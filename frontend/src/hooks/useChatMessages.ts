// hooks/useChatMessages.ts
import { useState, useRef, useEffect, useContext } from 'react';
import { CharacterData } from '../contexts/CharacterContext';
import { PromptHandler } from '../handlers/promptHandler';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { APIConfig, APIProvider, ChatTemplate } from '../types/api';
import { generateUUID } from '../utils/generateUUID';

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
}

export function useChatMessages(characterData: CharacterData | null) {
  // Access the API configuration from the context
  const { apiConfig } = useContext(APIConfigContext);

  // Initialize with stored user
  const [state, setState] = useState<ChatState>(() => {
    let storedUser: UserProfile | null = null;
    try {
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
    } catch (err) {
      console.error('Error loading stored user:', err);
    }

    return {
      messages: [],
      isLoading: false,
      isGenerating: false,
      error: null,
      currentUser: storedUser
    };
  });

  const currentGenerationRef = useRef<AbortController | null>(null);
  const lastCharacterId = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveEnabled = useRef(true);

  // Generate a unique character ID for consistency
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

  // Load chat whenever character data changes
  useEffect(() => {
    if (!characterData?.data?.name) return;

    const currentCharId = getCharacterId(characterData);
    if (currentCharId === lastCharacterId.current) return;

    console.log('Character changed, loading chat for:', characterData.data.name);
    
    const loadChat = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        const response = await fetch('/api/load-latest-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_data: characterData })
        });

        const data = await response.json();
        console.log('Load chat response:', data);

        if (data.success && data.messages) {
          // If messages exist, set them
          if (Array.isArray(data.messages.messages) && data.messages.messages.length > 0) {
            setState(prev => ({
              ...prev,
              messages: data.messages.messages,
              currentUser: data.messages.metadata?.chat_metadata?.lastUser || prev.currentUser
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
              messages: [firstMessage]
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
            messages: [firstMessage]
          }));
          // Save this initial state
          saveChat([firstMessage]);
        }
        
        lastCharacterId.current = currentCharId;
      } catch (err) {
        console.error('Chat loading error:', err);
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to load chat'
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
        const response = await fetch('/api/save-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            character_data: characterData,
            messages: messageList,
            lastUser: state.currentUser,
          }),
        });

        if (!response.ok) {
          console.error('Failed to save chat:', await response.text());
        }
      } catch (err) {
        console.error('Error saving chat:', err);
      }
    }, 500); // 500ms debounce
  };

  // Single message append with save
  const appendMessage = async (message: Message) => {
    if (!characterData?.data?.name) return;

    try {
      const response = await fetch('/api/append-chat-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: characterData,
          message,
        }),
      });

      if (!response.ok) {
        console.error('Failed to append message:', await response.text());
      }
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

  const deleteMessage = (messageId: string) => {
    setState(prev => {
      const newMessages = prev.messages.filter(msg => msg.id !== messageId);
      saveChat(newMessages);
      return { ...prev, messages: newMessages };
    });
  };

  const addMessage = (message: Message) => {
    setState(prev => {
      const newMessages = [...prev.messages, message];
      // For manual adds, we'll save after state update
      return { ...prev, messages: newMessages };
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
    // Handle /new command for new chat
if (prompt === '/new') {
  console.log('Handling /new command - creating new chat');
  
  // First, clear all existing messages
  setState(prev => ({ ...prev, messages: [] }));
  
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
      setState(prev => ({ ...prev, messages: [firstMessage] }));
      
      // Save the first message to the new chat
      await appendMessage(firstMessage);
    }
  } catch (err) {
    console.error('Error creating new chat:', err);
    setState(prev => ({ 
      ...prev, 
      error: err instanceof Error ? err.message : 'Failed to create new chat'
    }));
  }
  
  return;
}

    const userMessage: Message = {
      id: generateUUID(), // Use UUID instead of timestamp
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };

    const assistantMessage: Message = {
      id: generateUUID(), // Use UUID instead of timestamp
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
      const response = await PromptHandler.generateChatResponse(
        characterData,
        prompt,
        state.messages.map(({ role, content }) => ({ role, content })),
        apiConfig || defaultApiConfig,
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
        // Save final state after completion
        setTimeout(() => saveChat(finalMessages), 100);
        return {
          ...prev,
          messages: finalMessages,
          isGenerating: false
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
          isGenerating: false
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
          isGenerating: false
        }));
      }
      
      // Save the error state
      saveChat();
    } finally {
      currentGenerationRef.current = null;
      console.log('Generation complete');
    }
  };

  // Message variations with save hooks
  const regenerateMessage = async (message: Message) => {
    if (!characterData || state.isGenerating || !apiConfig) {
      console.error("Cannot regenerate:", {
        hasCharacterData: !!characterData,
        isGenerating: state.isGenerating,
        hasApiConfig: !!apiConfig
      });
      setState(prev => ({
        ...prev,
        error: !apiConfig ? "API configuration not loaded" : "Cannot regenerate message"
      }));
      return;
    }
  
    // First, ensure we have a valid message to regenerate
    if (!message || !message.id) {
      console.error("Invalid message for regeneration");
      return;
    }
  
    setState(prev => ({ ...prev, isGenerating: true }));
    console.log(`Attempting to regenerate message with ID: ${message.id}`);
  
    try {
      // Get the exact index of the message to regenerate
      const targetIndex = state.messages.findIndex(m => m.id === message.id);
      if (targetIndex === -1) {
        console.error(`Message with ID ${message.id} not found in messages array`);
        throw new Error("Message not found");
      }
      
      console.log(`Found message at index ${targetIndex} of ${state.messages.length}`);
  
      // Get context messages up to the message being regenerated
      const contextMessages = state.messages
        .slice(0, targetIndex)
        .map(({ role, content }) => ({ role, content }));
  
      console.log(`Using ${contextMessages.length} messages as context`);
  
      const response = await PromptHandler.generateChatResponse(
        characterData,
        "Please generate a relevant but different response.",
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
        
        // Use the targetIndex to update the specific message
        setState(prev => {
          const updatedMessages = [...prev.messages];
          if (targetIndex >= 0 && targetIndex < updatedMessages.length) {
            updatedMessages[targetIndex] = {
              ...updatedMessages[targetIndex],
              content: newContent
            };
          }
          return { ...prev, messages: updatedMessages };
        });
      }
  
      // Update variations for the target message
      setState(prev => {
        const updatedMessages = [...prev.messages];
        if (targetIndex >= 0 && targetIndex < updatedMessages.length) {
          const targetMsg = updatedMessages[targetIndex];
          
          // Create or update variations array
          let variations = targetMsg.variations || [];
          
          // Add original content if not already in variations
          if (targetMsg.content && !variations.includes(targetMsg.content)) {
            variations = [...variations, targetMsg.content];
          }
          
          // Add new content if not already in variations
          if (!variations.includes(newContent)) {
            variations = [...variations, newContent];
          }
          
          // Update the message with new content and variations
          updatedMessages[targetIndex] = {
            ...targetMsg,
            content: newContent,
            variations: variations,
            currentVariation: variations.length - 1
          };
        }
        
        return {
          ...prev,
          messages: updatedMessages,
          isGenerating: false
        };
      });
  
      // Save the updated chat
      await saveChat();
  
    } catch (err) {
      console.error("Regeneration error:", err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "Generation failed",
        isGenerating: false
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
      
      // Save the updated variation state
      saveChat(updatedMessages);
      
      return {
        ...prev,
        messages: updatedMessages
      };
    });
  };

  const stopGeneration = () => {
    if (currentGenerationRef.current) {
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
      currentUser: user 
    }));
    
    // Save current chat with updated user info
    saveChat();
  };

  // Load a specific chat by ID
  const loadExistingChat = async (chatId: string) => {
    if (!characterData) return;
    
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await fetch('/api/load-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: characterData,
          chat_id: chatId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to load chat');
      }
      
      const data = await response.json();
      
      if (data.success && data.messages) {
        // Set messages and extract user from metadata if available
        const userFromChat = data.messages.metadata?.chat_metadata?.lastUser;
        
        setState(prev => ({
          ...prev,
          messages: data.messages.messages || [],
          currentUser: userFromChat || prev.currentUser
        }));
        
        // Update lastCharacterId to prevent automatic reloading
        lastCharacterId.current = getCharacterId(characterData);
      } else {
        throw new Error(data.message || 'Failed to load chat data');
      }
    } catch (err) {
      setState(prev => ({
        ...prev, 
        error: err instanceof Error ? err.message : 'Failed to load chat'
      }));
      console.error('Error loading chat:', err);
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
    loadExistingChat
  };
}