// hooks/useChatMessages.ts
import { useState, useRef, useEffect, useContext } from 'react'; // Import useContext
import { CharacterData } from '../contexts/CharacterContext';
import { PromptHandler } from '../handlers/promptHandler';
import { APIConfigContext } from '../contexts/APIConfigContext'; // Import your API config context
import { APIConfig, APIProvider, ChatTemplate } from '../types/api';

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
  filename: string;  // Changed from path to filename
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
  const { apiConfig } = useContext(APIConfigContext); // Use the context

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

  // Load chat whenever we have character data (not just on changes)
  useEffect(() => {
    const loadChat = async () => {
      if (!characterData?.data?.name) return;

      const currentCharId = characterData.data.name;
      if (currentCharId === lastCharacterId.current) return;

      console.log('Attempting to load chat for:', characterData.data.name);
      console.log('Character has first_mes:', characterData.data.first_mes);

      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        const response = await fetch('/api/load-latest-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_data: characterData })
        });

        const data = await response.json();
        console.log('Load chat response:', data);

        if (data.success) {
          const loadedMessages = Array.isArray(data.messages) ? data.messages : [];
          console.log('Loaded messages:', loadedMessages);

          // If no loaded messages and we have a first message, use that
          if (loadedMessages.length === 0 && characterData.data.first_mes) {
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
              currentUser: data.metadata?.chat_metadata?.lastUser || prev.currentUser
            }));
          } else {
            setState(prev => ({
              ...prev,
              messages: loadedMessages,
              currentUser: data.metadata?.chat_metadata?.lastUser || prev.currentUser
            }));
          }
        } else {
          // Error case - still set first message
          if (characterData.data.first_mes) {
            const firstMessage: Message = {
              id: Date.now().toString(),
              role: 'assistant',
              content: characterData.data.first_mes,
              timestamp: Date.now(),
              variations: [],
              currentVariation: 0,
            };
            console.log('Setting first message on error:', firstMessage);
            setState(prev => ({
              ...prev,
              messages: [firstMessage]
            }));
          }
        }
        lastCharacterId.current = currentCharId;
      } catch (err) {
        console.error('Chat loading error:', err);
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to load chat',
          messages: []
        }));
      } finally {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    loadChat();
  }, [characterData]);

  // Message management
  const updateMessage = async (messageId: string, content: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(msg =>
        msg.id === messageId
          ? { ...msg, content, variations: [content], currentVariation: 0 }
          : msg
      )
    }));
    await saveChatState();
  };

  const deleteMessage = async (messageId: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.filter(msg => msg.id !== messageId)
    }));
    await saveChatState();
  };

  const addMessage = async (message: Message) => {
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, message]
    }));
    await appendMessage(message);
  };

  // Chat persistence
  const saveChatState = async () => {
    if (!characterData?.data?.name) return;

    try {
      const response = await fetch('/api/save-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: characterData,
          messages: state.messages,
          lastUser: state.currentUser,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save chat');
      }
    } catch (err) {
      console.error('Error saving chat:', err);
    }
  };

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
        throw new Error('Failed to append message');
      }
    } catch (err) {
      console.error('Error appending message:', err);
    }
  };

  // Message generation
  const generateResponse = async (prompt: string) => {
    if (!characterData || state.isGenerating) return;
    console.log('Starting generation for prompt:', prompt);  // Debug log

    // Handle /new command
    if (prompt === '/new' && characterData.data.first_mes) {
      console.log('Handling /new command');  // Debug log
      const firstMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: characterData.data.first_mes,
        timestamp: Date.now(),
        variations: [],
        currentVariation: 0,
      };
      setState(prev => ({
        ...prev,
        messages: [firstMessage]
      }));
      await saveChatState();
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      variations: [],
      currentVariation: 0,
      aborted: false
    };

    console.log('Created messages:', { userMessage, assistantMessage });  // Debug log

    // Add messages to state
    await addMessage(userMessage);
    await addMessage(assistantMessage);

    console.log('Messages added to state');  // Debug log
    setState(prev => ({ ...prev, isGenerating: true }));

    // Setup abort controller
    const abortController = new AbortController();
    currentGenerationRef.current = abortController;

    try {
      console.log('Making API request');  // Debug log
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

      console.log('Starting to process stream');  // Debug log
      let newContent = '';
      let chunkCount = 0;  // Debug counter

      for await (const chunk of PromptHandler.streamResponse(response)) {
        chunkCount++;  // Debug counter
        newContent += chunk;
        console.log(`Received chunk ${chunkCount}:`, chunk);  // Debug log

        setState(prev => {
          const updatedMessages = prev.messages.map(msg =>
            msg.id === assistantMessage.id ? { ...msg, content: newContent } : msg
          );
          console.log('Updating message content:', {  // Debug log
            messageId: assistantMessage.id,
            newContent,
            updatedMessages
          });
          return {
            ...prev,
            messages: updatedMessages
          };
        });
      }

      console.log('Stream complete, total chunks:', chunkCount);  // Debug log

      // Update with final content and variations
      setState(prev => {
        console.log('Setting final content:', newContent);  // Debug log
        return {
          ...prev,
          messages: prev.messages.map(msg =>
            msg.id === assistantMessage.id
              ? { ...msg, content: newContent, variations: [newContent], currentVariation: 0 }
              : msg
          )
        };
      });

      await saveChatState();
      console.log('Chat state saved');  // Debug log

    } catch (err) {
      console.error('Error during generation:', err);  // Debug log
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(msg =>
            msg.id === assistantMessage.id ? { ...msg, aborted: true } : msg
          )
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Generation failed',
          messages: prev.messages.map(msg =>
            msg.id === assistantMessage.id
              ? { ...msg, content: "Generation Failed", aborted: true }
              : msg
          )
        }));
      }
    } finally {
      setState(prev => ({ ...prev, isGenerating: false }));
      currentGenerationRef.current = null;
      console.log('Generation complete');  // Debug log
    }
  };

  // Message variations
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

    setState(prev => ({ ...prev, isGenerating: true }));

    try {
      const messageIndex = state.messages.findIndex(m => m.id === message.id);
      if (messageIndex === -1) throw new Error("Message not found");

      // Get context messages up to the message being regenerated
      const contextMessages = state.messages
        .slice(0, messageIndex)
        .map(({ role, content }) => ({ role, content }));

      const response = await PromptHandler.generateChatResponse(
        characterData,
        "Please regenerate your last response.",
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
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(msg =>
            msg.id === message.id
              ? { ...msg, content: newContent }
              : msg
          )
        }));
      }

      // Update with final content and variations
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(msg =>
          msg.id === message.id
            ? {
                ...msg,
                content: newContent,
                variations: msg.variations 
                  ? [...msg.variations, newContent]
                  : [msg.content, newContent],
                currentVariation: msg.variations 
                  ? msg.variations.length 
                  : 1
              }
            : msg
        )
      }));

      await saveChatState();

    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(msg =>
            msg.id === message.id ? { ...msg, aborted: true } : msg
          )
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : "Generation failed",
          messages: prev.messages.map(msg =>
            msg.id === message.id
              ? { ...msg, content: "Generation Failed", aborted: true }
              : msg
          )
        }));
      }
    } finally {
      setState(prev => ({ ...prev, isGenerating: false }));
      currentGenerationRef.current = null;
    }
  };

  const cycleVariation = async (messageId: string, direction: 'next' | 'prev') => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(msg => {
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
      })
    }));
    await saveChatState();
  };

  const stopGeneration = () => {
    if (currentGenerationRef.current) {
      currentGenerationRef.current.abort();
    }
  };

  const setCurrentUser = (user: UserProfile | null) => {
    if (user) {
      // Store complete user profile
      const userToStore = {
        name: user.name,
        filename: user.filename,
        size: user.size,
        modified: user.modified
      };
      localStorage.setItem('cardshark_current_user', JSON.stringify(userToStore));
    } else {
      localStorage.removeItem('cardshark_current_user');
    }
    setState(prev => ({ ...prev, currentUser: user }));
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
    setCurrentUser
  };
}