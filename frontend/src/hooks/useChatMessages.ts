// useChatMessages.ts (refactored)
import { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { CharacterData } from '../contexts/CharacterContext';
import { Message, UserProfile, ChatState, IMessage } from '../types/messages'; // Import IMessage
import { PromptHandler } from '../handlers/promptHandler';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { APIConfig, APIProvider } from '../types/api';
import { ChatStorage } from '../services/chatStorage';
import { MessageUtils } from '../utils/messageUtils';
import { htmlToText } from '../utils/contentUtils';
import { generateUUID } from '../utils/generateUUID';
import { Template } from '../types/templateTypes';

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
const CURRENT_USER_KEY = 'cardshark_current_user'; // Assuming this key is used by ChatStorage

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
export function useChatMessages(characterData: CharacterData | null) {
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
  const autoSaveEnabled = useRef(true);
  const hasInitializedChat = useRef<boolean>(false);

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
  console.log('[DEBUG] updateGeneratingMessageContent called with:', { messageId, chunk });
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
    console.log('[DEBUG] setGenerationComplete called with:', { messageId, finalContent, contextWindowType, receivedChunks, originalContentForVariation });
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
      return { ...prev, messages: finalMessages, isGenerating: false, generatingId: null, lastContextWindow: finalContextWindow };
    });
  };

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
        lastContextWindow: { ...prev.lastContextWindow, type: `${operationType}_error`, timestamp: new Date().toISOString(), characterName: characterData?.data?.name || 'Unknown', messageId: messageId, error: errorMessage }
      };
    });
  }, [characterData]);

  // --- Persistence ---
  const saveChat = useCallback((messageList = state.messages) => {
    if (!characterData?.data?.name || !autoSaveEnabled.current) return;
    const messagesToSave = messageList.filter(msg => msg.role !== 'thinking');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (characterData) {
          const apiInfo = apiConfig ? { provider: apiConfig.provider, model: apiConfig.model, url: apiConfig.url, template: apiConfig.templateId, enabled: apiConfig.enabled } : null;
          await ChatStorage.saveChat(characterData, messagesToSave, state.currentUser, apiInfo);
          console.debug(`Saved ${messagesToSave.length} messages`);
        }
      } catch (err) { console.error('Error saving chat:', err); }
      finally { saveTimeoutRef.current = null; }
    }, 1000);
  }, [characterData, state.messages, state.currentUser, apiConfig]);

  const appendMessage = useCallback(async (message: Message) => {
    if (message.role === 'thinking' || !characterData?.data?.name) return;
    try {
      if (characterData) await ChatStorage.appendMessage(characterData, message);
    } catch (err) { console.error('Error appending/updating message:', err); }
  }, [characterData]);

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

    const updateUIBuffer = () => {
        if (buffer.length > 0) {
            const contentToAdd = buffer;
            buffer = '';
            // Use functional update for setState based on potentially stale accumulatedContent
            // No need to read state here anymore
            if (isThinking) {
                // Assuming updateThinkingMessageContent is similarly refactored or doesn't need currentFullContent
                updateThinkingMessageContent(messageId, contentToAdd); // Pass only chunk
            } else {
                updateGeneratingMessageContent(messageId, contentToAdd); // Pass only chunk
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
        if (value) {
          const decodedChunk = decoder.decode(value, { stream: true });
          console.log('[DEBUG] processStream received chunk:', decodedChunk);
          receivedChunks++;
          const lines = decodedChunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonData = line.substring(6).trim();
              if (jsonData === '[DONE]') { done = true; break; }
              try {
                const parsed = JSON.parse(line.replace(/^data: /, ""));
                console.log('[DEBUG] processStream parsed:', parsed);
                // For assistant messages (not thinking), accumulate tokens
                if (!isThinking && parsed.token !== undefined) {
                  accumulatedContent += parsed.token;
                  if (!streamDone && parsed.token) {
                    console.log('[DEBUG] processStream calling updateGeneratingMessageContent:', { messageId, token: parsed.token });
                    updateGeneratingMessageContent(messageId, parsed.token);
                  }
                } else if (isThinking && parsed.content) {
                  accumulatedContent += parsed.content;
                  updateThinkingMessageContent(messageId, parsed.content);
                } else if (parsed.error) { throw new Error(parsed.error.message || "Error from stream"); }
              } catch (e) { /* Ignore non-JSON */ }
            }
          }
        }
        if (done) break;
      }
      // No need for final buffer processing or re-reading state

      // Use the locally accumulated content
      // Use the locally accumulated content directly
      console.log(`Stream processing complete. Chunks: ${receivedChunks}. Length: ${accumulatedContent.length}`);
      onComplete(accumulatedContent, receivedChunks); // Pass the final accumulated string
    } catch (err) {
      if (bufferTimer) clearInterval(bufferTimer);
      onError(err as Error);
    }
  }, [updateGeneratingMessageContent, updateThinkingMessageContent]); // Added state updaters

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
      if (!state.reasoningSettings.enabled || !characterData || !apiConfig) return null;
      console.log("Starting reasoning generation...");
      const thinkingMessage = createThinkingMessage();
      setState(prev => ({ ...prev, messages: [...prev.messages, thinkingMessage], isGenerating: true, generatingId: thinkingMessage.id }));

      try {
          const formattedAPIConfig = prepareAPIConfig(apiConfig);
          const template = PromptHandler.getTemplate(formattedAPIConfig.templateId);
          const memory = PromptHandler.createMemoryContext(characterData, template);
          const stopSequences = PromptHandler.getStopSequences(template, characterData.data?.name || 'Character');
          const reasoningInstructions = (state.reasoningSettings.instructions || DEFAULT_REASONING_SETTINGS.instructions || '')
              .replace(/\{\{char\}\}/g, characterData.data?.name || 'Character')
              .replace(/\{\{user\}\}/g, state.currentUser?.name || 'User');
          const reasoningHistory = PromptHandler.formatChatHistory(baseContextMessages, characterData.data?.name || 'Character', formattedAPIConfig.templateId);
          const reasoningUserPrompt = PromptHandler.formatPromptWithTemplate("", userInput, characterData.data?.name || 'Character', template);
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
                  // Note: setGenerationComplete removes the thinking message
                  setGenerationComplete(thinkingMessage.id, finalContent, 'reasoning_complete', receivedChunks);
              },
              (error) => { handleGenerationError(error, thinkingMessage.id, 'reasoning'); }
          );
          return finalReasoningContent;
      } catch (err) {
          handleGenerationError(err, thinkingMessage.id, 'reasoning');
          return null;
      } finally {
           setState(prev => prev.generatingId === thinkingMessage.id ? {...prev, isGenerating: false, generatingId: null} : prev);
          currentGenerationRef.current = null;
      }
  }, [characterData, state.reasoningSettings, state.currentUser, state.messages, apiConfig, handleGenerationError, prepareAPIConfig, processStream, setGenerationComplete]); // Added dependencies

  const generateResponse = useCallback(async (userInput: string) => {
    if (!characterData || state.isGenerating || !apiConfig) return;
    if (userInput === '/new') { handleNewChat(); return; }

    const userMessage = createUserMessage(userInput);
    const assistantMessage = createAssistantMessage();
    const baseContextMessages = getContextMessages(state); // Context before user message

    setGeneratingStart(userMessage, assistantMessage);
    await appendMessage(userMessage);
    setState(prev => { saveChat(prev.messages); return prev; }); // Save state with placeholders

    try {
      let reasoningResult: string | null = null;
      if (state.reasoningSettings.enabled) {
        reasoningResult = await generateReasoning(userInput, baseContextMessages);
         if (reasoningResult === null && state.error && !state.isGenerating) { return; } // Stop if reasoning failed
      }

      // Ensure still generating main response
      setState(prev => ({...prev, isGenerating: true, generatingId: assistantMessage.id}));

      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const template = PromptHandler.getTemplate(formattedAPIConfig.templateId);
      const memory = PromptHandler.createMemoryContext(characterData, template);
      const stopSequences = PromptHandler.getStopSequences(template, characterData.data?.name || 'Character');

      // Prepare final context including user message and potentially reasoning
      // Need to pass the full Message object to satisfy formatChatHistory
      const contextWithUser: Message[] = [...baseContextMessages, userMessage];
      let finalContextMessages: Message[] = contextWithUser;
      if (reasoningResult && state.reasoningSettings.visible) {
          // Create a temporary system message for reasoning
          const reasoningSystemMessage: Message = { role: 'system', content: `<thinking>${reasoningResult}</thinking>`, id: generateUUID(), timestamp: Date.now() };
          finalContextMessages = [...contextWithUser, reasoningSystemMessage];
      }

      const requestBody = {
        api_config: formattedAPIConfig,
        generation_params: {
          prompt: PromptHandler.formatPromptWithTemplate( PromptHandler.formatChatHistory(finalContextMessages, characterData.data?.name || 'Character', formattedAPIConfig.templateId), "", characterData.data?.name || 'Character', template ),
          memory: memory, stop_sequence: stopSequences, character_data: characterData, chat_history: finalContextMessages, current_message: ""
        }
      };
      const contextWindow = { type: 'generation_start', timestamp: new Date().toISOString(), characterName: characterData.data?.name || 'Unknown', messageId: assistantMessage.id, promptUsed: requestBody.generation_params.prompt, memoryUsed: memory, stopSequencesUsed: stopSequences, contextMessageCount: finalContextMessages.length, config: formattedAPIConfig, reasoningProvided: reasoningResult !== null };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));

      const abortController = new AbortController();
      currentGenerationRef.current = abortController;
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: abortController.signal });
      if (!response.ok) { const errorText = await response.text(); throw new Error(`Generation failed: ${response.status} ${errorText || "(No details)"}`); }

      let accumulatedContent = '';
      await processStream(
        response, assistantMessage.id, false, // isThinking = false
        (finalContent, receivedChunks) => {
          // Use accumulatedContent (tokens) for assistant
          setGenerationComplete(assistantMessage.id, finalContent, 'generation_complete', receivedChunks);
          setState(prev => { saveChat(prev.messages); const msg = prev.messages.find(m => m.id === assistantMessage.id); if (msg) appendMessage(msg); return prev; });
        },
        (error) => { handleGenerationError(error, assistantMessage.id); setState(prev => { saveChat(prev.messages); const msg = prev.messages.find(m => m.id === assistantMessage.id); if (msg) appendMessage(msg); return prev; }); }
      );
    } catch (err) {
      if (!state.error) handleGenerationError(err, assistantMessage.id);
      setState(prev => { saveChat(prev.messages); const msg = prev.messages.find(m => m.id === assistantMessage.id); if (msg) appendMessage(msg); return prev; });
    } finally {
      currentGenerationRef.current = null;
      setState(prev => prev.generatingId === assistantMessage.id ? {...prev, isGenerating: false, generatingId: null} : prev);
    }
  }, [characterData, state.isGenerating, state.messages, state.reasoningSettings, state.currentUser, apiConfig, handleGenerationError, saveChat, appendMessage, prepareAPIConfig, processStream, generateReasoning]);

  const regenerateMessage = useCallback(async (messageToRegenerate: Message) => {
    if (!characterData || state.isGenerating || !apiConfig || messageToRegenerate.role !== 'assistant') return;
    const messageId = messageToRegenerate.id;
    const messageIndex = state.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex < 1) { console.error("Cannot regenerate: No preceding message."); return; }
    let precedingUserMessage: Message | null = null;
    for (let i = messageIndex - 1; i >= 0; i--) { if (state.messages[i].role === 'user') { precedingUserMessage = state.messages[i]; break; } }
    if (!precedingUserMessage) { console.error("Cannot regenerate: No preceding user message."); return; }
    const promptText = htmlToText(precedingUserMessage.content);

    setState(prev => ({ ...prev, isGenerating: true, generatingId: messageId, error: null, messages: prev.messages.map(msg => msg.id === messageId ? { ...msg, content: '', status: 'streaming' as Message['status'] } : msg) }));

    try {
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const template = PromptHandler.getTemplate(formattedAPIConfig.templateId);
      const memory = PromptHandler.createMemoryContext(characterData, template);
      const stopSequences = PromptHandler.getStopSequences(template, characterData.data?.name || 'Character');
      // Context includes messages *up to and including* the preceding user message
      const contextMessages = getContextMessages(state, messageId).slice(0, state.messages.findIndex(msg => msg.id === precedingUserMessage!.id) + 1);
      const requestBody = {
        api_config: formattedAPIConfig,
        generation_params: {
          prompt: PromptHandler.formatPromptWithTemplate( PromptHandler.formatChatHistory(contextMessages, characterData.data?.name || 'Character', formattedAPIConfig.templateId), "", characterData.data?.name || 'Character', template ),
          memory: memory, stop_sequence: stopSequences, character_data: characterData, chat_history: contextMessages, current_message: ""
        }
      };
      const contextWindow = { type: 'regeneration_start', timestamp: new Date().toISOString(), characterName: characterData.data?.name || 'Unknown', messageId: messageId, promptUsed: requestBody.generation_params.prompt, memoryUsed: memory, stopSequencesUsed: stopSequences, contextMessageCount: contextMessages.length, config: formattedAPIConfig };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
      const abortController = new AbortController();
      currentGenerationRef.current = abortController;
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: abortController.signal });
      if (!response.ok) { const errorText = await response.text(); throw new Error(`Regeneration failed: ${response.status} ${errorText || "(No details)"}`); }

      let accumulatedContent = '';
      await processStream(
        response, messageId, false,
        (finalContent, receivedChunks) => {
          accumulatedContent = finalContent;
          setGenerationComplete(messageId, finalContent, 'regeneration_complete', receivedChunks);
          setState(prev => { saveChat(prev.messages); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; });
        },
        (error) => { handleGenerationError(error, messageId, 'regeneration'); setState(prev => { saveChat(prev.messages); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; }); }
      );
    } catch (err) {
      handleGenerationError(err, messageId, 'regeneration');
      setState(prev => { saveChat(prev.messages); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; });
    } finally {
      currentGenerationRef.current = null;
      setState(prev => prev.generatingId === messageId ? {...prev, isGenerating: false, generatingId: null} : prev);
    }
  }, [characterData, state.isGenerating, state.messages, apiConfig, handleGenerationError, saveChat, appendMessage, prepareAPIConfig, processStream]);

  const generateVariation = useCallback(async (messageToVary: Message) => {
    if (!characterData || state.isGenerating || !apiConfig || messageToVary.role !== 'assistant') return;
    const messageId = messageToVary.id;
    const originalContent = messageToVary.content;
    const messageIndex = state.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex < 1) { console.error("Cannot generate variation: No preceding message."); return; }
    let precedingUserMessage: Message | null = null;
    for (let i = messageIndex - 1; i >= 0; i--) { if (state.messages[i].role === 'user') { precedingUserMessage = state.messages[i]; break; } }
    if (!precedingUserMessage) { console.error("Cannot generate variation: No preceding user message."); return; }
    const promptText = htmlToText(precedingUserMessage.content);

    setState(prev => ({ ...prev, isGenerating: true, generatingId: messageId, error: null, messages: prev.messages.map(msg => msg.id === messageId ? { ...msg, status: 'generating_variation' as Message['status'] } : msg) }));

    try {
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const template = PromptHandler.getTemplate(formattedAPIConfig.templateId);
      const memory = PromptHandler.createMemoryContext(characterData, template);
      const stopSequences = PromptHandler.getStopSequences(template, characterData.data?.name || 'Character');
      // Context includes messages *up to and including* the preceding user message
      const contextMessages = getContextMessages(state, messageId).slice(0, state.messages.findIndex(msg => msg.id === precedingUserMessage!.id) + 1);
      const requestBody = {
        api_config: formattedAPIConfig,
        generation_params: {
          prompt: PromptHandler.formatPromptWithTemplate( PromptHandler.formatChatHistory(contextMessages, characterData.data?.name || 'Character', formattedAPIConfig.templateId), "", characterData.data?.name || 'Character', template ),
          memory: memory, stop_sequence: stopSequences, character_data: characterData, chat_history: contextMessages, current_message: ""
        }
      };
      const contextWindow = { type: 'variation_start', timestamp: new Date().toISOString(), characterName: characterData.data?.name || 'Unknown', messageId: messageId, promptUsed: requestBody.generation_params.prompt, memoryUsed: memory, stopSequencesUsed: stopSequences, contextMessageCount: contextMessages.length, config: formattedAPIConfig };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));

      // --- DEBUG LOG ---
      console.log("Frontend: Preparing to fetch /api/generate with body:", JSON.stringify(requestBody, null, 2));
      // --- END DEBUG LOG ---
      const abortController = new AbortController();
      currentGenerationRef.current = abortController;
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: abortController.signal });
      if (!response.ok) { const errorText = await response.text(); throw new Error(`Variation failed: ${response.status} ${errorText || "(No details)"}`); }

      let accumulatedContent = '';
      await processStream(
        response, messageId, false,
        (finalContent, receivedChunks) => {
          accumulatedContent = finalContent;
          setGenerationComplete(messageId, finalContent, 'variation_complete', receivedChunks, originalContent);
          setState(prev => { saveChat(prev.messages); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; });
        },
        (error) => { handleGenerationError(error, messageId, 'variation'); setState(prev => { saveChat(prev.messages); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; }); }
      );
    } catch (err) {
      handleGenerationError(err, messageId, 'variation');
      setState(prev => { saveChat(prev.messages); const msg = prev.messages.find(m => m.id === messageId); if (msg) appendMessage(msg); return prev; });
    } finally {
      currentGenerationRef.current = null;
      setState(prev => prev.generatingId === messageId ? {...prev, isGenerating: false, generatingId: null} : prev);
    }
  }, [characterData, state.isGenerating, state.messages, apiConfig, handleGenerationError, saveChat, appendMessage, prepareAPIConfig, processStream]);

  // --- Other Message Operations ---
  const cycleVariation = (messageId: string, direction: 'next' | 'prev') => {
    setState(prev => {
      let updatedMessage: Message | null = null;
      let nextIdx = 0; // Define here for scope
      const updatedMessages = prev.messages.map(msg => {
        if (msg.id === messageId && msg.variations && msg.variations.length > 1) {
          const currentIdx = msg.currentVariation ?? 0;
          nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
          if (nextIdx >= msg.variations.length) nextIdx = 0;
          if (nextIdx < 0) nextIdx = msg.variations.length - 1;
          updatedMessage = { ...msg, content: msg.variations[nextIdx], currentVariation: nextIdx };
          return updatedMessage;
        }
        return msg;
      });
      if (updatedMessage) { saveChat(updatedMessages); appendMessage(updatedMessage); }
      const targetMessage = prev.messages.find(msg => msg.id === messageId);
      const updatedContextWindow = { type: 'variation_cycled', timestamp: new Date().toISOString(), messageId, direction, newVariationIndex: nextIdx, totalVariations: targetMessage?.variations?.length || 0, characterName: characterData?.data?.name || 'Unknown' };
      return { ...prev, messages: updatedMessages, lastContextWindow: updatedContextWindow };
    });
  };

  const stopGeneration = useCallback(() => {
    if (!state.isGenerating || !currentGenerationRef.current) {
      if (state.isGenerating) setState(prev => ({...prev, isGenerating: false, generatingId: null}));
      return;
    }
    currentGenerationRef.current.abort();
  }, [state.isGenerating]);

  const setCurrentUser = (user: UserProfile | null) => {
    ChatStorage.saveCurrentUser(user);
    setState(prev => ({ ...prev, currentUser: user, lastContextWindow: { type: 'user_changed', timestamp: new Date().toISOString(), userName: user?.name || 'None', characterName: characterData?.data?.name || 'Unknown' } }));
  };

  const loadExistingChat = useCallback(async (chatId: string) => {
    if (!characterData) { setState(prev => ({ ...prev, error: "No character selected" })); return; }
    setState(prev => ({ ...prev, isLoading: true, error: null, messages: [] }));
    try {
      const result = await ChatStorage.loadChat(chatId, characterData);
      if (result.success && result.messages?.messages) {
        const messagesWithStatus = result.messages.messages.map((msg: IMessage) => ({ ...msg, status: msg.status || 'complete' }));
        setState(prev => ({ ...prev, messages: messagesWithStatus, currentUser: result.messages.metadata?.chat_metadata?.lastUser || prev.currentUser, lastContextWindow: { type: 'loaded_chat', timestamp: new Date().toISOString(), chatId: chatId, messageCount: messagesWithStatus.length } }));
        hasInitializedChat.current = true;
      } else if (characterData?.data?.first_mes) {
        const firstMessage = createAssistantMessage(characterData.data.first_mes, 'complete');
        setState(prev => ({ ...prev, messages: [firstMessage], lastContextWindow: { type: 'initial_message', timestamp: new Date().toISOString(), firstMessage: firstMessage.content } }));
        hasInitializedChat.current = true;
        saveChat([firstMessage]);
      } else {
        setState(prev => ({ ...prev, error: result.error || 'Failed to load chat', messages: [] }));
        hasInitializedChat.current = false;
      }
    } catch (err) {
      console.error("Error loading existing chat:", err);
      setState(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to load chat' }));
      hasInitializedChat.current = false;
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [characterData, saveChat]); // Added saveChat

  const updateReasoningSettings = (settings: Partial<ReasoningSettings>) => {
    try {
      const newSettings = { ...state.reasoningSettings, ...settings };
      localStorage.setItem(REASONING_SETTINGS_KEY, JSON.stringify(newSettings));
      setState(prev => ({ ...prev, reasoningSettings: newSettings, lastContextWindow: { type: 'reasoning_settings_updated', timestamp: new Date().toISOString(), enabled: newSettings.enabled, visible: newSettings.visible, characterName: characterData?.data?.name || 'Unknown' } }));
    } catch (err) {
      console.error("Error saving reasoning settings:", err);
      setState(prev => ({ ...prev, error: "Failed to save reasoning settings" }));
    }
  };

   const clearError = useCallback(() => { setState(prev => ({ ...prev, error: null })); }, []);

   const deleteMessage = (messageId: string) => {
     setState(prev => {
       const newMessages = prev.messages.filter(msg => msg.id !== messageId);
       saveChat(newMessages);
       return { ...prev, messages: newMessages, lastContextWindow: { type: 'message_deleted', timestamp: new Date().toISOString(), messageId, remainingMessages: newMessages.length, characterName: characterData?.data?.name || 'Unknown' } };
     });
   };

   const updateMessage = (messageId: string, newContent: string) => {
     setState(prev => {
       let updatedMessage: Message | null = null;
       const newMessages = prev.messages.map(msg => {
         if (msg.id === messageId) {
           updatedMessage = MessageUtils.addVariation(msg, newContent);
           return updatedMessage;
         }
         return msg;
       });
       if (updatedMessage) { saveChat(newMessages); appendMessage(updatedMessage); }
       return { ...prev, messages: newMessages, lastContextWindow: { type: 'message_edited', timestamp: new Date().toISOString(), messageId, newContent: newContent, characterName: characterData?.data?.name || 'Unknown' } };
     });
   };

   const handleNewChat = useCallback(async () => {
     if (!characterData) return;
     console.log('Handling /new command');
     hasInitializedChat.current = false;
     setState(prev => ({ ...prev, messages: [], isLoading: true, error: null, lastContextWindow: { type: 'new_chat_start', timestamp: new Date().toISOString(), characterName: characterData?.data?.name || 'Unknown' } }));
     try {
       await ChatStorage.clearContextWindow();
       if (characterData.data.first_mes) {
         const firstMessage = createAssistantMessage(characterData.data.first_mes, 'complete');
         setState(prev => ({ ...prev, messages: [firstMessage], isLoading: false, lastContextWindow: { ...prev.lastContextWindow, type: 'new_chat_complete', firstMessage: firstMessage.content } }));
         saveChat([firstMessage]);
         hasInitializedChat.current = true;
       } else {
          setState(prev => ({ ...prev, messages: [], isLoading: false, lastContextWindow: { ...prev.lastContextWindow, type: 'new_chat_complete_empty' } }));
          saveChat([]);
          hasInitializedChat.current = true;
       }
     } catch (err) {
       console.error('Error creating new chat:', err);
       setState(prev => ({ ...prev, isLoading: false, error: err instanceof Error ? err.message : 'Failed to create new chat', lastContextWindow: { ...prev.lastContextWindow, type: 'new_chat_error', error: err instanceof Error ? err.message : 'Unknown error' } }));
     }
   }, [characterData, saveChat]);

  // --- Effects ---
  useEffect(() => { // Load chat on character change
    if (!characterData?.data?.name) {
        setState(prev => ({...prev, messages: [], isLoading: false}));
        lastCharacterId.current = null; hasInitializedChat.current = false; return;
    };
    const currentCharId = ChatStorage.getCharacterId(characterData);
    if (currentCharId === lastCharacterId.current && hasInitializedChat.current) return;
    console.log('Character changed/init, loading chat for:', characterData.data.name);
    lastCharacterId.current = currentCharId; hasInitializedChat.current = false;
    const loadChat = async () => {
      setState(prev => ({ ...prev, isLoading: true, error: null, messages: [] }));
      try {
        const response = await ChatStorage.loadLatestChat(characterData);
        if (response.success && response.messages?.messages?.length > 0) {
          const messagesWithStatus = response.messages.messages.map((msg: IMessage) => ({ ...msg, status: msg.status || 'complete' }));
          setState(prev => ({ ...prev, messages: messagesWithStatus, currentUser: response.messages.metadata?.chat_metadata?.lastUser || prev.currentUser, lastContextWindow: { type: 'loaded_chat', timestamp: new Date().toISOString(), chatId: response.messages.metadata?.chat_metadata?.chat_id || 'unknown', messageCount: messagesWithStatus.length } }));
        } else if (characterData.data.first_mes) {
          const firstMessage = createAssistantMessage(characterData.data.first_mes, 'complete');
          setState(prev => ({ ...prev, messages: [firstMessage], lastContextWindow: { type: 'initial_message', timestamp: new Date().toISOString(), firstMessage: firstMessage.content } }));
          saveChat([firstMessage]);
        } else { setState(prev => ({ ...prev, messages: [] })); }
        hasInitializedChat.current = true;
      } catch (err) {
        console.error('Chat loading error:', err);
        setState(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to load chat' }));
        hasInitializedChat.current = false;
      } finally { setState(prev => ({ ...prev, isLoading: false })); }
    };
    loadChat();
  }, [characterData, saveChat]);

  useEffect(() => { // Load context window on mount
    ChatStorage.loadContextWindow().then(data => { if (data.success && data.context) setState(prev => ({ ...prev, lastContextWindow: data.context })); }).catch(err => console.error('Error loading context window:', err));
  }, []);

  useEffect(() => { // Save context window on change
    if (state.lastContextWindow) ChatStorage.saveContextWindow(state.lastContextWindow).catch(err => console.error('Error saving context window:', err));
  }, [state.lastContextWindow]);

  useEffect(() => { // Handle force stop events
    const handleForceStop = () => { if (state.isGenerating && currentGenerationRef.current) currentGenerationRef.current.abort(); };
    window.addEventListener('cardshark:force-generation-stop', handleForceStop);
    return () => window.removeEventListener('cardshark:force-generation-stop', handleForceStop);
  }, [state.isGenerating]);

  // --- Return Values ---
  return {
    ...state, updateMessage, deleteMessage, generateResponse, regenerateMessage, generateVariation,
    cycleVariation, stopGeneration, clearError, setCurrentUser, loadExistingChat, updateReasoningSettings, handleNewChat
  };
}
