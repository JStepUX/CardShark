// useChatMessages.ts (refactored)
import { useState, useRef, useEffect, useCallback } from 'react';
import { CharacterData } from '../contexts/CharacterContext';
import { PromptHandler } from '../handlers/promptHandler';
import { useAPIConfig } from '../contexts/APIConfigContext';
import { APIConfig } from '../types/api';
import { ChatStorage } from '../services/chatStorage';
import { toast } from 'sonner';
import { generateUUID } from '../utils/generateUUID';
import { CharacterCard, LoreEntry } from '../types/schema';
import { useChat } from '../contexts/ChatContext';
import { apiService } from '../services/apiService';

// Import types from our new centralized type definitions
import { 
  Message, 
  UserProfile, 
  ReasoningSettings,
  EnhancedChatState,
  PromptContextMessage,
  DEFAULT_REASONING_SETTINGS,
  DEBOUNCE_DELAY,
  STREAM_SETTINGS
} from '../services/chat/chatTypes';

// Import utilities from our new centralized utilities
import {
  sanitizeMessageContent,
  debounce,
  createUserMessage,
  createAssistantMessage,
  createThinkingMessage,
  DEFAULT_ASSISTANT_CHARACTER
} from '../services/chat/chatUtils';

// Import session management hook
import { useEnhancedChatSession } from './chat/useEnhancedChatSession';

// Import stream processor hook
import { useStreamProcessor } from './chat/useStreamProcessor';

// Import message state management hook (Phase 2 integration)
import { useMessageState } from './chat/useMessageState';

// --- Constants ---
const REASONING_SETTINGS_KEY = 'cardshark_reasoning_settings';
const CONTEXT_WINDOW_KEY = 'cardshark_context_window';

// --- Main Hook ---
export function useChatMessages(characterData: CharacterData | null, _options?: { isWorldPlay?: boolean }) {
  const effectiveCharacterData = characterData || DEFAULT_ASSISTANT_CHARACTER;
  const isGenericAssistant = !characterData; 
  const { apiConfig: globalApiConfig } = useAPIConfig();
  const { trackLoreImages } = useChat();
  // Phase 2: Initialize message state hook first (gradual migration)
  const [messageStateParams, setMessageStateParams] = useState<{
    chatSessionUuid: string | null;
    currentUser: UserProfile | null;
    autoSaveEnabled: boolean;
    isGenericAssistant: boolean;
  }>({
    chatSessionUuid: null,
    currentUser: null,
    autoSaveEnabled: !isGenericAssistant,
    isGenericAssistant
  });
  
  const messageStateHook = useMessageState(messageStateParams);
  
  // Use the enhanced session management hook
  const {
    chatSessionUuid,
    currentUser,
    isLoading: isSessionLoading,
    isDirty,
    ensureChatSession,
    createNewSession,
    setCurrentUser,
    markDirty,
    saveIfDirty,
    forceNavigationSave
  } = useEnhancedChatSession(effectiveCharacterData, isGenericAssistant, messageStateHook.messages);
  
  // Update message state params when session changes
  useEffect(() => {
    setMessageStateParams(prev => ({
      ...prev,
      chatSessionUuid,
      currentUser,
      autoSaveEnabled: !isGenericAssistant
    }));
  }, [chatSessionUuid, currentUser, isGenericAssistant]);

  // Use the stream processor hook
  const streamProcessor = useStreamProcessor();
  
  useEffect(() => {
    if (characterData && characterData.data?.name) { 
      toast.info(`Chatting with ${characterData.data.name}`);
    }
  }, [characterData?.data?.name]);   const [state, setState] = useState<EnhancedChatState>(() => {
    let persistedContextWindow = null;
    let reasoningSettings: ReasoningSettings;

    try {
      const storedContext = localStorage.getItem(CONTEXT_WINDOW_KEY);
      if (storedContext) {
        persistedContextWindow = JSON.parse(storedContext);
      }

      // Attempt to load stored reasoning settings but always ensure 'enabled' and 'visible' are false.
      const storedReasoningSettings = localStorage.getItem(REASONING_SETTINGS_KEY);
      if (storedReasoningSettings) {
        const parsedStoredSettings = JSON.parse(storedReasoningSettings);
        // Override stored settings to ensure reasoning is disabled and not visible
        reasoningSettings = { ...parsedStoredSettings, enabled: false, visible: false };
      } else {
        // If no stored settings, ensure it's off and not visible by default.
        reasoningSettings = { ...DEFAULT_REASONING_SETTINGS, enabled: false, visible: false };
      }
    } catch (err) {
      console.error("Error initializing state from localStorage:", err);
      // Fallback to defaults, ensuring reasoning is off and not visible.
      reasoningSettings = { ...DEFAULT_REASONING_SETTINGS, enabled: false, visible: false };
    }    
    
    return {
      messages: [],
      isLoading: false,
      isGenerating: false,
      error: null,
      lastContextWindow: persistedContextWindow,
      generatingId: null,
      reasoningSettings, // This will now always have enabled: false, visible: false
    };
  });  const lastCharacterId = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);  
  const autoSaveEnabled = useRef(!isGenericAssistant);
  const hasInitializedChat = useRef<boolean>(false);
  const isInitialLoad = useRef<boolean>(true);

  const prepareAPIConfig = useCallback((config?: APIConfig | null): APIConfig => {
    const defaultConfig: APIConfig = {
      id: 'default', provider: 'KoboldCPP', url: 'http://localhost:5001', enabled: false, templateId: 'mistral',
      generation_settings: { max_length: 220, max_context_length: 6144, temperature: 1.05, top_p: 0.92, top_k: 100 }
    };
    if (!config) return defaultConfig;
    const fullConfig = JSON.parse(JSON.stringify(config));
    fullConfig.generation_settings = { ...defaultConfig.generation_settings, ...(fullConfig.generation_settings || {}) };
    return { ...defaultConfig, ...fullConfig };  }, []);  const setGeneratingStart = (userMessage: Message | null, assistantMessage: Message) => {
    console.log(`[setGeneratingStart] Setting generation for assistant message ID: ${assistantMessage.id}`);
    
    // Add messages using message state hook
    if (userMessage) {
      messageStateHook.addMessage(userMessage);
    }
    messageStateHook.addMessage(assistantMessage);
    
    // Set generation state using message state hook
    messageStateHook.setGenerationState(true, assistantMessage.id);
    messageStateHook.clearError();
    
    // Mark as dirty for auto-save
    markDirty(messageStateHook.messages);
    
    console.log(`[setGeneratingStart] State updated with generatingId: ${assistantMessage.id}`);
  };const updateGeneratingMessageContent = (messageId: string, chunk: string) => {
    console.log(`[updateGeneratingMessageContent] Updating message ${messageId} with chunk: "${chunk}"`);
    
    // Check if we're generating and this is the correct message
    if (!messageStateHook.isGenerating || messageStateHook.generatingId !== messageId) {
      console.log(`[updateGeneratingMessageContent] Skipping update - not generating or wrong ID. isGenerating: ${messageStateHook.isGenerating}, generatingId: ${messageStateHook.generatingId}, messageId: ${messageId}`);
      return;
    }
    
    // Use the message state hook's appendToMessage method
    messageStateHook.appendToMessage(messageId, chunk);
    messageStateHook.updateMessageStatus(messageId, 'streaming');
    
    console.log(`[updateGeneratingMessageContent] Updated message ${messageId} with chunk`);
  };  const updateThinkingMessageContent = (messageId: string, chunk: string) => {
    // Check if we're generating and this is the correct message
    if (!messageStateHook.isGenerating || messageStateHook.generatingId !== messageId) {
      return;
    }
    
    // Use the message state hook's appendToMessage method
    messageStateHook.appendToMessage(messageId, chunk);
  };  const setGenerationComplete = (
      messageId: string, finalContent: string, contextWindowType: string,
      receivedChunks: number, originalContentForVariation?: string
    ) => {
    // Check if we're generating and this is the correct message
    if (!messageStateHook.isGenerating || messageStateHook.generatingId !== messageId) {
      console.log(`Completion ignored: Generation for ${messageId} already stopped/changed.`);
      if (!messageStateHook.isGenerating && messageStateHook.generatingId === null) return;
      messageStateHook.setGenerationState(false, null);
      return;
    }

    // Get the current message to handle variations
    const currentMessage = messageStateHook.getMessageById(messageId);
    if (!currentMessage) {
      console.error(`Message ${messageId} not found during completion`);
      messageStateHook.setGenerationState(false, null);
      return;
    }

    // Handle thinking messages (remove them)
    if (currentMessage.role === 'thinking') {
      messageStateHook.deleteMessage(messageId);
      messageStateHook.setGenerationState(false, null);
      streamProcessor.clearStreamTimeout();
      return;
    }

    // Prepare variations
    const sanitizedFinalContent = sanitizeMessageContent(finalContent);
    const currentVariations = currentMessage.variations?.map(sanitizeMessageContent) ||
                              (originalContentForVariation ? [sanitizeMessageContent(originalContentForVariation)] : 
                               (currentMessage.content ? [sanitizeMessageContent(currentMessage.content)] : []));
    const variations = [...currentVariations, sanitizedFinalContent];
    const uniqueVariations = Array.from(new Set(variations));
    const newVariationIndex = uniqueVariations.length - 1;

    // Update the message with final content and variations
    messageStateHook.updateMessage(messageId, {
      content: sanitizedFinalContent,
      variations: uniqueVariations,
      currentVariation: newVariationIndex,
      status: 'complete'
    });    // Stop generation
    messageStateHook.setGenerationState(false, null);

    // Mark as dirty for auto-save since message was completed
    markDirty(messageStateHook.messages);

    // Update context window in legacy state
    const finalContextWindow = { ...state.lastContextWindow, type: contextWindowType, finalResponse: sanitizedFinalContent, completionTime: new Date().toISOString(), totalChunks: receivedChunks };
    setState(prev => ({ ...prev, lastContextWindow: finalContextWindow }));

    streamProcessor.clearStreamTimeout(); 
    
    // Handle lore trigger extraction
    if (effectiveCharacterData?.data?.character_uuid && finalContent) {
      apiService.extractLoreTriggers(effectiveCharacterData, finalContent)
        .then((response: { success: boolean; matched_entries: LoreEntry[] }) => {
          if (response && response.success && response.matched_entries && response.matched_entries.length > 0) {
            if (effectiveCharacterData.data.character_uuid) { 
               trackLoreImages(response.matched_entries, effectiveCharacterData.data.character_uuid);
            }
          }
        })
        .catch((err: Error) => {
          console.error("Error extracting lore triggers:", err);
        });
    }
  };  const stopGeneration = useCallback(() => {
    if (!messageStateHook.isGenerating || !streamProcessor.isStreamActive()) {
      if (messageStateHook.isGenerating) messageStateHook.setGenerationState(false, null); 
      return;
    }
    console.log("Attempting to stop generation...");
    streamProcessor.abortCurrentStream(); 
  }, [messageStateHook.isGenerating, streamProcessor, messageStateHook]);

  const resetStreamTimeout = useCallback(() => {
    streamProcessor.resetStreamTimeout(() => {
      console.warn(`Stream timed out after ${STREAM_SETTINGS.INACTIVITY_TIMEOUT_MS / 1000}s. Aborting.`);
      stopGeneration(); 
    });
  }, [streamProcessor, stopGeneration]);

  const handleGenerationError = useCallback((err: any, messageId: string | null, operationType: string = 'generation') => {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const errorMessage = isAbort ? `${operationType} cancelled.` : (err instanceof Error ? err.message : `Unknown ${operationType} error`);
    if (!isAbort) {
        console.error(`Error during ${operationType}${messageId ? ` for message ${messageId}` : ''}:`, err);
    } else {
        console.log(`${operationType} aborted for message ${messageId}`);
    }

    setState(prev => {
      if (messageId === null || prev.generatingId === messageId) {
          let updatedMessages = prev.messages;
          if (messageId) {
              updatedMessages = prev.messages.map(msg => {
                if (msg.id === messageId) {
                  if (msg.role === 'thinking') return null; 
                  const finalContent = msg.content || (isAbort ? "" : `[${operationType} Error]`);
                  return { ...msg, status: (isAbort ? 'aborted' : 'error') as Message['status'], content: finalContent };
                }
                return msg;
              }).filter(msg => msg !== null) as Message[];
          }
          return {
            ...prev, messages: updatedMessages, error: isAbort ? null : errorMessage, 
            isGenerating: false, generatingId: null,            lastContextWindow: { ...prev.lastContextWindow, type: `${operationType}_${isAbort ? 'aborted' : 'error'}`, timestamp: new Date().toISOString(), characterName: effectiveCharacterData.data?.name || 'Unknown', messageId: messageId, error: errorMessage }
          };
      }
      return prev;
    });
    streamProcessor.clearStreamTimeout(); 
  }, [effectiveCharacterData, streamProcessor]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const saveChat = useCallback((chatSessionUuidFromState: string | null, messageListFromState: Message[], currentUserFromState: UserProfile | null) => {
    if (isGenericAssistant || !effectiveCharacterData.data?.name || !autoSaveEnabled.current || !chatSessionUuidFromState) {
      if (!autoSaveEnabled.current) {
      } else if (!chatSessionUuidFromState) {
        console.warn('[saveChat] Aborted: chatSessionUuidFromState is null or undefined. Cannot save chat.');
      }
      return;
    }
    
    const sanitizedMessagesToSave = messageListFromState
      .filter(msg => msg.role !== 'thinking')
      .map(msg => ({
        ...msg,
        content: sanitizeMessageContent(msg.content),
        variations: msg.variations?.map(sanitizeMessageContent)
      }));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (effectiveCharacterData && chatSessionUuidFromState) {
          const apiInfo = globalApiConfig ? { provider: globalApiConfig.provider, model: globalApiConfig.model, url: globalApiConfig.url, template: globalApiConfig.templateId, enabled: globalApiConfig.enabled } : null;
          const chatTitle = effectiveCharacterData.data?.name ? `Chat with ${effectiveCharacterData.data.name}` : undefined;
          const characterForSave: CharacterCard = effectiveCharacterData;
          const uuidForSave: string = chatSessionUuidFromState; 
          const messagesForSave: Message[] = sanitizedMessagesToSave;
          const userForSave: UserProfile | null = currentUserFromState;

          // --- BEGIN DIAGNOSTIC LOGS ---
          console.log('[useChatMessages] Preparing to save chat using database-centric API. Logging arguments for payload:');
          console.log('[useChatMessages] chat_session_uuid (uuidForSave, should be string):', uuidForSave, 'Type:', typeof uuidForSave, 'Is Array:', Array.isArray(uuidForSave));
          console.log('[useChatMessages] messages (messagesForSave, should be array of Message objects):', messagesForSave, 'Type:', typeof messagesForSave, 'Is Array:', Array.isArray(messagesForSave));
          if (Array.isArray(messagesForSave) && messagesForSave.length > 0) {
            console.log('[useChatMessages] First message object in messages array:', messagesForSave[0], 'Type of first message:', typeof messagesForSave[0]);
          }
          // --- END DIAGNOSTIC LOGS ---
          
          // Save chat using database-centric API
          await fetch('/api/reliable-save-chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: uuidForSave,
              character_uuid: characterForSave.data.character_uuid,
              messages: messagesForSave,
              user_name: userForSave,
              api_info: apiInfo,
              title: chatTitle
            })
          });
        }
      } catch (err) {
        console.error('Error saving chat:', err);
      }
      finally { saveTimeoutRef.current = null; }
    }, 1000);
  }, [effectiveCharacterData, globalApiConfig, isGenericAssistant]); 

  const appendMessageDirect = useCallback(async (chatSessionUuid: string | null, message: Message) => {
    if (isGenericAssistant || message.role === 'thinking' || !effectiveCharacterData.data?.name || !chatSessionUuid) return;
    try {
      if (effectiveCharacterData) await ChatStorage.appendMessage(chatSessionUuid, message);
    } catch (err) { console.error('Error appending/updating message:', err); }
  }, [effectiveCharacterData, isGenericAssistant]);

  const appendMessage = useCallback(
    debounce(async (chatSessionUuid: string | null, message: Message) => {
      await appendMessageDirect(chatSessionUuid, message);
    }, DEBOUNCE_DELAY),
    [appendMessageDirect] 
  );  const processStream = useCallback(async (
    response: Response, messageId: string, isThinking: boolean, onComplete: (content: string, chunks: number) => void, onError: (error: any) => void
  ) => {
    console.log(`[processStream] Starting stream processing for message ${messageId}, isThinking: ${isThinking}`);
    console.log(`[processStream] Current state.isGenerating: ${state.isGenerating}, state.generatingId: ${state.generatingId}`);
    let accumulatedContent = '';
    let receivedChunks = 0;
    
    try {
        // Use the stream processor's abort controller and timeout functionality
        for await (const chunk of PromptHandler.streamResponse(response)) {
            console.log(`[processStream] Received chunk ${receivedChunks + 1}: "${chunk}" (length: ${chunk.length})`);
            console.log(`[processStream] About to call ${isThinking ? 'updateThinkingMessageContent' : 'updateGeneratingMessageContent'} with messageId: ${messageId}`);
            
            // Check if stream was aborted
            if (!streamProcessor.isStreamActive()) {
              console.log(`[processStream] Stream aborted for message ${messageId}`);
              throw new DOMException('Aborted by user', 'AbortError');
            }
            
            // Reset timeout for each chunk received
            resetStreamTimeout(); 
            accumulatedContent += chunk;
            receivedChunks++;
            console.log(`[processStream] Accumulated content so far: "${accumulatedContent}" (total length: ${accumulatedContent.length})`);
            
            // Update message content based on type
            if (isThinking) {
                updateThinkingMessageContent(messageId, chunk);
            } else {
                updateGeneratingMessageContent(messageId, chunk);
            }
            
            // Yield control back to React for rendering
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        console.log(`[processStream] Stream complete for message ${messageId}. Final content: "${accumulatedContent}", chunks: ${receivedChunks}`);
        onComplete(accumulatedContent, receivedChunks);
    } catch (err) {
        console.error(`[processStream] Stream error for message ${messageId}:`, err);
        onError(err instanceof Error ? err : new Error('Unknown stream processing error'));
    }   
  }, [streamProcessor, resetStreamTimeout, updateGeneratingMessageContent, updateThinkingMessageContent, state.isGenerating, state.generatingId]);

  const getContextMessages = useCallback((currentState: EnhancedChatState, excludeId?: string): Message[] => {
    const MAX_CONTEXT_MESSAGES = 20; 
    return currentState.messages
      .filter(msg => msg.role !== 'thinking' && msg.id !== excludeId)
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((msg): Message => { 
        const content = (msg.variations && typeof msg.currentVariation === 'number')
          ? msg.variations[msg.currentVariation]
          : msg.content;
        return {
          id: msg.id,
          role: msg.role,
          content: content || '', 
          timestamp: msg.timestamp,
          status: msg.status,
          ...(msg.variations && { variations: msg.variations }),
          ...(typeof msg.currentVariation === 'number' && { currentVariation: msg.currentVariation }),
        };
      });
  }, []); 
  const generateReasoning = useCallback(async (userInput: string, baseContextMessages: Message[]): Promise<string | null> => {
    if (!state.reasoningSettings.enabled || !effectiveCharacterData?.data) {
      return null; 
    }
    
    const currentChatSessionUuidForReasoning = await ensureChatSession(); 
    if (!currentChatSessionUuidForReasoning && !isGenericAssistant) { 
        console.warn("generateReasoning: Could not ensure chat session for reasoning for a non-generic assistant.");
        toast.error("Reasoning failed: Chat session not available.");
        return null;
    }    const reasoningApiConfig = prepareAPIConfig(globalApiConfig); 
    const reasoningMessage = createThinkingMessage();
    setState(prev => ({ ...prev, isGenerating: true, generatingId: reasoningMessage.id })); 

    const currentAbortController = streamProcessor.createAbortController(); 
    const { signal } = currentAbortController;

    try {      const reasoningPromptString = PromptHandler.formatPromptWithContextMessages(
        effectiveCharacterData, 
        `${state.reasoningSettings.instructions}\nUser asks: ${userInput}`, 
        baseContextMessages.filter(msg => msg.role !== 'thinking') as Message[], // Pass Message[]
        currentUser?.name || 'User',
        reasoningApiConfig.templateId 
      );
      
      if (!reasoningPromptString) {
        console.warn("Reasoning prompt construction failed or returned empty.");
        setState(prev => ({ ...prev, isGenerating: false, generatingId: null }));
        return null;
      }
      
      setState(prev => ({ ...prev, lastContextWindow: { ...prev.lastContextWindow, type: 'reasoning_start', prompt: reasoningPromptString, timestamp: new Date().toISOString(), characterName: effectiveCharacterData.data.name, messageId: reasoningMessage.id } }));
      resetStreamTimeout();
      
      // PromptHandler.generateChatResponse expects PromptContextMessage[], so filter and cast
      const reasoningContextForApi = [{role: 'user', content: reasoningPromptString}].filter(
        (msg): msg is PromptContextMessage => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
      );

      if (!currentChatSessionUuidForReasoning) {
        console.error("generateReasoning: chatSessionUuid is null. Cannot generate reasoning.");
        throw new Error("Chat session UUID is missing, cannot generate reasoning.");
      }
      const response = await PromptHandler.generateChatResponse(
          currentChatSessionUuidForReasoning,
          reasoningContextForApi,
          reasoningApiConfig,
          signal,
          effectiveCharacterData
      );

      let finalReasoning: string | null = null;
      await processStream(
        response, reasoningMessage.id, true, 
        (finalContent, receivedChunks) => {
          finalReasoning = finalContent;
          setState(prev => ({
            ...prev,
            messages: prev.messages.map(msg => msg.id === reasoningMessage.id ? { ...msg, content: finalContent, status: 'complete' as Message['status'] } : msg),
          }));
          console.log(`Reasoning generation complete (${receivedChunks} chunks).`);
        },
        (error) => {
          handleGenerationError(error, reasoningMessage.id, 'reasoning');
          finalReasoning = null; 
        }
      );
      return finalReasoning; 
    } catch (err) {
      handleGenerationError(err, reasoningMessage.id, 'reasoning'); 
      return null; 
    } finally {
        setState(prev => {
            if (prev.generatingId === reasoningMessage.id) { 
                return { ...prev, messages: prev.messages.filter(msg => msg.id !== reasoningMessage.id), isGenerating: false, generatingId: null };
            }
            return { ...prev, messages: prev.messages.filter(msg => msg.id !== reasoningMessage.id) }; 
        });
    }
  }, [effectiveCharacterData, state.reasoningSettings, currentUser, state.messages, globalApiConfig, handleGenerationError, prepareAPIConfig, processStream, resetStreamTimeout, ensureChatSession, isGenericAssistant]);

  const generateResponse = useCallback(async (userInput: string) => { 
    if (state.isGenerating) {
      console.warn("Generation already in progress.");
      return;
    }
    if (!globalApiConfig || !globalApiConfig.enabled) {
        handleGenerationError(new Error("No active API configuration is enabled."), null, 'setup');
        return;
    }
    clearError(); 

    const preparedApiConfig = prepareAPIConfig(globalApiConfig); 
    const userMessage = createUserMessage(userInput);
    const assistantMessage = createAssistantMessage(); 

    const currentChatSessionUuid = await ensureChatSession();
    if (!currentChatSessionUuid) {
      return; 
    }    setGeneratingStart(userMessage, assistantMessage);
    if (!isGenericAssistant && autoSaveEnabled.current) { 
        appendMessageDirect(currentChatSessionUuid, userMessage); 
    }

    const currentAbortController = streamProcessor.createAbortController(); 
    const { signal } = currentAbortController;

    try {
      const contextMessagesForReasoning = getContextMessages(state, assistantMessage.id);
      let reasoningText: string | null = null;
      if (state.reasoningSettings.enabled) {
        reasoningText = await generateReasoning(userInput, contextMessagesForReasoning.slice(0, -1)); 
        if (signal.aborted) { 
          handleGenerationError(new DOMException('Aborted by user', 'AbortError'), assistantMessage.id, 'reasoning'); 
          return;
        }
        if (reasoningText === null && state.error && !isGenericAssistant) {
             console.log("Reasoning failed or was aborted, stopping main generation.");
             setState(prev => ({ ...prev, isGenerating: false, generatingId: null }));
             return;
        }
         setState(prev => ({ ...prev, isGenerating: true, generatingId: assistantMessage.id }));
      }      let apiContextMessages = getContextMessages(state, assistantMessage.id)
                                .filter(msg => msg.role !== 'thinking')
                                .map(msg => ({
                                  role: msg.role as 'user' | 'assistant' | 'system',
                                  content: sanitizeMessageContent(msg.content)
                                })) as PromptContextMessage[];
      
      if (reasoningText) {
        apiContextMessages = [
            ...apiContextMessages.slice(0,-1), 
            { role: 'assistant', content: `(Thinking: ${reasoningText})` }, 
            apiContextMessages[apiContextMessages.length-1] 
        ].filter((msg): msg is PromptContextMessage => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system');
      }

      const contextWindow = {
        type: 'generation_start', timestamp: new Date().toISOString(),
        characterName: effectiveCharacterData.data?.name || 'Unknown',
        messageId: assistantMessage.id, 
        promptUsed: `Context: ${apiContextMessages.map(m=>m.content).join('\n')}`, 
        contextMessageCount: apiContextMessages.length, config: preparedApiConfig,
        reasoningUsed: reasoningText
      };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
      localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify(contextWindow));      console.log(`[generateResponse] About to call PromptHandler.generateChatResponse with:`, {
        currentChatSessionUuid,
        apiContextMessagesLength: apiContextMessages.length,
        preparedApiConfig: preparedApiConfig?.provider,
        effectiveCharacterName: effectiveCharacterData?.data?.name
      });
      
      // Log state immediately before calling processStream for the main response
      console.log(`[generateResponse] PRE-STREAM state check for assistantMessage.id: ${assistantMessage.id}. isGenerating: ${state.isGenerating}, generatingId: ${state.generatingId}`);

      const response = await PromptHandler.generateChatResponse(
        currentChatSessionUuid,
        apiContextMessages, // This context needs to be correct
        preparedApiConfig,
        signal,
        effectiveCharacterData
      );
      
      // Log state immediately before calling processStream for the main response
      console.log(`[generateResponse] PRE-STREAM state check for assistantMessage.id: ${assistantMessage.id}. isGenerating: ${state.isGenerating}, generatingId: ${state.generatingId}`);

      await processStream(
        response, // This was the source of the error, it should be defined now
        assistantMessage.id,
        false, // isThinking
        (finalContent, receivedChunks) => {
          setGenerationComplete(assistantMessage.id, finalContent, 'generate_response_complete', receivedChunks);
        },
        (error) => {
          handleGenerationError(error, assistantMessage.id, 'generate_response_stream');
        }
      );

    } catch (err) {
      handleGenerationError(err, assistantMessage.id, 'generation_setup_error');
    }
  }, [state, globalApiConfig, effectiveCharacterData, saveChat, handleGenerationError, prepareAPIConfig, getContextMessages, generateReasoning, clearError, appendMessage, appendMessageDirect, resetStreamTimeout, stopGeneration, isGenericAssistant, processStream, ensureChatSession]);

  const regenerateMessage = useCallback(async (messageToRegenerate: Message) => {
    if (state.isGenerating) {
      console.warn("Regeneration already in progress.");
      return;
    }
    if (!globalApiConfig || !globalApiConfig.enabled) {
       handleGenerationError(new Error("No active API configuration is enabled for regeneration."), messageToRegenerate.id, 'regeneration_setup');
       return;
    }
    clearError();
    const preparedApiConfig = prepareAPIConfig(globalApiConfig); 

    const messageIndex = state.messages.findIndex((msg: Message) => msg.id === messageToRegenerate.id);
    if (messageIndex === -1 || messageIndex === 0) {
      console.error("Cannot regenerate: Message not found or is the first message.");
      return;
    }

    const precedingUserMessage = state.messages[messageIndex - 1];
    if (precedingUserMessage.role !== 'user') {
      console.error("Cannot regenerate: Preceding message is not from the user.");
      return;
    }

    const currentChatSessionUuid = await ensureChatSession();
    if (!currentChatSessionUuid) {
      setState(prev => ({...prev, isGenerating: false, generatingId: null})); 
      return;
    }
      setState(prev => ({
      ...prev,
      messages: prev.messages.map(msg => msg.id === messageToRegenerate.id ? { ...msg, status: 'streaming' as Message['status'], content: '' } : msg), 
      isGenerating: true, generatingId: messageToRegenerate.id, error: null
    }));

    const currentAbortController = streamProcessor.createAbortController(); 
    const { signal } = currentAbortController;

    try {
      // Pass Message[] to generateReasoning
      const contextForReasoning = getContextMessages(state, messageToRegenerate.id).slice(0, messageIndex -1);
      
      let reasoningText: string | null = null; 
      if (state.reasoningSettings.enabled) {
        reasoningText = await generateReasoning(precedingUserMessage.content, contextForReasoning); 
        if (signal.aborted) { 
          handleGenerationError(new DOMException('Aborted by user', 'AbortError'), messageToRegenerate.id, 'reasoning_regen');
          return;
        }
        if (reasoningText === null && state.error && !isGenericAssistant) { 
             console.log("Reasoning failed or was aborted, stopping regeneration.");
             setState(prev => ({ ...prev, isGenerating: false, generatingId: null }));
             return;
        }
        setState(prev => ({ ...prev, generatingId: messageToRegenerate.id })); 
      }
        // Prepare context for API: PromptContextMessage[]
      let contextMessagesForAPI = getContextMessages(state, messageToRegenerate.id)
                                    .slice(0, messageIndex) // History up to and including the preceding user message
                                    .filter(msg => msg.role !== 'thinking')
                                    .map(msg => ({
                                      role: msg.role as 'user' | 'assistant' | 'system',
                                      content: sanitizeMessageContent(msg.content)
                                    })) as PromptContextMessage[];
      if (reasoningText) {
        contextMessagesForAPI = [
            ...contextMessagesForAPI.slice(0,-1),
            {role: 'assistant', content: `(Thinking: ${reasoningText})`},
            contextMessagesForAPI[contextMessagesForAPI.length-1]
        ].filter((msg): msg is PromptContextMessage => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system');
      }
      
      const contextWindow = {
          type: 'regeneration_start', timestamp: new Date().toISOString(),
          characterName: effectiveCharacterData.data?.name || 'Unknown',
          messageId: messageToRegenerate.id, 
          promptUsed: `Context for regen: ${contextMessagesForAPI.map(m=>m.content).join('\n')}`,
          contextMessageCount: contextMessagesForAPI.length, config: preparedApiConfig,
          reasoningUsed: reasoningText 
      };
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
      localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify(contextWindow));

      const response = await PromptHandler.generateChatResponse(
          currentChatSessionUuid,
          contextMessagesForAPI, 
          preparedApiConfig, 
          signal, 
          effectiveCharacterData
      );

      await processStream(
        response, messageToRegenerate.id, false, 
        (finalContent, receivedChunks) => {
          const originalContent = messageToRegenerate.variations ? messageToRegenerate.variations[0] : messageToRegenerate.content;
          setGenerationComplete(messageToRegenerate.id, finalContent, 'regeneration_complete', receivedChunks, originalContent);
          
          if (effectiveCharacterData?.data?.character_uuid && finalContent) {
            apiService.extractLoreTriggers(effectiveCharacterData, finalContent)
              .then((res: { success: boolean; matched_entries: LoreEntry[] }) => {
                if (res && res.success && res.matched_entries && res.matched_entries.length > 0) {
                  if (effectiveCharacterData.data.character_uuid) { 
                     trackLoreImages(res.matched_entries, effectiveCharacterData.data.character_uuid);
                  }
                }
              })
              .catch((err: Error) => {
                console.error("Error extracting lore triggers after regeneration:", err);
              });
          }           if (!isGenericAssistant) {
             setState(prev => {
                saveChat(currentChatSessionUuid, prev.messages, currentUser);
                const finalMsg = prev.messages.find(m => m.id === messageToRegenerate.id);
                if (finalMsg) appendMessage(currentChatSessionUuid, finalMsg);
                return prev;
             });
           }
        },
        (error) => {
          handleGenerationError(error, messageToRegenerate.id, 'regeneration');           if (!isGenericAssistant) {
             setState(prev => {
                saveChat(currentChatSessionUuid, prev.messages, currentUser);
                const errorMsg = prev.messages.find(m => m.id === messageToRegenerate.id);
                if (errorMsg) appendMessage(currentChatSessionUuid, errorMsg);
                return prev;
             });
           }
        }
      );
    } catch (err) {
      if (signal.aborted && err instanceof DOMException && err.name === 'AbortError') {
        console.log('Regeneration aborted by user (caught in outer try-catch).');
        handleGenerationError(err, messageToRegenerate.id, 'regeneration_setup_aborted');      } else {
        handleGenerationError(err, messageToRegenerate.id, 'regeneration_setup_error');
      }
       if (!isGenericAssistant) {
             setState(prev => {
                saveChat(currentChatSessionUuid, prev.messages, currentUser);
                const errorMsg = prev.messages.find(m => m.id === messageToRegenerate.id);
                if (errorMsg) appendMessage(currentChatSessionUuid, errorMsg);
                return prev;
             });
        }
    }
  }, [state, globalApiConfig, effectiveCharacterData, saveChat, handleGenerationError, prepareAPIConfig, getContextMessages, clearError, appendMessage, appendMessageDirect, resetStreamTimeout, stopGeneration, isGenericAssistant, processStream, ensureChatSession, trackLoreImages]);

  const generateVariation = useCallback(async (messageToVary: Message) => {
    if (state.isGenerating) {
      console.warn("Variation generation already in progress.");
      return;
    }
    if (!globalApiConfig || !globalApiConfig.enabled) {
       handleGenerationError(new Error("No active API configuration is enabled for variation."), messageToVary.id, 'variation_setup');
       return;
    }
    clearError();
    const preparedApiConfig = prepareAPIConfig(globalApiConfig);

    const messageIndex = state.messages.findIndex((msg: Message) => msg.id === messageToVary.id);
     if (messageIndex === -1 || messageIndex === 0 || messageToVary.role !== 'assistant') {
       console.error("Cannot generate variation: Message not found, is first message, or not an assistant message.");
       return;
     }

    const precedingUserMessage = state.messages[messageIndex - 1];
     if (precedingUserMessage.role !== 'user') {
       console.error("Cannot generate variation: Preceding message is not from the user.");
       return;
     }

    const currentChatSessionUuid = await ensureChatSession();
    if (!currentChatSessionUuid) {
      setState(prev => ({...prev, isGenerating: false, generatingId: null}));
      return;
    }

    const originalContent = messageToVary.variations && messageToVary.variations.length > 0 
      ? messageToVary.variations[0] 
      : messageToVary.content;

    const variationProcessId = generateUUID(); 
    setState(prev => ({
      ...prev,      isGenerating: true, 
      generatingId: variationProcessId, 
      error: null
    }));

    const currentAbortController = streamProcessor.createAbortController();
    const { signal } = currentAbortController;

    try {
      // Pass Message[] to generateReasoning
      const contextForReasoning = getContextMessages(state, messageToVary.id).slice(0, messageIndex -1);
      
      let reasoningText: string | null = null; 
      if (state.reasoningSettings.enabled) {
        reasoningText = await generateReasoning(precedingUserMessage.content, contextForReasoning);
        if (signal.aborted) {
          handleGenerationError(new DOMException('Aborted by user', 'AbortError'), variationProcessId, 'reasoning_variation');
          return;
        }
        if (reasoningText === null && state.error && !isGenericAssistant) {
          console.log("Reasoning failed or was aborted, stopping variation generation.");
          setState(prev => ({ ...prev, isGenerating: false, generatingId: null }));
          return;
        }
      }
        // Prepare context for API: PromptContextMessage[]
      let contextMessagesForAPI = getContextMessages(state, messageToVary.id)
                                    .slice(0, messageIndex) // History up to and including the preceding user message
                                    .filter(msg => msg.role !== 'thinking')
                                    .map(msg => ({
                                      role: msg.role as 'user' | 'assistant' | 'system',
                                      content: sanitizeMessageContent(msg.content)
                                    })) as PromptContextMessage[];
      if (reasoningText) {
        contextMessagesForAPI = [
            ...contextMessagesForAPI.slice(0,-1),
            {role: 'assistant', content: `(Thinking: ${reasoningText})`},
            contextMessagesForAPI[contextMessagesForAPI.length-1]
        ].filter((msg): msg is PromptContextMessage => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system');
      }

      const contextWindow = {
           type: 'variation_start', timestamp: new Date().toISOString(),
           characterName: effectiveCharacterData.data?.name || 'Unknown',
           messageId: messageToVary.id, 
           promptUsed: `Context for variation: ${contextMessagesForAPI.map(m=>m.content).join('\n')}`,
           contextMessageCount: contextMessagesForAPI.length, config: preparedApiConfig,
           reasoningUsed: reasoningText
       };
       setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
       localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify(contextWindow));

      const response = await PromptHandler.generateChatResponse(
          currentChatSessionUuid,
          contextMessagesForAPI,
          preparedApiConfig,
          signal,
          effectiveCharacterData
      );

      await processStream(
        response, 
        variationProcessId, 
        false, 
        (finalContent, receivedChunks) => {
          setGenerationComplete(messageToVary.id, finalContent, 'variation_complete', receivedChunks, originalContent);
          
          if (effectiveCharacterData?.data?.character_uuid && finalContent) {
            apiService.extractLoreTriggers(effectiveCharacterData, finalContent)
              .then((resp: { success: boolean; matched_entries: LoreEntry[] }) => {
                if (resp && resp.success && resp.matched_entries && resp.matched_entries.length > 0) {
                  if (effectiveCharacterData.data.character_uuid) { 
                     trackLoreImages(resp.matched_entries, effectiveCharacterData.data.character_uuid);
                  }
                }
              })
              .catch((err: Error) => {
                console.error("Error extracting lore triggers after variation:", err);
              });
          }
           if (!isGenericAssistant) {
             setState(prev => {
                const updatedMessage = prev.messages.find(m => m.id === messageToVary.id);
                if (updatedMessage) {
                    saveChat(currentChatSessionUuid, prev.messages, currentUser);
                    appendMessage(currentChatSessionUuid, updatedMessage);
                }
                return prev;
             });
           }
        },
        (error) => { 
           handleGenerationError(error, variationProcessId, 'variation'); 
        }
      );
    } catch (err) {
      if (signal.aborted && err instanceof DOMException && err.name === 'AbortError') {
        console.log('Variation generation aborted by user (caught in outer try-catch).');
        handleGenerationError(err, variationProcessId, 'variation_setup_aborted');
      } else {
        handleGenerationError(err, variationProcessId, 'variation_setup_error');
      }
       if (!isGenericAssistant) {
             setState(prev => {
                saveChat(currentChatSessionUuid, prev.messages, currentUser);
                const errorMsg = prev.messages.find(m => m.id === messageToVary.id); 
                if (errorMsg) appendMessage(currentChatSessionUuid, errorMsg);
                return prev;
             });
        }
    }
  }, [state, globalApiConfig, effectiveCharacterData, saveChat, handleGenerationError, prepareAPIConfig, getContextMessages, clearError, appendMessage, stopGeneration, generateReasoning, isGenericAssistant, processStream, ensureChatSession, trackLoreImages]);
  const cycleVariation = (messageId: string, direction: 'next' | 'prev') => {
    setState(prev => {
      let chatSessionUuidToSave = chatSessionUuid; 

      const updatedMessages = prev.messages.map(msg => {
        if (msg.id === messageId && msg.variations && msg.variations.length > 0) {
          let currentIdx = msg.currentVariation ?? 0;
          if (direction === 'next') {
            currentIdx = (currentIdx + 1) % msg.variations.length;
          } else {
            currentIdx = (currentIdx - 1 + msg.variations.length) % msg.variations.length;
          }
          return { ...msg, content: msg.variations[currentIdx], currentVariation: currentIdx, status: 'complete' as Message['status'] };
        }
        return msg;
      });

      // Mark as dirty for auto-save
      markDirty(updatedMessages);

      if (!isGenericAssistant && autoSaveEnabled.current && chatSessionUuidToSave) {
        const changedMessage = updatedMessages.find(m => m.id === messageId);
        if (changedMessage) {
          ChatStorage.appendMessage(chatSessionUuidToSave, changedMessage) 
            .then(() => {
              saveChat(chatSessionUuidToSave, updatedMessages, currentUser);
            })
            .catch(err => console.error(`[cycleVariation] Error appending message ${messageId}:`, err));
        }
      }
      return { ...prev, messages: updatedMessages };
    });
  };

  const generateNpcIntroduction = useCallback(async (
    npcCharacterData: CharacterCard, 
    worldInfo?: { worldName: string; settingDescription: string }, 
    encounterContext?: string
  ) => {
    if (!npcCharacterData?.data) {
      toast.error("NPC data is missing for introduction.");
      return null;
    }
    if (state.isGenerating) {
      toast.info("Please wait for the current generation to complete.");
      return null;
    }
    clearError();

    const currentChatSessionUuidForNpc = await ensureChatSession(); 
    if (!currentChatSessionUuidForNpc && !isGenericAssistant) {
        toast.error("Cannot generate NPC intro without an active chat session for a non-generic character.");
        return null;
    }
    
    const introAssistantMessage = createAssistantMessage(`Generating introduction for ${npcCharacterData.data.name}...`, 'streaming');    setState(prev => ({
      ...prev,
      messages: [...prev.messages, introAssistantMessage], 
      isGenerating: true,
      generatingId: introAssistantMessage.id,
      error: null,
    }));
    
    const currentAbortController = streamProcessor.createAbortController();
    const { signal } = currentAbortController;

    try {
      const apiConfigToUse = prepareAPIConfig(globalApiConfig);
      
      const introPromptString = PromptHandler.formatPromptWithContextMessages(
        npcCharacterData,
        (encounterContext || `Introduce ${npcCharacterData.data.name}.`) + (worldInfo ? `\nWorld: ${worldInfo.worldName}\nSetting: ${worldInfo.settingDescription}` : ""), 
        [], 
        currentUser?.name || 'User', 
        apiConfigToUse.templateId
      );

      if (!introPromptString) {
        throw new Error("Failed to construct NPC introduction prompt.");
      }
      
      setState(prev => ({ ...prev, lastContextWindow: { type: 'npc_introduction_start', prompt: introPromptString, timestamp: new Date().toISOString(), characterName: npcCharacterData.data.name, messageId: introAssistantMessage.id } }));
      resetStreamTimeout();
      
      const introContextForApi = [{role: 'user', content: introPromptString}].filter(
        (msg): msg is PromptContextMessage => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
      );

      if (!currentChatSessionUuidForNpc) {
        console.error("generateNpcIntroduction: chatSessionUuid is null. Cannot generate NPC introduction.");
        throw new Error("Chat session UUID is missing, cannot generate NPC introduction.");
      }
      const response = await PromptHandler.generateChatResponse(
        currentChatSessionUuidForNpc,
        introContextForApi,
        apiConfigToUse,
        signal,
        npcCharacterData
      );

      let finalIntro: string | null = null;
      await processStream(
        response,
        introAssistantMessage.id,
        false, 
        (finalContent, _receivedChunks) => {
          finalIntro = finalContent;
          setState(prev => ({
            ...prev,
            messages: prev.messages.map(m => m.id === introAssistantMessage.id ? {...m, content: finalContent, status: 'complete'} : m)
          }));
        },
        (error) => {
          handleGenerationError(error, introAssistantMessage.id, 'npc_introduction');
          finalIntro = null;
        }
      );
      return finalIntro;

    } catch (err) {
      handleGenerationError(err, introAssistantMessage.id, 'npc_introduction_setup');
      return null;    } finally {
      setState(prev => {
        const newMessages = prev.messages.filter(m => m.id !== introAssistantMessage.id);
        if (prev.generatingId === introAssistantMessage.id) {
          return { ...prev, messages: newMessages, isGenerating: false, generatingId: null };
        }
        return { ...prev, messages: newMessages }; 
      });
      streamProcessor.clearStreamTimeout();
    }  }, [state.isGenerating, currentUser, globalApiConfig, clearError, prepareAPIConfig, processStream, setGenerationComplete, handleGenerationError, resetStreamTimeout, streamProcessor, ensureChatSession, isGenericAssistant]);

  const updateReasoningSettings = useCallback((settings: ReasoningSettings) => {
    setState(prevState => {
      // Merge settings with current settings, but ensure reasoning remains disabled and not visible
      const mergedSettings = { ...prevState.reasoningSettings, ...settings, enabled: false, visible: false };
      
      try {
        localStorage.setItem(REASONING_SETTINGS_KEY, JSON.stringify(mergedSettings));
      } catch (error) {
        console.error('Failed to save reasoning settings to localStorage:', error);
      }
      
      return {
        ...prevState,
        reasoningSettings: mergedSettings
      };
    });
  }, []);

  // Initialize reasoning settings in localStorage if not already set, ensuring it's disabled.
  useEffect(() => {
    const storedSettings = localStorage.getItem(REASONING_SETTINGS_KEY);
    if (!storedSettings) {
      try {
        localStorage.setItem(REASONING_SETTINGS_KEY, JSON.stringify({ ...DEFAULT_REASONING_SETTINGS, enabled: false, visible: false }));
      } catch (error) {
        console.error('Failed to initialize reasoning settings in localStorage:', error);
      }
    } else {
      // If settings are stored, ensure they reflect the disabled state
      try {
        const parsed = JSON.parse(storedSettings);
        if (parsed.enabled || parsed.visible) {
          localStorage.setItem(REASONING_SETTINGS_KEY, JSON.stringify({ ...parsed, enabled: false, visible: false }));
        }
      } catch (error) {
        console.error('Failed to update stored reasoning settings to disabled state:', error);
      }
    }  }, []);
  
  // Phase 2: Enhanced deleteMessage using message state hook
  const deleteMessage = (messageId: string) => {
    // Use the new message state hook for this operation
    messageStateHook.deleteMessage(messageId);
    
    // Mark as dirty for auto-save
    markDirty(messageStateHook.messages);
  };
  
  // Phase 2: Enhanced updateMessage using message state hook
  const updateMessage = (messageId: string, newContent: string, isStreamingUpdate: boolean = false) => {
    if (isStreamingUpdate) {
      // For streaming updates, just update content and status
      messageStateHook.updateMessageContent(messageId, newContent, true);
    } else {
      // For regular updates, update content and handle variations
      const sanitizedNewContent = sanitizeMessageContent(newContent);
      messageStateHook.updateMessage(messageId, {
        content: sanitizedNewContent,
        status: 'complete',
        variations: [sanitizedNewContent],
        currentVariation: 0
      });
      
      // Mark as dirty for auto-save
      markDirty(messageStateHook.messages);
    }
  };


   useEffect(() => { 
    const currentCharacterId = effectiveCharacterData?.data?.character_uuid || ChatStorage.getCharacterId(effectiveCharacterData);
    
    if ((isGenericAssistant && hasInitializedChat.current) || (lastCharacterId.current === currentCharacterId && hasInitializedChat.current)) {
      return;
    }
    
    lastCharacterId.current = currentCharacterId;
    hasInitializedChat.current = false; 
    isInitialLoad.current = false; 

    const loadChatForCharacter = async () => {
      if (isGenericAssistant) {
        setState(prev => ({ ...prev, messages: [], chatSessionUuid: null, isLoading: false, error: null }));
        hasInitializedChat.current = true; 
        return;
      }

      if (!effectiveCharacterData?.data?.character_uuid) {
        console.warn("[ChatLoad useEffect] No character_uuid available. Showing greeting or empty.");
        if (effectiveCharacterData?.data?.first_mes) {
            setState(prev => ({
                ...prev,
                messages: [createAssistantMessage(effectiveCharacterData.data.first_mes, 'complete')],
                chatSessionUuid: null, 
                isLoading: false,
                error: "Character has no UUID, showing greeting only."
            }));
        } else {
            setState(prev => ({ ...prev, messages: [], chatSessionUuid: null, isLoading: false, error: "Character data incomplete."}));
        }
        hasInitializedChat.current = true;
        return;
      }
      
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const result = await ChatStorage.loadLatestChat(effectiveCharacterData);        if (result && result.success) {
          if (result.data === null || !result.chat_session_uuid) { 
            await createNewSession(); 
          } else {
            const messagesWithStatus = (result.messages || []).map((msg: any): Message => ({
                id: msg.id || generateUUID(),
                role: msg.role,
                content: msg.content || "",
                timestamp: msg.timestamp || Date.now(),
                status: msg.status || 'complete',
                variations: msg.variations || (msg.content ? [msg.content] : []),
                currentVariation: msg.currentVariation !== undefined ? msg.currentVariation : (msg.variations && msg.variations.length > 0 ? msg.variations.length -1 : 0)
            }));
            setState(prev => ({
              ...prev,
              messages: messagesWithStatus,
              chatSessionUuid: result.chat_session_uuid, 
              isLoading: false,
              error: null,
            }));
            toast.info(`Loaded latest chat for ${effectiveCharacterData.data.name}`);
            hasInitializedChat.current = true;
          }
        } else if (result && result.isRecoverable && result.first_mes_available) {            console.warn(`[ChatLoad useEffect] loadLatestChat failed but is recoverable. Error: ${result.error}. Attempting new chat.`);
            toast.info(`No prior chat history found for ${effectiveCharacterData.data.name}. Starting a new chat.`);
            await createNewSession();
        } else {
          console.error("[ChatLoad useEffect] Error loading latest chat:", result?.error || "Unknown error");
          toast.error(`Error loading chat: ${result?.error || 'Could not load chat history.'}`);
          let fallbackMessages: Message[] = [];
          if (effectiveCharacterData.data.first_mes) {
              fallbackMessages.push(createAssistantMessage(effectiveCharacterData.data.first_mes, 'complete'));
          }
          setState(prev => ({ 
              ...prev, 
              messages: fallbackMessages, 
              chatSessionUuid: null, 
              isLoading: false, 
              error: result?.error || "Failed to load chat history." 
          }));
          hasInitializedChat.current = true; 
        }
      } catch (err) {
        console.error("[ChatLoad useEffect] Exception loading latest chat:", err);
        toast.error(`Exception loading chat: ${err instanceof Error ? err.message : String(err)}`);
        setState(prev => ({ ...prev, isLoading: false, error: err instanceof Error ? err.message : String(err) }));
        hasInitializedChat.current = true; 
      }
    };

    if (!isGenericAssistant && effectiveCharacterData?.data) {
      loadChatForCharacter();
    } else if (isGenericAssistant) {
      setState(prev => ({ ...prev, messages: [], chatSessionUuid: null, isLoading: false, error: null }));
      hasInitializedChat.current = true;
    }     return () => {
      if (streamProcessor.isStreamActive()) {
        streamProcessor.abortCurrentStream();
        setState(prev => ({...prev, isGenerating: false, generatingId: null}));
      }
    };
   }, [effectiveCharacterData, isGenericAssistant]); 


   useEffect(() => {
    autoSaveEnabled.current = !isGenericAssistant;
  }, [isGenericAssistant]);


   useEffect(() => {
    if (state.lastContextWindow) {
      try {
        localStorage.setItem(CONTEXT_WINDOW_KEY, JSON.stringify(state.lastContextWindow));
      } catch (error) {
        console.error("Error saving context window to localStorage:", error);
      }
    }
  }, [state.lastContextWindow]);

   useEffect(() => { 
     const handleForceStop = () => {
       if (state.isGenerating) {
         console.log("Force stop event received, stopping generation.");
         stopGeneration();
         if (state.generatingId) {
             setState(prev => ({
                 ...prev,
                 messages: prev.messages.map(msg => msg.id === state.generatingId ? {...msg, status: 'aborted', content: msg.content + " [Cancelled]"} : msg),
                 isGenerating: false,
                 generatingId: null,
                 error: "Generation stopped by user."
             }));
         } else {
            setState(prev => ({...prev, isGenerating: false, generatingId: null, error: "Generation stopped by user."}));
         }
       }
     };
 
     window.addEventListener('force-stop-generation', handleForceStop);
     return () => {
       window.removeEventListener('force-stop-generation', handleForceStop);
     };
   }, [state.isGenerating, state.generatingId, stopGeneration]);   return {
    ...state,
    // Phase 2: Use message state hook for messages while keeping other state
    messages: messageStateHook.messages,
    isGenerating: messageStateHook.isGenerating,
    generatingId: messageStateHook.generatingId,
    error: messageStateHook.error || state.error,
    // Add session state from enhanced session hook
    currentUser,
    chatSessionUuid,
    isLoading: state.isLoading || isSessionLoading,
    isDirty, // Add dirty state
    setGeneratingStart,
    updateGeneratingMessageContent,
    updateThinkingMessageContent,
    setGenerationComplete,
    handleGenerationError,
    stopGeneration,
    clearError,
    generateResponse,
    regenerateMessage,
    generateVariation,
    cycleVariation,
    setCurrentUser,
    // Enhanced auto-save functions
    saveChat: () => saveIfDirty(),
    forceNavigationSave,
    markDirty: (messages: Message[]) => markDirty(messages),
    // Legacy compatibility
    appendMessage: (message: Message) => appendMessage(chatSessionUuid, message),
    deleteMessage,
    updateMessage,
    updateReasoningSettings,
    generateNpcIntroduction,
    activeCharacterData: effectiveCharacterData,
  };
}
