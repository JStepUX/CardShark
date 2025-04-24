// contexts/ChatContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Message, UserProfile } from '../types/messages';
import { useCharacter } from '../contexts/CharacterContext';
import { APIConfig, APIProvider } from '../types/api';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { PromptHandler } from '../handlers/promptHandler';
import { ChatStorage } from '../services/chatStorage';
import { MessageUtils } from '../utils/messageUtils';

// Define ReasoningSettings interface
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

// Define the context structure
interface ChatContextType {
  // State
  messages: Message[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  currentUser: UserProfile | null;
  lastContextWindow: any;
  generatingId: string | null;
  reasoningSettings: ReasoningSettings;

  // Message Management
  updateMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  addMessage: (message: Message) => void;
  cycleVariation: (messageId: string, direction: 'next' | 'prev') => void;
  
  // Generation
  generateResponse: (prompt: string) => Promise<void>;
  regenerateMessage: (message: Message) => Promise<void>;
  continueResponse: (message: Message) => Promise<void>;
  stopGeneration: () => void;
  
  // Chat Management
  setCurrentUser: (user: UserProfile | null) => void;
  loadExistingChat: (chatId: string) => Promise<void>;
  createNewChat: () => Promise<void>;
  updateReasoningSettings: (settings: ReasoningSettings) => void;
  
  // Error Management
  clearError: () => void;
}

// Create the context
const ChatContext = createContext<ChatContextType | null>(null);

// Create the provider component
export const ChatProvider: React.FC<{
    children: React.ReactNode
  }> = ({ children }) => {
    // Get character data from the CharacterContext
    const { characterData } = useCharacter();
    const { apiConfig } = useContext(APIConfigContext);
    
    // Initialize state
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => ChatStorage.getCurrentUser());
    const [lastContextWindow, setLastContextWindow] = useState<any>(null);
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [reasoningSettings, setReasoningSettings] = useState<ReasoningSettings>(() => {
      try {
        const savedSettings = localStorage.getItem('cardshark_reasoning_settings');
        if (savedSettings) {
          return JSON.parse(savedSettings);
        }
      } catch (err) {
        console.error('Error loading reasoning settings:', err);
      }
      return DEFAULT_REASONING_SETTINGS;
    });

  // Refs for managing generation and debounced saves
  const currentGenerationRef = useRef<AbortController | null>(null);
  const lastCharacterId = useRef<string | null>(null);
  const autoSaveEnabled = useRef(true);
  const createNewChatRef = useRef<(() => Promise<void>) | null>(null);

  // Load context window on mount
  useEffect(() => {
    const loadContextWindow = async () => {
      try {
        const data = await ChatStorage.loadContextWindow();
        if (data.success && data.context) {
          setLastContextWindow(data.context);
        }
      } catch (err) {
        console.error('Error loading context window:', err);
      }
    };
    
    loadContextWindow();
  }, []);  
  
  // Save context window when it changes
  useEffect(() => {
    if (lastContextWindow) {
      ChatStorage.saveContextWindow(lastContextWindow)
        .catch(err => console.error('Error saving context window:', err));
    }
  }, [lastContextWindow]);
  
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
        setIsLoading(true);
        setError(null);
        
        // Only proceed if characterData is not null
        if (!characterData) {
          throw new Error('No character data available');
        }
        
        const response = await ChatStorage.loadLatestChat(characterData);
        
        if (response.success && response.messages) {
          if (Array.isArray(response.messages.messages) && response.messages.messages.length > 0) {
            setMessages(response.messages.messages);
            if (response.messages.metadata?.chat_metadata?.lastUser) {
              setCurrentUser(response.messages.metadata.chat_metadata.lastUser);
            }
            setLastContextWindow({
              type: 'loaded_chat',
              timestamp: new Date().toISOString(),
              characterName: characterData?.data?.name,
              chatId: response.messages.metadata?.chat_metadata?.chat_id || 'unknown',
              messageCount: response.messages.messages.length
            });
          } else if (characterData?.data?.first_mes) {
            // Substitute variables in first_mes
            const characterName = characterData.data.name || 'Character';
            const userName = currentUser?.name || 'User';
            const substitutedContent = characterData.data.first_mes
              .replace(/\{\{char\}\}/g, characterName)
              .replace(/\{\{user\}\}/g, userName);
            const firstMessage = MessageUtils.createAssistantMessage(substitutedContent);
            setMessages([firstMessage]);
            setLastContextWindow({
              type: 'initial_message',
              timestamp: new Date().toISOString(),
              characterName: characterData.data.name,
              firstMessage: characterData.data.first_mes
            });
            saveChat([firstMessage]);
          }
        } else if (characterData?.data?.first_mes) {
          // Substitute variables in first_mes (fallback)
          const characterName = characterData.data.name || 'Character';
          const userName = currentUser?.name || 'User';
          const substitutedContent = characterData.data.first_mes
            .replace(/\{\{char\}\}/g, characterName)
            .replace(/\{\{user\}\}/g, userName);
          const firstMessage = MessageUtils.createAssistantMessage(substitutedContent);
          setMessages([firstMessage]);
          setLastContextWindow({
            type: 'initial_message_fallback',
            timestamp: new Date().toISOString(),
            characterName: characterData.data.name,
            firstMessage: characterData.data.first_mes,
            error: 'Failed to load existing chat'
          });
          saveChat([firstMessage]);
        }
        
        lastCharacterId.current = currentCharId;
      } catch (err) {
        console.error('Chat loading error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chat');
        setLastContextWindow({
          type: 'load_error',
          timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name,
          error: err instanceof Error ? err.message : 'Failed to load chat'
        });
      } finally {
        setIsLoading(false);
      }
    }
  }, [characterData]);
  
  // Create debounced save function
  const debouncedSave = MessageUtils.createDebouncedSave(
    (messages: Message[]) => {
      saveChat(messages);
    },
    500 // Add the debounce delay parameter
  );
  
  // Save chat function
        
  const saveChat = useCallback(async (messageList: Message[]) => {
    if (!characterData?.data?.name || !autoSaveEnabled.current) {
      console.debug('Save aborted: no character data name or autoSave disabled');
      return false;
    }
    
    try {
      console.debug(`Executing save for ${messageList.length} messages`);
      
      // Clone the message list to avoid any state mutation issues
      const messagesToSave = JSON.parse(JSON.stringify(messageList));
      
      // Create consistent API info
      const apiInfo = apiConfig ? {
        provider: apiConfig.provider,
        model: apiConfig.model || 'unknown',
        url: apiConfig.url || '',
        templateId: apiConfig.templateId || 'unknown',
        enabled: apiConfig.enabled
      } : null;
      
      console.debug('Saving with API info:', apiInfo ? apiConfig?.provider : 'none');
      
      // Make a single saveChat call with proper debug info
      const result = await ChatStorage.saveChat(
        characterData, 
        messagesToSave, 
        currentUser, 
        apiInfo
      );
      
      console.debug('Save result:', result?.success ? 'success' : 'failed');
      return result?.success || false;
    } catch (err) {
      console.error('Error saving chat:', err);
      return false;
    }
  }, [characterData, currentUser, apiConfig]);

  // Append a message to the chat
  const appendMessage = useCallback(async (message: Message) => {
    if (!characterData?.data?.name) {
      console.debug('Append aborted: no character data name');
      return null;
    }
    
    try {
      console.debug(`Appending message ${message.id} (${message.role}) to chat`);
      
      // Ensure message has required fields
      const messageToAppend = {
        ...message,
        id: message.id || crypto.randomUUID(),
        timestamp: message.timestamp || Date.now()
      };
      
      // Make API call
      const result = await ChatStorage.appendMessage(characterData, messageToAppend);
      
      console.debug(`Append result for ${messageToAppend.id}:`, result?.success ? 'success' : 'failed');
      return messageToAppend;
    } catch (err) {
      console.error('Error appending message:', err);
      return null;
    }
  }, [characterData]);
  
  // Prepare API config with default values if needed
  const prepareAPIConfig = useCallback((config?: APIConfig | null): APIConfig => {
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
  }, []);
  
  // Generate reasoning response
  const generateReasoningResponse = useCallback(async (prompt: string) => {
    if (!reasoningSettings.enabled || !characterData) return null;
    
    // Create thinking message
    const thinkingId = crypto.randomUUID();
    const thinkingMessage: Message = {
      id: thinkingId,
      role: 'thinking' as 'system', // Cast to acceptable role type
      content: '',
      timestamp: Date.now()
    };
    
    // Add thinking message to state
    setMessages((prev: Message[]) => [...prev, thinkingMessage]);
    setIsGenerating(true);
    setGeneratingId(thinkingId);
    
    try {
      // Guard against undefined characterData
      if (!characterData) {
        throw new Error('No character data available for generating a response');
      }
    
      // Prepare reasoning prompt with proper null checks
      const reasoningInstructions = reasoningSettings?.instructions || DEFAULT_REASONING_SETTINGS.instructions || '';
      const characterName = characterData.data?.name || 'Character';
      const userName = currentUser?.name || 'User';
      
      const reasoningPrompt = reasoningInstructions
        .replace(/\{\{char\}\}/g, characterName)
        .replace(/\{\{user\}\}/g, userName);
      
      // Fixed: Proper type handling when mapping message roles
      const contextMessages = messages
        .filter(msg => msg.role !== 'thinking')
        .map(({ role, content }) => {
          // Explicitly construct a valid role
          let validRole: 'user' | 'assistant' | 'system' = 'system';
          if (role === 'user') {
            validRole = 'user';
          } else if (role === 'assistant') {
            validRole = 'assistant';
          }
          return { role: validRole, content };
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
        setMessages((prev: Message[]) => {
          const updatedMessages = prev.map(msg => 
            msg.id === thinkingId ? {...msg, content: thinkingContent} : msg
          );
          return updatedMessages;
        });
      }
      
      // Update final thinking message
      setMessages((prev: Message[]) => {
        const updatedMessages = prev.map(msg => 
          msg.id === thinkingId ? {...msg, content: thinkingContent} : msg
        );
        return updatedMessages;
      });
      
      return thinkingContent;
    } catch (err) {
      console.error('Error generating thinking:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate thinking');
      return null;
    }
  }, [characterData, messages, reasoningSettings, currentUser, apiConfig, prepareAPIConfig]);
  
  // Update message content
  const updateMessage = useCallback((messageId: string, content: string) => {
    setMessages((prev: Message[]) => {
      const msgIndex = prev.findIndex(msg => msg.id === messageId);
      if (msgIndex === -1) return prev;
  
      const messageToUpdate = prev[msgIndex];
      if (messageToUpdate.content === content) return prev;
  
      const updatedMessage = MessageUtils.addVariation(messageToUpdate, content);
  
      const newMessages = [...prev];
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
        saveChat(newMessages); //Direct save is OK.
        appendMessage({ ...newMessages[msgIndex], timestamp: Date.now() });
      } else {
        console.log(`Potential ongoing edit for message ${messageId}, using debounced save`);
        debouncedSave(messageId, newMessages); // Pass messageId and newMessages
      }
  
      setLastContextWindow(updatedContextWindow);
      return newMessages;
    });
  }, [characterData, appendMessage, debouncedSave, saveChat]);
  
  // Delete a message
        
  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev: Message[]) => {
      const newMessages = prev.filter(msg => msg.id !== messageId);
  
      // Debounced save, passing messageId and the NEW messages array
     debouncedSave(messageId, newMessages); // Use debouncedSave here
  
      setLastContextWindow({
        type: 'message_deleted',
        timestamp: new Date().toISOString(),
        messageId,
        remainingMessages: newMessages.length,
        characterName: characterData?.data?.name || 'Unknown'
      });
  
      return newMessages;
    });
  }, [characterData, debouncedSave]); //  debouncedSave in the dependency arra

    
  
  // Add a new message
  const addMessage = useCallback((message: Message) => {
    const finalMessage = !message.id ? { ...message, id: crypto.randomUUID() } : message;
  
    setMessages((prev: Message[]) => {
      const newMessages = [...prev, finalMessage];
  
      setLastContextWindow({
        type: 'message_added',
        timestamp: new Date().toISOString(),
        messageId: finalMessage.id,
        messageRole: finalMessage.role,
        totalMessages: newMessages.length,
        characterName: characterData?.data?.name || 'Unknown'
      });
  
      // Debounced save after adding a message
      debouncedSave(finalMessage.id, newMessages); // Use debouncedSave here
  
      return newMessages;
    });
  
    setTimeout(() => {
      appendMessage(finalMessage);
    }, 50);
  }, [appendMessage, characterData, debouncedSave]);
  
  // Handle generation errors
  const handleGenerationError = useCallback((err: any, messageId: string) => {
    console.error('Error during generation:', err);
    let updatedMessages: Message[] = []; // Initialize here

    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log('Generation was aborted by user - keeping current content');

      setMessages((prev: Message[]) => {
        const messageIndex = prev.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
          console.error(`Message with ID ${messageId} not found`);
          return prev;
        }

        const currentMessage = prev[messageIndex];
        const currentContent = currentMessage.content || '';

        console.log(`Preserving current content: ${currentContent.substring(0, 50)}...`);

        updatedMessages = [...prev]; // Assign to the outer-scope variable
        updatedMessages[messageIndex] = {
          ...currentMessage,
          content: currentContent,
          variations: currentMessage.variations ?
            [...currentMessage.variations] :
            [currentContent],
          currentVariation: 0
        };

        setLastContextWindow({
          type: 'generation_stopped',
          stopTime: new Date().toISOString(),
          partialContent: currentContent.substring(0, 100) + '...'
        });

        return updatedMessages;
      });

      saveChat(updatedMessages); // Pass updatedMessages
    } else {
      setMessages((prev: Message[]) => {
        updatedMessages = prev.map(msg => // Assign to the outer-scope variable
          msg.id === messageId ? { ...msg, content: "Generation Failed", aborted: true } : msg
        );
        return updatedMessages;
    });
    

      setError(err instanceof Error ? err.message : 'Generation failed');
      setLastContextWindow({
        type: 'generation_error',
        errorTime: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error during generation'
      });

      saveChat(updatedMessages); // Pass updatedMessages
    }

    setIsGenerating(false);
    setGeneratingId(null);
  }, [saveChat]); // saveChat needs to be in the dependency array
  
  // Create new chat function
  const createNewChat = useCallback(async () => {
    if (!characterData) return;
    
    console.log('Creating new chat');
    
    try {
      // Clear context window
      await ChatStorage.clearContextWindow();
      
      // Clear messages
      setMessages([]);
      setLastContextWindow({
        type: 'new_chat',
        timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown'
      });
      
      if (characterData?.data.first_mes) {
        // Substitute variables in first_mes
        const characterName = characterData.data.name || 'Character';
        const userName = currentUser?.name || 'User';
        const substitutedContent = characterData.data.first_mes
          .replace(/\{\{char\}\}/g, characterName)
          .replace(/\{\{user\}\}/g, userName);
        
        const firstMessage = MessageUtils.createAssistantMessage(substitutedContent);
        
        setMessages([firstMessage]);
        setLastContextWindow({
          type: 'new_chat_first_message',
          timestamp: new Date().toISOString(),
          characterName: characterData.data?.name || 'Unknown',
          firstMessage: characterData.data.first_mes
        });
        
        await appendMessage(firstMessage);
      }
    } catch (err) {
      console.error('Error creating new chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to create new chat');
      setLastContextWindow({
        type: 'new_chat_error',
        timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown',
        error: err instanceof Error ? err.message : 'Failed to create new chat'
      });
    }
  }, [characterData, appendMessage, currentUser]);
  
  // Save the createNewChat function to the ref after it's been created
  useEffect(() => {
    createNewChatRef.current = createNewChat;
  }, [createNewChat]);
  
  const updateAndSaveMessages = useCallback((newMessages: Message[]) => {
    // First update state
    setMessages(newMessages);
    
    // Then schedule a save (not immediate, to avoid race conditions)
    setTimeout(() => {
      if (characterData) {
        saveChat(newMessages);
      }
    }, 50); // Short delay to ensure state is updated first
  }, [characterData, saveChat]);

  // Generate response with support for /new command
  const generateResponse = useCallback(async (prompt: string) => {
    if (!characterData || isGenerating) return;

    console.log('Starting generation for prompt:', prompt);

    // Special command for new chat
    if (prompt === '/new' && createNewChatRef.current) {
      createNewChatRef.current();
      return;
    }

    // Create user and assistant messages
    const userMessage = MessageUtils.createUserMessage(prompt);
    const assistantMessage = MessageUtils.createAssistantMessage();

    // Update state with new messages (No need for debouncedSave here, we'll save at the end)
    setMessages((prev: Message[]) => [...prev, userMessage, assistantMessage]);
    setIsGenerating(true);
    setGeneratingId(assistantMessage.id);

    await appendMessage(userMessage);

    // Stream generation
    let bufferTimer: NodeJS.Timeout | null = null;

    const abortController = new AbortController();
    currentGenerationRef.current = abortController;

    try {
      // Check if reasoning is enabled and generate reasoning first
      let reasoningContent = null;
      if (reasoningSettings.enabled) {
        reasoningContent = await generateReasoningResponse(prompt);
      }

      // Format context for API with proper typing
      const contextMessages = messages
        .filter(msg => msg.role !== 'thinking')
        .map(({ role, content }) => {
          let validRole: 'user' | 'assistant' | 'system' = 'system';
          if (role === 'user') {
            validRole = 'user';
          } else if (role === 'assistant') {
            validRole = 'assistant';
          }
          return { role: validRole, content };
        });

      // If we have reasoning content, include it as system role
      if (reasoningContent) {
        contextMessages.push({
          role: 'system',
          content: `<think>${reasoningContent}</think>`
        });
      }

      const formattedAPIConfig = prepareAPIConfig(apiConfig);

      // Update context window
      setLastContextWindow({
        type: 'generation_starting',
        timestamp: new Date().toISOString(),
        characterName: characterData.data?.name || 'Unknown',
        messageId: assistantMessage.id,
        prompt,
        reasoningEnabled: reasoningSettings.enabled,
        hasReasoningContent: !!reasoningContent
      });

      // Start generation request
      const response = await PromptHandler.generateChatResponse(
        characterData,
        prompt,
        contextMessages,
        formattedAPIConfig,
        abortController.signal
      );

      if (!response.ok) {
        // Throw error using response status and text
        throw new Error(`API Error: ${response.status} ${await response.text()}`);
      }

      // Process streaming response using the async generator
      let content = '';
      let buffer = '';
      let isFirstChunk = true;

      bufferTimer = setInterval(() => {
        if (buffer.length > 0) {
          let processedBuffer = buffer;
          if (isFirstChunk && content === '') {
            processedBuffer = processedBuffer.replace(/^\s+/, '');
            isFirstChunk = false;
          }
          const newContent = content + processedBuffer;
          buffer = '';
          setMessages((prev: Message[]) => {
            const updatedMessages = prev.map(msg =>
              msg.id === assistantMessage.id ? { ...msg, content: newContent } : msg
            );
            return updatedMessages;
          });
          content = newContent;
        }
      }, 50);
      
      // Iterate over the streamResponse async generator
      for await (const chunk of PromptHandler.streamResponse(response)) {
        buffer += chunk;
      }
      
      // Final update
      if (buffer.length > 0) {
        let processedBuffer = buffer; // Also handle final buffer properly
        
        // Apply the same whitespace trimming logic for the final buffer if it's the first chunk
        if (isFirstChunk && content === '') {
          processedBuffer = processedBuffer.replace(/^\s+/, '');
          isFirstChunk = false;
        }
        
        content += processedBuffer;
      }

      // Define finalMessages here before using it
      const finalMessages = messages.map(msg =>
        msg.id === assistantMessage.id ? {
          ...msg,
          content,
          variations: [content],
          currentVariation: 0
        } : msg
      );

      // Finalize message
      setIsGenerating(false);
      setGeneratingId(null);
      setLastContextWindow((currentWindow: any) => ({
        ...currentWindow,
        type: 'generation_complete',
        completionTime: new Date().toISOString()
      }));

      // Save messages
      updateAndSaveMessages(finalMessages); // Now finalMessages is defined
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
  }, [  // Corrected dependency array
    appendMessage,
    characterData,
    generateReasoningResponse,
    handleGenerationError,
    isGenerating,
    prepareAPIConfig,
    reasoningSettings.enabled,
    apiConfig,
    updateAndSaveMessages,
    messages
  ]);
  
  // Regenerate message
  const regenerateMessage = useCallback(async (message: Message) => {
    if (!characterData || isGenerating || !apiConfig) {
      console.error("Cannot regenerate:", {
        hasCharacterData: !!characterData,
        isGenerating: isGenerating,
        hasApiConfig: !!apiConfig
      });
      setError(!apiConfig ? "API configuration not loaded" : "Cannot regenerate message");
      setLastContextWindow({
        type: 'regeneration_error',
        timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown',
        error: !apiConfig ? "API configuration not loaded" : "Cannot regenerate message"
      });
      return;
    }

    const targetIndex = messages.findIndex(msg => msg.id === message.id);
    if (targetIndex === -1) {
      console.error(`Message with ID ${message.id} not found`);
      return;
    }

    setIsGenerating(true);
    setGeneratingId(message.id);
    console.log(`Regenerating message at index ${targetIndex}`);

    try {
      // Get context messages up to the target message
      const contextMessages = messages
        .slice(0, targetIndex)
        .filter(msg => msg.role !== 'thinking')
        .map(({ role, content }) => {
          let validRole: 'user' | 'assistant' | 'system' = 'system';
          if (role === 'user') {
            validRole = 'user';
          } else if (role === 'assistant') {
            validRole = 'assistant';
          }
          return { role: validRole, content };
        });

      // Find the most recent user prompt
      let promptText = "Provide a fresh response that builds on the existing story without repeating previous details verbatim. ##!important:avoid acting,speaking, or thinking for {{user}}!##";
      let promptSource = "default";

      for (let i = targetIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          promptText = messages[i].content;
          promptSource = `message_${i}`;
          break;
        }
      }

      // Update context window
      setLastContextWindow({
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
      });

      // Generate new content
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const abortController = new AbortController();
      currentGenerationRef.current = abortController;
      
      // Call generateChatResponse which returns a Response object
      const response = await PromptHandler.generateChatResponse(
        characterData,
        promptText,
        contextMessages,
        formattedAPIConfig,
        abortController.signal
      );

      if (!response.ok) {
        // Throw error using response status and text
        throw new Error(`Generation failed - check API settings: ${response.status} ${await response.text()}`);
      }

      // Stream response using the async generator
      let newContent = '';
      let buffer = '';
      let bufferTimer: NodeJS.Timeout | null = null;

      // Iterate over the streamResponse async generator
      for await (const chunk of PromptHandler.streamResponse(response)) {
        if (!bufferTimer) {
          bufferTimer = setInterval(() => {
            if (buffer.length > 0) {
              const content = newContent + buffer;
              buffer = '';
              setMessages((prev: Message[]) => {
                const updatedMessages = [...prev];
                // Ensure targetIndex is valid before updating
                if (targetIndex >= 0 && targetIndex < updatedMessages.length) {
                   updatedMessages[targetIndex] = {
                     ...updatedMessages[targetIndex],
                     content
                   };
                }
                return updatedMessages;
              });
              newContent = content;
            }
          }, 50);
        }
        buffer += chunk;
      }

      // Clean up buffer timer
      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }

      // Final update.  Define finalMessages here before using it
      if (buffer.length > 0) {
        newContent += buffer;
      }

      const finalMessages = messages.map(msg => {
        if (msg.id === message.id) {
          const variations = [...(msg.variations || [])];
          if (!variations.includes(newContent)) {
            variations.push(newContent);
          }
          return {
            ...msg,
            content: newContent,
            variations,
            currentVariation: variations.length - 1
          };
        }
        return msg;
      });


      setLastContextWindow((prev: any) => ({
        ...prev,
        type: 'regeneration_complete',
        finalResponse: newContent,
        completionTime: new Date().toISOString(),
        variationsCount: message.variations?.length || 0  // Use message.variations
      }));


      // Save messages using the helper function
      updateAndSaveMessages(finalMessages);

    } catch (err) {
      console.error("Regeneration error:", err);
      setError(err instanceof Error ? err.message : "Generation failed");
      setLastContextWindow((prev: any) => ({
        ...prev,
        type: 'regeneration_error',
        errorTime: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error during regeneration'
      }));
    } finally {
      currentGenerationRef.current = null;
      setIsGenerating(false);
      setGeneratingId(null);
    }
    // Corrected Dependency Array:
  }, [characterData, isGenerating, apiConfig, messages, prepareAPIConfig, updateAndSaveMessages, appendMessage]);
  
  // Complete continueResponse function for ChatContext.tsx
  const continueResponse = useCallback(async (message: Message) => {
    if (!characterData || isGenerating || !apiConfig) {
      setError(!apiConfig ? "API configuration not loaded" : "Cannot continue message");
      setLastContextWindow({
        type: 'continuation_error',
        timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown',
        error: !apiConfig ? "API configuration not loaded" : "Cannot continue message"
      });
      return;
    }
  
    const targetIndex = messages.findIndex(msg => msg.id === message.id);
    if (targetIndex === -1) {
      console.error(`Message with ID ${message.id} not found`);
      return;
    }
  
    setIsGenerating(true);
    setGeneratingId(message.id);
    console.log(`Continuing message at index ${targetIndex}`);
  
    // Set up abort controller for cancellation
    const abortController = new AbortController();
    currentGenerationRef.current = abortController;
  
    try {
      // Get context messages up to and including the target message
      const contextMessages = messages
        .slice(0, targetIndex + 1)
        .filter(msg => msg.role !== 'thinking')
        .map(({ role, content }) => {
          let validRole: 'user' | 'assistant' | 'system' = 'system';
          if (role === 'user') {
            validRole = 'user';
          } else if (role === 'assistant') {
            validRole = 'assistant';
          }
          return { role: validRole, content };
        });
  
      // Update context window
      setLastContextWindow({
        type: 'continuation',
        timestamp: new Date().toISOString(),
        characterName: characterData.data?.name || 'Unknown',
        messageId: message.id,
        messageIndex: targetIndex,
        contextMessageCount: contextMessages.length,
        originalContent: message.content
      });
  
      // The continuation prompt should be minimal and use system role
      const continuationPrompt: { role: 'user' | 'assistant' | 'system', content: string } = {
        role: 'system',
        content: "Continue from exactly where you left off without repeating anything. Do not summarize or restart."
      };
  
      // Add our continuation instruction to the context
      contextMessages.push(continuationPrompt);
  
      // Generate new content
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      
      // Call generateChatResponse which returns a Response object
      const response = await PromptHandler.generateChatResponse(
        characterData,
        message.content, // Pass original message content for context
        contextMessages,
        formattedAPIConfig,
        abortController.signal
      );
  
      if (!response.ok) {
        // Throw error using response status and text
        throw new Error(`Continuation failed - check API settings: ${response.status} ${await response.text()}`);
      }
  
      // Stream response using the async generator
      let newContent = message.content; // Start with existing content
      let buffer = '';
      let bufferTimer: NodeJS.Timeout | null = null;
      
      // Iterate over the streamResponse async generator
      for await (const chunk of PromptHandler.streamResponse(response)) {
        if (!bufferTimer) {
          bufferTimer = setInterval(() => {
            if (buffer.length > 0) {
              const content = newContent + buffer;
              buffer = '';
              setMessages((prev: Message[]) => {
                const updatedMessages = [...prev];
                if (targetIndex >= 0 && targetIndex < updatedMessages.length) {
                  updatedMessages[targetIndex] = {
                    ...updatedMessages[targetIndex],
                    content
                  };
                }
                return updatedMessages;
              });
              newContent = content;
            }
          }, 50);
        }
        buffer += chunk;
      }
  
      // Clean up buffer timer
      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }
  
      // Add any remaining buffered content
      if (buffer.length > 0) {
        newContent += buffer;
      }
      
      // Now that streaming is complete, handle variations correctly - only once at the end
      
      // Keep a local copy of the current message state to compare
      const originalMessage = messages.find(msg => msg.id === message.id);
      
      // Check if we actually have new content to add as a variation
      if (originalMessage && newContent !== originalMessage.content) {
        console.log("Creating final message with continuation content");
        
        // Get existing variations, or initialize if none
        const variations = [...(originalMessage.variations || [originalMessage.content])];
        
        // Only add as a new variation if it's different
        if (!variations.includes(newContent)) {
          variations.push(newContent);
        }
        
        // Create the final message with the new content and updated variations
        const finalMessage = {
          ...originalMessage,
          content: newContent,
          variations,
          currentVariation: variations.length - 1,
          timestamp: Date.now() // Update timestamp
        };
        
        // Update messages state once with the final result
        setMessages(prevMessages => 
          prevMessages.map(msg => msg.id === message.id ? finalMessage : msg)
        );
        
        // Update context window info
        setLastContextWindow({
          type: 'continuation_complete',
          timestamp: new Date().toISOString(),
          characterName: characterData.data?.name || 'Unknown',
          messageId: message.id,
          finalResponse: newContent,
          completionTime: new Date().toISOString(),
          variationsCount: variations.length
        });
        
        // Save ONCE at the end instead of for each chunk
        try {
          // Make a single append call
          await appendMessage(finalMessage);
          
          // Get the current state of messages after our state update
          const currentMessages = messages.map(msg => 
            msg.id === message.id ? finalMessage : msg
          );
          
          // Make a single save call
          await saveChat(currentMessages);
          
          console.log('Successfully saved continued message');
        } catch (saveError) {
          console.error('Error saving continued message:', saveError);
        }
      }
    } catch (err) {
      console.error("Continuation error:", err);
      setError(err instanceof Error ? err.message : "Continuation failed");
      setLastContextWindow({
        type: 'continuation_error',
        timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown',
        errorTime: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error during continuation'
      });
    } finally {
      currentGenerationRef.current = null;
      setIsGenerating(false);
      setGeneratingId(null);
    }
  }, [
    characterData,
    isGenerating,
    apiConfig,
    messages,
    prepareAPIConfig,
    saveChat,
    appendMessage
  ]);
  
  // Stop generation
  const stopGeneration = useCallback(() => {
    if (currentGenerationRef.current) {
      console.log('Stopping generation - aborting controller');
      
      setLastContextWindow((prev: any) => ({
        ...prev,
        type: 'generation_stopping',
        stopTime: new Date().toISOString()
      }));
      
      setIsGenerating(false); // Immediately update UI state
      setGeneratingId(null);
      
      // Abort the controller which will trigger the AbortError
      currentGenerationRef.current.abort();
      currentGenerationRef.current = null; // Clear it immediately
    } else {
      console.warn('No active generation to stop');
    }
  }, []);
  
  // Cycle through message variations
  const cycleVariation = useCallback((messageId: string, direction: 'next' | 'prev') => {
    setMessages((prev: Message[]) => {
      const updatedMessages = prev.map(msg => {
        if (msg.id === messageId && msg.variations?.length) {
          return MessageUtils.cycleVariation(msg, direction);
        }
        return msg;
      });

      const targetMessage = prev.find(msg => msg.id === messageId);
      setLastContextWindow({
        type: 'cycle_variation',
        timestamp: new Date().toISOString(),
        messageId,
        direction,
        characterName: characterData?.data?.name || 'Unknown',
        totalVariations: targetMessage?.variations?.length || 0,
        previousIndex: targetMessage?.currentVariation || 0
      });

      saveChat(updatedMessages); // THIS IS THE FIX - Pass updatedMessages
      return updatedMessages;
    });
  }, [characterData, saveChat]);
  
  // Set current user
  const setCurrentUserHandler = useCallback((user: UserProfile | null) => {
    ChatStorage.saveCurrentUser(user);
    setCurrentUser(user);
    setLastContextWindow({
      type: 'user_changed',
      timestamp: new Date().toISOString(),
      userName: user?.name || 'null',
      characterName: characterData?.data?.name || 'Unknown'
    });
    
    saveChat(messages);
  }, [characterData, saveChat]);
  
  // Load existing chat
  const loadExistingChat = useCallback(async (chatId: string) => {
    if (!characterData) return;
    
    try {
      await ChatStorage.clearContextWindow();
      setIsLoading(true);
      setError(null);
      setLastContextWindow({
        type: 'loading_chat',
        timestamp: new Date().toISOString(),
        chatId,
        characterName: characterData.data?.name || 'Unknown'
      });
      
      const data = await ChatStorage.loadChat(chatId, characterData);
      
      if (data.success && data.messages) {
        const userFromChat = data.messages.metadata?.chat_metadata?.lastUser;
        setMessages(data.messages.messages || []);
        setCurrentUser(userFromChat || currentUser);
        setLastContextWindow({
          type: 'chat_loaded',
          timestamp: new Date().toISOString(),
          chatId,
          messageCount: (data.messages.messages || []).length,
          user: userFromChat?.name || 'Not specified',
          characterName: characterData.data?.name || 'Unknown'
        });

        lastCharacterId.current = ChatStorage.getCharacterId(characterData);
      } else {
        throw new Error(data.message || 'Failed to load chat data');
      }
    } catch (err) {
      console.error('Error loading chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chat');
      setLastContextWindow({
        type: 'chat_load_error',
        timestamp: new Date().toISOString(),
        chatId,
        error: err instanceof Error ? err.message : 'Failed to load chat'
      });
    } finally {
      setIsLoading(false);
    }
  }, [characterData, currentUser]);
  
  // Update reasoning settings
  const updateReasoningSettings = useCallback((settings: ReasoningSettings) => {
    try {
      // Save to localStorage
      localStorage.setItem('cardshark_reasoning_settings', JSON.stringify(settings));
      
      // Update state
      setReasoningSettings(settings);
      setLastContextWindow({
        type: 'reasoning_settings_updated',
        timestamp: new Date().toISOString(),
        enabled: settings.enabled,
        visible: settings.visible,
        characterName: characterData?.data?.name || 'Unknown'
      });
      
      console.log('Updated reasoning settings:', settings);
    } catch (err) {
      console.error('Error updating reasoning settings:', err);
      setError('Failed to update reasoning settings');
    }
  }, [characterData]);
  
  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  // Create the context value
  const contextValue: ChatContextType = {
    // State
    messages,
    isLoading,
    isGenerating,
    error,
    currentUser,
    lastContextWindow,
    generatingId,
    reasoningSettings,
    
    // Message Management
    updateMessage,
    deleteMessage,
    addMessage,
    cycleVariation,
    
    // Generation
    generateResponse,
    regenerateMessage,
    continueResponse,
    stopGeneration,
    
    // Chat Management
    setCurrentUser: setCurrentUserHandler,
    loadExistingChat,
    createNewChat,
    updateReasoningSettings,
    
    // Error Management
    clearError
  };
  
  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

// Create a hook to use the context
export const useChat = () => {
  const context = useContext(ChatContext);
  
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  
  return context;
};

// Export the context for more advanced use cases
export default ChatContext;
