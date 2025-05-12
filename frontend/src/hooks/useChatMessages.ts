// useChatMessages.ts (refactored)
import { useState, useRef, useEffect, useCallback } from 'react';
import { CharacterData } from '../contexts/CharacterContext';
import { Message, UserProfile, ChatState } from '../types/messages'; // Import IMessage
import { PromptHandler } from '../handlers/promptHandler';
import { useAPIConfig } from '../contexts/APIConfigContext'; // Use the hook
// Removed useSettings import as it's not needed for API selection here anymore
import { APIConfig } from '../types/api';
import { ChatStorage } from '../services/chatStorage';
import { toast } from 'sonner'; // Import toast
import { generateUUID } from '../utils/generateUUID'; // Ensure this is imported
import { CharacterCard } from '../types/schema'; // Import CharacterCard type
import { substituteVariables } from '../utils/variableUtils'; // Import for variable substitution

// --- Interfaces ---
interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions?: string;
}

// Define a stricter type for messages passed to PromptHandler
type PromptContextMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string;
    // Include other relevant fields if needed by PromptHandler, but exclude 'thinking' role
};


interface EnhancedChatState extends ChatState {
  generatingId: string | null; // ID of the message currently being generated/regenerated/varied
  reasoningSettings: ReasoningSettings;
}

// --- Constants ---
const DEFAULT_REASONING_SETTINGS: ReasoningSettings = {
  enabled: false,
  visible: false,
  instructions: "!important! Embody {{char}}. **Think** through the context of this interaction with <thinking></thinking> tags. Consider your character, your relationship with the user, and relevant context from the conversation history."
};
const REASONING_SETTINGS_KEY = 'cardshark_reasoning_settings';
const CONTEXT_WINDOW_KEY = 'cardshark_context_window';
const DEBOUNCE_DELAY = 1000; // 1 second debounce delay for message updates

// --- Debounce Utility ---
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

// --- Default Assistant Character ---
const DEFAULT_ASSISTANT_CHARACTER: CharacterCard = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Assistant",
    description: "A helpful AI assistant.",
    personality: "Helpful, knowledgeable, and concise.",
    scenario: "Chatting with the user.",
    first_mes: "Hello! How can I help you today?",
    mes_example: "", // Keep examples minimal for generic assistant
    creator_notes: "",
    system_prompt: "You are a helpful AI assistant.",
    post_history_instructions: "Provide helpful and relevant information.",
    tags: ["assistant", "ai"],
    creator: "System",
    character_version: "1.0",
    alternate_greetings: [],
    extensions: {
      talkativeness: "0.5",
      fav: false,
      world: "", // No specific world
      depth_prompt: { prompt: "", depth: 1, role: "system" }
    },
    group_only_greetings: [],
    character_book: { entries: [], name: "" },
    spec: ''
  },
  // Add top-level fields if necessary based on CharacterCard definition
  name: "Assistant",
  description: "A helpful AI assistant.",
  personality: "Helpful, knowledgeable, and concise.",
  scenario: "Chatting with the user.",
  first_mes: "Hello! How can I help you today?",
  mes_example: "",
  creatorcomment: "",
  avatar: "none",
  chat: "", // This likely refers to a chat ID, keep empty for default
  talkativeness: "0.5",
  fav: false,
  tags: ["assistant", "ai"],
  create_date: new Date().toISOString() // Set a creation date
};


// --- Helper Functions ---
const createUserMessage = (content: string): Message => ({
  id: generateUUID(),
  role: 'user',
  content,
  timestamp: Date.now(),
  status: 'complete'
});

const createAssistantMessage = (content: string = '', status: Message['status'] = 'streaming'): Message => ({
  id: generateUUID(),
  role: 'assistant',
  content,
  timestamp: Date.now(),
  status: status,
  variations: content ? [content] : [],
  currentVariation: content ? 0 : undefined,
});

const createThinkingMessage = (): Message => ({
    id: generateUUID(),
    role: 'thinking',
    content: '', // Starts empty
    timestamp: Date.now(),
    status: 'streaming' // Indicate it's being generated
});

// --- Main Hook ---
export function useChatMessages(characterData: CharacterData | null, options?: { isWorldPlay?: boolean }) {
  // Determine the character to use: passed character or default assistant
  const effectiveCharacterData = characterData || DEFAULT_ASSISTANT_CHARACTER;
  const isGenericAssistant = !characterData; // Flag to check if we're using the default

  // Get API and Settings contexts
  const { apiConfig: globalApiConfig } = useAPIConfig(); // Get the globally active config

  // Toast for character load
  useEffect(() => {
    if (characterData && characterData.data?.name) { // Ensure it's a specific character, not default assistant
      toast.info(`Chatting with ${characterData.data.name}`);
    }
  }, [characterData?.data?.name]); // Trigger when character name changes

  // --- State Initialization ---
  const [state, setState] = useState<EnhancedChatState>(() => {
    let storedUser = ChatStorage.getCurrentUser();
    let persistedContextWindow = null;
    let reasoningSettings = DEFAULT_REASONING_SETTINGS;

    try {
      const storedContextWindowStr = localStorage.getItem(CONTEXT_WINDOW_KEY);
      if (storedContextWindowStr) persistedContextWindow = JSON.parse(storedContextWindowStr);

      const savedReasoningSettingsStr = localStorage.getItem(REASONING_SETTINGS_KEY);
      if (savedReasoningSettingsStr) reasoningSettings = { ...DEFAULT_REASONING_SETTINGS, ...JSON.parse(savedReasoningSettingsStr) };
    } catch (err) {
      console.error('Error loading settings from localStorage:', err);
    }

    return {
      messages: [],
      isLoading: false,
      isGenerating: false,
      error: null,
      currentUser: storedUser,
      lastContextWindow: persistedContextWindow,
      generatingId: null,
      reasoningSettings
    };
  });

  // --- Refs ---
  const currentGenerationRef = useRef<AbortController | null>(null);
  const lastCharacterId = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Timeout for stream inactivity
  const autoSaveEnabled = useRef(!isGenericAssistant);
  const hasInitializedChat = useRef<boolean>(false);
  const isInitialLoad = useRef<boolean>(true); // New flag to track initial load
  const STREAM_INACTIVITY_TIMEOUT_MS = 30000; // 30 seconds

  // --- Utility Functions ---
  const prepareAPIConfig = useCallback((config?: APIConfig | null): APIConfig => {
    const defaultConfig: APIConfig = {
      id: 'default', provider: 'KoboldCPP', url: 'http://localhost:5001', enabled: false, templateId: 'mistral',
      generation_settings: { max_length: 220, max_context_length: 6144, temperature: 1.05, top_p: 0.92, top_k: 100 }
    };
    if (!config) return defaultConfig;
    // Deep copy to avoid modifying original settings object
    const fullConfig = JSON.parse(JSON.stringify(config));
    // Merge generation settings with defaults, ensuring nested objects are handled
    fullConfig.generation_settings = { ...defaultConfig.generation_settings, ...(fullConfig.generation_settings || {}) };
    // Merge the rest of the config with defaults
    return { ...defaultConfig, ...fullConfig };
  }, []);

  // --- State Update Helpers ---
  const setGeneratingStart = (userMessage: Message | null, assistantMessage: Message) => {
    setState(prev => ({
      ...prev,
      messages: userMessage ? [...prev.messages, userMessage, assistantMessage] : [...prev.messages, assistantMessage],
      isGenerating: true, generatingId: assistantMessage.id, error: null
    }));
  };

  const updateGeneratingMessageContent = (messageId: string, chunk: string) => {
  // console.log('[DEBUG] updateGeneratingMessageContent called with:', { messageId, chunk }); // Reduced logging
    setState(prev => {
      if (!prev.isGenerating || prev.generatingId !== messageId) {
          // console.log(`[updateGenerating] Skipping update for ${messageId} - not generating or ID mismatch.`);
          return prev;
      }
      let found = false;
      const updatedMessages = prev.messages.map(msg => {
        if (msg.id === messageId) {
          found = true;
          const newContent = msg.content + chunk;
          // console.log(`[updateGenerating] Updating ${messageId}: current='${msg.content}', chunk='${chunk}', new='${newContent}'`);
          return { ...msg, content: newContent, status: 'streaming' as Message['status'] };
        }
        return msg;
      });
      if (!found) {
           console.warn(`[updateGenerating] Message ID ${messageId} not found in state during update.`);
      }
      return { ...prev, messages: updatedMessages };
    });
  };

  const updateThinkingMessageContent = (messageId: string, chunk: string) => { // Removed currentFullContent
    setState(prev => {
      if (!prev.isGenerating || prev.generatingId !== messageId) return prev;
      const updatedMessages = prev.messages.map(msg =>
        msg.id === messageId ? { ...msg, content: msg.content + chunk } : msg // Append chunk here
      );
      return { ...prev, messages: updatedMessages };
    });
  };

  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []); // No dependencies needed

  const setGenerationComplete = (
      messageId: string, finalContent: string, contextWindowType: string,
      receivedChunks: number, originalContentForVariation?: string
    ) => {
    // console.log('[DEBUG] setGenerationComplete called with:', { messageId, finalContent, contextWindowType, receivedChunks, originalContentForVariation }); // Reduced logging
    setState(prev => {
      // Check if we are still generating *this specific message*
      if (!prev.isGenerating || prev.generatingId !== messageId) {
        console.log(`Completion ignored: Generation for ${messageId} already stopped/changed.`);
        // If generation stopped but this is the final update, ensure state reflects non-generating
        if (!prev.isGenerating && prev.generatingId === null) return prev;
        // Otherwise, reset generation state if ID doesn't match
        return { ...prev, isGenerating: false, generatingId: null };
      }

      const finalMessages = prev.messages.map(msg => {
        if (msg.id === messageId) {
          if (msg.role === 'thinking') return null; // Remove thinking message
          const currentVariations = msg.variations || (originalContentForVariation ? [originalContentForVariation] : [msg.content]);
          const variations = [...currentVariations, finalContent];
          const uniqueVariations = Array.from(new Set(variations));
          const newVariationIndex = uniqueVariations.length - 1;
          return { ...msg, content: finalContent, variations: uniqueVariations, currentVariation: newVariationIndex, status: 'complete' as Message['status'] };
        }
        return msg;
      }).filter(msg => msg !== null) as Message[];

      const finalContextWindow = { ...prev.lastContextWindow, type: contextWindowType, finalResponse: finalContent, completionTime: new Date().toISOString(), totalChunks: receivedChunks };
      clearStreamTimeout(); // Clear timeout on successful completion
      return { ...prev, messages: finalMessages, isGenerating: false, generatingId: null, lastContextWindow: finalContextWindow };
    });
  };

  // Define stopGeneration early so it can be used in resetStreamTimeout's dependencies
  const stopGeneration = useCallback(() => {
    if (!state.isGenerating || !currentGenerationRef.current) {
      if (state.isGenerating) setState(prev => ({...prev, isGenerating: false, generatingId: null})); // Ensure state is reset if ref is missing
      return;
    }
    console.log("Attempting to stop generation...");
    currentGenerationRef.current.abort(); // Abort the fetch request
    clearStreamTimeout(); // Clear inactivity timeout
    // State update (isGenerating=false, generatingId=null) will be handled by handleGenerationError or setGenerationComplete
  }, [state.isGenerating, clearStreamTimeout]);

  const resetStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      console.warn(`Stream timed out after ${STREAM_INACTIVITY_TIMEOUT_MS / 1000}s. Aborting.`);
      stopGeneration(); // Call stopGeneration on timeout
    }, STREAM_INACTIVITY_TIMEOUT_MS);
  }, [clearStreamTimeout, stopGeneration]); // Add stopGeneration dependency

  const handleGenerationError = useCallback((err: any, messageId: string | null, operationType: string = 'generation') => {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const errorMessage = isAbort ? `${operationType} cancelled.` : (err instanceof Error ? err.message : `Unknown ${operationType} error`);
    // Avoid logging abort errors as actual errors unless debugging
    if (!isAbort) {
        console.error(`Error during ${operationType}${messageId ? ` for message ${messageId}` : ''}:`, err);
    } else {
        console.log(`${operationType} aborted for message ${messageId}`);
    }

    setState(prev => {
      // Only update state if we were actually generating this message or if messageId is null (setup error)
      if (messageId === null || prev.generatingId === messageId) {
          let updatedMessages = prev.messages;
          if (messageId) {
              updatedMessages = prev.messages.map(msg => {
                if (msg.id === messageId) {
                  if (msg.role === 'thinking') return null; // Remove thinking message on error/abort
                  // Keep existing content on abort, add error marker on actual error
                  const finalContent = msg.content || (isAbort ? "" : `[${operationType} Error]`);
                  return { ...msg, status: (isAbort ? 'aborted' : 'error') as Message['status'], content: finalContent };
                }
                return msg;
              }).filter(msg => msg !== null) as Message[];
          }
          return {
            ...prev, messages: updatedMessages, error: isAbort ? null : errorMessage, // Don't show abort as error message in UI
            isGenerating: false, generatingId: null,
            lastContextWindow: { ...prev.lastContextWindow, type: `${operationType}_${isAbort ? 'aborted' : 'error'}`, timestamp: new Date().toISOString(), characterName: effectiveCharacterData.data?.name || 'Unknown', messageId: messageId, error: errorMessage }
          };
      }
      // If the error/abort is for a generation that's already stopped/changed, just return previous state
      return prev;
    });
    clearStreamTimeout(); // Clear timeout on error/abort
  }, [effectiveCharacterData, clearStreamTimeout]); // Use effectiveCharacterData, add clearStreamTimeout

  // Define clearError here, before other callbacks that use it
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // --- Persistence ---
  // saveChat now requires explicit messageList and user arguments
  const saveChat = useCallback((messageList: Message[], user: UserProfile | null) => {
    // Only save if it's a real character and autoSave is enabled
    if (isGenericAssistant || !effectiveCharacterData.data?.name || !autoSaveEnabled.current) return;
    const messagesToSave = messageList.filter(msg => msg.role !== 'thinking');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Use effectiveCharacterData here, but the check above ensures it's not the generic one
        if (effectiveCharacterData) {
          // Use the globally active config for saving metadata for now
          const apiInfo = globalApiConfig ? { provider: globalApiConfig.provider, model: globalApiConfig.model, url: globalApiConfig.url, template: globalApiConfig.templateId, enabled: globalApiConfig.enabled } : null;
          // Pass null for backgroundSettings, let backend handle it if needed or load from file
          await ChatStorage.saveChat(effectiveCharacterData, messagesToSave, user, apiInfo, null);
          // console.debug(`Saved ${messagesToSave.length} messages`); // Reduced logging
        }
      } catch (err) { console.error('Error saving chat:', err); }
      finally { saveTimeoutRef.current = null; }
    }, 1000);
  }, [effectiveCharacterData, globalApiConfig, isGenericAssistant]); // Use globalApiConfig in dependency array

  // Direct API call implementation (non-debounced)
  const appendMessageDirect = useCallback(async (message: Message) => {
    // Only append if it's a real character
    if (isGenericAssistant || message.role === 'thinking' || !effectiveCharacterData.data?.name) return;
    try {
      // Use effectiveCharacterData, check ensures it's not generic
      if (effectiveCharacterData) await ChatStorage.appendMessage(effectiveCharacterData, message);
    } catch (err) { console.error('Error appending/updating message:', err); }
  }, [effectiveCharacterData, isGenericAssistant]);

  // Create a debounced version of appendMessage
  const appendMessage = useCallback(
    debounce(async (message: Message) => {
      await appendMessageDirect(message);
    }, DEBOUNCE_DELAY),
    [appendMessageDirect]
  );

  // --- Core Stream Processing Logic ---
  const processStream = useCallback(async (
    response: Response, messageId: string, isThinking: boolean,
    onComplete: (finalContent: string, receivedChunks: number) => void,
    onError: (error: Error) => void
  ) => {
    if (!response.ok) { // Check response status before processing body
        const errorText = await response.text().catch(() => `HTTP error ${response.status}`);
        onError(new Error(`API request failed: ${response.status} ${errorText}`));
        return;
    }
    if (!response.body) { onError(new Error("Response body is missing")); return; }

    // Use the static streamResponse generator from PromptHandler
    try {
        let accumulatedContent = '';
        let receivedChunks = 0;
        for await (const chunk of PromptHandler.streamResponse(response)) {
            if (!currentGenerationRef.current || currentGenerationRef.current.signal.aborted) {
              throw new DOMException('Aborted by user', 'AbortError');
            }
            resetStreamTimeout(); // Reset inactivity timer on receiving data
            accumulatedContent += chunk;
            receivedChunks++;
            if (isThinking) {
                updateThinkingMessageContent(messageId, chunk);
            } else {
                updateGeneratingMessageContent(messageId, chunk);
            }
        }
        onComplete(accumulatedContent, receivedChunks);
    } catch (err) {
        onError(err instanceof Error ? err : new Error('Unknown stream processing error'));
    }
  }, [resetStreamTimeout, updateGeneratingMessageContent, updateThinkingMessageContent]); // Dependencies for stream processing

  // --- Context Message Retrieval ---
  const getContextMessages = useCallback((currentState: EnhancedChatState, excludeId?: string): Message[] => {
    // Simple context: last N messages, excluding 'thinking' and the excluded ID
    const MAX_CONTEXT_MESSAGES = 20; // Example: Adjust as needed
    return currentState.messages
      .filter(msg => msg.role !== 'thinking' && msg.id !== excludeId)
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((msg): Message => { // Use full msg object and explicitly type the return
        // Ensure variations and currentVariation are handled correctly
        const content = (msg.variations && typeof msg.currentVariation === 'number')
          ? msg.variations[msg.currentVariation]
          : msg.content;
        return {
          ...msg,
          content: PromptHandler.stripHtmlTags(content || ''), // Ensure content is always a string and stripped
          // Omit variations/currentVariation from context if desired, or keep them
           variations: undefined,
           currentVariation: undefined,
        };
      });
  }, []); // No dependencies needed for this simple version

  // --- Reasoning Generation ---
  const generateReasoning = useCallback(async (userInput: string, baseContextMessages: Message[]): Promise<string | null> => {
    // Ensure reasoning is enabled and we have necessary data (use globalApiConfig)
    if (!state.reasoningSettings.enabled || !effectiveCharacterData || !globalApiConfig) return null;

    const reasoningMessage = createThinkingMessage();
    // Add thinking message immediately, but don't include it in the context for its own generation
    setState(prev => ({ ...prev, messages: [...prev.messages, reasoningMessage], isGenerating: true, generatingId: reasoningMessage.id, error: null }));

    try {
      const formattedAPIConfig = prepareAPIConfig(globalApiConfig); // Use global config for reasoning
      const reasoningApiConfig = { ...formattedAPIConfig, generation_settings: { ...formattedAPIConfig.generation_settings, max_length: 512 } }; // Increase max length for reasoning

      // Construct the prompt specifically for reasoning
      const template = PromptHandler.getTemplate(reasoningApiConfig.templateId);
      const memory = PromptHandler.createMemoryContext(effectiveCharacterData, template);
      // Filter baseContextMessages to ensure only valid roles are passed
      const filteredBaseContext = baseContextMessages.filter(msg => msg.role !== 'thinking') as PromptContextMessage[];
      const history = PromptHandler.formatChatHistory(filteredBaseContext, effectiveCharacterData.data.name || 'Character', reasoningApiConfig.templateId);
      // Combine memory, history, user input, and reasoning instructions
      const reasoningPrompt = `${memory}\n${history}\n${PromptHandler.replaceVariables(template?.userFormat || 'User: {{content}}', { content: userInput })}\n${state.reasoningSettings.instructions || ''}`;

      currentGenerationRef.current = new AbortController();
      // Use the generic generateChatResponse, passing the constructed prompt and reasoning-specific config
      const response = await PromptHandler.generateChatResponse(
          effectiveCharacterData,
          reasoningPrompt, // Pass the fully constructed reasoning prompt
          [], // Pass empty contextMessages as history is already in the prompt
          reasoningApiConfig,
          currentGenerationRef.current.signal
      );

      let finalReasoning: string | null = null;
      await processStream(
        response, reasoningMessage.id, true, // isThinking = true
        (finalContent, receivedChunks) => {
          finalReasoning = finalContent;
          // Update the thinking message content as it streams
          setState(prev => ({
            ...prev,
            messages: prev.messages.map(msg => msg.id === reasoningMessage.id ? { ...msg, content: finalContent, status: 'complete' as Message['status'] } : msg),
            // Keep generatingId until main response starts or error occurs
          }));
          console.log(`Reasoning generation complete (${receivedChunks} chunks).`);
        },
        (error) => {
          handleGenerationError(error, reasoningMessage.id, 'reasoning');
          finalReasoning = null; // Ensure null on error
        }
      );
      return finalReasoning; // Return the generated reasoning text
    } catch (err) {
      handleGenerationError(err, reasoningMessage.id, 'reasoning'); // Use reasoningMessage.id
      return null; // Return null on error
    }
    // Update dependencies: use globalApiConfig
  }, [effectiveCharacterData, state.reasoningSettings, state.currentUser, state.messages, globalApiConfig, handleGenerationError, prepareAPIConfig, processStream, stopGeneration]); // Removed unused dependencies, added stopGeneration

  // --- Main Response Generation ---
  const generateResponse = useCallback(async (userInput: string) => { // Removed apiId parameter
    if (state.isGenerating) {
      console.warn("Generation already in progress.");
      return;
    }
    // Use the globally active API config
    if (!globalApiConfig || !globalApiConfig.enabled) {
        handleGenerationError(new Error("No active API configuration is enabled."), null, 'setup');
        return;
    }
    clearError(); // Clear previous errors

    const preparedApiConfig = prepareAPIConfig(globalApiConfig); // Prepare the global config

    const userMessage = createUserMessage(userInput);
    const assistantMessage = createAssistantMessage(); // Start with empty assistant message

    // Add user message immediately, start generation state with assistant message
    setGeneratingStart(userMessage, assistantMessage);
    // Save immediately after adding user message if auto-save is on
    if (!isGenericAssistant && autoSaveEnabled.current) {
        appendMessageDirect(userMessage); // Use direct append for user message
    }

    try {
      // Get context *before* reasoning, including the new user message
      const contextMessagesForReasoning = getContextMessages(state, assistantMessage.id);

      // --- Reasoning Step (Optional) ---
      let reasoningText: string | null = null;
      if (state.reasoningSettings.enabled) {
        // Pass the actual user input and the context *before* the user message was added
        reasoningText = await generateReasoning(userInput, contextMessagesForReasoning.slice(0, -1)); // Exclude the latest user message from reasoning context
        if (reasoningText === null && state.error) {
             console.log("Reasoning failed or was aborted, stopping main generation.");
             setState(prev => ({ ...prev, isGenerating: false, generatingId: null }));
             return;
        }
         // Update generating ID back to the assistant message before main generation
         setState(prev => ({ ...prev, generatingId: assistantMessage.id }));
      }

      // --- Prompt Construction & Context Window ---
      // Get context *including* the new user message for the main prompt
      const contextMessagesForPrompt = getContextMessages(state, assistantMessage.id);
      // Filter context messages *before* passing to formatPromptWithContextMessages
      const filteredContextForPrompt = contextMessagesForPrompt.filter(msg => msg.role !== 'thinking') as PromptContextMessage[];
      const finalPrompt = PromptHandler.formatPromptWithContextMessages(
          effectiveCharacterData,
          userInput, // Pass the current user input here
          filteredContextForPrompt, // Pass filtered context
          state.currentUser?.name || 'User', // Pass current user's name
          preparedApiConfig.templateId
      );

      const contextWindow = {
        type: 'generation_start', timestamp: new Date().toISOString(),
        characterName: effectiveCharacterData.data?.name || 'Unknown',
        messageId: assistantMessage.id, promptUsed: finalPrompt, // Log the fully formatted prompt
        contextMessageCount: filteredContextForPrompt.length, config: preparedApiConfig,
        reasoningUsed: reasoningText
      };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
      localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify(contextWindow)); // Persist context window info

      // --- API Call ---
      currentGenerationRef.current = new AbortController();
      // Use the static generateChatResponse method
      // Filter context messages *before* passing to generateChatResponse
      const filteredContextForAPI = contextMessagesForPrompt.filter(msg => msg.role !== 'thinking') as PromptContextMessage[];
      const response = await PromptHandler.generateChatResponse(
          effectiveCharacterData,
          userInput, // Pass the raw user input again, backend/handler reconstructs prompt
          filteredContextForAPI, // Pass filtered context
          preparedApiConfig, // Pass the chosen, prepared config
          currentGenerationRef.current.signal
      );

      await processStream(
        response, assistantMessage.id, false, // isThinking = false
        (finalContent, receivedChunks) => {
          setGenerationComplete(assistantMessage.id, finalContent, 'generation_complete', receivedChunks);
          // Save/append after successful generation only if it's a real character
          if (!isGenericAssistant) {
            // Use setState callback to get the most up-to-date messages after completion
            setState(prev => {
              const finalStateMessages = prev.messages;
              saveChat(finalStateMessages, prev.currentUser); // Save the complete chat
              const finalAssistantMsg = finalStateMessages.find(m => m.id === assistantMessage.id);
              if (finalAssistantMsg) appendMessage(finalAssistantMsg); // Debounced append for the final assistant message
              return prev; // No state change needed here, just accessing latest state
            });
          }
        },
        (error) => {
          handleGenerationError(error, assistantMessage.id);
          // Save/append even on error if it's a real character (to save the partial message/error state)
          if (!isGenericAssistant) {
             setState(prev => {
                saveChat(prev.messages, prev.currentUser);
                const errorMsg = prev.messages.find(m => m.id === assistantMessage.id);
                if (errorMsg) appendMessage(errorMsg);
                return prev;
             });
          }
        }
      );
    } catch (err) {
      handleGenerationError(err, assistantMessage.id);
       if (!isGenericAssistant) {
             setState(prev => {
                saveChat(prev.messages, prev.currentUser);
                const errorMsg = prev.messages.find(m => m.id === assistantMessage.id);
                if (errorMsg) appendMessage(errorMsg);
                return prev;
             });
        }
    }
    // Update dependencies: removed settings.apis, activeApiId
  }, [state, globalApiConfig, effectiveCharacterData, saveChat, handleGenerationError, prepareAPIConfig, getContextMessages, generateReasoning, clearError, appendMessage, appendMessageDirect, resetStreamTimeout, stopGeneration, isGenericAssistant, processStream]);

  // --- Message Regeneration ---
  const regenerateMessage = useCallback(async (messageToRegenerate: Message) => {
    if (state.isGenerating) {
      console.warn("Regeneration already in progress.");
      return;
    }
    // For regeneration/variation, always use the globally active API for simplicity for now
    if (!globalApiConfig || !globalApiConfig.enabled) {
       handleGenerationError(new Error("No active API configuration is enabled for regeneration."), messageToRegenerate.id, 'regeneration_setup');
       return;
    }
    clearError();
    const preparedApiConfig = prepareAPIConfig(globalApiConfig); // Use global active config

    const messageIndex = state.messages.findIndex(msg => msg.id === messageToRegenerate.id);
    if (messageIndex === -1 || messageIndex === 0) {
      console.error("Cannot regenerate: Message not found or is the first message.");
      return;
    }

    const precedingUserMessage = state.messages[messageIndex - 1];
    if (precedingUserMessage.role !== 'user') {
      console.error("Cannot regenerate: Preceding message is not from the user.");
      return;
    }

    // Set generating state for the message being regenerated
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(msg => msg.id === messageToRegenerate.id ? { ...msg, status: 'streaming' as Message['status'], content: '' } : msg), // Clear content for regen
      isGenerating: true, generatingId: messageToRegenerate.id, error: null
    }));

    try {
      // Context includes messages *up to* the preceding user message
      const contextMessages = getContextMessages(state, messageToRegenerate.id).slice(0, messageIndex -1); // Exclude the message itself and get history before it

      // --- Reasoning Step (Optional, based on preceding user input) ---
       let reasoningText: string | null = null;
       if (state.reasoningSettings.enabled) {
         // Pass the content of the preceding user message to generateReasoning
         reasoningText = await generateReasoning(precedingUserMessage.content, contextMessages);
         if (reasoningText === null && state.error) {
             console.log("Reasoning failed or was aborted, stopping regeneration.");
             setState(prev => ({ ...prev, isGenerating: false, generatingId: null }));
             return;
         }
         setState(prev => ({ ...prev, generatingId: messageToRegenerate.id })); // Ensure generatingId is correct
       }

      // --- Prompt Construction & Context Window ---
      // Filter context before passing
      const filteredContext = contextMessages.filter(msg => msg.role !== 'thinking') as PromptContextMessage[];
      const finalPrompt = PromptHandler.formatPromptWithContextMessages(
          effectiveCharacterData,
          precedingUserMessage.content, // Prompt is the preceding user message
          filteredContext, // History before the preceding user message
          state.currentUser?.name || 'User', // Pass current user's name
          preparedApiConfig.templateId
      );

      const contextWindow = {
          type: 'regeneration_start', timestamp: new Date().toISOString(),
          characterName: effectiveCharacterData.data?.name || 'Unknown',
          messageId: messageToRegenerate.id, promptUsed: finalPrompt,
          contextMessageCount: filteredContext.length, config: preparedApiConfig,
          reasoningUsed: reasoningText
      };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
      localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify(contextWindow));

      // --- API Call ---
      currentGenerationRef.current = new AbortController();
      // Filter context before passing
      const filteredContextForAPI = contextMessages.filter(msg => msg.role !== 'thinking') as PromptContextMessage[];
      const response = await PromptHandler.generateChatResponse(
          effectiveCharacterData,
          precedingUserMessage.content, // Pass preceding user message content
          filteredContextForAPI,
          preparedApiConfig,
          currentGenerationRef.current.signal
      );

      await processStream(
        response, messageToRegenerate.id, false, // isThinking = false
        (finalContent, receivedChunks) => {
          // Pass original content for variation tracking if available
          const originalContent = messageToRegenerate.variations ? messageToRegenerate.variations[0] : messageToRegenerate.content;
          setGenerationComplete(messageToRegenerate.id, finalContent, 'regeneration_complete', receivedChunks, originalContent);
          // Save/append after successful regeneration only if it's a real character
           if (!isGenericAssistant) {
             setState(prev => {
                saveChat(prev.messages, prev.currentUser);
                const finalMsg = prev.messages.find(m => m.id === messageToRegenerate.id);
                if (finalMsg) appendMessage(finalMsg);
                return prev;
             });
           }
        },
        (error) => {
          handleGenerationError(error, messageToRegenerate.id, 'regeneration');
           if (!isGenericAssistant) {
             setState(prev => {
                saveChat(prev.messages, prev.currentUser);
                const errorMsg = prev.messages.find(m => m.id === messageToRegenerate.id);
                if (errorMsg) appendMessage(errorMsg);
                return prev;
             });
           }
        }
      );
    } catch (err) {
      handleGenerationError(err, messageToRegenerate.id, 'regeneration');
       if (!isGenericAssistant) {
             setState(prev => {
                saveChat(prev.messages, prev.currentUser);
                const errorMsg = prev.messages.find(m => m.id === messageToRegenerate.id);
                if (errorMsg) appendMessage(errorMsg);
                return prev;
             });
        }
    }
    // Update dependencies: use globalApiConfig
  }, [state, globalApiConfig, effectiveCharacterData, saveChat, handleGenerationError, prepareAPIConfig, getContextMessages, clearError, appendMessage, stopGeneration, generateReasoning, isGenericAssistant, processStream]); // Added processStream

  // --- Message Variation Generation ---
  const generateVariation = useCallback(async (messageToVary: Message) => {
    if (state.isGenerating) {
      console.warn("Variation generation already in progress.");
      return;
    }
    // Use global active API for variations
    if (!globalApiConfig || !globalApiConfig.enabled) {
       handleGenerationError(new Error("No active API configuration is enabled for variation."), messageToVary.id, 'variation_setup');
       return;
    }
    clearError();
    const preparedApiConfig = prepareAPIConfig(globalApiConfig); // Use global active config

    const messageIndex = state.messages.findIndex(msg => msg.id === messageToVary.id);
     if (messageIndex === -1 || messageIndex === 0 || messageToVary.role !== 'assistant') {
       console.error("Cannot generate variation: Message not found, is first message, or not an assistant message.");
       return;
     }

    const precedingUserMessage = state.messages[messageIndex - 1];
     if (precedingUserMessage.role !== 'user') {
       console.error("Cannot generate variation: Preceding message is not from the user.");
       return;
     }

    // Store original content for setGenerationComplete
    const originalContent = messageToVary.variations ? messageToVary.variations[0] : messageToVary.content;

    // Set generating state for the message being varied
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(msg => msg.id === messageToVary.id ? { ...msg, status: 'streaming' as Message['status'] } : msg), // Don't clear content for variation
      isGenerating: true, generatingId: messageToVary.id, error: null
    }));

    try {
      // Context includes messages *up to* the preceding user message
      const contextMessages = getContextMessages(state, messageToVary.id).slice(0, messageIndex - 1); // Exclude the message itself

       // --- Reasoning Step (Optional, based on preceding user input) ---
       let reasoningText: string | null = null;
       if (state.reasoningSettings.enabled) {
         reasoningText = await generateReasoning(precedingUserMessage.content, contextMessages);
          if (reasoningText === null && state.error) {
             console.log("Reasoning failed or was aborted, stopping variation generation.");
             setState(prev => ({ ...prev, isGenerating: false, generatingId: null }));
             return;
         }
         setState(prev => ({ ...prev, generatingId: messageToVary.id })); // Ensure generatingId is correct
       }

      // --- Prompt Construction & Context Window ---
      // Filter context before passing
      const filteredContext = contextMessages.filter(msg => msg.role !== 'thinking') as PromptContextMessage[];
      const finalPrompt = PromptHandler.formatPromptWithContextMessages(
          effectiveCharacterData,
          precedingUserMessage.content, // Prompt is the preceding user message
          filteredContext,
          state.currentUser?.name || 'User', // Pass current user's name
          preparedApiConfig.templateId
      );

       const contextWindow = {
           type: 'variation_start', timestamp: new Date().toISOString(),
           characterName: effectiveCharacterData.data?.name || 'Unknown',
           messageId: messageToVary.id, promptUsed: finalPrompt,
           contextMessageCount: filteredContext.length, config: preparedApiConfig,
           reasoningUsed: reasoningText
       };
       setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
       localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify(contextWindow));

      // --- API Call ---
      currentGenerationRef.current = new AbortController();
      // Filter context before passing
      const filteredContextForAPI = contextMessages.filter(msg => msg.role !== 'thinking') as PromptContextMessage[];
      const response = await PromptHandler.generateChatResponse(
          effectiveCharacterData,
          precedingUserMessage.content, // Pass preceding user message content
          filteredContextForAPI,
          preparedApiConfig,
          currentGenerationRef.current.signal
      );

      await processStream(
        response, messageToVary.id, false, // isThinking = false
        (finalContent, receivedChunks) => {
          setGenerationComplete(messageToVary.id, finalContent, 'variation_complete', receivedChunks, originalContent);
          // Save/append after successful variation only if it's a real character
           if (!isGenericAssistant) {
             setState(prev => {
                saveChat(prev.messages, prev.currentUser);
                const finalMsg = prev.messages.find(m => m.id === messageToVary.id);
                if (finalMsg) appendMessage(finalMsg);
                return prev;
             });
           }
        },
        (error) => {
          handleGenerationError(error, messageToVary.id, 'variation');
           if (!isGenericAssistant) {
             setState(prev => {
                saveChat(prev.messages, prev.currentUser);
                const errorMsg = prev.messages.find(m => m.id === messageToVary.id);
                if (errorMsg) appendMessage(errorMsg);
                return prev;
             });
           }
        }
      );
    } catch (err) {
      handleGenerationError(err, messageToVary.id, 'variation');
       if (!isGenericAssistant) {
             setState(prev => {
                saveChat(prev.messages, prev.currentUser);
                const errorMsg = prev.messages.find(m => m.id === messageToVary.id);
                if (errorMsg) appendMessage(errorMsg);
                return prev;
             });
        }
    }
    // Update dependencies: use globalApiConfig
  }, [state, globalApiConfig, effectiveCharacterData, saveChat, handleGenerationError, prepareAPIConfig, getContextMessages, clearError, appendMessage, stopGeneration, generateReasoning, isGenericAssistant, processStream]); // Added processStream


  // --- Message Management ---
  const cycleVariation = (messageId: string, direction: 'next' | 'prev') => {
    setState(prev => {
      let updatedMessage: Message | null = null;
      const updatedMessages = prev.messages.map(msg => {
        if (msg.id === messageId && msg.variations && msg.variations.length > 1) {
          const currentIdx = msg.currentVariation ?? 0;
          let nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
          if (nextIdx >= msg.variations.length) nextIdx = 0;
          if (nextIdx < 0) nextIdx = msg.variations.length - 1;
          const newContent = msg.variations[nextIdx];
          updatedMessage = { ...msg, content: newContent, currentVariation: nextIdx };
          return updatedMessage;
        }
        return msg;
      });
      // Save/append after cycling variation only if it's a real character and a change occurred
      if (updatedMessage && !isGenericAssistant) {
        saveChat(updatedMessages, prev.currentUser);
        appendMessage(updatedMessage); // appendMessage handles the storage update
      }
      const targetMessage = prev.messages.find(msg => msg.id === messageId);
      // Ensure updatedMessage is treated as Message type for accessing currentVariation
      const nextIdx = (updatedMessage as Message | null)?.currentVariation ?? targetMessage?.currentVariation ?? 0;
      const updatedContextWindow = { type: 'variation_cycled', timestamp: new Date().toISOString(), messageId, direction, newVariationIndex: nextIdx, totalVariations: targetMessage?.variations?.length || 0, characterName: effectiveCharacterData?.data?.name || 'Unknown' };
      return { ...prev, messages: updatedMessages, lastContextWindow: updatedContextWindow };
    });
  };

  // stopGeneration moved earlier

  const setCurrentUser = (user: UserProfile | null) => {
    setState(prev => ({ ...prev, currentUser: user }));
    ChatStorage.saveCurrentUser(user); // Corrected method name
  };

  const generateNpcIntroduction = useCallback(async (
    roomContext: string
    // npcName is already available via effectiveCharacterData.data.name
    // npcPersonality is available via effectiveCharacterData.data.personality
    // userName is available via state.currentUser.name
  ) => {
    if (state.isGenerating) {
      console.warn("Generation already in progress. Cannot generate NPC introduction.");
      return;
    }
    if (!globalApiConfig || !globalApiConfig.enabled) {
      handleGenerationError(new Error("No active API configuration is enabled for NPC introduction."), null, 'npc_intro_setup');
      return;
    }
    if (!effectiveCharacterData?.data?.name) {
      handleGenerationError(new Error("NPC character data not available for introduction."), null, 'npc_intro_setup');
      return;
    }
    clearError();

    const preparedApiConfig = prepareAPIConfig(globalApiConfig);
    const assistantMessage = createAssistantMessage(); // Empty message to receive the stream

    // Clear previous messages and set generating state for the new introduction
    setState(prev => ({
      ...prev,
      messages: [], // Start fresh for NPC interaction
      isGenerating: true,
      generatingId: assistantMessage.id,
      error: null,
    }));

    const npcName = effectiveCharacterData.data.name;
    const npcPersonality = effectiveCharacterData.data.personality || "a mysterious figure";
    const currentUserName = state.currentUser?.name || 'adventurer';
    const currentRoomName = effectiveCharacterData.data.extensions?.world || 'this place'; // Get room from character if possible

    const introInstructionalPrompt = `You are ${npcName}. Your personality is: ${npcPersonality}. You are currently in ${roomContext || currentRoomName}. ${currentUserName} has just appeared or is present. Introduce yourself to ${currentUserName} and react to their presence in a way that fits your personality and the current situation. This is your first interaction in this scene.`;

    try {
      const finalPromptForNpcIntro = PromptHandler.formatPromptWithContextMessages(
        effectiveCharacterData,
        introInstructionalPrompt,
        [],
        currentUserName,
        preparedApiConfig.templateId
      );

      const contextWindow = {
        type: 'npc_introduction_start', timestamp: new Date().toISOString(),
        characterName: npcName,
        messageId: assistantMessage.id, promptUsed: finalPromptForNpcIntro,
        contextMessageCount: 0, config: preparedApiConfig,
      };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));

      currentGenerationRef.current = new AbortController();
      const response = await PromptHandler.generateChatResponse(
        effectiveCharacterData,
        introInstructionalPrompt,
        [],
        preparedApiConfig,
        currentGenerationRef.current.signal
      );

      setState(prev => ({ ...prev, messages: [assistantMessage] }));

      await processStream(
        response, assistantMessage.id, false,
        (finalContent, receivedChunks) => {
          setGenerationComplete(assistantMessage.id, finalContent, 'npc_introduction_complete', receivedChunks);
        },
        (error) => {
          handleGenerationError(error, assistantMessage.id, 'npc_introduction');
        }
      );
    } catch (err) {
      handleGenerationError(err, assistantMessage.id, 'npc_introduction');
    }
  }, [
    state.isGenerating, state.currentUser,
    globalApiConfig, effectiveCharacterData, handleGenerationError,
    clearError, prepareAPIConfig, processStream,
    setGenerationComplete,
  ]);

  // Define handleNewChat before loadExistingChat which might call it
  const handleNewChat = useCallback(async () => {
       if (!effectiveCharacterData?.data?.name) {
           console.error("Cannot start new chat without character data.");
           setState(prev => ({ ...prev, error: "Cannot start new chat: Character data missing."}));
           return;
       }
       console.log("Handling new chat request...");
       setState(prev => ({ ...prev, isLoading: true, error: null, messages: [], generatingId: null, isGenerating: false })); // Clear messages and stop generation
       stopGeneration(); // Ensure any ongoing generation is stopped
       currentGenerationRef.current = null; // Clear ref

       try {
           // Clear persisted context window for a truly new chat
           localStorage.removeItem(CONTEXT_WINDOW_KEY);
           setState(prev => ({ ...prev, lastContextWindow: null }));

           // Create a new chat file on the backend
           const result = await ChatStorage.createNewChat(effectiveCharacterData);
           if (result?.success && result.chat_id) {
               console.log(`New chat created with ID: ${result.chat_id}`);
               // Generate the first message using the new chat ID context
               const firstMessageContent = effectiveCharacterData.data?.first_mes || "Hello.";
               
               // Substitute variables in the first message
               const substitutedContent = substituteVariables(
                   firstMessageContent,
                   state.currentUser?.name,
                   effectiveCharacterData.data?.name
               );
               
               const assistantMessage = createAssistantMessage(substitutedContent, 'complete'); // Create first message as complete

               // Update state with the first message
               setState(prev => ({
                   ...prev,
                   messages: [assistantMessage],
                   isLoading: false,
                   lastContextWindow: { type: 'new_chat_created', chatId: result.chat_id, timestamp: Date.now(), characterName: effectiveCharacterData.data?.name },
               }));
               // Save this initial state
               saveChat([assistantMessage], state.currentUser);
               appendMessageDirect(assistantMessage); // Save the first message immediately

               hasInitializedChat.current = true; // Mark chat as initialized
               isInitialLoad.current = false; // Mark initial load as complete
               autoSaveEnabled.current = true; // Enable auto-save

               // Scroll to bottom after a short delay
               setTimeout(() => {
                   window.dispatchEvent(new Event('cardshark:scroll-to-bottom'));
               }, 100);

           } else {
               throw new Error(result?.message || "Failed to create new chat file on backend.");
           }
       } catch (err) {
           console.error('Error creating new chat:', err);
           setState(prev => ({ ...prev, isLoading: false, error: err instanceof Error ? err.message : 'Failed to start new chat' }));
       }
   }, [effectiveCharacterData, stopGeneration, saveChat, appendMessageDirect, state.currentUser]); // Added dependencies

  const loadExistingChat = useCallback(async (chatId: string) => {
    if (!effectiveCharacterData?.data?.name) {
      console.error("Cannot load chat without character data.");
      return;
    }
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      // Correct parameter order for loadChat
      const loadedChat = await ChatStorage.loadChat(chatId, effectiveCharacterData);
      if (loadedChat && loadedChat.success) { // Check for success flag
        // Ensure messages have status, variations, currentVariation
        const messagesWithStatus = (loadedChat.messages || []).map((msg: any) => ({ // Handle case where messages might be missing
          ...msg,
          status: msg.status || 'complete',
          variations: msg.variations || [msg.content],
          currentVariation: msg.currentVariation ?? (msg.variations ? msg.variations.length - 1 : 0)
        }));

        setState(prev => ({
          ...prev,
          messages: messagesWithStatus,
          currentUser: loadedChat.currentUser || prev.currentUser, // Load user if available
          isLoading: false,
          lastContextWindow: { type: 'chat_loaded', chatId: chatId, timestamp: Date.now(), characterName: effectiveCharacterData.data?.name, messageCount: messagesWithStatus.length, backgroundSettings: loadedChat.backgroundSettings }, // Add background settings here
          generatingId: null, // Ensure no generation is active
          isGenerating: false,
        }));
        // Persist the loaded context window info
        localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify({ type: 'chat_loaded', chatId: chatId, timestamp: Date.now(), characterName: effectiveCharacterData.data?.name, messageCount: messagesWithStatus.length }));
        autoSaveEnabled.current = true; // Enable auto-save for loaded chats
        hasInitializedChat.current = true; // Mark chat as initialized
        isInitialLoad.current = false; // Mark initial load as complete
        // Scroll to bottom after a short delay to allow rendering
        setTimeout(() => {
           window.dispatchEvent(new Event('cardshark:scroll-to-bottom'));
        }, 100);
      } else {
        // If chat doesn't exist or loading failed, start a new one
        console.warn(`Chat ${chatId} not found or failed to load, starting new chat. Error: ${loadedChat?.error}`);
        setState(prev => ({ ...prev, isLoading: false, error: `Chat ${chatId} not found or failed to load.` }));
        await handleNewChat(); // Call new chat handler (await it)
      }
    } catch (err) {
      console.error('Error loading chat:', err);
      setState(prev => ({ ...prev, isLoading: false, error: err instanceof Error ? err.message : 'Failed to load chat' }));
       // Attempt to start a new chat on load failure
       await handleNewChat(); // Await new chat creation
    }
  }, [effectiveCharacterData, handleNewChat]); // Added handleNewChat dependency

   const updateReasoningSettings = (settingsUpdate: Partial<ReasoningSettings>) => {
     setState(prev => {
       const newSettings = { ...prev.reasoningSettings, ...settingsUpdate };
       localStorage.setItem(REASONING_SETTINGS_KEY, JSON.stringify(newSettings));
       return { ...prev, reasoningSettings: newSettings };
     });
   };

   // clearError defined earlier

   const deleteMessage = (messageId: string) => {
     setState(prev => {
       const messageToDelete = prev.messages.find(msg => msg.id === messageId);
       const newMessages = prev.messages.filter(msg => msg.id !== messageId);
       // If deleting the message being generated, stop generation
       if (prev.generatingId === messageId) {
         stopGeneration();
       }
       // Save chat after deletion if auto-save is enabled and it's a real character
       if (!isGenericAssistant && autoSaveEnabled.current && messageToDelete) {
         saveChat(newMessages, prev.currentUser); // Save the updated list
         // NOTE: ChatStorage.deleteMessage does not exist, rely on saveChat overwriting
       }
       return { ...prev, messages: newMessages };
     });
   };

   const updateMessage = (messageId: string, newContent: string, isStreamingUpdate: boolean = false) => {
     setState(prev => {
       let updatedMessage: Message | null = null;
       const newMessages = prev.messages.map(msg => {
         if (msg.id === messageId) {
           updatedMessage = { ...msg, content: newContent };
           // If it's a final update (not streaming), update variations
           if (!isStreamingUpdate) {
               const currentVariations = updatedMessage.variations || [updatedMessage.content]; // Start with current content if no variations
               // Replace the current variation content, or add if index is out of bounds (shouldn't happen ideally)
               const currentIdx = updatedMessage.currentVariation ?? currentVariations.length -1; // Default to last index
               if (currentIdx >= 0 && currentIdx < currentVariations.length) {
                   currentVariations[currentIdx] = newContent;
                   updatedMessage.variations = [...currentVariations]; // Ensure new array instance
               } else {
                   // Fallback: add as new variation if index is weird
                   updatedMessage.variations = [...currentVariations, newContent];
                   updatedMessage.currentVariation = updatedMessage.variations.length - 1;
               }
           }
           return updatedMessage;
         }
         return msg;
       });
       // Save/append after update only if it's a real character and not a streaming update
       if (updatedMessage && !isGenericAssistant && !isStreamingUpdate) {
         saveChat(newMessages, prev.currentUser);
         appendMessage(updatedMessage); // Use debounced append for final updates
       }
       return { ...prev, messages: newMessages };
     });
   };

   // --- Effects ---
   useEffect(() => { // Load chat on character change or options change
     const characterId = effectiveCharacterData?.data?.name; // Use name as ID for now
     const isWorld = options?.isWorldPlay ?? false;

     // Prevent reload if character hasn't changed, unless switching between world/normal chat
     if (characterId === lastCharacterId.current && !isInitialLoad.current) {
       // console.log("Character ID hasn't changed, skipping chat load."); // Reduce logging
       return;
     }

     console.log(`Character changed to: ${characterId}. Loading chat...`);
     lastCharacterId.current = characterId || null;
     isInitialLoad.current = true; // Set flag for initial load sequence

     // Disable auto-save during load/initialization for non-world chats
     autoSaveEnabled.current = isWorld; // Only enable auto-save immediately for world play

     const loadChat = async () => {
       console.log(`[useChatMessages] loadChat called. Character ID: ${characterId}, Name: ${effectiveCharacterData?.data?.name}, FirstMes: ${effectiveCharacterData?.data?.first_mes?.substring(0,30)}...`, 'isWorldPlay:', isWorld);
       if (!characterId) {
         console.log("[useChatMessages] No character ID, resetting to default assistant state.");
         setState({ // Reset state for generic assistant
           messages: [], isLoading: false, isGenerating: false, error: null,
           currentUser: ChatStorage.getCurrentUser(), // Keep current user
           lastContextWindow: null, generatingId: null,
           reasoningSettings: DEFAULT_REASONING_SETTINGS // Reset reasoning
         });
         hasInitializedChat.current = false;
         isInitialLoad.current = false; // Generic assistant doesn't "load"
         autoSaveEnabled.current = false; // Disable auto-save for generic assistant
         return;
       }

       setState(prev => ({ ...prev, isLoading: true, error: null }));
       try {
         // Use loadLatestChat instead of getLatestChatId
         const latestChatData = await ChatStorage.loadLatestChat(effectiveCharacterData);
         
         // Enhanced response handling with more detailed logging
         console.log("loadLatestChat response:", {
           success: latestChatData?.success,
           hasChatIdProperty: latestChatData?.hasOwnProperty('chat_id'), // Check for chat_id
           chatIdValue: latestChatData?.chat_id, // Log the value of chat_id
           hasMessages: latestChatData?.messages && latestChatData.messages.length > 0,
           errorType: latestChatData?.error ? typeof latestChatData.error : 'none',
           isRecoverable: latestChatData?.isRecoverable
         });
         
         // Use latestChatData.chat_id (snake_case) as returned by the backend
         if (latestChatData && latestChatData.success && latestChatData.chat_id) {
             // If successful and we got a chat_id, load that specific chat
             console.log(`Found existing chat with ID: ${latestChatData.chat_id}, loading it...`);
             await loadExistingChat(latestChatData.chat_id);
         } else if (latestChatData?.isRecoverable ||
                   (latestChatData && !latestChatData.success && 
                   (latestChatData.error?.includes("No chats found") || 
                    latestChatData.error?.includes("no chat files found") ||
                    latestChatData.error?.includes("empty success response") ||
                    latestChatData.error?.includes("Failed to load chat")))) {
             
             // Check if this is a first-time character with first_mes available
             if (effectiveCharacterData?.data?.first_mes && latestChatData?.first_mes_available) {
               console.log("First-time character with first_mes detected. Creating new chat with greeting.");
             } else {
               console.log("No existing chats found or recoverable error, starting new chat.");
             }
             
             // In either case, create a new chat which will use first_mes if available
             // handleNewChat will properly substitute variables in first_mes
             await handleNewChat();
         } else {
             // Handle other errors from loadLatestChat or unexpected responses
             let detail = "Unknown error during chat load.";
             if (latestChatData && typeof latestChatData.error === 'string' && latestChatData.error.trim() !== '') {
               detail = latestChatData.error;
             } else if (latestChatData) {
               detail = 'Chat data structure was unexpected after loading.';
             } else {
               detail = 'No chat data returned from storage.';
             }
             // For first-time character with no chats, provide clearer message
             if (effectiveCharacterData?.data?.first_mes && !latestChatData?.success) {
               console.log("Character has first_mes but chat loading failed, falling back to creating new chat");
               // handleNewChat will properly substitute variables in first_mes
               await handleNewChat();
               return;
             }
             
             console.error("Failed to load latest chat or unexpected response. Detail:", detail, "Full response:", latestChatData);
             // Log if there's a first message available for better debugging
             if (effectiveCharacterData?.data?.first_mes) {
               console.log("Note: Character has first_mes which could be used as a fallback");
             }
             setState(prev => ({ ...prev, isLoading: false, error: `Failed to load chat: ${detail}` }));
             toast.error("Failed to load chat", {
               description: `${detail.substring(0, 100)}${detail.length > 100 ? '...' : ''}`,
               action: {
                 label: "Try Again",
                 onClick: () => handleNewChat() // Attempt to start a new chat
               }
             });
           }
         } catch (err) { // This catch is for truly unexpected errors during the loading process
           console.error("Critical error during chat loading process:", err);
           const errorMessage = err instanceof Error ? err.message : "Unknown critical error";
           
           // If this is a new character with first_mes, we can still recover
           if (effectiveCharacterData?.data?.first_mes) {
             console.log("Character has first_mes available despite critical error, attempting to create new chat");
             await handleNewChat();
             return;
           }
           
           setState(prev => ({ ...prev, isLoading: false, error: `Critical chat load error: ${errorMessage}` }));
           toast.error("Critical chat load error", {
             description: `${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`,
             action: {
               label: "Start New Chat",
               onClick: () => handleNewChat()
             }
           });
         } finally {
          // Ensure isLoading is false after initial load attempt completes
          setState(prev => ({ ...prev, isLoading: false }));
          isInitialLoad.current = false; // Mark initial load attempt as complete
          // Re-enable auto-save after load/init completes if it's not the generic assistant
          if (!isGenericAssistant) {
              autoSaveEnabled.current = true;
          }
       }
     };

     loadChat();

     // Cleanup function to cancel generation if component unmounts or character changes
     return () => {
       if (currentGenerationRef.current) {
         console.log("Character changed/unmounted, aborting ongoing generation.");
         stopGeneration();
       }
       // Clear save timeout on unmount/change
       if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
     };
   }, [effectiveCharacterData, options?.isWorldPlay, loadExistingChat, handleNewChat, stopGeneration, isGenericAssistant]); // Added isGenericAssistant


   // Effect to load reasoning settings from storage on mount
   useEffect(() => {
     try {
       const savedSettings = localStorage.getItem(REASONING_SETTINGS_KEY);
       if (savedSettings) {
         setState(prev => ({ ...prev, reasoningSettings: { ...DEFAULT_REASONING_SETTINGS, ...JSON.parse(savedSettings) } }));
       }
     } catch (err) {
       console.error("Error loading reasoning settings:", err);
     }
   }, []); // Empty dependency array ensures this runs only once on mount

   // Effect to save reasoning settings whenever they change
   useEffect(() => {
     localStorage.setItem(REASONING_SETTINGS_KEY, JSON.stringify(state.reasoningSettings));
   }, [state.reasoningSettings]);

   // Effect to handle forced stop events from outside the hook
   useEffect(() => { // Handle force stop events
     const handleForceStop = () => {
       console.log('Received force stop event in useChatMessages, stopping generation.');
       if (state.isGenerating) {
         stopGeneration();
         // Update state to reflect the stop immediately if needed, though stopGeneration should handle it
         setState(prev => ({
             ...prev,
             isGenerating: false,
             generatingId: null,
             // Optionally mark the message as aborted if generatingId is known
             messages: prev.messages.map(msg => msg.id === prev.generatingId ? {...msg, status: 'aborted' as Message['status']} : msg)
         }));
       }
     };

     window.addEventListener('cardshark:force-generation-stop', handleForceStop);

     return () => {
       window.removeEventListener('cardshark:force-generation-stop', handleForceStop);
     };
   }, [state.isGenerating, stopGeneration]); // Depend on isGenerating and stopGeneration


  // --- Return Values ---
  return {
    messages: state.messages,
    isLoading: state.isLoading,
    isGenerating: state.isGenerating,
    error: state.error,
    currentUser: state.currentUser,
    lastContextWindow: state.lastContextWindow,
    generatingId: state.generatingId,
    reasoningSettings: state.reasoningSettings,
    activeCharacterData: effectiveCharacterData, // Added this
    generateResponse,
    regenerateMessage,
    generateVariation, // Expose generateVariation
    cycleVariation,
    stopGeneration,
    deleteMessage,
    updateMessage,
    setCurrentUser,
    loadExistingChat,
    handleNewChat, // Expose handleNewChat
    updateReasoningSettings,
    clearError,
    generateNpcIntroduction // Added this
  };
}
