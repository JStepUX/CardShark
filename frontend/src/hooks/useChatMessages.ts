// useChatMessages.ts (refactored)
import { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { CharacterData } from '../contexts/CharacterContext';
import { Message, UserProfile, ChatState } from '../types/messages';
import { PromptHandler } from '../handlers/promptHandler';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { APIConfig, APIProvider } from '../types/api';
import { ChatStorage } from '../services/chatStorage';
import { MessageUtils } from '../utils/messageUtils';
import { htmlToText, markdownToHtml } from '../utils/contentUtils';
import { generateUUID } from '../utils/generateUUID';

// Add ReasoningSettings interface
interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions?: string;
}

// Default reasoning settings
const DEFAULT_REASONING_SETTINGS: ReasoningSettings = {
  enabled: false,
  visible: false,
  instructions: "!important! Embody {{char}}. **Think** through the context of this interaction with <thinking></thinking> tags. Consider your character, your relationship with the user, and relevant context from the conversation history."
};

// Enhanced ChatState interface to include generatingId
interface EnhancedChatState extends ChatState {
  generatingId: string | null;
  reasoningSettings: ReasoningSettings;
}

export function useChatMessages(characterData: CharacterData | null) {
  const { apiConfig } = useContext(APIConfigContext);
  
  // Initialize state with stored values
  const [state, setState] = useState<EnhancedChatState>(() => {
    let storedUser = ChatStorage.getCurrentUser();
    let persistedContextWindow = null;
    let reasoningSettings = DEFAULT_REASONING_SETTINGS;
    
    try {
      const storedContextWindow = localStorage.getItem('cardshark_context_window');
      if (storedContextWindow) {
        persistedContextWindow = JSON.parse(storedContextWindow);
      }
      
      // Load reasoning settings
      const savedReasoningSettings = localStorage.getItem('cardshark_reasoning_settings');
      if (savedReasoningSettings) {
        reasoningSettings = JSON.parse(savedReasoningSettings);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
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
  
  // Refs for managing generation and debounced saves
  const currentGenerationRef = useRef<AbortController | null>(null);
  const lastCharacterId = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveEnabled = useRef(true);
  const hasInitializedChat = useRef<boolean>(false);
  
  // Create debounced save function
  const debouncedSave = MessageUtils.createDebouncedSave((messages: Message[]) => {
    saveChat(messages);
  });
  
  // Add the prepareAPIConfig function that's missing
  const prepareAPIConfig = useCallback((config?: APIConfig | null): APIConfig => {
    if (config) {
      const fullConfig = JSON.parse(JSON.stringify(config));
      
      if (!fullConfig.generation_settings) {
        fullConfig.generation_settings = {
          max_length: 220,
          max_context_length: 6144,
          temperature: 1.05,
          top_p: 0.92,
          top_k: 100,
        };
      }
      
      return fullConfig;
    }
    
    return {
      id: 'default',
      provider: 'KoboldCPP' as APIProvider,
      url: 'http://localhost:5001',
      enabled: false,
      templateId: 'mistral',
      generation_settings: {
        max_length: 220,
        max_context_length: 6144,
        temperature: 1.05,
        top_p: 0.92,
        top_k: 100
      }
    };
  }, []);

  // Handle generation errors
  const handleGenerationError = useCallback((err: any, messageId: string) => {
    console.error('Error during generation:', err);
    
    setState(prev => {
      const messageIndex = prev.messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
        console.error(`Message with ID ${messageId} not found`);
        return {
          ...prev,
          error: err instanceof Error ? err.message : "An unknown error occurred",
          isGenerating: false,
          generatingId: null
        };
      }

      const currentMessage = prev.messages[messageIndex];
      
      let updatedMessages = [...prev.messages];
      
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('Generation was aborted by user - keeping current content');
        
        updatedMessages[messageIndex] = {
          ...currentMessage,
          aborted: false
        };
      } else {
        console.log('Generation error - marking message as aborted');
        
        updatedMessages[messageIndex] = {
          ...currentMessage,
          aborted: true
        };
      }
      
      return {
        ...prev,
        messages: updatedMessages,
        error: err instanceof Error ? err.message : "An unknown error occurred",
        isGenerating: false,
        generatingId: null,
        lastContextWindow: {
          type: 'generation_error',
          timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name || 'Unknown',
          error: err instanceof Error ? err.message : 'Unknown error'
        }
      };
    });
  }, [characterData]);

  // Add a listener for forced stop events
  useEffect(() => {
    const handleForceStop = () => {
      console.log('Force stop event received in useChatMessages');
      if (state.isGenerating) {
        setState(prev => ({
          ...prev,
          isGenerating: false,
          generatingId: null,
          
          // If we have a current generation in progress, mark it as complete
          messages: prev.messages.map(msg =>
            msg.id === prev.generatingId
              ? { ...msg, status: 'complete' }
              : msg
          ),
          
          // Update context window to reflect force stopped status
          lastContextWindow: {
            ...prev.lastContextWindow,
            type: 'generation_force_stopped',
            timestamp: new Date().toISOString(),
            message: 'Generation was force stopped due to timeout'
          }
        }));
      }
    };
    
    window.addEventListener('cardshark:force-generation-stop', handleForceStop);
    
    return () => {
      window.removeEventListener('cardshark:force-generation-stop', handleForceStop);
    };
  }, [state.isGenerating, state.generatingId]);

  // Load context window on mount
  useEffect(() => {
    const loadContextWindow = async () => {
      try {
        const data = await ChatStorage.loadContextWindow();
        if (data.success && data.context) {
          setState(prev => ({
            ...prev,
            lastContextWindow: data.context
          }));
        }
      } catch (err) {
        console.error('Error loading context window:', err);
      }
    };
    
    loadContextWindow();
  }, []);
  
  // Save context window when it changes
  useEffect(() => {
    if (state.lastContextWindow) {
      ChatStorage.saveContextWindow(state.lastContextWindow)
        .catch(err => console.error('Error saving context window:', err));
    }
  }, [state.lastContextWindow]);
  
  // Load chat when character changes
  useEffect(() => {
    if (!characterData?.data?.name) return;
    
    const currentCharId = ChatStorage.getCharacterId(characterData);
    if (currentCharId === lastCharacterId.current) return;
    
    if (lastCharacterId.current !== null) {
      ChatStorage.clearContextWindow();
    }
    
    console.log('Character changed, loading chat for:', characterData.data.name);
    
    hasInitializedChat.current = false;
    
    loadChatForCharacter();
    
    async function loadChatForCharacter() {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        
        const response = await ChatStorage.loadLatestChat(characterData!);
        
        if (response.success && response.messages) {
          if (Array.isArray(response.messages.messages) && response.messages.messages.length > 0) {
            setState(prev => ({
              ...prev,
              messages: response.messages.messages,
              currentUser: response.messages.metadata?.chat_metadata?.lastUser || prev.currentUser,
              lastContextWindow: {
                type: 'loaded_chat',
                timestamp: new Date().toISOString(),
                characterName: characterData?.data?.name,
                chatId: response.messages.metadata?.chat_metadata?.chat_id || 'unknown',
                messageCount: response.messages.messages.length
              }
            }));
            hasInitializedChat.current = true;
          } else if (characterData?.data?.first_mes && !hasInitializedChat.current) {
            createAndAddFirstMessage(characterData.data.first_mes);
          }
        } else if (characterData?.data?.first_mes && !hasInitializedChat.current) {
          createAndAddFirstMessage(characterData.data.first_mes);
        }
        
        lastCharacterId.current = currentCharId;
      } catch (err) {
        console.error('Chat loading error:', err);
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to load chat',
          lastContextWindow: {
            type: 'load_error',
            timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name,
            error: err instanceof Error ? err.message : 'Failed to load chat'
          }
        }));
      } finally {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [characterData]);
  
  const createAndAddFirstMessage = (messageContent: string) => {
    const processEvent = new CustomEvent('cardshark:process-first-message', {
      detail: {
        messageContent,
        substituteWith: null
      }
    });
    
    window.dispatchEvent(processEvent);
    
    const processedContent = processEvent.detail.substituteWith || messageContent;
    
    const firstMessage = createAssistantMessage(processedContent);
    
    setState(prev => ({
      ...prev, 
      messages: [firstMessage],
      lastContextWindow: {
        type: 'initial_message',
        timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name,
        firstMessage: processedContent
      }
    }));
    
    hasInitializedChat.current = true;
    
    saveChat([firstMessage]);
  };
  
  const saveChat = (messageList = state.messages) => {
    if (!characterData?.data?.name) {
      console.debug('Save aborted: no character data name');
      return;
    }
    
    if (!autoSaveEnabled.current) {
      console.debug('Save aborted: autoSave disabled');
      return;
    }
    
    console.debug('Scheduling save with timeout...');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      console.debug('Cleared existing save timeout');
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        console.debug(`Executing save for ${messageList.length} messages`);
        
        const apiInfo = apiConfig ? {
          provider: apiConfig.provider,
          model: apiConfig.model,
          url: apiConfig.url,
          template: apiConfig.templateId,
          enabled: apiConfig.enabled
        } : null;
        
        const result = await ChatStorage.saveChat(characterData, messageList, state.currentUser, apiInfo);
        console.debug('Save result:', result);
      } catch (err) {
        console.error('Error saving chat:', err);
      } finally {
        saveTimeoutRef.current = null;
      }
    }, 500);
  };
  
  const appendMessage = async (message: Message) => {
    if (!characterData?.data?.name) return;
    
    try {
      console.log(`Appending/updating message ${message.id} to chat`);
      await ChatStorage.appendMessage(characterData, message);
    } catch (err) {
      console.error('Error appending/updating message:', err);
    }
  };
  
  const updateMessage = (messageId: string, content: string, isStreamingUpdate?: boolean) => {
    setState(prev => {
      const msgIndex = prev.messages.findIndex(msg => msg.id === messageId);
      if (msgIndex === -1) return prev;
      
      const messageToUpdate = prev.messages[msgIndex];
      if (messageToUpdate.content === content) return prev;
      
      const updatedMessage = MessageUtils.addVariation(messageToUpdate, content);
      
      const newMessages = [...prev.messages];
      newMessages[msgIndex] = updatedMessage;
      
      const updatedContextWindow = {
        type: 'message_edited',
        timestamp: new Date().toISOString(),
        messageId,
        role: messageToUpdate.role,
        previousContent: messageToUpdate.content,
        newContent: content,
        messageIndex: msgIndex,
        characterName: characterData?.data?.name || 'Unknown'
      };
      
      const isCompletedEdit = messageToUpdate.content !== content && 
        (!messageToUpdate.variations || messageToUpdate.variations.indexOf(content) === -1);
      
      // Only trigger immediate save for manual edits, not streaming updates
      if (isCompletedEdit && !isStreamingUpdate) {
        console.log(`Completed edit detected for message ${messageId}, saving now`);
        saveChat(newMessages);
        appendMessage({...newMessages[msgIndex], timestamp: Date.now()});
      } else {
        console.log(`Potential ongoing edit for message ${messageId}, using debounced save`);
        debouncedSave(messageId, newMessages);
      }
      
      return {
        ...prev,
        messages: newMessages,
        lastContextWindow: updatedContextWindow
      };
    });
  };
  
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);
  
  const deleteMessage = (messageId: string) => {
    setState(prev => {
      const newMessages = prev.messages.filter(msg => msg.id !== messageId);
      
      saveChat(newMessages);
      
      const updatedContextWindow = {
        type: 'message_deleted',
        timestamp: new Date().toISOString(),
        messageId,
        remainingMessages: newMessages.length,
        characterName: characterData?.data?.name || 'Unknown'
      };
      
      return {
        ...prev,
        messages: newMessages,
        lastContextWindow: updatedContextWindow
      };
    });
  };
  
  const addMessage = (message: Message) => {
    const finalMessage = !message.id ? { ...message, id: message.id } : message;
    
    setState(prev => {
      const newMessages = [...prev.messages, finalMessage];
      
      const updatedContextWindow = {
        type: 'message_added',
        timestamp: new Date().toISOString(),
        messageId: finalMessage.id,
        messageRole: finalMessage.role,
        totalMessages: newMessages.length,
        characterName: characterData?.data?.name || 'Unknown'
      };
      
      return {
        ...prev,
        messages: newMessages,
        lastContextWindow: updatedContextWindow
      };
    });
    
    setTimeout(() => {
      saveChat();
      appendMessage(finalMessage);
    }, 50);
  };
  
  const handleNewChat = async () => {
    console.log('Handling /new command - creating new chat');
    
    hasInitializedChat.current = false;
    
    setState(prev => ({
      ...prev,
      messages: [],
      lastContextWindow: {
        type: 'new_chat',
        timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown'
      }
    }));
    
    try {
      await ChatStorage.clearContextWindow();
      
      if (characterData?.data.first_mes) {
        createAndAddFirstMessage(characterData.data.first_mes);
      }
    } catch (err) {
      console.error('Error creating new chat:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to create new chat',
        lastContextWindow: {
          type: 'new_chat_error',
          timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name || 'Unknown',
          error: err instanceof Error ? err.message : 'Failed to create new chat'
        }
      }));
    }
  };
  
  const generateResponse = useCallback(async (prompt: string) => {
    if (!characterData || state.isGenerating) return;

    console.log('Starting generation for prompt:', prompt);

    if (prompt === '/new') {
      handleNewChat();
      return;
    }

    const userMessage = createUserMessage(prompt);
    const assistantMessage = createAssistantMessage();

    setState(prev => ({ 
      ...prev, 
      messages: [...prev.messages, userMessage, assistantMessage],
      isGenerating: true,
      generatingId: assistantMessage.id
    }));

    await appendMessage(userMessage);

    try {
      if (!apiConfig) {
        throw new Error("API configuration not loaded");
      }

      const contextMessages = state.messages
        .concat(userMessage)
        .filter(msg => msg.role !== 'thinking')
        .map(({role, content}) => {
          let validRole: 'user' | 'assistant' | 'system' = 'system';
          if (role === 'user') {
            validRole = 'user';
          } else if (role === 'assistant') {
            validRole = 'assistant';
          }
          return { role: validRole, content };
        });

      let reasoningContent = null;
      if (state.reasoningSettings.enabled) {
        reasoningContent = await generateReasoningResponse(prompt);
      }

      if (reasoningContent) {
        contextMessages.push({
          role: 'system',
          content: `<think>${reasoningContent}</think>`
        });
      }

      const contextWindow = {
        type: 'generation',
        timestamp: new Date().toISOString(),
        characterName: characterData.data?.name || 'Unknown',
        messageId: assistantMessage.id,
        prompt,
        contextMessageCount: contextMessages.length,
        config: apiConfig,
        reasoning: reasoningContent !== null
      };

      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));

      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const abortController = new AbortController();
      currentGenerationRef.current = abortController;

      const response = await PromptHandler.generateChatResponse(
        characterData,
        prompt,
        contextMessages,
        formattedAPIConfig,
        abortController.signal
      );

      if (!response.ok) {
        throw new Error("Generation failed - check API settings");
      }

      let newContent = '';
      let buffer = '';
      let bufferTimer: NodeJS.Timeout | null = null;
      let receivedChunks = 0;

      for await (const chunk of PromptHandler.streamResponse(response)) {
        receivedChunks++;
        
        if (!bufferTimer) {
          bufferTimer = setInterval(() => {
            if (buffer.length > 0) {
              const content = newContent + buffer;
              buffer = '';
              
              // Log buffer updates for debugging
              if (receivedChunks % 10 === 0) {
                console.log(`Buffer update: processed ${receivedChunks} chunks so far`);
              }
              
              setState(prev => {
                const updatedMessages = [...prev.messages];
                const assistantIndex = updatedMessages.findIndex(msg => msg.id === assistantMessage.id);
                if (assistantIndex !== -1) {
                  updatedMessages[assistantIndex] = {
                    ...updatedMessages[assistantIndex],
                    content
                  };
                }
                return { ...prev, messages: updatedMessages };
              });
              newContent = content;
            }
          }, 50);
        }
        
        buffer += chunk;
      }

      // Log final stream statistics
      console.log(`Stream complete: received ${receivedChunks} total chunks`);

      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }

      // Process any remaining buffer
      if (buffer.length > 0) {
        newContent += buffer;
        
        // Log final content length for debugging
        console.log(`Final response length: ${newContent.length} characters`);
        
        setState(prev => {
          const updatedMessages = [...prev.messages];
          const assistantIndex = updatedMessages.findIndex(msg => msg.id === assistantMessage.id);
          
          if (assistantIndex !== -1) {
            const assistantMsg = updatedMessages[assistantIndex];
            
            updatedMessages[assistantIndex] = {
              ...assistantMsg,
              content: newContent,
              variations: [newContent],
              currentVariation: 0
            };
          }

          const updatedContextWindow = {
            ...prev.lastContextWindow,
            type: 'generation_complete',
            finalResponse: newContent,
            completionTime: new Date().toISOString(),
            totalChunks: receivedChunks
          };

          return {
            ...prev,
            messages: updatedMessages,
            isGenerating: false,
            generatingId: null,
            lastContextWindow: updatedContextWindow
          };
        });

        await saveChat();
        await appendMessage({ ...assistantMessage, content: newContent, timestamp: Date.now() });
      } else {
        console.warn('Stream completed but buffer was empty - this is unusual');
        setState(prev => ({
          ...prev,
          isGenerating: false,
          generatingId: null,
          lastContextWindow: {
            ...prev.lastContextWindow,
            type: 'generation_empty',
            completionTime: new Date().toISOString(),
            totalChunks: receivedChunks
          }
        }));
      }

    } catch (err) {
      handleGenerationError(err, assistantMessage.id);
    } finally {
      currentGenerationRef.current = null;
    }
  }, [characterData, state.isGenerating, state.messages, apiConfig, state.reasoningSettings.enabled, appendMessage, prepareAPIConfig, saveChat]);

  const generateReasoningResponse = useCallback(async (prompt: string) => {
    if (!state.reasoningSettings.enabled || !characterData) return null;
    
    const thinkingId = generateUUID();
    const thinkingMessage: Message = {
      id: thinkingId,
      role: 'thinking',
      content: '',
      timestamp: Date.now()
    };
    
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, thinkingMessage],
      isGenerating: true,
      generatingId: thinkingId
    }));
    
    try {
      const reasoningInstructions = state.reasoningSettings.instructions || DEFAULT_REASONING_SETTINGS.instructions || '';
      const characterName = characterData.data?.name || 'Character';
      const userName = state.currentUser?.name || 'User';
      
      const reasoningPrompt = reasoningInstructions
        .replace(/\{\{char\}\}/g, characterName)
        .replace(/\{\{user\}\}/g, userName)
        .replace(/\{\{message\}\}/g, prompt);
      
      if (!apiConfig) {
        throw new Error("API configuration not loaded");
      }
      
      const contextMessages = state.messages
        .filter(msg => msg.role !== 'thinking')
        .map(({role, content}) => {
          let validRole: 'user' | 'assistant' | 'system' = 'system';
          if (role === 'user') {
            validRole = 'user';
          } else if (role === 'assistant') {
            validRole = 'assistant';
          }
          return { role: validRole, content };
        });
        
      contextMessages.push({
        role: 'system',
        content: reasoningPrompt
      });
      
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const response = await PromptHandler.generateChatResponse(
        characterData,
        reasoningPrompt,
        contextMessages,
        formattedAPIConfig
      );
      
      let thinkingContent = '';
      for await (const chunk of PromptHandler.streamResponse(response)) {
        thinkingContent += chunk;
        setState(prev => {
          const updatedMessages = prev.messages.map(msg => 
            msg.id === thinkingId ? {...msg, content: thinkingContent} : msg
          );
          return {
            ...prev,
            messages: updatedMessages
          };
        });
      }
      
      setState(prev => {
        const updatedMessages = prev.messages.map(msg => 
          msg.id === thinkingId ? {...msg, content: thinkingContent} : msg
        );
        return {
          ...prev,
          messages: updatedMessages,
          isGenerating: false,
          generatingId: null
        };
      });
      
      return thinkingContent;
    } catch (err) {
      console.error('Error generating thinking:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to generate thinking',
        isGenerating: false,
        generatingId: null
      }));
      return null;
    }
  }, [characterData, state.reasoningSettings, state.currentUser, state.messages, apiConfig, prepareAPIConfig]);
  
  const regenerateMessage = async (message: Message) => {
    if (!characterData || state.isGenerating || !apiConfig) {
      console.error("Cannot regenerate:", {
        hasCharacterData: !!characterData,
        isGenerating: state.isGenerating,
        hasApiConfig: !!apiConfig
      });
      setState(prev => ({
        ...prev,
        error: !apiConfig ? "API configuration not loaded" : "Cannot regenerate message",
        lastContextWindow: {
          type: 'regeneration_error',
          timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name || 'Unknown',
          error: !apiConfig ? "API configuration not loaded" : "Cannot regenerate message"
        }
      }));
      return;
    }
  
    const targetIndex = state.messages.findIndex(msg => msg.id === message.id);
    if (targetIndex === -1) {
      console.error(`Message with ID ${message.id} not found`);
      return;
    }
  
    setState(prev => ({ ...prev, isGenerating: true }));
    console.log(`Regenerating message at index ${targetIndex}`);
  
    try {
      const contextMessages = state.messages
        .slice(0, targetIndex)
        .filter(msg => msg.role !== 'thinking')
        .map(({role, content}) => {
          return {
            role: role === 'thinking' ? 'system' : role, 
            content
          } as { role: 'user' | 'assistant' | 'system'; content: string };
        });
  
      let promptText = "Provide a fresh response that builds on the existing story without repeating previous details verbatim. ##!important:avoid acting,speaking, or thinking for {{user}}!##";
      let promptSource = "default";
      
      for (let i = targetIndex - 1; i >= 0; i--) {
        if (state.messages[i].role === 'user') {
          promptText = state.messages[i].content;
          promptSource = `message_${i}`;
          break;
        }
      }
  
      const contextWindow = {
        type: 'regeneration',
        timestamp: new Date().toISOString(),
        characterName: characterData.data?.name || 'Unknown',
        messageId: message.id,
        messageIndex: targetIndex,
        contextMessageCount: contextMessages.length,
        prompt: promptText,
        promptSource: promptSource,
        originalContent: message.content,
        config: apiConfig
      };
  
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
  
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const response = await PromptHandler.generateChatResponse(
        characterData,
        promptText,
        contextMessages,
        formattedAPIConfig,
        currentGenerationRef.current?.signal
      );
  
      if (!response.ok) {
        throw new Error("Generation failed - check API settings");
      }
  
      let newContent = '';
      let buffer = '';
      let bufferTimer: NodeJS.Timeout | null = null;
  
      for await (const chunk of PromptHandler.streamResponse(response)) {
        if (!bufferTimer) {
          bufferTimer = setInterval(() => {
            if (buffer.length > 0) {
              const content = newContent + buffer;
              buffer = '';
              setState(prev => {
                const updatedMessages = [...prev.messages];
                updatedMessages[targetIndex] = {
                  ...updatedMessages[targetIndex],
                  content
                };
                return { ...prev, messages: updatedMessages };
              });
              newContent = content;
            }
          }, 50);
        }
        
        buffer += chunk;
      }
  
      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }
  
      if (buffer.length > 0) {
        newContent += buffer;
        setState(prev => {
          const updatedMessages = [...prev.messages];
          const targetMsg = updatedMessages[targetIndex];
        
          const variations = [...(targetMsg.variations || [])];
          if (!variations.includes(newContent)) {
            variations.push(newContent);
          }
        
          updatedMessages[targetIndex] = {
            ...targetMsg,
            content: newContent,
            variations,
            currentVariation: variations.length - 1
          };
  
          const updatedContextWindow = {
            ...prev.lastContextWindow,
            type: 'regeneration_complete',
            finalResponse: newContent,
            completionTime: new Date().toISOString(),
            variationsCount: variations.length
          };
  
          return {
            ...prev,
            messages: updatedMessages,
            isGenerating: false,
            lastContextWindow: updatedContextWindow
          };
        });
      }
  
      saveChat();
      
    } catch (err) {
      console.error("Regeneration error:", err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "Generation failed",
        isGenerating: false,
        lastContextWindow: {
          ...prev.lastContextWindow,
          type: 'regeneration_error',
          errorTime: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Unknown error during regeneration'
        }
      }));
    } finally {
      currentGenerationRef.current = null;
    }
  };

  const generateVariation = useCallback(async (messageToVary: Message) => {
    if (!characterData?.data || !apiConfig || state.isGenerating) {
      console.warn('Variation generation conditions not met.', {
        hasChar: !!characterData?.data,
        hasApiConfig: !!apiConfig,
        isGenerating: state.isGenerating,
      });
      return;
    }

    const { id: messageId, content: previousContentHtml, role } = messageToVary;
    const previousContentText = htmlToText(previousContentHtml); // Get plain text of previous response

    if (role !== 'assistant') {
      console.warn('Cannot generate variations for non-assistant messages.');
      return;
    }

    const messageIndex = state.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex < 1 || state.messages[messageIndex - 1].role !== 'user') {
      console.error('Could not find preceding user message to generate variation.');
      setState(prev => ({ ...prev, error: 'Cannot generate variation: context unclear.' }));
      return;
    }
    const originalUserMessage = state.messages[messageIndex - 1];
    const originalUserMessageText = htmlToText(originalUserMessage.content); // Get plain text

    // Construct the special prompt message mimicking 'refreshVariation'
    // This message will be passed as the 'currentMessage' to generateChatResponse
    const variationPromptMessage = `Create a new response to the message: "${originalUserMessageText}". Your previous response was: "${previousContentText}". Create a completely different response that captures your character (${characterData.data.name}) but explores a new direction. Avoid repeating phrases from your previous response.`;

    setState(prev => ({
      ...prev,
      isGenerating: true,
      generatingId: messageId, // Mark the message being varied
      error: null,
    }));

    const abortController = new AbortController();
    currentGenerationRef.current = abortController;

    try {
      const preparedApiConfig = prepareAPIConfig(apiConfig);

      // Prepare history up to the user message *before* the assistant message we're varying
      const historyForVariation = state.messages.slice(0, messageIndex);

      // Call the static generateChatResponse method
      const response = await PromptHandler.generateChatResponse(
        characterData,
        variationPromptMessage, // Pass the specially crafted prompt here
        historyForVariation,
        preparedApiConfig,
        abortController.signal
      );

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText || response.statusText}`);
      }

      let accumulatedContent = '';
      // Use the static streamResponse method
      for await (const chunk of PromptHandler.streamResponse(response)) {
        if (abortController.signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }
        accumulatedContent += chunk;
      }

      const finalContent = markdownToHtml(accumulatedContent.trim()); // Convert final markdown to HTML

      // Update State with New Variation
      setState(prev => {
        const msgIndex = prev.messages.findIndex(msg => msg.id === messageId);
        if (msgIndex === -1) return prev; // Message might have been deleted

        const originalMessage = prev.messages[msgIndex];
        // Use the imported MessageUtils.addVariation
        const updatedMessage = MessageUtils.addVariation(originalMessage, finalContent);

        const newMessages = [...prev.messages];
        newMessages[msgIndex] = updatedMessage;

        // Save the updated chat state
        saveChat(newMessages); // Save the whole chat with the updated message
        appendMessage(updatedMessage); // Ensure this specific message update is persisted if needed

        return {
          ...prev,
          messages: newMessages,
          isGenerating: false,
          generatingId: null,
          lastContextWindow: { // Update context window for success
            type: 'variation_success',
            timestamp: new Date().toISOString(),
            characterName: characterData.data.name,
            originalMessageId: messageId,
            newVariationContent: finalContent,
            totalVariations: updatedMessage.variations?.length || 1
          }
        };
      });

    } catch (err) {
      handleGenerationError(err, messageId); // Use existing error handler
    } finally {
      if (currentGenerationRef.current === abortController) {
        currentGenerationRef.current = null;
      }
      // Ensure isGenerating is false even if error handling missed something
      setState(prev => ({ ...prev, isGenerating: false, generatingId: null }));
    }
  }, [characterData, apiConfig, state.messages, state.currentUser, state.isGenerating, prepareAPIConfig, handleGenerationError, saveChat, appendMessage]);
  
  const cycleVariation = (messageId: string, direction: 'next' | 'prev') => {
    setState(prev => {
      const updatedMessages = prev.messages.map(msg => {
        if (msg.id === messageId && msg.variations?.length) {
          return MessageUtils.cycleVariation(msg, direction);
        }
        return msg;
      });
      
      const targetMessage = prev.messages.find(msg => msg.id === messageId);
      const updatedContextWindow = {
        type: 'cycle_variation',
        timestamp: new Date().toISOString(),
        messageId,
        direction,
        characterName: characterData?.data?.name || 'Unknown',
        totalVariations: targetMessage?.variations?.length || 0,
        previousIndex: targetMessage?.currentVariation || 0,
        currentVariationContent: targetMessage?.variations?.[targetMessage?.currentVariation || 0] || ''
      };
      
      saveChat(updatedMessages);
      
      return {
        ...prev,
        messages: updatedMessages,
        lastContextWindow: updatedContextWindow
      };
    });
  };
  
  const stopGeneration = useCallback(() => {
    console.log('Stop generation called');
    if (!state.isGenerating) {
      console.log('Not currently generating, nothing to stop');
      return;
    }
    
    if (currentGenerationRef.current) {
      console.log('Aborting generation with controller');
      try {
        currentGenerationRef.current.abort();
      } catch (err) {
        console.error('Error aborting generation:', err);
      }
      currentGenerationRef.current = null;
    }
    
    // Always reset state, even if abort controller failed
    setState(prev => ({
      ...prev,
      isGenerating: false,
      generatingId: null,
      
      // Update context window
      lastContextWindow: {
        type: 'generation_stopped',
        timestamp: new Date().toISOString(),
        messageId: prev.generatingId
      }
    }));
  }, [state.isGenerating, state.generatingId]);

  const setCurrentUser = (user: UserProfile | null) => {
    ChatStorage.saveCurrentUser(user);
    
    setState(prev => ({
      ...prev,
      currentUser: user,
      lastContextWindow: {
        type: 'user_changed',
        timestamp: new Date().toISOString(),
        userName: user?.name || 'null',
        characterName: characterData?.data?.name || 'Unknown'
      }
    }));
    
    saveChat();
  };
  
  const loadExistingChat = useCallback(async (chatId: string) => {
    if (!characterData) {
      setState(prev => ({
        ...prev,
        error: "No character data available"
      }));
      return;
    }
    
    try {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null
      }));
      
      const result = await ChatStorage.loadChat(chatId, characterData);
      
      if (result?.success && result.messages) {
        setState(prev => ({
          ...prev,
          messages: [],
          currentUser: null
        }));
        
        if (Array.isArray(result.messages.messages) && result.messages.messages.length > 0) {
          setState(prev => ({
            ...prev,
            messages: result.messages.messages,
            currentUser: result.messages.metadata?.chat_metadata?.lastUser || prev.currentUser
          }));
        } else if (characterData?.data?.first_mes) {
          const firstMessage = createAssistantMessage(characterData.data.first_mes);
          setState(prev => ({
            ...prev,
            messages: [firstMessage]
          }));
        }
      } else {
        setState(prev => ({
          ...prev,
          error: "Failed to load chat"
        }));
      }
    } catch (err) {
      console.error('Error loading chat:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "Unknown error loading chat"
      }));
    } finally {
      setState(prev => ({
        ...prev,
        isLoading: false
      }));
    }
  }, [characterData]);

  const updateReasoningSettings = (settings: ReasoningSettings) => {
    try {
      localStorage.setItem('cardshark_reasoning_settings', JSON.stringify(settings));
      
      setState(prev => ({
        ...prev,
        reasoningSettings: settings,
        lastContextWindow: {
          type: 'reasoning_settings_updated',
          timestamp: new Date().toISOString(),
          enabled: settings.enabled,
          visible: settings.visible,
          characterName: characterData?.data?.name || 'Unknown'
        }
      }));
      
      console.log('Updated reasoning settings:', settings);
    } catch (err) {
      console.error('Error updating reasoning settings:', err);
      setState(prev => ({
        ...prev,
        error: 'Failed to update reasoning settings'
      }));
    }
  };
  
  return {
    ...state,
    updateMessage,
    deleteMessage,
    addMessage,
    generateResponse,
    regenerateMessage,
    generateVariation,
    cycleVariation,
    stopGeneration,
    setCurrentUser,
    loadExistingChat,
    clearError,
    updateReasoningSettings,
    generateReasoningResponse
  };
}

const createUserMessage = (content: string): Message => {
  const htmlContent = markdownToHtml(content);
  
  return {
    id: MessageUtils.generateUUID(),
    role: 'user',
    content: htmlContent,
    rawContent: htmlToText(htmlContent),
    timestamp: Date.now()
  };
};

const createAssistantMessage = (content: string = ''): Message => {
  const htmlContent = markdownToHtml(content);
  
  return {
    id: MessageUtils.generateUUID(),
    role: 'assistant',
    content: htmlContent,
    rawContent: htmlToText(htmlContent),
    timestamp: Date.now(),
    variations: content ? [htmlContent] : [],
    currentVariation: 0
  };
};

// Removed duplicate local addVariation function. Using MessageUtils.addVariation instead.
