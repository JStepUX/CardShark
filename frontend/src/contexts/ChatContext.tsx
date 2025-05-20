// contexts/ChatContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Message, UserProfile } from '../types/messages';
import { useCharacter } from '../contexts/CharacterContext';
import { APIConfig, APIProvider } from '../types/api';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { PromptHandler } from '../handlers/promptHandler';
import { ChatStorage } from '../services/chatStorage';
import { MessageUtils } from '../utils/messageUtils';
import { useContentFilter } from '../hooks/useContentFilter';
import {
  TriggeredLoreImage,
  AvailablePreviewImage,
  processLoreEntriesForImageTracking, // Import the function
  getAvailableImagesForPreview,     // Import the function
  resetTriggeredImages as resetGlobalTriggeredImages, // Keeping for now, will be removed if loreHandler is made pure
  getGlobalTriggeredLoreImages // Keeping for now
} from '../handlers/loreHandler';
import { LoreEntry } from '../types/schema'; // Ensure LoreEntry is imported

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
  triggeredLoreImages: TriggeredLoreImage[];
  availablePreviewImages: AvailablePreviewImage[];
  currentPreviewImageIndex: number;

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
  navigateToPreviewImage: (index: number) => void;
  trackLoreImages: (matchedEntries: LoreEntry[], characterUuid: string) => void; // Added characterUuid
  resetTriggeredLoreImagesState: () => void; // Renamed for clarity within context
  
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
    const apiConfigContext = useContext(APIConfigContext);
    const apiConfig = apiConfigContext ? apiConfigContext.apiConfig : null;
    
    // Initialize state
    const [messages, setMessages] = useState<Message[]>([]);
    const messagesRef = useRef<Message[]>(messages);

    useEffect(() => {
      messagesRef.current = messages;
    }, [messages]);
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
    const [triggeredLoreImages, setTriggeredLoreImages] = useState<TriggeredLoreImage[]>([]);
    const [availablePreviewImages, setAvailablePreviewImages] = useState<AvailablePreviewImage[]>([]);
    const [currentPreviewImageIndex, setCurrentPreviewImageIndex] = useState<number>(0);

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

  // Reset Triggered Lore Images State
  const resetTriggeredLoreImagesState = useCallback(() => {
    resetGlobalTriggeredImages();
    setTriggeredLoreImages([]);
    
    const charImgPath = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
      ? `/api/character-image/${characterData.data.character_uuid}.png`
      : '';
      
    const defaultAvailableImages = getAvailableImagesForPreview(charImgPath);
    setAvailablePreviewImages(defaultAvailableImages);
    setCurrentPreviewImageIndex(0);
  }, [characterData, getAvailableImagesForPreview]);
  
  // Load chat when character changes
  useEffect(() => {
    if (!characterData?.data?.name) return;
    
    const currentCharId = ChatStorage.getCharacterId(characterData);
    if (currentCharId === lastCharacterId.current) return;
    
    if (lastCharacterId.current !== null) {
      ChatStorage.clearContextWindow();
    }
    
    console.log('Character changed, loading chat for:', characterData.data.name);
    resetTriggeredLoreImagesState(); // Reset lore images when character changes
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
        
        // Case 1: Successfully loaded chat with messages
        if (response.success && response.messages && Array.isArray(response.messages) && response.messages.length > 0) {
          setMessages(response.messages);
          if (response.metadata?.chat_metadata?.lastUser) {
            setCurrentUser(response.metadata.chat_metadata.lastUser);
          }
          
          // Restore Lore Image Data
          let loadedTriggeredLoreImages: TriggeredLoreImage[] = [];
          if (response.metadata?.chat_metadata?.triggeredLoreImages) {
            loadedTriggeredLoreImages = response.metadata.chat_metadata.triggeredLoreImages;
            setTriggeredLoreImages(loadedTriggeredLoreImages); 
          }
          
          const charImgPath = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
            ? `/api/character-image/${characterData.data.character_uuid}.png`
            : '';
          const newAvailableImages = getAvailableImagesForPreview(charImgPath); 
          setAvailablePreviewImages(newAvailableImages);
 
          if (response.metadata?.chat_metadata?.currentDisplayedImage && newAvailableImages.length > 0) {
            const savedDisplay = response.metadata.chat_metadata.currentDisplayedImage;
            const foundIndex = newAvailableImages.findIndex(img =>
              img.type === savedDisplay.type &&
              (img.type === 'character' || (img.entryId === savedDisplay.entryId && img.imageUuid === savedDisplay.imageUuid))
            );
            if (foundIndex !== -1) {
              setCurrentPreviewImageIndex(foundIndex);
            } else {
              setCurrentPreviewImageIndex(0); // Default to character image
            }
          } else if (newAvailableImages.length > 0) {
            setCurrentPreviewImageIndex(0); // Default to character image
          } else {
            setCurrentPreviewImageIndex(0); // No images
          }

          setLastContextWindow({
            type: 'loaded_chat',
            timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name,
            chatId: response.metadata?.chat_metadata?.chat_id || response.chatId || 'unknown',
            messageCount: response.messages.length
          });
          setError(null);
        // Case 2: No chat found (recoverable error) AND first_mes is available
        } else if (response.isRecoverable && characterData?.data?.first_mes) {
          console.log('No existing chat found (recoverable), initializing with first_mes. Original response error:', response.error);
          const characterName = characterData.data.name || 'Character';
          const userName = currentUser?.name || 'User';
          const substitutedContent = characterData.data.first_mes
            .replace(/\{\{char\}\}/g, characterName)
            .replace(/\{\{user\}\}/g, userName);
          const firstMessage = MessageUtils.createAssistantMessage(substitutedContent);
          setMessages([firstMessage]);
          setLastContextWindow({
            type: 'initial_message_used_after_recoverable_load_fail',
            timestamp: new Date().toISOString(),
            characterName: characterData.data.name,
            firstMessage: characterData.data.first_mes,
            originalLoadError: response.error
          });
          saveChat([firstMessage]); 
          setError(null);
          // Ensure preview images are reset/set to default for a new chat from first_mes
          const charImgPath = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
            ? `/api/character-image/${characterData.data.character_uuid}.png`
            : '';
          const defaultAvailable = charImgPath ? [{ type: 'character' as 'character', src: charImgPath }] : [];
          setAvailablePreviewImages(defaultAvailable);
          setCurrentPreviewImageIndex(0);
          setTriggeredLoreImages([]);


        // Case 3: Any other load failure (not success, not recoverable with first_mes) OR recoverable but no first_mes
        } else {
          console.error('Failed to load chat. Response:', response, 'Character has first_mes:', !!characterData?.data?.first_mes);
          setError(response.error || 'Failed to load chat and no initial message available.');
          setMessages([]);
          setLastContextWindow({
            type: 'load_failed_or_no_fallback',
            timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name,
            error: response.error || 'Failed to load chat and no initial message available.'
          });
        }
        
        lastCharacterId.current = currentCharId;
      } catch (err) {
        // This catch block handles unexpected errors during the process
        console.error('Unexpected error during chat loading process:', err);
        setError(err instanceof Error ? err.message : 'An unexpected error occurred while loading chat.');
        setMessages([]); // Ensure messages are empty on unexpected error
        setLastContextWindow({
          type: 'unexpected_load_error',
          timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name,
          error: err instanceof Error ? err.message : 'An unexpected error occurred.'
        });
      } finally {
        setIsLoading(false);
      }
    }
  }, [characterData, resetTriggeredLoreImagesState, getAvailableImagesForPreview]);
  
  // Save chat function - defined before debouncedSave
  const saveChat = useCallback(async (messageList: Message[]) => {
    if (!characterData?.data?.name || !autoSaveEnabled.current) {
      console.debug('Save aborted: no character data name or autoSave disabled');
      return false;
    }
    
    try {
      console.debug(`Executing save for ${messageList.length} messages`);
      
      const messagesToSave = JSON.parse(JSON.stringify(messageList));
      
      const apiInfo = apiConfig ? {
        provider: apiConfig.provider,
        model: apiConfig.model || 'unknown',
        url: apiConfig.url || '',
        templateId: apiConfig.templateId || 'unknown',
        enabled: apiConfig.enabled
      } : null;

      let currentDisplayedImage: { type: 'character' | 'lore'; entryId?: string; imageUuid?: string } | undefined = undefined;
      if (availablePreviewImages && availablePreviewImages.length > 0 && currentPreviewImageIndex < availablePreviewImages.length) {
        const currentImage = availablePreviewImages[currentPreviewImageIndex];
        currentDisplayedImage = {
          type: currentImage.type,
          ...(currentImage.type === 'lore' && { // Conditionally add properties for 'lore' type
            entryId: currentImage.entryId,
            imageUuid: currentImage.imageUuid,
          }),
        };
      }
 
      const lorePersistenceData = {
        triggeredLoreImages: triggeredLoreImages, 
        currentDisplayedImage: currentDisplayedImage,
      };
      
      console.debug('Saving with API info:', apiInfo ? apiConfig?.provider : 'none');
      console.debug('Saving with Lore Persistence Data:', lorePersistenceData);
      
      const result = await ChatStorage.saveChat(
        characterData,
        messagesToSave,
        currentUser,
        apiInfo,
        null, 
        lorePersistenceData 
      );
      
      console.debug('Save result:', result?.success ? 'success' : 'failed');
      return result?.success || false;
    } catch (err) {
      console.error('Error saving chat:', err);
      return false;
    }
  }, [characterData, currentUser, apiConfig, availablePreviewImages, currentPreviewImageIndex, triggeredLoreImages]);

  // Create debounced save function
  const debouncedSave = MessageUtils.createDebouncedSave(
    (messages: Message[]): Promise<boolean> => { // Callback returns Promise<boolean>
      return saveChat(messages) // saveChat itself returns Promise<boolean>
        .catch(error => {
          console.error("Error in debounced saveChat execution:", error);
          throw error; // Re-throw the error to be caught by the debouncer if it handles rejections
        });
    },
    500 // Add the debounce delay parameter
  );
  
  // Append a message to the chat
  const appendMessage = useCallback(async (message: Message) => {
    if (!characterData?.data?.name) {
      console.debug('Append aborted: no character data name');
      return null;
    }
    
    try {
      console.debug(`Appending message ${message.id} (${message.role}) to chat`);
      
      const messageToAppend = {
        ...message,
        id: message.id || crypto.randomUUID(),
        timestamp: message.timestamp || Date.now()
      };
      
      const result = await ChatStorage.appendMessage(characterData, messageToAppend);
      
      console.debug(`Append result for ${messageToAppend.id}:`, result?.success ? 'success' : 'failed');
      return messageToAppend;
    } catch (err) {
      console.error('Error appending message:', err);
      return null;
    }
  }, [characterData]);
  
  // Get content filtering capabilities
  const { getRequestParameters, filterText, shouldUseClientFiltering } = useContentFilter();
  
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
      
      const contentFilterParams = getRequestParameters();
      
      return {
        ...fullConfig,
        ...contentFilterParams
      };
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
      },
      ...getRequestParameters() 
    };
  }, [getRequestParameters]);
  
  // Generate reasoning response
  const generateReasoningResponse = useCallback(async (prompt: string) => {
    if (!reasoningSettings.enabled || !characterData) return null;
    
    const thinkingId = crypto.randomUUID();
    const thinkingMessage: Message = {
      id: thinkingId,
      role: 'thinking' as 'system', 
      content: '',
      timestamp: Date.now()
    };
    
    setMessages((prev: Message[]) => [...prev, thinkingMessage]);
    setIsGenerating(true);
    setGeneratingId(thinkingId);
    
    try {
      if (!characterData) {
        throw new Error('No character data available for generating a response');
      }
    
      const reasoningInstructions = reasoningSettings?.instructions || DEFAULT_REASONING_SETTINGS.instructions || '';
      const characterName = characterData.data?.name || 'Character';
      const userName = currentUser?.name || 'User';
      
      const reasoningPrompt = reasoningInstructions
        .replace(/\{\{char\}\}/g, characterName)
        .replace(/\{\{user\}\}/g, userName);
      
      const contextMessages = messagesRef.current 
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
      
      const thinkingPrompt = `${reasoningPrompt}\n\nUser's message: ${prompt}`;
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
        const response = await PromptHandler.generateChatResponse(
        characterData,
        thinkingPrompt,
        contextMessages,
        currentUser?.name || 'User', 
        formattedAPIConfig,
        currentGenerationRef.current?.signal
      );
      let thinkingContent = '';
      for await (const chunk of PromptHandler.streamResponse(response)) {
        const rawThinkingContent = thinkingContent + chunk;
        
        thinkingContent = shouldUseClientFiltering 
          ? filterText(rawThinkingContent) 
          : rawThinkingContent;
        
        setMessages((prev: Message[]) => {
          const updatedMessages = prev.map(msg => 
            msg.id === thinkingId ? {...msg, content: thinkingContent} : msg
          );
          return updatedMessages;
        });
      }
      
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
  }, [characterData, reasoningSettings, currentUser, apiConfig, prepareAPIConfig, filterText, shouldUseClientFiltering, messagesRef]);
  
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
        saveChat(newMessages); 
        appendMessage({ ...newMessages[msgIndex], timestamp: Date.now() });
      } else {
        console.log(`Potential ongoing edit for message ${messageId}, using debounced save`);
        debouncedSave(newMessages); 
      }
  
      setLastContextWindow(updatedContextWindow);
      return newMessages;
    });
  }, [characterData, appendMessage, debouncedSave, saveChat]);
  
  // Delete a message
  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev: Message[]) => {
      const newMessages = prev.filter(msg => msg.id !== messageId);
  
     debouncedSave(newMessages); 
  
      setLastContextWindow({
        type: 'message_deleted',
        timestamp: new Date().toISOString(),
        messageId,
        remainingMessages: newMessages.length,
        characterName: characterData?.data?.name || 'Unknown'
      });
  
      return newMessages;
    });
  }, [characterData, debouncedSave]);
 
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
  
      debouncedSave(newMessages); 
  
      return newMessages;
    });
  
    setTimeout(() => {
      appendMessage(finalMessage);
    }, 50);
  }, [appendMessage, characterData, debouncedSave]);
  
  // Handle generation errors
  const handleGenerationError = useCallback((err: any, messageId: string) => {
    console.error('Error during generation:', err);
    let updatedMessages: Message[] = []; 

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

        updatedMessages = [...prev]; 
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

      saveChat(updatedMessages); 
    } else {
      setMessages((prev: Message[]) => {
        updatedMessages = prev.map(msg => 
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

      saveChat(updatedMessages); 
    }

    setIsGenerating(false);
    setGeneratingId(null);
  }, [saveChat]);
  
  // Create new chat function
  const createNewChat = useCallback(async () => {
    if (!characterData) return;
    
    console.log('Creating new chat');
    
    try {
      await ChatStorage.clearContextWindow();
      
      setMessages([]);
      setLastContextWindow({
        type: 'new_chat',
        timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown'
      });
      
      if (characterData?.data.first_mes) {
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
    setMessages(newMessages);
    
    setTimeout(() => {
      if (characterData) {
        saveChat(newMessages);
      }
    }, 50); 
  }, [characterData, saveChat]);
 
  // Generate response with support for /new command
  const generateResponse = useCallback(async (prompt: string) => {
    if (!characterData || isGenerating) return;

    console.log('Starting generation for prompt:', prompt);

    if (prompt === '/new' && createNewChatRef.current) {
      createNewChatRef.current();
      return;
    }

    const userMessage = MessageUtils.createUserMessage(prompt);
    const assistantMessage = MessageUtils.createAssistantMessage();

    setMessages((prev: Message[]) => [...prev, userMessage, assistantMessage]);
    setIsGenerating(true);
    setGeneratingId(assistantMessage.id);

    await appendMessage(userMessage);

    let bufferTimer: NodeJS.Timeout | null = null;

    const abortController = new AbortController();
    currentGenerationRef.current = abortController;

    try {
      let reasoningContent = null;
      if (reasoningSettings.enabled) {
        reasoningContent = await generateReasoningResponse(prompt);
      }

      const contextMessages = messagesRef.current 
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

      if (reasoningContent) {
        contextMessages.push({
          role: 'system',
          content: `<think>${reasoningContent}</think>`
        });
      }

      const formattedAPIConfig = prepareAPIConfig(apiConfig);

      setLastContextWindow({
        type: 'generation_starting',
        timestamp: new Date().toISOString(),
        characterName: characterData.data?.name || 'Unknown',
        messageId: assistantMessage.id,
        prompt,
        reasoningEnabled: reasoningSettings.enabled,
        hasReasoningContent: !!reasoningContent
      });
 
      const response = await PromptHandler.generateChatResponse(
        characterData,
        prompt,
        contextMessages,
        currentUser?.name || 'User', 
        formattedAPIConfig, 
        abortController.signal
      );
 
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${await response.text()}`);
      }      
      let content = '';
      let buffer = '';
      let isFirstChunk = true;

      bufferTimer = setInterval(() => {
        if (buffer.length > 0) {
          console.log(`Processing buffer of length ${buffer.length}, first ${Math.min(20, buffer.length)} chars: "${buffer.substring(0, 20)}..."`);
          
          let processedBuffer = buffer;
          if (isFirstChunk && content === '') {
            processedBuffer = processedBuffer.replace(/^\s+/, '');
            isFirstChunk = false;
          }
          
          const rawContent = content + processedBuffer;
          
          const newContent = shouldUseClientFiltering 
            ? filterText(rawContent) 
            : rawContent;
            
          buffer = '';
          
          setMessages((prevMessages: Message[]) => {
            const updatedMessages = prevMessages.map((msg: Message) =>
              msg.id === assistantMessage.id ? {
                ...msg,
                content: newContent,
                status: 'streaming' as const 
              } : msg
            );
            return updatedMessages;
          });
          content = newContent;
        }
      }, 50);
      
      for await (const chunk of PromptHandler.streamResponse(response)) {
        if (chunk) {
          console.log(`Response chunk received: "${chunk.substring(0, 20)}...", length: ${chunk.length}`);
        } else {
          console.warn("Empty chunk received from stream");
        }
        buffer += chunk || '';
      }
      if (buffer.length > 0) {
        let processedBuffer = buffer; 
        
        if (isFirstChunk && content === '') {
          processedBuffer = processedBuffer.replace(/^\s+/, '');
          isFirstChunk = false;
        }
        
        const rawContent = content + processedBuffer;
        
        content = shouldUseClientFiltering 
          ? filterText(rawContent) 
          : rawContent;
      }

      const finalMessages = messagesRef.current.map((msg: Message) =>
        msg.id === assistantMessage.id ? {
          ...msg,
          content,
          variations: [content],
          currentVariation: 0
        } : msg
      );

      setIsGenerating(false);
      setGeneratingId(null);
      setLastContextWindow((currentWindow: any) => ({
        ...currentWindow,
        type: 'generation_complete',
        completionTime: new Date().toISOString()
      }));

      updateAndSaveMessages(finalMessages); 

    } catch (err) {
      handleGenerationError(err, assistantMessage.id);
    } finally {
      currentGenerationRef.current = null;

      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }
      console.log('Generation complete');
    } 
  }, [ 
    characterData, 
    currentUser, 
    apiConfig, 
    reasoningSettings, 
    isGenerating, 
    messagesRef, 
    appendMessage, 
    generateReasoningResponse, 
    handleGenerationError, 
    prepareAPIConfig, 
    saveChat, 
    updateAndSaveMessages, 
    filterText, 
    shouldUseClientFiltering
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

    const targetIndex = messagesRef.current.findIndex((msg: Message) => msg.id === message.id);
    if (targetIndex === -1) {
      console.error(`Message with ID ${message.id} not found`);
      return;
    }

    setIsGenerating(true);
    setGeneratingId(message.id);
    console.log(`Regenerating message at index ${targetIndex}`);

    try {
      const contextMessages = messagesRef.current 
        .slice(0, targetIndex)
        .filter((msg: Message) => msg.role !== 'thinking')
        .map((msg: Message) => {
          const { role, content } = msg;
          let validRole: 'user' | 'assistant' | 'system' = 'system';
          if (role === 'user') {
            validRole = 'user';
          } else if (role === 'assistant') {
            validRole = 'assistant';
          }
          return { role: validRole, content };
        });

      let promptText = "Provide a fresh response that builds on the existing story without repeating previous details verbatim. ##!important:avoid acting,speaking, or thinking for {{user}}!##";
      let promptSource = "default";

      for (let i = targetIndex - 1; i >= 0; i--) {
        if (messagesRef.current[i].role === 'user') { 
          promptText = messagesRef.current[i].content; 
          promptSource = `message_${i}`;
          break;
        }
      }

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

      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      const abortController = new AbortController();
      currentGenerationRef.current = abortController;
      
      const response = await PromptHandler.generateChatResponse(
        characterData,
        promptText,
        contextMessages,
        currentUser?.name || 'User', 
        formattedAPIConfig,
        abortController.signal
      );

      if (!response.ok) {
        throw new Error(`Generation failed - check API settings: ${response.status} ${await response.text()}`);
      }

      let newContent = '';
      let buffer = '';
      let bufferTimer: NodeJS.Timeout | null = null;      
      for await (const chunk of PromptHandler.streamResponse(response)) {
        if (!bufferTimer) {
          bufferTimer = setInterval(() => {
            if (buffer.length > 0) {
              const rawContent = newContent + buffer;
              
              const content = shouldUseClientFiltering 
                ? filterText(rawContent) 
                : rawContent;
                
              buffer = '';
              setMessages((prevMessages: Message[]) => {
                const updatedMessages = [...prevMessages];
                if (targetIndex >= 0 && targetIndex < updatedMessages.length) {
                   updatedMessages[targetIndex] = {
                     ...updatedMessages[targetIndex],
                     content,
                     status: 'streaming' as const 
                   };
                }
                return updatedMessages;
              });
              newContent = content;
            }
          }, 50);
        }
        console.log(`Regeneration chunk received: "${chunk?.substring(0, 20)}...", length: ${chunk.length}`);
        buffer += chunk || '';
      }

      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }      
      if (buffer.length > 0) {
        const rawContent = newContent + buffer;
        
        newContent = shouldUseClientFiltering 
          ? filterText(rawContent) 
          : rawContent;
      }
      
      const originalMessage = messagesRef.current.find((msg: Message) => msg.id === message.id); 
      
      if (originalMessage && newContent !== originalMessage.content) {
        console.log("Creating final message with continuation content");
        
        const variations = [...(originalMessage.variations || [originalMessage.content])];
        
        if (!variations.includes(newContent)) {
          variations.push(newContent);
        }
        
        const finalMessage = {
          ...originalMessage,
          content: newContent,
          variations,
          currentVariation: variations.length - 1,
          timestamp: Date.now() 
        };
        
        setMessages((prevMessages: Message[]) =>
          prevMessages.map((msg: Message) => msg.id === message.id ? finalMessage : msg)
        );
        
        setLastContextWindow({
          type: 'continuation_complete',
          timestamp: new Date().toISOString(),
          characterName: characterData.data?.name || 'Unknown',
          messageId: message.id,
          finalResponse: newContent,
          completionTime: new Date().toISOString(),
          variationsCount: variations.length
        });
        
        try {
          await appendMessage(finalMessage);
          
          const currentMessages = messagesRef.current.map((msg: Message) =>
            msg.id === message.id ? finalMessage : msg
          );
          
          await saveChat(currentMessages);
          
          console.log('Successfully saved continued message');
        } catch (saveError) {
          console.error('Error saving continued message:', saveError);
        }
      }
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
  }, [ 
    characterData, 
    currentUser, 
    apiConfig, 
    isGenerating, 
    messagesRef, 
    appendMessage, 
    handleGenerationError, 
    prepareAPIConfig, 
    saveChat, 
    filterText, 
    shouldUseClientFiltering
  ]);
  
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
  
    const targetIndex = messagesRef.current.findIndex((msg: Message) => msg.id === message.id);
    if (targetIndex === -1) {
      console.error(`Message with ID ${message.id} not found`);
      return;
    }
  
    setIsGenerating(true);
    setGeneratingId(message.id);
    console.log(`Continuing message at index ${targetIndex}`);
  
    const abortController = new AbortController();
    currentGenerationRef.current = abortController;
  
    try {
      const contextMessages = messagesRef.current 
        .slice(0, targetIndex + 1)
        .filter((msg: Message) => msg.role !== 'thinking')
        .map((msg: Message) => {
          const { role, content } = msg;
          let validRole: 'user' | 'assistant' | 'system' = 'system';
          if (role === 'user') {
            validRole = 'user';
          } else if (role === 'assistant') {
            validRole = 'assistant';
          }
          return { role: validRole, content };
        });
  
      setLastContextWindow({
        type: 'continuation',
        timestamp: new Date().toISOString(),
        characterName: characterData.data?.name || 'Unknown',
        messageId: message.id,
        messageIndex: targetIndex,
        contextMessageCount: contextMessages.length,
        originalContent: message.content
      });
  
      const continuationPrompt: { role: 'user' | 'assistant' | 'system', content: string } = {
        role: 'system',
        content: "Continue from exactly where you left off without repeating anything. Do not summarize or restart."
      };
  
      contextMessages.push(continuationPrompt);
  
      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      
      const response = await PromptHandler.generateChatResponse(
        characterData,
        message.content, 
        contextMessages,
        currentUser?.name || 'User', 
        formattedAPIConfig,
        abortController.signal
      );
  
      if (!response.ok) {
        throw new Error(`Continuation failed - check API settings: ${response.status} ${await response.text()}`);
      }
  
      let currentContent = message.content; 
      let buffer = '';
      let bufferTimer: NodeJS.Timeout | null = null;
      for await (const chunk of PromptHandler.streamResponse(response)) {
        if (!bufferTimer) {
          bufferTimer = setInterval(() => {
            if (buffer.length > 0) {
              const rawUpdatedContent = currentContent + buffer;
              
              const updatedContent = shouldUseClientFiltering 
                ? filterText(rawUpdatedContent) 
                : rawUpdatedContent;
                
              buffer = '';
              setMessages((prevMessages: Message[]) => {
                const updatedMessages = [...prevMessages];
                const msgIndex = prevMessages.findIndex((msg: Message) => msg.id === message.id);
                if (msgIndex >= 0 && msgIndex < updatedMessages.length) {
                  updatedMessages[msgIndex] = {
                    ...updatedMessages[msgIndex],
                    content: updatedContent,
                    status: 'streaming' as const
                  };
                }
                return updatedMessages;
              });
              currentContent = updatedContent;
            }
          }, 50);
        }
        
        console.log(`Continuation chunk received: "${chunk?.substring(0, 20)}...", length: ${chunk.length}`);
        buffer += chunk || '';
      }
  
      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }      
      if (buffer.length > 0) {
        const rawContent = currentContent + buffer;
        
        currentContent = shouldUseClientFiltering 
          ? filterText(rawContent) 
          : rawContent;
      }
      
      const originalMessage = messagesRef.current.find((msg: Message) => msg.id === message.id); 
      
      if (originalMessage && currentContent !== originalMessage.content) {
        console.log("Creating final message with continuation content");
        
        const variations = [...(originalMessage.variations || [originalMessage.content])];
        
        if (!variations.includes(currentContent)) {
          variations.push(currentContent);
        }
        
        const finalMessage = {
          ...originalMessage,
          content: currentContent,
          variations,
          currentVariation: variations.length - 1,
          timestamp: Date.now() 
        };
        
        setMessages((prevMessages: Message[]) =>
          prevMessages.map((msg: Message) => msg.id === message.id ? finalMessage : msg)
        );
        
        setLastContextWindow({
          type: 'continuation_complete',
          timestamp: new Date().toISOString(),
          characterName: characterData.data?.name || 'Unknown',
          messageId: message.id,
          finalResponse: currentContent,
          completionTime: new Date().toISOString(),
          variationsCount: variations.length
        });
        
        try {
          await appendMessage(finalMessage);
          
          const currentMessages = messagesRef.current.map((msg: Message) =>
            msg.id === message.id ? finalMessage : msg
          );
          
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
    currentUser, 
    apiConfig, 
    isGenerating, 
    messagesRef, 
    appendMessage, 
    handleGenerationError, 
    prepareAPIConfig, 
    saveChat, 
    filterText, 
    shouldUseClientFiltering
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
      
      setIsGenerating(false); 
      setGeneratingId(null);
      
      currentGenerationRef.current.abort();
      currentGenerationRef.current = null; 
    } else {
      console.warn('No active generation to stop');
    }
  }, []);
  
  // Cycle through message variations
  const cycleVariation = useCallback((messageId: string, direction: 'next' | 'prev') => {
    setMessages((prevMessages: Message[]) => {
      const updatedMessages = prevMessages.map((msg: Message) => {
        if (msg.id === messageId && msg.variations?.length) {
          return MessageUtils.cycleVariation(msg, direction);
        }
        return msg;
      });

      const targetMessage = prevMessages.find((msg: Message) => msg.id === messageId);
      setLastContextWindow({
        type: 'cycle_variation',
        timestamp: new Date().toISOString(),
        messageId,
        direction,
        characterName: characterData?.data?.name || 'Unknown',
        totalVariations: targetMessage?.variations?.length || 0,
        previousIndex: targetMessage?.currentVariation || 0
      });
      
      debouncedSave(updatedMessages);

      return updatedMessages;
    });
  }, [characterData, debouncedSave, MessageUtils.cycleVariation]);
  
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
    
    saveChat(messagesRef.current); 
  }, [characterData, saveChat, messagesRef]);
  
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

        let loadedTriggeredLoreImages: TriggeredLoreImage[] = [];
        if (data.messages.metadata?.chat_metadata?.triggeredLoreImages) {
          loadedTriggeredLoreImages = data.messages.metadata.chat_metadata.triggeredLoreImages;
          setTriggeredLoreImages(loadedTriggeredLoreImages);
        }

        const charImgPath = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
          ? `/api/character-image/${characterData.data.character_uuid}.png`
          : '';
        
        const newAvailableImages = getAvailableImagesForPreview(charImgPath);
        setAvailablePreviewImages(newAvailableImages);

        if (data.messages.metadata?.chat_metadata?.currentDisplayedImage && newAvailableImages.length > 0) {
          const savedDisplay = data.messages.metadata.chat_metadata.currentDisplayedImage;
          const foundIndex = newAvailableImages.findIndex(img =>
            img.type === savedDisplay.type &&
            (img.type === 'character' || (img.entryId === savedDisplay.entryId && img.imageUuid === savedDisplay.imageUuid))
          );
          if (foundIndex !== -1) {
            setCurrentPreviewImageIndex(foundIndex);
          } else {
            setCurrentPreviewImageIndex(0); 
          }
        } else if (newAvailableImages.length > 0) {
          setCurrentPreviewImageIndex(0); 
        } else {
          setCurrentPreviewImageIndex(0); 
        }

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
  }, [characterData, currentUser, getAvailableImagesForPreview, resetTriggeredLoreImagesState]);
  
  // Update reasoning settings
  const updateReasoningSettings = useCallback((settings: ReasoningSettings) => {
    try {
      localStorage.setItem('cardshark_reasoning_settings', JSON.stringify(settings));
      
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
 
  // Lore Image Preview Navigation
  const navigateToPreviewImage = useCallback((index: number) => {
    if (index >= 0 && index < availablePreviewImages.length) {
      setCurrentPreviewImageIndex(index);
    } else {
      console.warn(`navigateToPreviewImage: Index ${index} is out of bounds for ${availablePreviewImages.length} images.`);
      if (availablePreviewImages.length > 0) {
        setCurrentPreviewImageIndex(0);
      }
    }
  }, [availablePreviewImages]);
 
  // Track Lore Images
  const trackLoreImages = useCallback((matchedEntries: LoreEntry[], characterUuidFromHook: string) => {
    const currentCharacterUuid = characterData?.data?.character_uuid || characterUuidFromHook;
 
    if (!currentCharacterUuid) {
      console.warn("trackLoreImages: Character UUID not available for image tracking.");
      return;
    }
    
    processLoreEntriesForImageTracking(matchedEntries, currentCharacterUuid);
 
    const updatedGlobalTriggeredImages = getGlobalTriggeredLoreImages();
    setTriggeredLoreImages(updatedGlobalTriggeredImages);
 
    const charImgPath = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
      ? `/api/character-image/${characterData.data.character_uuid}.png`
      : '';
    
    const newAvailableImages = getAvailableImagesForPreview(charImgPath);
    setAvailablePreviewImages(newAvailableImages);
 
    let switchedToTriggeredImage = false;
    for (const entry of matchedEntries) {
      if (entry.has_image && entry.image_uuid) {
        const triggeredImageIndex = newAvailableImages.findIndex(
          (img) =>
            img.type === 'lore' &&
            img.entryId === entry.id.toString() &&
            img.imageUuid === entry.image_uuid
        );
        if (triggeredImageIndex !== -1) {
          setCurrentPreviewImageIndex(triggeredImageIndex);
          switchedToTriggeredImage = true;
          break; 
        }
      }
    }
 
    if (!switchedToTriggeredImage) {
      if (newAvailableImages.length > 0 && currentPreviewImageIndex >= newAvailableImages.length) {
        setCurrentPreviewImageIndex(0); 
      } else if (newAvailableImages.length === 0) {
        setCurrentPreviewImageIndex(0); 
      } else if (newAvailableImages.length > 0 && availablePreviewImages.length !== newAvailableImages.length) {
        const currentImageStillExists = newAvailableImages[currentPreviewImageIndex];
        if (!currentImageStillExists) {
            setCurrentPreviewImageIndex(0);
        }
      }
    }
  }, [characterData, availablePreviewImages, currentPreviewImageIndex, getGlobalTriggeredLoreImages, getAvailableImagesForPreview]);
 
  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  // Create the context value
  const contextValue: ChatContextType = {
    messages: messages,
    isLoading: isLoading,
    isGenerating: isGenerating,
    error: error,
    currentUser: currentUser,
    lastContextWindow: lastContextWindow,
    generatingId: generatingId,
    reasoningSettings: reasoningSettings,
    triggeredLoreImages: triggeredLoreImages,
    availablePreviewImages: availablePreviewImages,
    currentPreviewImageIndex: currentPreviewImageIndex,

    updateMessage: updateMessage,
    deleteMessage: deleteMessage,
    addMessage: addMessage,
    cycleVariation: cycleVariation,
    
    generateResponse: generateResponse,
    regenerateMessage: regenerateMessage,
    continueResponse: continueResponse,
    stopGeneration: stopGeneration,
    
    setCurrentUser: setCurrentUserHandler,
    loadExistingChat: loadExistingChat,
    createNewChat: createNewChat,
    updateReasoningSettings: updateReasoningSettings,
    navigateToPreviewImage: navigateToPreviewImage,
    trackLoreImages: trackLoreImages,
    resetTriggeredLoreImagesState: resetTriggeredLoreImagesState,
    
    clearError: clearError
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
