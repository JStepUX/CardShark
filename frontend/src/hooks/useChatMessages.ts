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
  
  // Create debounced save function
  const debouncedSave = MessageUtils.createDebouncedSave((messages: Message[]) => {
    saveChat(messages);
  });
  
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
    loadChatForCharacter();
    
    // Function to load character's chat
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
          } else if (characterData?.data?.first_mes) {
            const firstMessage = createAssistantMessage(characterData?.data?.first_mes);
            
            setState(prev => ({
              ...prev, 
              messages: [firstMessage],
              lastContextWindow: {
                type: 'initial_message',
                timestamp: new Date().toISOString(),
                characterName: characterData.data.name,
                firstMessage: characterData.data.first_mes
              }
            }));
            
            saveChat([firstMessage]);
          }
        } else if (characterData?.data?.first_mes) {
          const firstMessage = createAssistantMessage(characterData.data.first_mes);
          
          setState(prev => ({
            ...prev,
            messages: [firstMessage],
            lastContextWindow: {
              type: 'initial_message_fallback',
              timestamp: new Date().toISOString(),
              characterName: characterData.data.name,
              firstMessage: characterData.data.first_mes,
              error: 'Failed to load existing chat'
            }
          }));
          
          saveChat([firstMessage]);
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
  
  // Save chat function
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
  
  // Append a message to the chat
  const appendMessage = async (message: Message) => {
    if (!characterData?.data?.name) return;
    
    try {
      console.log(`Appending/updating message ${message.id} to chat`);
      await ChatStorage.appendMessage(characterData, message);
    } catch (err) {
      console.error('Error appending/updating message:', err);
    }
  };
  
  // Update message content
  const updateMessage = (messageId: string, content: string) => {
    setState(prev => {
      const msgIndex = prev.messages.findIndex(msg => msg.id === messageId);
      if (msgIndex === -1) return prev;
      
      const messageToUpdate = prev.messages[msgIndex];
      if (messageToUpdate.content === content) return prev;
      
      const updatedMessage = addVariation(messageToUpdate, content);
      
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
      
      if (isCompletedEdit) {
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
  
  // Clear error state
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);
  
  // Delete a message
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
  
  // Add a new message
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
  
  // Add reasoning generation
  const generateReasoningResponse = async (prompt: string) => {
    if (!state.reasoningSettings.enabled || !characterData) return null;
    
    // Create thinking message
    const thinkingId = MessageUtils.generateUUID();
    const thinkingMessage: Message = {
      id: thinkingId,
      role: 'thinking',
      content: '',
      timestamp: Date.now()
    };
    
    // Add thinking message to state
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, thinkingMessage],
      isGenerating: true,
      generatingId: thinkingId as unknown as string // Explicitly cast to string type
    }));
    
    try {
      // Guard against undefined characterData
      if (!characterData) {
        throw new Error('No character data available for generating a response');
      }
    
      // Prepare reasoning prompt with proper null checks
      const reasoningInstructions = state.reasoningSettings?.instructions || DEFAULT_REASONING_SETTINGS.instructions || '';
      const characterName = characterData.data?.name || 'Character';
      const userName = state.currentUser?.name || 'User';
      
      const reasoningPrompt = reasoningInstructions
        .replace(/\{\{char\}\}/g, characterName)
        .replace(/\{\{user\}\}/g, userName);
      
      // Fixed: Proper type handling when mapping message roles
      const contextMessages = state.messages
        .filter(msg => msg.role !== 'thinking')
        .map(({role, content}) => {
          return {
            role: role === 'thinking' ? 'system' : role, 
            content
          } as { role: 'user' | 'assistant' | 'system'; content: string };
        });
      
      // Generate thinking content
      const thinkingPrompt = `${reasoningPrompt}\n\nUser's message: ${prompt}`;
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      
      const response = await PromptHandler.generateChatResponse(
        characterData,
        thinkingPrompt,
        contextMessages,
        formattedAPIConfig,
        // Add signal if using AbortController
        currentGenerationRef.current?.signal
      );
      
      // Process streaming response
      let thinkingContent = '';
      for await (const chunk of PromptHandler.streamResponse(response)) {
        thinkingContent += chunk;
        setState(prev => {
          const updatedMessages = prev.messages.map(msg => 
            msg.id === thinkingId ? {...msg, content: thinkingContent} : msg
          );
          return {...prev, messages: updatedMessages};
        });
      }
      
      // Update final thinking message
      setState(prev => {
        const updatedMessages = prev.messages.map(msg => 
          msg.id === thinkingId ? {...msg, content: thinkingContent} : msg
        );
        return {
          ...prev,
          messages: updatedMessages,
          isGenerating: false
        };
      });
      
      return thinkingContent;
    } catch (err) {
      console.error('Error generating thinking:', err);
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Failed to generate thinking'
      }));
      return null;
    }
  };
  
  // Generate response (Implementation stays largely the same but streamlined)
  const generateResponse = async (prompt: string) => {
    if (!characterData || state.isGenerating) return;
    
    console.log('Starting generation for prompt:', prompt);
    
    // Special command for new chat
    if (prompt === '/new') {
      handleNewChat();
      return;
    }
    
    // Create user and assistant messages
    const userMessage = createUserMessage(prompt);
    const assistantMessage = createAssistantMessage();
    
    // Update state with new messages
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage, assistantMessage],
      isGenerating: true,
      generatingId: assistantMessage.id
    }));
    
    await appendMessage(userMessage);
    
    // Stream generation
    let bufferTimer: NodeJS.Timeout | null = null;
    
    const abortController = new AbortController();
    currentGenerationRef.current = abortController;
    
    try {
      // Check if reasoning is enabled and generate reasoning first
      let reasoningContent = null;
      if (state.reasoningSettings.enabled) {
        reasoningContent = await generateReasoningResponse(prompt);
      }

      // Fixed: Format context for API with proper typing
      const contextMessages = state.messages
        .filter(msg => msg.role !== 'thinking')
        .map(({role, content}) => {
          return {
            role: role === 'thinking' ? 'system' : role, 
            content
          } as { role: 'user' | 'assistant' | 'system'; content: string };
        });
      
      // Fixed: If we have reasoning content, include it as system role
      if (reasoningContent) {
        contextMessages.push({
          role: 'system',  // Changed from 'thinking' to 'system'
          content: `<think>${reasoningContent}</think>`
        });
      }
      
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      
      // Update context window
      const contextWindow = {
        type: 'generation_starting',
        timestamp: new Date().toISOString(),
        characterName: characterData.data?.name || 'Unknown',
        messageId: assistantMessage.id,
        prompt,
        reasoningEnabled: state.reasoningSettings.enabled,
        hasReasoningContent: !!reasoningContent
      };
      
      setState(prev => ({ ...prev, lastContextWindow: contextWindow }));
      
      // Start generation request
      const response = await PromptHandler.generateChatResponse(
        characterData,
        prompt,
        contextMessages,
        formattedAPIConfig,
        abortController.signal
      );
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      // Process streaming response
      let content = '';
      let buffer = '';
      
      bufferTimer = setInterval(() => {
        if (buffer.length > 0) {
          const newContent = content + buffer;
          buffer = '';
          
          setState(prev => {
            const updatedMessages = prev.messages.map(msg => 
              msg.id === assistantMessage.id ? {...msg, content: newContent} : msg
            );
            return { ...prev, messages: updatedMessages };
          });
          
          content = newContent;
        }
      }, 50);
      
      for await (const chunk of PromptHandler.streamResponse(response)) {
        buffer += chunk;
      }
      
      // Final update
      if (buffer.length > 0) {
        content += buffer;
        setState(prev => {
          const updatedMessages = prev.messages.map(msg => 
            msg.id === assistantMessage.id ? {...msg, content} : msg
          );
          return {
            ...prev,
            messages: updatedMessages,
            isGenerating: false,
            generatingId: null,
            lastContextWindow: {
              ...prev.lastContextWindow,
              type: 'generation_complete',
              completionTime: new Date().toISOString()
            }
          };
        });
      }
      
      // Save messages
      saveChat();
      appendMessage({...assistantMessage, content});
      
    } catch (err) {
      handleGenerationError(err, assistantMessage.id);
    } finally {
      currentGenerationRef.current = null;
      
      // Ensure buffer timer is cleared
      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }
      console.log('Generation complete');
    }
  };
  
  // Handle new chat command
  const handleNewChat = async () => {
    console.log('Handling /new command - creating new chat');
    
    // Clear messages
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
      // Clear context window
      await ChatStorage.clearContextWindow();
      
      if (characterData?.data.first_mes) {
        const firstMessage = createAssistantMessage(characterData.data.first_mes);
        
        setState(prev => ({
          ...prev,
          messages: [firstMessage],
          lastContextWindow: {
            type: 'new_chat_first_message',
            timestamp: new Date().toISOString(),
            characterName: characterData.data?.name || 'Unknown',
            firstMessage: characterData.data.first_mes
          }
        }));
        
        await appendMessage(firstMessage);
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
  
  // Prepare API config with default values if needed
  const prepareAPIConfig = (config?: APIConfig | null): APIConfig => {
    if (config) {
      const fullConfig = JSON.parse(JSON.stringify(config));
      
      if (!fullConfig.generation_settings) {
        console.warn('API config missing generation_settings, adding defaults');
        fullConfig.generation_settings = {
          max_length: 220,
          max_context_length: 6144,
          temperature: 1.05,
          top_p: 0.92,
          top_k: 100,
          top_a: 0,
          typical: 1,
          tfs: 1,
          rep_pen: 1.07,
          rep_pen_range: 360,
          rep_pen_slope: 0.7,
          sampler_order: [6, 0, 1, 3, 4, 2, 5]
        };
      }
      
      return fullConfig;
    }
    
    console.warn('No API config provided, using defaults');
    return {
      id: 'default',
      provider: APIProvider.KOBOLD,
      url: 'http://localhost:5001',
      enabled: false,
      templateId: 'mistral',
      generation_settings: {
        max_length: 220,
        max_context_length: 6144,
        temperature: 1.05,
        top_p: 0.92,
        top_k: 100,
        top_a: 0,
        typical: 1,
        tfs: 1,
        rep_pen: 1.07,
        rep_pen_range: 360,
        rep_pen_slope: 0.7,
        sampler_order: [6, 0, 1, 3, 4, 2, 5]
      }
    };
  };
  
  // Handle generation errors
  const handleGenerationError = (err: any, messageId: string) => {
    console.error('Error during generation:', err);
    
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log('Generation was aborted by user - keeping current content');
      
      setState(prev => {
        // Find the message being generated
        const messageIndex = prev.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
          console.error(`Message with ID ${messageId} not found`);
          return prev;
        }
        
        const currentMessage = prev.messages[messageIndex];
        const currentContent = currentMessage.content || '';
        
        console.log(`Preserving current content: ${currentContent.substring(0, 50)}...`);
        
        // Build updated messages array
        const updatedMessages = [...prev.messages];
        updatedMessages[messageIndex] = {
          ...currentMessage,
          // Keep the current content, don't mark as aborted
          content: currentContent,
          // Add current content as a variation if needed
          variations: currentMessage.variations ? 
            [...currentMessage.variations] : 
            [currentContent],
          currentVariation: 0
        };
        
        return {
          ...prev,
          messages: updatedMessages,
          isGenerating: false,
          lastContextWindow: {
            ...prev.lastContextWindow,
            type: 'generation_stopped',
            stopTime: new Date().toISOString(),
            partialContent: currentContent.substring(0, 100) + '...'
          }
        };
      });
      
      saveChat();
    } else {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Generation failed',
        messages: prev.messages.map(msg => 
          msg.id === messageId ? {...msg, content: "Generation Failed", aborted: true} : msg
        ),
        isGenerating: false,
        lastContextWindow: {
          ...prev.lastContextWindow,
          type: 'generation_error',
          errorTime: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Unknown error during generation'
        }
      }));
      
      saveChat();
    }
  };
  
// Regenerate message
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
      // Get context messages up to the target message
      const contextMessages = state.messages
        .slice(0, targetIndex)
        .filter(msg => msg.role !== 'thinking')
        .map(({role, content}) => {
          return {
            role: role === 'thinking' ? 'system' : role, 
            content
          } as { role: 'user' | 'assistant' | 'system'; content: string };
        });
  
      // Find the most recent user prompt
      let promptText = "Provide a fresh response that builds on the existing story without repeating previous details verbatim. ##!important:avoid acting,speaking, or thinking for {{user}}!##";
      let promptSource = "default";
      
      for (let i = targetIndex - 1; i >= 0; i--) {
        if (state.messages[i].role === 'user') {
          promptText = state.messages[i].content;
          promptSource = `message_${i}`;
          break;
        }
      }
  
      // Update context window
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
  
      // Generate new content
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
  
      // Stream response
      let newContent = '';
      let buffer = '';
      let bufferTimer: NodeJS.Timeout | null = null;
  
      for await (const chunk of PromptHandler.streamResponse(response)) {
        // Batch updates for smoother performance
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
          }, 50); // Render updates at ~20fps for smooth animation
        }
        
        // Add new content to buffer
        buffer += chunk;
      }
  
      // Clean up buffer timer
      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }
  
      // Final update
      if (buffer.length > 0) {
        newContent += buffer;
        setState(prev => {
          const updatedMessages = [...prev.messages];
          const targetMsg = updatedMessages[targetIndex];
        
          // Add as a new variation
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
  
      // Save messages
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
  
  // Cycle through message variations
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
  
  const stopGeneration = () => {
    if (currentGenerationRef.current) {
      console.log('Stopping generation - aborting controller');
      
      setState(prev => {
        // Note: We don't need to find the generating message ID since we're
        // letting the abort controller handle stopping the generation
        
        const updatedContextWindow = {
          ...prev.lastContextWindow,
          type: 'generation_stopping',
          stopTime: new Date().toISOString()
        };
        
        return {
          ...prev,
          lastContextWindow: updatedContextWindow,
          isGenerating: false // Immediately update UI state
        };
      });
      
      // Abort the controller which will trigger the AbortError
      currentGenerationRef.current.abort();
      currentGenerationRef.current = null; // Clear it immediately
    } else {
      console.warn('No active generation to stop');
    }
  };
  
  // Set current user
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
  
  // Load existing chat
  const loadExistingChat = async (chatId: string) => {
    if (!characterData) return;
    
    try {
      await ChatStorage.clearContextWindow();
      
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        lastContextWindow: {
          type: 'loading_chat',
          timestamp: new Date().toISOString(),
          chatId,
          characterName: characterData.data?.name || 'Unknown'
        }
      }));
      
      const data = await ChatStorage.loadChat(characterData, chatId);
      
      if (data.success && data.messages) {
        const userFromChat = data.messages.metadata?.chat_metadata?.lastUser;
        
        setState(prev => ({
          ...prev,
            messages: data.messages.messages || [],
            currentUser: userFromChat || prev.currentUser,
            lastContextWindow: {
            type: 'chat_loaded',
            timestamp: new Date().toISOString(),
            chatId,
            messageCount: (data.messages.messages || []).length,
            user: userFromChat?.name || 'Not specified',
            characterName: characterData.data?.name || 'Unknown'
            }
            }));

            lastCharacterId.current = ChatStorage.getCharacterId(characterData);
            } else {
            throw new Error(data.message || 'Failed to load chat data');
            }
            } catch (err) {
            console.error('Error loading chat:', err);
            setState(prev => ({
                ...prev,
                error: err instanceof Error ? err.message : 'Failed to load chat',
                lastContextWindow: {
                type: 'chat_load_error',
                timestamp: new Date().toISOString(),
                chatId,
                error: err instanceof Error ? err.message : 'Failed to load chat'
                }
            }));
            } finally {
            setState(prev => ({ ...prev, isLoading: false }));
            }
            };

  // Update reasoning settings
  const updateReasoningSettings = (settings: ReasoningSettings) => {
    try {
      // Save to localStorage
      localStorage.setItem('cardshark_reasoning_settings', JSON.stringify(settings));
      
      // Update state
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
  
  // Return the hook state and functions
  return {
    ...state,
    updateMessage,
    deleteMessage,
    addMessage,
    generateResponse,
    regenerateMessage,
    cycleVariation,
    stopGeneration,
    setCurrentUser,
    loadExistingChat,
    clearError,
    updateReasoningSettings
  };
}

// Update message creation to handle HTML content
const createUserMessage = (content: string): Message => {
  // Convert markdown to HTML
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
  // Convert markdown to HTML
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

// Handle message variations for rich content
const addVariation = (message: Message, newContent: string): Message => {
  // Ensure we convert markdown in new content
  const htmlContent = markdownToHtml(newContent);
  
  // Create a copy of variations or initialize it
  const variations = [...(message.variations || [])];
  
  // Add the new content if it doesn't already exist
  if (!variations.includes(htmlContent)) {
    variations.push(htmlContent);
  }
  
  // Find the index of the new content
  const variationIndex = variations.indexOf(htmlContent);
  
  return {
    ...message,
    content: htmlContent,
    rawContent: htmlToText(htmlContent),
    variations: variations,
    currentVariation: variationIndex
  };
};
