// hooks/useChatMessages.ts
import { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { CharacterData } from '../contexts/CharacterContext';
import { PromptHandler } from '../handlers/promptHandler';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { APIConfig, APIProvider, ChatTemplate } from '../types/api';
import { generateUUID } from '../utils/generateUUID';
import { apiService } from '../services/apiService';

const defaultApiConfig: APIConfig = {
  id: 'default',
  provider: APIProvider.KOBOLD,
  url: 'http://localhost:5001',
  template: ChatTemplate.MISTRAL,
  enabled: true
};

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  variations?: string[];
  currentVariation?: number;
  aborted?: boolean;
}

export interface UserProfile {
  name: string;
  filename: string;
  size: number;
  modified: number;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  currentUser: UserProfile | null;
  lastContextWindow: any | null;  // Added to track the context window
}

export function useChatMessages(characterData: CharacterData | null) {
  // Access the API configuration from the context
  const { apiConfig } = useContext(APIConfigContext);

  // Initialize with stored user and persisted context window
  const [state, setState] = useState<ChatState>(() => {
    let storedUser: UserProfile | null = null;
    let persistedContextWindow: any | null = null;
    
    try {
      // Load stored user
      const stored = localStorage.getItem('cardshark_current_user');
      if (stored) {
        const userData = JSON.parse(stored);
        // Validate stored user has all required fields
        if (userData.name && userData.filename &&
          typeof userData.size === 'number' &&
          typeof userData.modified === 'number') {
          storedUser = userData;
        }
      }
      
      // Load persisted context window
      const storedContextWindow = localStorage.getItem('cardshark_context_window');
      if (storedContextWindow) {
        persistedContextWindow = JSON.parse(storedContextWindow);
      }
    } catch (err) {
      console.error('Error loading stored data:', err);
    }

    return {
      messages: [],
      isLoading: false,
      isGenerating: false,
      error: null,
      currentUser: storedUser,
      lastContextWindow: persistedContextWindow  // Use the persisted context window
    };
  });

  const currentGenerationRef = useRef<AbortController | null>(null);
  const lastCharacterId = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveEnabled = useRef(true);

  // Generate a unique character ID for consistency
  const getCharacterId = (character: CharacterData | null): string | null => {
    if (!character?.data?.name) return null;
    
    try {
      // Create a simple hash from character name and first few chars of description
      const name = character.data.name;
      const desc = character.data.description?.substring(0, 50) || '';
      
      // Use a safer encoding method
      // Instead of btoa, we'll use a simple hash function
      const simpleHash = (text: string): string => {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
          const char = text.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32bit integer
        }
        // Return a positive value as a hex string, limited to 8 chars
        return Math.abs(hash).toString(16).substring(0, 8);
      };
      
      return `${name.replace(/\s+/g, '_').toLowerCase()}-${simpleHash(name + desc)}`;
    } catch (error) {
      console.error('Error generating character ID:', error);
      // Fallback to a timestamp-based ID if anything goes wrong
      return `char-${Date.now().toString(36)}`;
    }
  };

  // Add this effect at the beginning of the hook to load context on mount
  useEffect(() => {
    const loadContextWindow = async () => {
      try {
        const data = await apiService.loadContextWindow();
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
  }, []); // Run once on mount

  // For clearing context window:
  const clearContextWindow = async () => {
    try {
      await apiService.clearContextWindow();
    } catch (err) {
      console.error('Error clearing context window:', err);
    }
  };

  // For saving context window:
useEffect(() => {
  // Don't persist null context windows, and only persist if we have real data
  if (state.lastContextWindow) {
    const saveContextWindow = async () => {
      try {
        await apiService.saveContextWindow(state.lastContextWindow);
      } catch (err) {
        console.error('Error saving context window:', err);
      }
    };
    
    saveContextWindow();
  }
}, [state.lastContextWindow]);
    
  // Load chat whenever character data changes
  useEffect(() => {
    if (!characterData?.data?.name) return;

    const currentCharId = getCharacterId(characterData);
    if (currentCharId === lastCharacterId.current) return;
    
    // Clear persisted context window when character changes
    if (lastCharacterId.current !== null) {
      clearContextWindow();
    }

    console.log('Character changed, loading chat for:', characterData.data.name);
    
    const loadChat = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
    
        const response = await apiService.loadLatestChat(characterData);
        console.log('Load chat response:', response);
    
        if (response.success && response.messages) {
          // If messages exist, set them
          if (Array.isArray(response.messages.messages) && response.messages.messages.length > 0) {
            setState(prev => ({
              ...prev,
              messages: response.messages.messages,
              currentUser: response.messages.metadata?.chat_metadata?.lastUser || prev.currentUser,
              // Set the context window data based on loaded chat
              lastContextWindow: {
                type: 'loaded_chat',
                timestamp: new Date().toISOString(),
                characterName: characterData.data.name,
                chatId: response.messages.metadata?.chat_metadata?.chat_id || 'unknown',
                messageCount: response.messages.messages.length
              }
            }));
          } 
          // If no messages but we have a first message, use that
          else if (characterData.data.first_mes) {
            const firstMessage: Message = {
              id: Date.now().toString(),
              role: 'assistant',
              content: characterData.data.first_mes,
              timestamp: Date.now(),
              variations: [],
              currentVariation: 0,
            };
            console.log('Setting initial first message:', firstMessage);
            setState(prev => ({
              ...prev,
              messages: [firstMessage],
              // Set the context window for initial message
              lastContextWindow: {
                type: 'initial_message',
                timestamp: new Date().toISOString(),
                characterName: characterData.data.name,
                firstMessage: characterData.data.first_mes
              }
            }));
            // Save this initial state
            saveChat([firstMessage]);
          }
        } else if (characterData.data.first_mes) {
          // If chat loading failed but we have a first message, start with that
          const firstMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: characterData.data.first_mes,
            timestamp: Date.now(),
            variations: [],
            currentVariation: 0,
          };
          console.log('Setting first message on error/no messages:', firstMessage);
          setState(prev => ({
            ...prev,
            messages: [firstMessage],
            // Set the context window for initial message when load failed
            lastContextWindow: {
              type: 'initial_message_fallback',
              timestamp: new Date().toISOString(),
              characterName: characterData.data.name,
              firstMessage: characterData.data.first_mes,
              error: 'Failed to load existing chat'
            }
          }));
          // Save this initial state
          saveChat([firstMessage]);
        }
        
        lastCharacterId.current = currentCharId;
      } catch (err) {
        console.error('Chat loading error:', err);
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to load chat',
          // Record error in context window
          lastContextWindow: {
            type: 'load_error',
            timestamp: new Date().toISOString(),
            characterName: characterData.data.name,
            error: err instanceof Error ? err.message : 'Failed to load chat'
          }
        }));
      } finally {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    loadChat();
  }, [characterData]);

  // Debounced save function to prevent excessive writes
  const saveChat = (messageList = state.messages) => {
    if (!characterData?.data?.name || !autoSaveEnabled.current) return;
    
    // Clear any pending timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set a new timeout
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        console.log('Saving chat state...', messageList.length);
        
        // Get current API information from context
        const apiInfo = apiConfig ? {
          provider: apiConfig.provider,
          model: apiConfig.model,
          url: apiConfig.url,
          // Don't include sensitive info like API keys
          template: apiConfig.template,
          enabled: apiConfig.enabled
        } : null;
        
        // Save chat with API information
        await apiService.saveChat(characterData, messageList, state.currentUser, apiInfo);
      } catch (err) {
        console.error('Error saving chat:', err);
      }
    }, 500); // 500ms debounce
  };

  // Single message append with save
  const appendMessage = async (message: Message) => {
    if (!characterData?.data?.name) return;
  
    try {
      await apiService.appendChatMessage(characterData, message);
    } catch (err) {
      console.error('Error appending message:', err);
    }
  };

  // Message management with save hooks
  const updateMessage = (messageId: string, content: string) => {
    setState(prev => {
      const newMessages = prev.messages.map(msg =>
        msg.id === messageId
          ? { ...msg, content, variations: [content], currentVariation: 0 }
          : msg
      );
      saveChat(newMessages);
      return { ...prev, messages: newMessages };
    });
  };

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const deleteMessage = (messageId: string) => {
    setState(prev => {
      const newMessages = prev.messages.filter(msg => msg.id !== messageId);
      saveChat(newMessages);
      
      // Update context window to show message was deleted
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
    // Ensure message has a proper UUID
    if (!message.id) {
      message = {
        ...message,
        id: generateUUID()
      };
    }
    
    setState(prev => {
      const newMessages = [...prev.messages, message];
      
      // Update context window
      const updatedContextWindow = {
        type: 'message_added',
        timestamp: new Date().toISOString(),
        messageId: message.id,
        messageRole: message.role,
        totalMessages: newMessages.length,
        characterName: characterData?.data?.name || 'Unknown'
      };
      
      return { 
        ...prev, 
        messages: newMessages,
        lastContextWindow: updatedContextWindow 
      };
    });
    
    // We save after the state update to ensure we have the latest messages
    setTimeout(() => {
      saveChat();
      appendMessage(message);
    }, 50);
  };

  // Message generation with save hooks
  const generateResponse = async (prompt: string) => {
    if (!characterData || state.isGenerating) return;
    console.log('Starting generation for prompt:', prompt);

    // Handle /new command for new chat
    if (prompt === '/new') {
      console.log('Handling /new command - creating new chat');
      
      // First, clear all existing messages
      setState(prev => ({ 
        ...prev, 
        messages: [],
        lastContextWindow: {
          type: 'new_chat',
          timestamp: new Date().toISOString(),
          characterName: characterData.data?.name || 'Unknown'
        }
      }));
      
      // Then create a new chat on the backend
      try {
        const response = await fetch('/api/create-new-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_data: characterData }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to create new chat');
        }
        
        // Now add the first message if available
        if (characterData.data.first_mes) {
          const firstMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: characterData.data.first_mes,
            timestamp: Date.now(),
            variations: [],
            currentVariation: 0,
          };
          
          // Update state with just the first message
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
          
          // Save the first message to the new chat
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
            characterName: characterData.data?.name || 'Unknown',
            error: err instanceof Error ? err.message : 'Failed to create new chat'
          }
        }));
      }
      
      return;
    }

    const userMessage: Message = {
      id: generateUUID(),
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };
  
    const assistantMessage: Message = {
      id: generateUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
      variations: [],
      currentVariation: 0,
      aborted: false
    };
  
    console.log('Created messages:', { userMessage, assistantMessage });
  
    // Add messages to state
    setState(prev => ({ 
      ...prev, 
      messages: [...prev.messages, userMessage, assistantMessage],
      isGenerating: true 
    }));
  
    // Save the user message immediately
    await appendMessage(userMessage);
  
    // Setup abort controller
    const abortController = new AbortController();
    currentGenerationRef.current = abortController;
  
    try {
      console.log('Making API request');
      
      // Prepare context messages
      const contextMessages = state.messages.map(({ role, content }) => ({ role, content }));
      
      // Create a proper API config with required fields
      const fullApiConfig: APIConfig = apiConfig || {
        id: 'default',
        provider: APIProvider.KOBOLD, 
        url: 'http://localhost:5001',
        enabled: false,
        template: ChatTemplate.MISTRAL,
        templateId: 'mistral'
      };
      
      // Now use the templateId from the API config
      console.log('Using template ID:', fullApiConfig.templateId);
      
      // Create context window object for tracking
      const contextWindow = {
        type: 'generation',
        timestamp: new Date().toISOString(),
        prompt,
        characterName: characterData.data?.name || 'Unknown',
        messageHistory: contextMessages,
        userMessage: userMessage,
        assistantMessageId: assistantMessage.id,
        config: fullApiConfig, // Use the full API config
        systemPrompt: characterData.data?.system_prompt || '',
        firstMes: characterData.data?.first_mes || '',
        personality: characterData.data?.personality || '',
        scenario: characterData.data?.scenario || ''
      };
      
      // Update state with context window
      setState(prev => ({
        ...prev,
        lastContextWindow: contextWindow
      }));
      
      const response = await PromptHandler.generateChatResponse(
        characterData,
        prompt,
        contextMessages,
        fullApiConfig, // Use the full API config
        abortController.signal
      );

      if (!response.ok) {
        throw new Error('Generation failed - check API settings');
      }

      console.log('Starting to process stream');
      let newContent = '';
      let chunkCount = 0;

      for await (const chunk of PromptHandler.streamResponse(response)) {
        chunkCount++;
        newContent += chunk;

        setState(prev => {
          const updatedMessages = prev.messages.map(msg =>
            msg.id === assistantMessage.id ? { ...msg, content: newContent } : msg
          );
          return {
            ...prev,
            messages: updatedMessages
          };
        });
      }

      console.log('Stream complete, chunks:', chunkCount);

      // Update with final content and variations
      setState(prev => {
        const finalMessages = prev.messages.map(msg =>
          msg.id === assistantMessage.id
            ? { ...msg, content: newContent, variations: [newContent], currentVariation: 0 }
            : msg
        );
        
        // Update context window with completion info
        const updatedContextWindow = {
          ...prev.lastContextWindow,
          type: 'generation_complete',
          finalResponse: newContent,
          chunkCount,
          completionTime: new Date().toISOString(),
          totalTokens: newContent.split(/\s+/).length // Rough token estimation
        };
        
        // Save final state after completion
        setTimeout(() => saveChat(finalMessages), 100);
        return {
          ...prev,
          messages: finalMessages,
          isGenerating: false,
          lastContextWindow: updatedContextWindow
        };
      });

      // Save assistant message
      await appendMessage({
        ...assistantMessage,
        content: newContent,
        variations: [newContent],
        currentVariation: 0
      });

    } catch (err) {
      console.error('Error during generation:', err);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(msg =>
            msg.id === assistantMessage.id ? { ...msg, aborted: true } : msg
          ),
          isGenerating: false,
          lastContextWindow: {
            ...prev.lastContextWindow,
            type: 'generation_aborted',
            abortTime: new Date().toISOString(),
            error: 'Generation was manually aborted'
          }
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Generation failed',
          messages: prev.messages.map(msg =>
            msg.id === assistantMessage.id
              ? { ...msg, content: "Generation Failed", aborted: true }
              : msg
          ),
          isGenerating: false,
          lastContextWindow: {
            ...prev.lastContextWindow,
            type: 'generation_error',
            errorTime: new Date().toISOString(),
            error: err instanceof Error ? err.message : 'Unknown error during generation'
          }
        }));
      }
      
      // Save the error state
      saveChat();
    } finally {
      currentGenerationRef.current = null;
      console.log('Generation complete');
    }
  };

  // Regeneration function with context tracking
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
  
    // Find the exact message by ID
    const targetIndex = state.messages.findIndex(msg => msg.id === message.id);
    
    if (targetIndex === -1) {
      console.error(`Message with ID ${message.id} not found`);
      return;
    }
    
    setState(prev => ({ 
      ...prev, 
      isGenerating: true 
    }));
    
    console.log(`Regenerating message at index ${targetIndex}`);
  
    try {
      // Get all messages before the target as context
      const contextMessages = state.messages
        .slice(0, targetIndex)
        .map(({ role, content }) => ({ role, content }));
        
      // Find the last user message to use as prompt
      let promptText = "Provide a fresh response that builds on the existing story without repeating previous details verbatim. ##!important:avoid acting,speaking, or thinking for {{user}}!##";
      let promptSource = "default";
      for (let i = targetIndex - 1; i >= 0; i--) {
        if (state.messages[i].role === 'user') {
          promptText = state.messages[i].content;
          promptSource = `message_${i}`;
          break;
        }
      }
      
      // Create context window object for regeneration
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
      
      // Update state with context window
      setState(prev => ({
        ...prev,
        lastContextWindow: contextWindow
      }));
  
      const response = await PromptHandler.generateChatResponse(
        characterData,
        promptText,
        contextMessages,
        apiConfig,
        currentGenerationRef.current?.signal
      );
  
      if (!response.ok) {
        throw new Error("Generation failed - check API settings");
      }
  
      let newContent = '';
      for await (const chunk of PromptHandler.streamResponse(response)) {
        newContent += chunk;
        
        setState(prev => {
          const updatedMessages = [...prev.messages];
          updatedMessages[targetIndex] = {
            ...updatedMessages[targetIndex],
            content: newContent
          };
          return { ...prev, messages: updatedMessages };
        });
      }
  
      // Update the message in state with the new content and add to variations
      setState(prev => {
        const updatedMessages = [...prev.messages];
        const targetMsg = updatedMessages[targetIndex];
        
        // Create or update variations array
        const variations = [...(targetMsg.variations || [])];
        
        // Add original content if not already in variations
        if (!variations.includes(targetMsg.content)) {
          variations.push(targetMsg.content);
        }
        
        updatedMessages[targetIndex] = {
          ...targetMsg,
          content: newContent,
          variations: variations,
          currentVariation: variations.length - 1
        };
        
        // Update context window with completion info
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
  
      // Save the updated chat
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

  const cycleVariation = (messageId: string, direction: 'next' | 'prev') => {
    setState(prev => {
      const updatedMessages = prev.messages.map(msg => {
        if (msg.id === messageId && msg.variations?.length) {
          const currentIndex = msg.currentVariation ?? 0;
          const totalVariations = msg.variations.length;
          const newIndex = direction === 'next'
            ? (currentIndex + 1) % totalVariations
            : (currentIndex - 1 + totalVariations) % totalVariations;

          return {
            ...msg,
            content: msg.variations[newIndex],
            currentVariation: newIndex,
          };
        }
        return msg;
      });
      
      // Create context window info about variation cycling
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
      
      // Save the updated variation state
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
      setState(prev => ({
        ...prev,
        lastContextWindow: {
          ...prev.lastContextWindow,
          type: 'generation_stopping',
          stopTime: new Date().toISOString()
        }
      }));
      
      currentGenerationRef.current.abort();
    }
  };

  const setCurrentUser = (user: UserProfile | null) => {
    if (user) {
      // Store complete user profile
      localStorage.setItem('cardshark_current_user', JSON.stringify({
        name: user.name,
        filename: user.filename,
        size: user.size,
        modified: user.modified
      }));
    } else {
      localStorage.removeItem('cardshark_current_user');
    }
    
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
    
    // Save current chat with updated user info
    saveChat();
  };

  // Load a specific chat by ID
  const loadExistingChat = async (chatId: string) => {
    if (!characterData) return;
    
    try {
      // Clear persisted context window first
      await apiService.clearContextWindow();
      
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
      
      const data = await apiService.loadChat(characterData, chatId);
      
      if (data.success && data.messages) {
        // Set messages and extract user from metadata if available
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
        
        // Update lastCharacterId to prevent automatic reloading
        lastCharacterId.current = getCharacterId(characterData);
      } else {
        throw new Error(data.message || 'Failed to load chat data');
      }
    } catch (err) {
      // Error handling remains the same
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

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
    clearError  
  };
}