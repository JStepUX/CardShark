// useChatMessages.ts (refactored)
import { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { CharacterData } from '../contexts/CharacterContext';
import { Message, UserProfile, ChatState } from '../types/messages'; // Import IMessage
import { PromptHandler } from '../handlers/promptHandler';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { APIConfig } from '../types/api';
import { ChatStorage } from '../services/chatStorage';
import { generateUUID } from '../utils/generateUUID'; // Ensure this is imported
import { CharacterCard } from '../types/schema'; // Import CharacterCard type

// --- Interfaces ---
interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions?: string;
}

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

  const { apiConfig } = useContext(APIConfigContext);

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
    const fullConfig = JSON.parse(JSON.stringify(config));
    fullConfig.generation_settings = { ...defaultConfig.generation_settings, ...(fullConfig.generation_settings || {}) };
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

  const setGenerationComplete = (
      messageId: string, finalContent: string, contextWindowType: string,
      receivedChunks: number, originalContentForVariation?: string
    ) => {
    // console.log('[DEBUG] setGenerationComplete called with:', { messageId, finalContent, contextWindowType, receivedChunks, originalContentForVariation }); // Reduced logging
    setState(prev => {
      if (!prev.isGenerating || prev.generatingId !== messageId) {
        console.log(`Completion ignored: Generation for ${messageId} already stopped/changed.`);
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

  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []); // No dependencies needed

  const resetStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      console.warn(`Stream timed out after ${STREAM_INACTIVITY_TIMEOUT_MS / 1000}s. Aborting.`);
      stopGeneration(); // Call stopGeneration on timeout
    }, STREAM_INACTIVITY_TIMEOUT_MS);
  }, [clearStreamTimeout]); // Removed stopGeneration dependency (defined later)

  const handleGenerationError = useCallback((err: any, messageId: string | null, operationType: string = 'generation') => {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const errorMessage = isAbort ? `${operationType} cancelled.` : (err instanceof Error ? err.message : `Unknown ${operationType} error`);
    console.error(`Error during ${operationType}${messageId ? ` for message ${messageId}` : ''}:`, err);

    setState(prev => {
      let updatedMessages = prev.messages;
      if (messageId) {
          updatedMessages = prev.messages.map(msg => {
            if (msg.id === messageId) {
              if (msg.role === 'thinking') return null; // Remove thinking message on error
              return { ...msg, status: (isAbort ? 'aborted' : 'error') as Message['status'], content: msg.content || (isAbort ? "" : `[${operationType} Error]`) };
            }
            return msg;
          }).filter(msg => msg !== null) as Message[];
      }
      return {
        ...prev, messages: updatedMessages, error: errorMessage, isGenerating: false, generatingId: null,
        lastContextWindow: { ...prev.lastContextWindow, type: `${operationType}_error`, timestamp: new Date().toISOString(), characterName: effectiveCharacterData.data?.name || 'Unknown', messageId: messageId, error: errorMessage }
      };
    });
    clearStreamTimeout(); // Clear timeout on error
  }, [effectiveCharacterData, clearStreamTimeout]); // Use effectiveCharacterData, add clearStreamTimeout

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
          const apiInfo = apiConfig ? { provider: apiConfig.provider, model: apiConfig.model, url: apiConfig.url, template: apiConfig.templateId, enabled: apiConfig.enabled } : null;
          await ChatStorage.saveChat(effectiveCharacterData, messagesToSave, user, apiInfo);
          // console.debug(`Saved ${messagesToSave.length} messages`); // Reduced logging
        }
      } catch (err) { console.error('Error saving chat:', err); }
      finally { saveTimeoutRef.current = null; }
    }, 1000);
  }, [effectiveCharacterData, apiConfig, isGenericAssistant]); // Add dependencies

  // Direct API call implementation (non-debounced)
  const appendMessageDirect = useCallback(async (message: Message) => {
    // Only append if it's a real character
    if (isGenericAssistant || message.role === 'thinking' || !effectiveCharacterData.data?.name) return;
    try {
      // Use effectiveCharacterData, check ensures it's not generic
      if (effectiveCharacterData) await ChatStorage.appendMessage(effectiveCharacterData, message);
    } catch (err) { console.error('Error appending/updating message:', err); }
  }, [effectiveCharacterData, isGenericAssistant]); // Removed apiConfig from dependencies as it's not used

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
    if (!response.body) { onError(new Error("Response body is missing")); return; }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    let receivedChunks = 0;
    let done = false;
    let buffer = ''; // Buffer for UI updates
    let bufferTimer: NodeJS.Timeout | null = null;
    
    // Track empty chunks to help diagnose OpenRouter issues
    let emptyChunkCount = 0;
    let lastChunkTime = Date.now();
    let contentStarted = false; // Keep track if we received the first content chunk

    const updateUIBuffer = () => {
      if (buffer.length > 0) {
        const contentToAdd = buffer;
        buffer = '';
        // Use functional update for setState based on potentially stale accumulatedContent
        if (isThinking) {
          updateThinkingMessageContent(messageId, contentToAdd);
        } else {
          updateGeneratingMessageContent(messageId, contentToAdd);
        }
      }
    };

    if (!isThinking) { // Only buffer UI updates for assistant messages
      bufferTimer = setInterval(updateUIBuffer, 100);
    }

    try {
      while (!done) {
        if (!currentGenerationRef.current || currentGenerationRef.current.signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }
        
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        
        // Track time between chunks for debugging
        const now = Date.now();
        const timeSinceLastChunk = now - lastChunkTime;
        lastChunkTime = now;
        
        if (value) {
          const decodedChunk = decoder.decode(value, { stream: true });
          resetStreamTimeout(); // Reset inactivity timer on receiving data
          
          // Log chunk details for debugging if needed
          if (receivedChunks === 0 || receivedChunks % 50 === 0) {
            console.log(`[Stream] Received chunk #${receivedChunks}, length: ${decodedChunk.length}, time since last: ${timeSinceLastChunk}ms`);
          }
          
          receivedChunks++;
          
          // Split the chunk into lines and process each line separately
          const lines = decodedChunk.split('\n');
          
          for (const line of lines) {
            if (!line.trim()) continue; // Skip empty lines
            
            let contentDelta: string | null = null;
            let isDoneSignal = false;

            // Process each data line independently
            if (line.startsWith('data: ')) {
              const jsonData = line.substring(6).trim();
              
              if (jsonData === '[DONE]') { 
                console.log('[Stream] Received [DONE] marker');
                isDoneSignal = true; 
              } else {
                try {
                  // Parse the JSON string
                  const parsed = JSON.parse(jsonData);
                  
                  // Handle OpenAI/OpenRouter token format
                  if (typeof parsed.token === 'string') {
                    contentDelta = parsed.token;
                  } 
                  // Also check for direct content_delta format
                  else if (typeof parsed.content_delta === 'string') {
                    contentDelta = parsed.content_delta;
                  } 
                  // Fallback to OpenAI/OpenRouter chat format
                  else if (parsed.choices?.[0]?.delta?.content) {
                    contentDelta = parsed.choices[0].delta.content;
                  } 
                  // Another format used by some APIs
                  else if (isThinking && typeof parsed.content === 'string') {
                    contentDelta = parsed.content;
                  }
                  // Handle explicit empty content delta
                  else if (parsed.choices?.[0]?.delta && 'content' in parsed.choices[0].delta && parsed.choices[0].delta.content === null) {
                    emptyChunkCount++;
                  }
                  else if (parsed.error) { 
                    throw new Error(parsed.error.message || "Error from stream"); 
                  }
                } catch (e) {
                  // Don't crash on parse error - log it and continue
                  console.warn('[Stream] Failed to parse JSON data line:', line, e);
                  
                  // Only log a warning, don't treat as fatal error since some APIs
                  // send multiple partial data lines that won't parse individually
                }
              }
            } else {
               // Handle lines that are NOT SSE (don't start with 'data: ')
               try {
                 const parsed = JSON.parse(line);
                 if (typeof parsed.token === 'string') {
                   contentDelta = parsed.token;
                 } else if (typeof parsed.content_delta === 'string') {
                   contentDelta = parsed.content_delta;
                 } else if (isThinking && typeof parsed.content === 'string') {
                   contentDelta = parsed.content;
                 } else if (parsed.error) {
                   throw new Error(parsed.error.message || "Error from plain JSON stream");
                 }
               } catch (e) {
                 // Plain text might be sent directly
                 // This is rare but can happen with some APIs
               }
            }

            // Process any extracted content
            if (contentDelta !== null) {
               if (!contentStarted) {
                 console.log('[Stream] First content chunk received:', contentDelta.substring(0, 50) + (contentDelta.length > 50 ? '...' : ''));
                 contentStarted = true;
               }
               
               accumulatedContent += contentDelta;
               buffer += contentDelta;
               
               if (isThinking) {
                 // Update thinking message immediately (no buffering needed)
                 updateThinkingMessageContent(messageId, contentDelta);
               }
            }

            if (isDoneSignal) {
              done = true;
              break; // Exit inner loop once DONE is received
            }
          } // End for loop over lines
        } // End if(value)
        
        // Force update UI buffer for non-thinking messages
        if (buffer.length > 0 && !isThinking) {
          updateUIBuffer();
        }
        
        if (done) break; // Exit outer loop if done
      } // End while loop
      
      // Log streaming statistics for debugging
      console.log(`[Stream] Streaming complete. Chunks: ${receivedChunks}, Empty chunks: ${emptyChunkCount}, Total content length: ${accumulatedContent.length}`);
      
      // Process any remaining buffer content
      if (buffer.length > 0) {
        updateUIBuffer();
      }
      
      onComplete(accumulatedContent, receivedChunks);
    } catch (err) {
      console.error('[Stream] Stream error:', err);
      onError(err as Error);
    } finally {
      if (bufferTimer) clearInterval(bufferTimer);
    }
  }, [updateGeneratingMessageContent, updateThinkingMessageContent, resetStreamTimeout]);

  // --- Generation Functions ---
  // Helper to get context messages, ensuring full Message type for formatChatHistory
  const getContextMessages = (currentState: EnhancedChatState, excludeId?: string): Message[] => {
      return currentState.messages
        .filter(msg => msg.role !== 'thinking' && msg.id !== excludeId)
        .map((msg): Message => { // Use full msg object and explicitly type the return
           let finalContent = msg.content;
           // Use the current variation's content if available
           if (msg.variations && msg.variations.length > 0 && typeof msg.currentVariation === 'number' && msg.variations[msg.currentVariation]) {
             finalContent = msg.variations[msg.currentVariation];
           }
           const cleanContent = PromptHandler.stripHtmlTags(finalContent);

           // Ensure only valid roles are passed through
           let validRole: 'user' | 'assistant' | 'system';
           if (msg.role === 'user') validRole = 'user';
           else if (msg.role === 'assistant') validRole = 'assistant';
           else validRole = 'system'; // Treat original 'system' messages as system

           // Return object matching the full Message structure
           return {
               id: msg.id,
               role: validRole,
               content: cleanContent,
               timestamp: msg.timestamp,
               variations: msg.variations,
               currentVariation: msg.currentVariation,
               aborted: msg.aborted,
               isFirst: msg.isFirst,
               order: msg.order,
               parentMessageId: msg.parentMessageId,
               status: msg.status
            };
        });
  };


  const generateReasoning = useCallback(async (userInput: string, baseContextMessages: Message[]): Promise<string | null> => {
      // Use effectiveCharacterData for checks and logic
      if (!state.reasoningSettings.enabled || !effectiveCharacterData || !apiConfig) return null;
      console.log("Starting reasoning generation...");
      const thinkingMessage = createThinkingMessage();
      setState(prev => ({ ...prev, messages: [...prev.messages, thinkingMessage], isGenerating: true, generatingId: thinkingMessage.id }));
      resetStreamTimeout(); // Start/reset timeout for reasoning

      try {
          const formattedAPIConfig = prepareAPIConfig(apiConfig);
          const template = PromptHandler.getTemplate(formattedAPIConfig.templateId);
          const memory = PromptHandler.createMemoryContext(effectiveCharacterData, template);
          const stopSequences = PromptHandler.getStopSequences(template, effectiveCharacterData.data?.name || 'Character');
          const reasoningInstructions = (state.reasoningSettings.instructions || DEFAULT_REASONING_SETTINGS.instructions || '')
              .replace(/\{\{char\}\}/g, effectiveCharacterData.data?.name || 'Character')
              .replace(/\{\{user\}\}/g, state.currentUser?.name || 'User');
          const reasoningHistory = PromptHandler.formatChatHistory(baseContextMessages, effectiveCharacterData.data?.name || 'Character', formattedAPIConfig.templateId);
          const reasoningUserPrompt = PromptHandler.formatPromptWithTemplate("", userInput, effectiveCharacterData.data?.name || 'Character', template);
          const reasoningSystemInstruction = `<thinking_instructions>${reasoningInstructions}</thinking_instructions>`;
          const requestBody = {
              api_config: formattedAPIConfig,
              generation_params: {
                  prompt: `${reasoningHistory}\n${reasoningUserPrompt}\n${reasoningSystemInstruction}`,
                  memory: memory, stop_sequence: [...stopSequences, '</thinking>']
              }
          };
          const abortController = new AbortController();
          currentGenerationRef.current = abortController;
          const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: abortController.signal });
          if (!response.ok) { const errorText = await response.text(); throw new Error(`Reasoning failed: ${response.status} ${errorText || "(No details)"}`); }

          let finalReasoningContent: string | null = null;
          await processStream(
              response, thinkingMessage.id, true, // isThinking = true
              (finalContent, receivedChunks) => {
                  finalReasoningContent = finalContent;
                  // Note: setGenerationComplete removes the thinking message and clears timeouts
                  setGenerationComplete(thinkingMessage.id, finalContent, 'reasoning_complete', receivedChunks);
              },
              (error) => {
                clearStreamTimeout(); // Clear timeout on reasoning error
                handleGenerationError(error, thinkingMessage.id, 'reasoning');
              }
          );
          return finalReasoningContent;
      } catch (err) {
          handleGenerationError(err, thinkingMessage.id, 'reasoning');
          return null;
      } finally {
           // Timeouts are cleared within setGenerationComplete or handleGenerationError
           setState(prev => prev.generatingId === thinkingMessage.id ? {...prev, isGenerating: false, generatingId: null} : prev);
          currentGenerationRef.current = null;
      }
  }, [effectiveCharacterData, state.reasoningSettings, state.currentUser, state.messages, apiConfig, handleGenerationError, prepareAPIConfig, processStream, setGenerationComplete, resetStreamTimeout, clearStreamTimeout]); // Use effectiveCharacterData, add timeout fns

  const generateResponse = useCallback(async (userInput: string) => {
    // Use effectiveCharacterData for checks, allow generation even if original characterData is null
    if (!effectiveCharacterData || state.isGenerating || !apiConfig) return;
    // Only allow /new command if it's a real character chat
    if (userInput === '/new' && !isGenericAssistant) { handleNewChat(); return; }

    // Check if this is a system message that should be hidden from the chat
    const isSystemMessage = userInput.startsWith('__system__:');
    const cleanedInput = isSystemMessage ? userInput.replace('__system__:', '').trim() : userInput;

    // Only create a visible user message if it's not a system message
    const userMessage = isSystemMessage ? null : createUserMessage(cleanedInput);
    const assistantMessage = createAssistantMessage();
    const baseContextMessages = getContextMessages(state); // Context before user message

    // If it's a system message, we still want to send it to the LLM, but not display it to the user
    const systemMessage = isSystemMessage ? { 
      id: generateUUID(),
      role: 'system' as const,  // Use 'as const' to narrow the type to a literal
      content: cleanedInput,
      timestamp: Date.now(),
      status: 'complete' as Message['status']
    } : null;

    // Include system message in context if present, but don't display it in the UI
    const contextMessages = systemMessage 
      ? [...baseContextMessages, systemMessage] 
      : userMessage ? [...baseContextMessages, userMessage] : baseContextMessages;

    // Only show assistant message in UI, not the system message
    setGeneratingStart(userMessage, assistantMessage);
    resetStreamTimeout(); // Start/reset timeout for main response
    
    // Only append user message to storage if it's a real character and not a system message
    if (!isGenericAssistant && userMessage) await appendMessage(userMessage);
    
    // REMOVED: Save immediately BEFORE streaming - this was causing the issue
    // if (!isGenericAssistant) setState(prev => { saveChat(prev.messages, prev.currentUser); return prev; });

    try {
      let reasoningResult: string | null = null;
      if (state.reasoningSettings.enabled) {
        reasoningResult = await generateReasoning(cleanedInput, baseContextMessages);
         if (reasoningResult === null && state.error && !state.isGenerating) { return; } // Stop if reasoning failed
      }

      // Ensure still generating main response
      setState(prev => ({...prev, isGenerating: true, generatingId: assistantMessage.id}));

      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const template = PromptHandler.getTemplate(formattedAPIConfig.templateId);
      const memory = PromptHandler.createMemoryContext(effectiveCharacterData, template);
      const stopSequences = PromptHandler.getStopSequences(template, effectiveCharacterData.data?.name || 'Character');

      // Prepare final context potentially reasoning
      let finalContextMessages: Message[] = contextMessages;
      if (reasoningResult && state.reasoningSettings.visible) {
          // Create a temporary system message for reasoning
          const reasoningSystemMessage: Message = { role: 'system', content: `<thinking>${reasoningResult}</thinking>`, id: generateUUID(), timestamp: Date.now(), status: 'complete' }; // Added status
          finalContextMessages = [...contextMessages, reasoningSystemMessage];
      }

      const requestBody = {
        api_config: formattedAPIConfig,
        generation_params: {
          prompt: PromptHandler.formatPromptWithTemplate( PromptHandler.formatChatHistory(finalContextMessages, effectiveCharacterData.data?.name || 'Character', formattedAPIConfig.templateId), "", effectiveCharacterData.data?.name || 'Character', template ),
          memory: memory, stop_sequence: stopSequences, character_data: effectiveCharacterData, chat_history: finalContextMessages, current_message: ""
        }
      };
      const contextWindow = { type: 'generation_start', timestamp: new Date().toISOString(), characterName: effectiveCharacterData.data?.name || 'Unknown', messageId: assistantMessage.id, promptUsed: requestBody.generation_params.prompt, memoryUsed: memory, stopSequencesUsed: stopSequences, contextMessageCount: finalContextMessages.length, config: formattedAPIConfig, reasoningProvided: reasoningResult !== null };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));

      const abortController = new AbortController();
      currentGenerationRef.current = abortController;
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: abortController.signal });
      if (!response.ok) { const errorText = await response.text(); throw new Error(`Generation failed: ${response.status} ${errorText || "(No details)"}`); }

      await processStream(
        response, assistantMessage.id, false, // isThinking = false
        (finalContent, receivedChunks) => {
          // Use accumulatedContent for assistant
          setGenerationComplete(assistantMessage.id, finalContent, 'generation_complete', receivedChunks);
          
          // MOVED: Save/append AFTER streaming is complete - fixing the issue
          if (!isGenericAssistant) {
            setState(prev => { 
              // Get the updated message with finalContent from current state
              const msg = prev.messages.find(m => m.id === assistantMessage.id); 
              if (msg) {
                // First save the complete chat with the fully streamed message
                saveChat(prev.messages, prev.currentUser);
                // Then append/update that specific message in storage
                appendMessageDirect(msg); // Use direct (non-debounced) version
              }
              return prev;
            });
          }
        },
        (error) => { 
          handleGenerationError(error, assistantMessage.id); 
          // Only save if there's an error, but still AFTER streaming attempt
          if (!isGenericAssistant) setState(prev => { 
            saveChat(prev.messages, prev.currentUser); 
            const msg = prev.messages.find(m => m.id === assistantMessage.id); 
            if (msg) appendMessageDirect(msg);
            return prev; 
          }); 
        }
      );
    } catch (err) {
      if (!state.error) handleGenerationError(err, assistantMessage.id);
      // Only save/append if it's a real character
      if (!isGenericAssistant) setState(prev => { saveChat(prev.messages, prev.currentUser); const msg = prev.messages.find(m => m.id === assistantMessage.id); if (msg) appendMessageDirect(msg); return prev; });
    } finally {
      currentGenerationRef.current = null;
      setState(prev => prev.generatingId === assistantMessage.id ? {...prev, isGenerating: false, generatingId: null} : prev);
    }
  }, [effectiveCharacterData, isGenericAssistant, state.isGenerating, state.messages, state.reasoningSettings, state.currentUser, apiConfig, handleGenerationError, saveChat, appendMessage, appendMessageDirect, prepareAPIConfig, processStream, generateReasoning, resetStreamTimeout]);

  const regenerateMessage = useCallback(async (messageToRegenerate: Message) => {
    // Use effectiveCharacterData for checks
    if (!effectiveCharacterData || state.isGenerating || !apiConfig || messageToRegenerate.role !== 'assistant') return;
    const messageId = messageToRegenerate.id;
    const messageIndex = state.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex < 1) { console.error("Cannot regenerate: No preceding message."); return; }
    let precedingUserMessage: Message | null = null;
    for (let i = messageIndex - 1; i >= 0; i--) { if (state.messages[i].role === 'user') { precedingUserMessage = state.messages[i]; break; } }
    if (!precedingUserMessage) { console.error("Cannot regenerate: No preceding user message."); return; }
    // const promptText = htmlToText(precedingUserMessage.content); // Not used directly

    setState(prev => ({ ...prev, isGenerating: true, generatingId: messageId, error: null, messages: prev.messages.map(msg => msg.id === messageId ? { ...msg, content: '', status: 'streaming' as Message['status'] } : msg) }));

    try {
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const template = PromptHandler.getTemplate(formattedAPIConfig.templateId);
      const memory = PromptHandler.createMemoryContext(effectiveCharacterData, template);
      const stopSequences = PromptHandler.getStopSequences(template, effectiveCharacterData.data?.name || 'Character');
      // Context includes messages *up to and including* the preceding user message
      const contextMessages = getContextMessages(state, messageId).slice(0, state.messages.findIndex(msg => msg.id === precedingUserMessage!.id) + 1);
      const requestBody = {
        api_config: formattedAPIConfig,
        generation_params: {
          prompt: PromptHandler.formatPromptWithTemplate( PromptHandler.formatChatHistory(contextMessages, effectiveCharacterData.data?.name || 'Character', formattedAPIConfig.templateId), "", effectiveCharacterData.data?.name || 'Character', template ),
          memory: memory, stop_sequence: stopSequences, character_data: effectiveCharacterData, chat_history: contextMessages, current_message: ""
        }
      };
      const contextWindow = { type: 'regeneration_start', timestamp: new Date().toISOString(), characterName: effectiveCharacterData.data?.name || 'Unknown', messageId: messageId, promptUsed: requestBody.generation_params.prompt, memoryUsed: memory, stopSequencesUsed: stopSequences, contextMessageCount: contextMessages.length, config: formattedAPIConfig };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
      const abortController = new AbortController();
      currentGenerationRef.current = abortController;
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: abortController.signal });
      if (!response.ok) { const errorText = await response.text(); throw new Error(`Generation failed: ${response.status} ${errorText || "(No details)"}`); }

      // let accumulatedContent = ''; // Removed
      await processStream(
        response, messageId, false, // isThinking = false
        (finalContent, receivedChunks) => {
          setGenerationComplete(messageId, finalContent, 'regeneration_complete', receivedChunks, messageToRegenerate.content);
          // Only save/append if it's a real character
          if (!isGenericAssistant) setState(prev => { saveChat(prev.messages, prev.currentUser); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; });
        },
        (error) => { handleGenerationError(error, messageId, 'regeneration'); if (!isGenericAssistant) setState(prev => { saveChat(prev.messages, prev.currentUser); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; }); }
      );
    } catch (err) {
      if (!state.error) handleGenerationError(err, messageId, 'regeneration');
      // Only save/append if it's a real character
      if (!isGenericAssistant) setState(prev => { saveChat(prev.messages, prev.currentUser); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; });
    } finally {
      setState(prev => prev.generatingId === messageId ? {...prev, isGenerating: false, generatingId: null} : prev);
      currentGenerationRef.current = null;
    }
  }, [effectiveCharacterData, isGenericAssistant, state.isGenerating, state.messages, state.currentUser, apiConfig, handleGenerationError, saveChat, appendMessage, prepareAPIConfig, processStream]); // Add dependencies

  const generateVariation = useCallback(async (messageToVary: Message) => {
    // Use effectiveCharacterData for checks
    if (!effectiveCharacterData || state.isGenerating || !apiConfig || messageToVary.role !== 'assistant') return;
    const messageId = messageToVary.id;
    const originalContent = messageToVary.content; // Store original content for setGenerationComplete
    const messageIndex = state.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex < 1) { console.error("Cannot generate variation: No preceding message."); return; }
    let precedingUserMessage: Message | null = null;
    for (let i = messageIndex - 1; i >= 0; i--) { if (state.messages[i].role === 'user') { precedingUserMessage = state.messages[i]; break; } }
    if (!precedingUserMessage) { console.error("Cannot generate variation: No preceding user message."); return; }
    // const promptText = htmlToText(precedingUserMessage.content); // Not used

    setState(prev => ({ ...prev, isGenerating: true, generatingId: messageId, error: null, messages: prev.messages.map(msg => msg.id === messageId ? { ...msg, status: 'generating_variation' as Message['status'] } : msg) }));

    try {
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const template = PromptHandler.getTemplate(formattedAPIConfig.templateId);
      const memory = PromptHandler.createMemoryContext(effectiveCharacterData, template);
      const stopSequences = PromptHandler.getStopSequences(template, effectiveCharacterData.data?.name || 'Character');
      // Context includes messages *up to and including* the preceding user message
      const contextMessages = getContextMessages(state, messageId).slice(0, state.messages.findIndex(msg => msg.id === precedingUserMessage!.id) + 1);

      // console.log("Frontend: Preparing to fetch /api/generate for variation..."); // Reduced logging
      const requestBody = {
        api_config: formattedAPIConfig,
        generation_params: {
          prompt: PromptHandler.formatPromptWithTemplate( PromptHandler.formatChatHistory(contextMessages, effectiveCharacterData.data?.name || 'Character', formattedAPIConfig.templateId), "", effectiveCharacterData.data?.name || 'Character', template ),
          memory: memory, stop_sequence: stopSequences, character_data: effectiveCharacterData, chat_history: contextMessages, current_message: ""
        }
      };
      const contextWindow = { type: 'variation_start', timestamp: new Date().toISOString(), characterName: effectiveCharacterData.data?.name || 'Unknown', messageId: messageId, promptUsed: requestBody.generation_params.prompt, memoryUsed: memory, stopSequencesUsed: stopSequences, contextMessageCount: contextMessages.length, config: formattedAPIConfig };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));

      // console.log("Frontend: Preparing to fetch /api/generate with body:", JSON.stringify(requestBody, null, 2)); // Reduced logging

      const abortController = new AbortController();
      currentGenerationRef.current = abortController;
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: abortController.signal });
      if (!response.ok) { const errorText = await response.text(); throw new Error(`Variation generation failed: ${response.status} ${errorText || "(No details)"}`); }

      // let accumulatedContent = ''; // Removed
      await processStream(
        response, messageId, false, // isThinking = false
        (finalContent, receivedChunks) => {
          // Use accumulatedContent (tokens) for assistant
          setGenerationComplete(messageId, finalContent, 'variation_complete', receivedChunks, originalContent);
          // Only save/append if it's a real character
          if (!isGenericAssistant) setState(prev => { saveChat(prev.messages, prev.currentUser); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; });
        },
        (error) => { handleGenerationError(error, messageId, 'variation'); if (!isGenericAssistant) setState(prev => { saveChat(prev.messages, prev.currentUser); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; }); }
      );
    } catch (err) {
      if (!state.error) handleGenerationError(err, messageId, 'variation');
      // Only save/append if it's a real character
      if (!isGenericAssistant) setState(prev => { saveChat(prev.messages, prev.currentUser); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; });
    } finally {
      setState(prev => prev.generatingId === messageId ? {...prev, isGenerating: false, generatingId: null} : prev);
      currentGenerationRef.current = null;
    }
  }, [effectiveCharacterData, isGenericAssistant, state.isGenerating, state.messages, state.currentUser, apiConfig, handleGenerationError, saveChat, appendMessage, prepareAPIConfig, processStream]); // Add dependencies


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

  const stopGeneration = useCallback(() => {
    if (!state.isGenerating || !currentGenerationRef.current) {
      if (state.isGenerating) setState(prev => ({...prev, isGenerating: false, generatingId: null})); // Ensure state is reset if ref is missing
      return;
    }
    console.log("Attempting to stop generation...");
    currentGenerationRef.current.abort();
    clearStreamTimeout(); // Clear timeout when manually stopping
  }, [state.isGenerating, clearStreamTimeout]);

  const setCurrentUser = (user: UserProfile | null) => {
    ChatStorage.saveCurrentUser(user); // Correct method name
    setState(prev => ({ ...prev, currentUser: user, lastContextWindow: { type: 'user_changed', timestamp: new Date().toISOString(), userName: user?.name || 'None', characterName: effectiveCharacterData?.data?.name || 'Unknown' } }));
  };

  const loadExistingChat = useCallback(async (chatId: string) => {
    // Don't load if it's the generic assistant
    if (isGenericAssistant) {
      console.log("Skipping chat load for generic assistant.");
      setState(prev => ({ ...prev, messages: [], isLoading: false, error: null }));
      return;
    }

    console.log("Starting chat load with autoSaveEnabled:", autoSaveEnabled.current);
    
    // Temporarily disable autosave to prevent race conditions during load
    const previousAutoSaveState = autoSaveEnabled.current;
    autoSaveEnabled.current = false;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      // Pass character data first to allow the backend to find the active chat
      // Only use chatId as an explicit override if it doesn't match the character name
      const characterName = effectiveCharacterData?.data?.name || '';
      const shouldUseActiveChat = chatId === characterName;
      
      console.log(`Loading chat${shouldUseActiveChat ? " (using active chat)" : ` with ID ${chatId}`} for character: ${characterName}`);
      
      // If chatId equals character name, rely on backend active chat lookup
      // Otherwise use the explicit chatId that was provided
      const loadedChat = await ChatStorage.loadChat(
        shouldUseActiveChat ? null : chatId, // Pass null if using active chat
        effectiveCharacterData  // Always pass character data
      );
      
      // Check if loading was successful and messages exist
      if (loadedChat && loadedChat.success && Array.isArray(loadedChat.messages)) {
        console.log(`Successfully loaded chat with ${loadedChat.messages.length} messages`);
        
        // Mark chat as initialized BEFORE setting state to prevent race conditions
        hasInitializedChat.current = true;
        
        // Prepare messages with proper status
        const messagesWithStatus = loadedChat.messages.map((msg: any) => ({ 
          ...msg, 
          status: 'complete' as Message['status'] 
        }));
        
        // Update state with loaded messages
        setState(prev => ({ 
          ...prev, 
          messages: messagesWithStatus, 
          currentUser: loadedChat.metadata?.lastUser || prev.currentUser, 
          lastContextWindow: { 
            type: 'loaded_chat', 
            timestamp: new Date().toISOString(), 
            chatId: loadedChat.metadata?.chat_metadata?.chat_id || chatId, 
            messageCount: messagesWithStatus.length 
          } 
        }));
      } else if (effectiveCharacterData?.data?.first_mes) {
        // Load first message if chat doesn't exist and character has one
        console.log("No existing chat found, creating initial message from first_mes");
        hasInitializedChat.current = true;
        const firstMessage = createAssistantMessage(effectiveCharacterData.data.first_mes, 'complete');
        
        setState(prev => ({ 
          ...prev, 
          messages: [firstMessage], 
          lastContextWindow: { 
            type: 'initial_message', 
            timestamp: new Date().toISOString(), 
            firstMessage: firstMessage.content 
          } 
        }));
        
        // Now we can safely save the first message since we've marked chat as initialized
        setTimeout(() => {
          console.log("Saving initial message after slight delay");
          saveChat([firstMessage], state.currentUser);
        }, 100);
      } else {
        // No chat found and no first message
        console.log("No existing chat or first_mes content found");
        hasInitializedChat.current = true;
        setState(prev => ({ 
          ...prev, 
          messages: [], 
          lastContextWindow: { 
            type: 'no_chat_found', 
            timestamp: new Date().toISOString(), 
            chatId: chatId 
          } 
        }));
      }
    } catch (err) {
      console.error("Error loading chat:", err);
      setState(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to load chat' }));
      hasInitializedChat.current = false; // Failed to initialize
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
      
      // Wait a moment before re-enabling autosave to ensure state updates are complete
      setTimeout(() => {
        console.log("Re-enabling autosave:", previousAutoSaveState && !isGenericAssistant);
        autoSaveEnabled.current = previousAutoSaveState && !isGenericAssistant;
      }, 500);
    }
  }, [effectiveCharacterData, isGenericAssistant, state.currentUser, saveChat]);

  const updateReasoningSettings = (settings: Partial<ReasoningSettings>) => {
    try {
      const newSettings = { ...state.reasoningSettings, ...settings };
      localStorage.setItem(REASONING_SETTINGS_KEY, JSON.stringify(newSettings));
      setState(prev => ({ ...prev, reasoningSettings: newSettings, lastContextWindow: { type: 'reasoning_settings_updated', timestamp: new Date().toISOString(), enabled: newSettings.enabled, visible: newSettings.visible, characterName: effectiveCharacterData?.data?.name || 'Unknown' } }));
    } catch (err) {
      console.error("Error saving reasoning settings:", err);
      setState(prev => ({ ...prev, error: "Failed to save reasoning settings" }));
    }
  };

   const clearError = useCallback(() => { setState(prev => ({ ...prev, error: null })); }, []);

   const deleteMessage = (messageId: string) => {
     setState(prev => {
       const newMessages = prev.messages.filter(msg => msg.id !== messageId);
       // Only save if it's a real character
       if (!isGenericAssistant) saveChat(newMessages, prev.currentUser);
       return { ...prev, messages: newMessages, lastContextWindow: { type: 'message_deleted', timestamp: new Date().toISOString(), messageId, remainingMessages: newMessages.length, characterName: effectiveCharacterData?.data?.name || 'Unknown' } };
     });
   };

   const updateMessage = (messageId: string, newContent: string, isStreamingUpdate?: boolean) => {
     setState(prev => {
       let updatedMessage: Message | null = null;
       const newMessages = prev.messages.map(msg => {
         if (msg.id === messageId) {
           updatedMessage = { ...msg, content: newContent, status: isStreamingUpdate ? 'streaming' : 'complete' };
           return updatedMessage;
         }
         return msg;
       });

       // Save immediately if not streaming AND it's a real character
       if (!isStreamingUpdate && !isGenericAssistant && updatedMessage) {
         saveChat(newMessages, prev.currentUser);
         appendMessage(updatedMessage); // Update storage
       }
       return { ...prev, messages: newMessages, lastContextWindow: { type: 'message_edited', timestamp: new Date().toISOString(), messageId, newContent: newContent, characterName: effectiveCharacterData?.data?.name || 'Unknown' } };
     });
   };

   const handleNewChat = useCallback(async () => {
    // Don't allow new chat if using generic assistant
    if (isGenericAssistant || !effectiveCharacterData) {
      console.warn("Cannot start a new chat session without a selected character.");
      return;
    }
    console.log("Starting new chat...");
    autoSaveEnabled.current = false; // Disable save during clear
    hasInitializedChat.current = false; // Reset initialization flag
    setState(prev => ({ ...prev, messages: [], isLoading: true, error: null, lastContextWindow: { type: 'new_chat_start', timestamp: new Date().toISOString(), characterName: effectiveCharacterData?.data?.name || 'Unknown' } }));
    try {
      // Use createNewChat instead of deleteChat
      const creationResult = await ChatStorage.createNewChat(effectiveCharacterData);
      if (!creationResult || !creationResult.success) {
        throw new Error(creationResult?.error || "Failed to create new chat session on backend.");
      }
      // Load first message if available, otherwise clear
      if (effectiveCharacterData.data.first_mes) {
          const firstMessage = createAssistantMessage(effectiveCharacterData.data.first_mes, 'complete');
          setState(prev => ({ ...prev, messages: [firstMessage], isLoading: false, lastContextWindow: { ...prev.lastContextWindow, type: 'new_chat_complete', firstMessage: firstMessage.content } }));
          saveChat([firstMessage], state.currentUser); // Save the initial message
          hasInitializedChat.current = true;
      } else {
           setState(prev => ({ ...prev, messages: [], isLoading: false, lastContextWindow: { ...prev.lastContextWindow, type: 'new_chat_complete_empty' } }));
           saveChat([], state.currentUser); // Save empty chat
           hasInitializedChat.current = true;
      }
      console.log("Chat cleared successfully.");
    } catch (err) {
      console.error("Error clearing chat:", err);
       setState(prev => ({ ...prev, isLoading: false, error: err instanceof Error ? err.message : 'Failed to create new chat', lastContextWindow: { ...prev.lastContextWindow, type: 'new_chat_error', error: err instanceof Error ? err.message : 'Unknown error' } }));
    } finally {
      autoSaveEnabled.current = !isGenericAssistant; // Re-enable save only if not generic
    }
  }, [effectiveCharacterData, isGenericAssistant, state.currentUser, saveChat]); // Add dependencies


  // --- Effects ---
  useEffect(() => { // Load chat on character change or options change
    const currentCharacterId = effectiveCharacterData?.data?.name || null;
    const isWorld = options?.isWorldPlay === true; // Check the option
    const isNewContext = currentCharacterId !== lastCharacterId.current;

    // --- Handle Generic Assistant ---
    if (isGenericAssistant) {
        if (isNewContext) { // Only clear if switching *to* generic
            setState(prev => ({ ...prev, messages: [], isLoading: false, error: null }));
            console.log("Switched to generic assistant view, clearing messages.");
            lastCharacterId.current = DEFAULT_ASSISTANT_CHARACTER.data.name; // Track generic assistant "ID"
            hasInitializedChat.current = true; // Mark as initialized
        }
        autoSaveEnabled.current = false; // Disable autosave
        return; // Stop further processing
    }

    // --- Handle World Play ---
    if (isWorld) {
        autoSaveEnabled.current = false; // Disable autosave for worlds
        if (isNewContext || !hasInitializedChat.current) {
            console.log(`Initializing World Play context: ${currentCharacterId}`);
            setState(prev => ({ ...prev, messages: [], isLoading: true, error: null, lastContextWindow: null }));
            lastCharacterId.current = currentCharacterId;
            // Initialize with first_mes directly, skip loading history
            const firstMessageContent = effectiveCharacterData?.data?.first_mes;
            if (firstMessageContent) {
                const firstMessage = createAssistantMessage(firstMessageContent, 'complete');
                setState(prev => ({ ...prev, messages: [firstMessage], isLoading: false }));
            } else {
                setState(prev => ({ ...prev, messages: [], isLoading: false }));
            }
            hasInitializedChat.current = true; // Mark as initialized
        }
        return; // Stop further processing
    }

    // --- Handle Regular Characters (Not Generic Assistant or World Play) ---
    // Initial state for autosave depends on whether this is the first load after startup
    if (isInitialLoad.current) {
        console.log("Initial app load detected, temporarily disabling autosave");
        autoSaveEnabled.current = false; // Initially disable autosave until load completes
        isInitialLoad.current = false;  // Reset the initial load flag
    } else {
        // For subsequent character changes, enable autosave
        autoSaveEnabled.current = true;
    }

    // --- Logic for actual characters ---
    const loadChat = async () => {
      // Use effectiveCharacterData name for loading
      const characterName = effectiveCharacterData?.data?.name;
      if (!characterName) {
        console.warn("Attempted to load chat without a character name.");
        setState(prev => ({ ...prev, messages: [], isLoading: false, error: null }));
        return;
      }

      console.log(`Loading chat for character: ${characterName} (isNewContext: ${isNewContext}, hasInitialized: ${hasInitializedChat.current})`);
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        await loadExistingChat(characterName);
        // loadExistingChat now sets hasInitializedChat.current internally
        
        // After successful load, re-enable autosave with a delay to ensure chat is loaded first
        setTimeout(() => {
          console.log("Re-enabling autosave after successful chat load");
          autoSaveEnabled.current = true;
        }, 1000);
      } catch (err) {
        // Error handling is now inside loadExistingChat
        console.error("Error occurred during loadExistingChat call:", err);
      } finally {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    // Load chat if character ID changes or if it hasn't been initialized yet for this character
    if (isNewContext || !hasInitializedChat.current) {
      loadChat(); // This will call loadExistingChat internally
      lastCharacterId.current = currentCharacterId;
      // hasInitializedChat.current is set within loadExistingChat now
    }

    // Cleanup function
    return () => {
      // If switching characters, disable autosave to prevent race conditions
      if (lastCharacterId.current !== currentCharacterId && lastCharacterId.current !== null) {
        console.log(`Switching from ${lastCharacterId.current} to ${currentCharacterId}, temporarily disabling autosave`);
        autoSaveEnabled.current = false;
      }
    };
  }, [characterData, options?.isWorldPlay, loadExistingChat, isGenericAssistant, effectiveCharacterData]); // Keep dependencies


  // --- Load/Save Reasoning Settings ---
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem(REASONING_SETTINGS_KEY);
      if (savedSettings) {
        setState(prev => ({ ...prev, reasoningSettings: { ...DEFAULT_REASONING_SETTINGS, ...JSON.parse(savedSettings) } }));
      }
    } catch (err) { console.error("Error loading reasoning settings:", err); }
  }, []);

  useEffect(() => {
    localStorage.setItem(REASONING_SETTINGS_KEY, JSON.stringify(state.reasoningSettings));
  }, [state.reasoningSettings]);

  // --- Load/Save Context Window ---
  useEffect(() => {
    if (state.lastContextWindow) {
      localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify(state.lastContextWindow));
    }
  }, [state.lastContextWindow]);

  // --- Force Stop Event Listener ---
  useEffect(() => { // Handle force stop events
    const handleForceStop = () => {
      console.log('Received force stop event in useChatMessages');
      if (currentGenerationRef.current) {
        currentGenerationRef.current.abort();
        currentGenerationRef.current = null;
        // Update state immediately to reflect abortion
        setState(prev => {
          if (!prev.isGenerating || !prev.generatingId) return prev;
          const messageId = prev.generatingId;
          const updatedMessages = prev.messages.map(msg =>
            msg.id === messageId ? { ...msg, status: 'aborted' as Message['status'], content: msg.content || "[Aborted]" } : msg
          ).filter(msg => msg?.role !== 'thinking'); // Remove thinking message on abort
          return { ...prev, messages: updatedMessages, isGenerating: false, generatingId: null, error: "Generation aborted." };
        });
      }
    };
    window.addEventListener('cardshark:force-generation-stop', handleForceStop);
    return () => window.removeEventListener('cardshark:force-generation-stop', handleForceStop);
  }, []); // Empty dependency array ensures this runs once

  // --- Return Values ---
  return {
    ...state,
    // Expose functions
    generateResponse,
    regenerateMessage,
    generateVariation,
    cycleVariation,
    stopGeneration,
    setCurrentUser,
    loadExistingChat,
    updateReasoningSettings,
    deleteMessage,
    updateMessage,
    handleNewChat,
    clearError, // Expose the memoized clearError
    // Provide the effective character data being used (could be default)
    activeCharacterData: effectiveCharacterData
  };
}
// --- Helper Types (if needed elsewhere) ---
export type { ReasoningSettings };
