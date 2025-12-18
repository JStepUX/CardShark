/**
 * @file ChatContext.tsx
 * @description Global state management for chat sessions, messages, and generation status.
 * @dependencies useCharacter, useEnhancedChatSession
 * @consumers ChatView.tsx, WorldCardsPlayView.tsx
 */
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
  processLoreEntriesForImageTracking,
  getAvailableImagesForPreview,
  resetTriggeredImages as resetGlobalTriggeredImages
} from '../handlers/loreHandler';
import { LoreEntry } from '../types/schema';
import { buildContextMessages } from '../utils/contextBuilder';

interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions?: string;
}

const DEFAULT_REASONING_SETTINGS: ReasoningSettings = {
  enabled: false,
  visible: false,
  instructions: "!important! Embody {{char}}. **Think** through the context of this interaction with <thinking></thinking> tags. Consider your character, your relationship with the user, and relevant context from the conversation history."
};

interface ChatContextType {
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
  currentChatId: string | null;
  updateMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  addMessage: (message: Message) => void;
  cycleVariation: (messageId: string, direction: 'next' | 'prev') => void;
  generateResponse: (prompt: string, retryCount?: number) => Promise<void>;
  regenerateMessage: (message: Message, retryCount?: number) => Promise<void>;
  regenerateGreeting: () => Promise<void>;
  continueResponse: (message: Message) => Promise<void>;
  stopGeneration: () => void;
  setCurrentUser: (user: UserProfile | null) => void;
  loadExistingChat: (chatId: string) => Promise<void>;
  createNewChat: () => Promise<string | null>;
  updateReasoningSettings: (settings: ReasoningSettings) => void;
  navigateToPreviewImage: (index: number) => void;
  trackLoreImages: (matchedEntries: LoreEntry[], characterUuid: string) => void;
  resetTriggeredLoreImagesState: () => void;
  clearError: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export { ChatContext }; // Export the context for optional usage

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { characterData } = useCharacter(); const apiConfigContext = useContext(APIConfigContext);
  const apiConfig = apiConfigContext ? apiConfigContext.apiConfig : null;

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
      return savedSettings ? JSON.parse(savedSettings) : DEFAULT_REASONING_SETTINGS;
    } catch (err) {
      console.error('Error loading reasoning settings:', err);
      return DEFAULT_REASONING_SETTINGS;
    }
  });
  const [triggeredLoreImages, setTriggeredLoreImages] = useState<TriggeredLoreImage[]>([]);
  const [availablePreviewImages, setAvailablePreviewImages] = useState<AvailablePreviewImage[]>([]);
  const [currentPreviewImageIndex, setCurrentPreviewImageIndex] = useState<number>(0);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const currentGenerationRef = useRef<AbortController | null>(null);
  const lastCharacterId = useRef<string | null>(null); // Stores character_id for file system comparison
  const autoSaveEnabled = useRef(true);
  const createNewChatRef = useRef<(() => Promise<string | null>) | null>(null);
  const isCreatingChatRef = useRef(false); // Prevent concurrent chat creation

  useEffect(() => {
    const loadCtxWindow = async () => {
      try {
        const data = await ChatStorage.loadContextWindow();
        if (data.success && data.context) setLastContextWindow(data.context);
      } catch (err) { console.error('Error loading context window:', err); }
    };
    loadCtxWindow();
  }, []);

  useEffect(() => {
    if (lastContextWindow) {
      ChatStorage.saveContextWindow(lastContextWindow).catch(err => console.error('Error saving context window:', err));
    }
  }, [lastContextWindow]);

  const resetTriggeredLoreImagesState = useCallback(() => {
    resetGlobalTriggeredImages();
    setTriggeredLoreImages([]);
    const charImgPath = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
      ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
    const defaultAvailImages = getAvailableImagesForPreview(charImgPath);
    setAvailablePreviewImages(defaultAvailImages);
    setCurrentPreviewImageIndex(0);
  }, [characterData]);

  const saveChat = useCallback(async (messageList: Message[]) => {
    if (!characterData?.data?.name || !autoSaveEnabled.current) {
      console.debug('Save aborted: no character data name or autoSave disabled');
      return false;
    }

    let chatToSaveId = currentChatId;

    try {
      if (!chatToSaveId) {
        console.debug('currentChatId is null, attempting to create a new chat session first.');
        if (!characterData) {
          console.error('Cannot create new chat session: characterData is null.');
          setError('Cannot create new chat session: No character selected.');
          return false;
        } const newChatResponse = await ChatStorage.createNewChat(characterData);
        if (newChatResponse.success && newChatResponse.chat_session_uuid) {
          chatToSaveId = newChatResponse.chat_session_uuid;
          setCurrentChatId(chatToSaveId);
          console.debug(`New chat session created with ID: ${chatToSaveId}`);
        } else {
          console.error('Failed to create new chat session before saving:', newChatResponse.error);
          setError(newChatResponse.error || 'Failed to create new chat session.');
          return false;
        }
      }

      console.debug(`Executing save for chat ID ${chatToSaveId} with ${messageList.length} messages`);
      const messagesToSave = JSON.parse(JSON.stringify(messageList));






      // Save chat using database-centric API
      const response = await fetch('/api/reliable-save-chat', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_session_uuid: chatToSaveId,
          messages: messagesToSave,
          title: characterData.data.name ? `Chat with ${characterData.data.name}` : undefined
        })
      });

      const result = response.ok ? await response.json() : { success: false, error: 'Save failed' };

      const success = result?.success;
      // Handle wrapped data (DataResponse) or direct response
      const data = result?.data || result;

      if (success) {
        const returnedId = data?.chat_session_uuid || data?.chatId;
        if (returnedId && returnedId !== chatToSaveId) {
          setCurrentChatId(returnedId);
          console.debug(`Save successful, chat ID (from backend) updated to: ${returnedId}`);
        } else {
          console.debug(`Save successful for chat ID: ${chatToSaveId}`);
        }
      } else {
        console.debug('Save result:', success ? 'success' : `failed (chatId: ${chatToSaveId})`, result?.error);
      }
      return result?.success || false;
    } catch (err) {
      console.error('Error saving chat:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during save.');
      return false;
    }
  }, [characterData, currentUser, apiConfig, availablePreviewImages, currentPreviewImageIndex, triggeredLoreImages, currentChatId]); useEffect(() => {
    if (!characterData?.data?.name) {
      console.log('ChatContext useEffect: No character data name, returning');
      return;
    }

    const currentCharacterFileId = ChatStorage.getCharacterId(characterData);
    console.log('ChatContext useEffect: currentCharacterFileId:', currentCharacterFileId, 'lastCharacterId:', lastCharacterId.current, 'currentChatId:', currentChatId);

    // Always load the most recent chat for any character selection
    // This ensures we get the latest chat from the database even if returning to the same character

    if (lastCharacterId.current !== null && lastCharacterId.current !== currentCharacterFileId) {
      console.log('Character changed, clearing context window');
      ChatStorage.clearContextWindow();
    }

    console.log('Loading most recent chat for character:', characterData.data.name);

    // Only reset currentChatId if this is a character change or first load
    // If returning to chat with same character, preserve current chat
    if (lastCharacterId.current !== null && lastCharacterId.current !== currentCharacterFileId) {
      console.log('Character changed, resetting currentChatId to load most recent chat');
      setCurrentChatId(null);
    } else if (!currentChatId) {
      console.log('No current chat, loading most recent chat');
      setCurrentChatId(null); // Explicitly set to null to trigger latest chat load
    } else {
      console.log('Returning to existing chat session:', currentChatId);
      // Don't reset currentChatId - we're resuming an existing session
    }

    resetTriggeredLoreImagesState();

    async function loadChatForCharacterInternal() {
      try {
        setIsLoading(true);
        setError(null);
        if (!characterData) throw new Error('No character data available'); const response = await ChatStorage.loadLatestChat(characterData);

        // Handle potentially unwrapped response from ChatStorage or raw DataResponse
        const sessionData = response.data || response;
        const messages = sessionData.messages;

        if (response.success && messages && Array.isArray(messages) && messages.length > 0) {
          setMessages(messages);
          const loadedChatSessionId = sessionData.chat_session_uuid || sessionData.chatId || sessionData.metadata?.chat_metadata?.chat_id || null;
          setCurrentChatId(loadedChatSessionId); if (sessionData.metadata?.chat_metadata?.lastUser) setCurrentUser(sessionData.metadata.chat_metadata.lastUser);

          let loadedTrigLoreImgs: TriggeredLoreImage[] = []; if (sessionData.metadata?.chat_metadata?.triggeredLoreImages) {
            loadedTrigLoreImgs = sessionData.metadata.chat_metadata.triggeredLoreImages;
            setTriggeredLoreImages(loadedTrigLoreImgs);
          }

          const charImgP = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
            ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
          const newAvailImgs = getAvailableImagesForPreview(charImgP);
          setAvailablePreviewImages(newAvailImgs);

          if (sessionData.metadata?.chat_metadata?.currentDisplayedImage && newAvailImgs.length > 0) {
            const savedDisp = sessionData.metadata.chat_metadata.currentDisplayedImage;
            const foundIdx = newAvailImgs.findIndex(img =>
              img.type === savedDisp.type &&
              (img.type === 'character' || (img.entryId === savedDisp.entryId && img.imageUuid === savedDisp.imageUuid))
            );
            setCurrentPreviewImageIndex(foundIdx !== -1 ? foundIdx : 0);
          } else {
            setCurrentPreviewImageIndex(newAvailImgs.length > 0 ? 0 : 0);
          } setLastContextWindow({
            type: 'loaded_chat', timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name, chatId: loadedChatSessionId || 'unknown',
            messageCount: messages.length
          });
          setError(null);
        } else if (response.isRecoverable && characterData?.data?.first_mes) {
          console.log('No existing chat (recoverable), init with first_mes. Error:', response.error);
          const charName = characterData.data.name || 'Character';
          const uName = currentUser?.name || 'User';
          const subContent = characterData.data.first_mes.replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, uName);
          const firstMsg = MessageUtils.createAssistantMessage(subContent);

          // Populate variations with alternate greetings if available
          if (characterData.data.alternate_greetings && Array.isArray(characterData.data.alternate_greetings) && characterData.data.alternate_greetings.length > 0) {
            const alternates = characterData.data.alternate_greetings.map(alt =>
              alt.replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, uName)
            );
            firstMsg.variations = [subContent, ...alternates];
            firstMsg.currentVariation = 0;
          }

          setMessages([firstMsg]);
          setLastContextWindow({
            type: 'initial_message_used', timestamp: new Date().toISOString(),
            characterName: characterData.data.name, firstMessage: characterData.data.first_mes,
            originalLoadError: response.error
          });
          const saveOk = await saveChat([firstMsg]); // saveChat will create ID if null
          setError(saveOk ? null : "Failed to save initial message.");

          const charImgP = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
            ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
          const defAvail = getAvailableImagesForPreview(charImgP);
          setAvailablePreviewImages(defAvail);
          setCurrentPreviewImageIndex(0);
          setTriggeredLoreImages([]);
        } else {
          console.error('Failed to load chat. Resp:', response, 'Has first_mes:', !!characterData?.data?.first_mes);
          setError(response.error || 'Failed to load chat & no initial message.');
          setMessages([]);
          setLastContextWindow({
            type: 'load_failed_or_no_fallback', timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name,
            error: response.error || 'Failed to load chat & no initial message.'
          });
        }
      } catch (err) {
        console.error('Unexpected error during chat loading:', err);
        setError(err instanceof Error ? err.message : 'Unexpected error loading chat.');
        setMessages([]);
        setLastContextWindow({
          type: 'unexpected_load_error', timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name,
          error: err instanceof Error ? err.message : 'Unexpected error.'
        });
      } finally {
        setIsLoading(false);
        // Always update the last character ID to prevent infinite loops
        lastCharacterId.current = currentCharacterFileId;
      }
    }
    loadChatForCharacterInternal();
  }, [characterData, resetTriggeredLoreImagesState]); // Remove currentUser from deps

  const debouncedSave = MessageUtils.createDebouncedSave(
    (msgs: Message[]): Promise<boolean> => saveChat(msgs).catch(e => { console.error("Debounced saveChat err:", e); throw e; }), 500
  );

  const appendMessage = useCallback(async (message: Message) => {
    if (!characterData?.data?.name) { console.debug('Append abort: no char name'); return null; }
    if (!currentChatId) { console.error('Append abort: currentChatId null.'); setError('No active chat session.'); return null; }

    try {
      console.debug(`Appending msg ${message.id} (${message.role}) to chat ${currentChatId}`);
      const msgToAppend = { ...message, id: message.id || crypto.randomUUID(), timestamp: message.timestamp || Date.now() };
      const result = await ChatStorage.appendMessage(currentChatId, msgToAppend);
      console.debug(`Append result for ${msgToAppend.id}:`, result?.success ? 'success' : 'failed');
      if (!result?.success) setError(result?.error || "Failed to append message.");
      return msgToAppend;
    } catch (err) {
      console.error('Error appending message:', err);
      setError(err instanceof Error ? err.message : "Failed to append message.");
      return null;
    }
  }, [characterData, currentChatId]);

  const { getRequestParameters, filterText, shouldUseClientFiltering } = useContentFilter();

  const prepareAPIConfig = useCallback((config?: APIConfig | null): APIConfig => {
    const defaultConfigSettings = {
      max_length: 220, max_context_length: 6144, temperature: 1.05, top_p: 0.92, top_k: 100,
      top_a: 0, typical: 1, tfs: 1, rep_pen: 1.07, rep_pen_range: 360, rep_pen_slope: 0.7,
      sampler_order: [6, 0, 1, 3, 4, 2, 5]
    };
    if (config) {
      const fullConfig = JSON.parse(JSON.stringify(config));
      if (!fullConfig.generation_settings) {
        console.warn('API config missing generation_settings, adding defaults');
        fullConfig.generation_settings = defaultConfigSettings;
      }
      const contentFilterParams = getRequestParameters();
      return { ...fullConfig, ...contentFilterParams };
    }
    console.warn('No API config provided, using defaults');
    return {
      id: 'default', provider: APIProvider.KOBOLD, url: 'http://localhost:5001',
      enabled: false, templateId: 'mistral', generation_settings: defaultConfigSettings,
      ...getRequestParameters()
    };
  }, [getRequestParameters]);


  const updateMessage = useCallback((messageId: string, content: string) => {
    setMessages((prev: Message[]) => {
      const updatedMsgs = prev.map(msg => {
        if (msg.id === messageId) {
          const variations = msg.variations ? [...msg.variations] : [msg.content];
          const currentVarIdx = msg.currentVariation ?? variations.length - 1;
          variations[currentVarIdx] = content;
          return { ...msg, content: content, variations: variations, currentVariation: currentVarIdx };
        }
        return msg;
      });
      debouncedSave(updatedMsgs);
      return updatedMsgs;
    });
  }, [debouncedSave]);

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev: Message[]) => {
      const updatedMsgs = prev.filter(msg => msg.id !== messageId);
      debouncedSave(updatedMsgs);
      return updatedMsgs;
    });
  }, [debouncedSave]);

  const addMessage = useCallback((message: Message) => {
    const msgWithId = { ...message, id: message.id || crypto.randomUUID() };
    setMessages((prev: Message[]) => {
      const newMsgs = [...prev, msgWithId];
      if (message.role === 'user') debouncedSave(newMsgs);
      return newMsgs;
    });
    if (message.role === 'user' && currentChatId) appendMessage(msgWithId);
  }, [debouncedSave, appendMessage, currentChatId]);

  const handleGenerationError = useCallback((err: any, messageId: string) => {
    console.error('Generation error:', err);
    const errorMsg = err instanceof Error ? err.message : 'Unknown error during generation.';
    setError(errorMsg);
    setMessages((prev: Message[]) => prev.map(msg => {
      if (msg.id === messageId) {
        if (msg.variations && msg.variations.length > 1 && typeof msg.currentVariation === 'number' && msg.currentVariation > 0) {
          const prevVarIdx = msg.currentVariation - 1;
          return { ...msg, role: 'assistant', content: msg.variations[prevVarIdx], currentVariation: prevVarIdx, error: errorMsg };
        }
        return { ...msg, role: 'system', content: `Generation failed: ${errorMsg}` };
      }
      return msg;
    }));
    setMessages(currentMsgs => { saveChat(currentMsgs); return currentMsgs; });
  }, [saveChat]); const createNewChat = useCallback(async (): Promise<string | null> => {
    if (!characterData) return null;

    // Prevent concurrent chat creation
    if (isCreatingChatRef.current) {
      console.log('Chat creation already in progress, skipping duplicate request');
      return null;
    }

    isCreatingChatRef.current = true;
    console.log('Creating new chat');
    setIsLoading(true); setError(null); setCurrentChatId(null);

    try {
      await ChatStorage.clearContextWindow(); const newChatResp = await ChatStorage.createNewChat(characterData);
      if (!newChatResp.success || !newChatResp.chat_session_uuid) {
        console.error('Failed to create new chat session backend:', newChatResp.error);
        setError(newChatResp.error || 'Failed to create new chat session.');
        setIsLoading(false);
        isCreatingChatRef.current = false; // Reset flag on early return
        return null;
      }
      const newCId = newChatResp.chat_session_uuid;
      setCurrentChatId(newCId);
      console.log(`New chat session created with ID: ${newCId}`);

      let initMsgs: Message[] = [];
      if (characterData?.data.first_mes) {
        const charN = characterData.data.name || 'Character';
        const userN = currentUser?.name || 'User';
        const subContent = characterData.data.first_mes.replace(/\{\{char\}\}/g, charN).replace(/\{\{user\}\}/g, userN);
        const firstM = MessageUtils.createAssistantMessage(subContent);

        // Populate variations with alternate greetings if available
        if (characterData.data.alternate_greetings && Array.isArray(characterData.data.alternate_greetings) && characterData.data.alternate_greetings.length > 0) {
          const alternates = characterData.data.alternate_greetings.map(alt =>
            alt.replace(/\{\{char\}\}/g, charN).replace(/\{\{user\}\}/g, userN)
          );
          firstM.variations = [subContent, ...alternates];
          firstM.currentVariation = 0;
        }

        initMsgs = [firstM];
        setLastContextWindow({
          type: 'new_chat_first_message', timestamp: new Date().toISOString(),
          characterName: characterData.data?.name || 'Unknown', firstMessage: characterData.data.first_mes, chatId: newCId
        });
      } else {
        setLastContextWindow({
          type: 'new_chat_empty', timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name || 'Unknown', chatId: newCId
        });
      }
      setMessages(initMsgs);
      try {
        await fetch('/api/reliable-save-chat', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_session_uuid: newCId,
            messages: initMsgs,
            title: characterData.data.name ? `Chat with ${characterData.data.name}` : undefined
          })
        });
      } catch (err) {
        console.warn(`Initial save for new chat ${newCId} failed:`, err);
      }

      return newCId; // Return the new chat ID
    } catch (err) {
      console.error('Error creating new chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to create new chat');
      setLastContextWindow({
        type: 'new_chat_error', timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown',
        error: err instanceof Error ? err.message : 'Failed to create new chat'
      });
      return null;
    } finally {
      setIsLoading(false);
      isCreatingChatRef.current = false; // Reset the creation flag
    }
  }, [characterData, currentUser, saveChat]);

  useEffect(() => { createNewChatRef.current = createNewChat; }, [createNewChat]);

  const regenerateMessage = useCallback(async (message: Message, retryCount: number = 0) => {
    if (!characterData || message.role !== 'assistant') return;
    if (!currentChatId) { setError("Cannot regen: No active chat."); return; }

    const msgIdx = messagesRef.current.findIndex(m => m.id === message.id);
    if (msgIdx <= 0) return;
    const lastUserMsg = messagesRef.current[msgIdx - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') return;

    const origContent = message.content;
    const origVariations = message.variations ? [...message.variations] : [origContent];
    const origVarIdx = message.currentVariation ?? origVariations.length - 1;

    setMessages((prev: Message[]) => prev.map(m => m.id === message.id ? { ...m, content: '...', role: 'assistant' } : m));
    setIsGenerating(true); setGeneratingId(message.id); setError(null);

    const abortCtrl = new AbortController(); currentGenerationRef.current = abortCtrl;

    try {
      // Build context using shared utility - for regeneration, slice to msgIdx
      // which includes history up to and including the preceding user message
      const ctxMsgs = buildContextMessages({
        existingMessages: messagesRef.current.slice(0, msgIdx),
        excludeMessageId: message.id
      });
      const fmtAPIConfig = prepareAPIConfig(apiConfig);
      const response = await PromptHandler.generateChatResponse(
        currentChatId, ctxMsgs, fmtAPIConfig, abortCtrl.signal, characterData
      );

      let fullContent = ''; let buffer = ''; const bufferInt = 50;
      let bufTimer: NodeJS.Timeout | null = null; const updateRegenMsgContent = (chunk: string, isFinal = false) => {
        buffer += chunk;
        // Always clear existing timer and set a new one for responsive streaming
        if (bufTimer) clearTimeout(bufTimer);
        bufTimer = setTimeout(() => {
          const curBuf = buffer; buffer = ''; fullContent += curBuf;
          const filtContent = shouldUseClientFiltering ? filterText(fullContent) : fullContent; setMessages((prevMsgs: Message[]) => prevMsgs.map(msg => {
            if (msg.id === message.id) {
              const newVars = [...origVariations, filtContent];
              return {
                ...msg,
                content: filtContent,
                variations: newVars,
                currentVariation: newVars.length - 1,
                role: 'assistant' as const,
                status: isFinal ? 'complete' as const : 'streaming' as const
              };
            } return msg;
          }));
          if (isFinal) setMessages(finalMsgs => { debouncedSave(finalMsgs); return finalMsgs; });
        }, isFinal ? 0 : bufferInt); // Immediate update for final content
      };

      for await (const chunk of PromptHandler.streamResponse(response)) {
        if (abortCtrl.signal.aborted) { console.log('Regen aborted.'); if (bufTimer) clearTimeout(bufTimer); if (buffer.length > 0) updateRegenMsgContent('', true); break; }
        updateRegenMsgContent(chunk);
      }
      if (!abortCtrl.signal.aborted && buffer.length > 0) updateRegenMsgContent('', true);
      const finalMsgs = messagesRef.current.map(msg => {
        if (msg.id === message.id) {
          const finalFiltContent = shouldUseClientFiltering ? filterText(fullContent) : fullContent;
          const newVars = [...origVariations, finalFiltContent];
          return {
            ...msg,
            content: finalFiltContent,
            variations: newVars,
            currentVariation: newVars.length - 1,
            role: 'assistant' as const,
            status: 'complete' as const
          };
        } return msg;
      });
      saveChat(finalMsgs);

      // Auto-retry on empty response
      if (!abortCtrl.signal.aborted && fullContent.trim().length === 0) {
        if (retryCount < 2) {
          console.warn(`Empty response detected during regen, retrying (attempt ${retryCount + 1})...`);
          const msgToRegen = finalMsgs.find(m => m.id === message.id) || message;
          await regenerateMessage(msgToRegen, retryCount + 1);
          return;
        } else {
          console.error("Empty response received after max retries (regen)");
          setError("Received empty response from the model. Please try again.");
        }
      }

      setLastContextWindow((prev: any) => ({ ...prev, type: 'message_regenerated', regeneratedMessageId: message.id }));
    } catch (err) {
      if (!abortCtrl.signal.aborted) handleGenerationError(err, message.id);
      else {
        console.log("Regen aborted, reverting.");
        setMessages(prevMsgs => prevMsgs.map(m => m.id === message.id ? { ...m, content: origContent, variations: origVariations, currentVariation: origVarIdx, role: 'assistant' } : m));
        saveChat(messagesRef.current);
      }
    } finally {
      if (!abortCtrl.signal.aborted) { setIsGenerating(false); setGeneratingId(null); }
      currentGenerationRef.current = null;
    }
  }, [characterData, apiConfig, prepareAPIConfig, shouldUseClientFiltering, filterText, handleGenerationError, currentChatId, saveChat]);

  const generateResponse = useCallback(async (prompt: string, retryCount: number = 0) => {
    if (!characterData) { setError('No character data for response.'); return; }

    let effectiveChatId = currentChatId;
    if (!effectiveChatId) {
      console.log("No currentChatId, creating new chat for response.");
      if (createNewChatRef.current) {
        effectiveChatId = await createNewChatRef.current(); // Get the chat ID directly from the function
        if (!effectiveChatId && !messagesRef.current.find(m => m.role === 'assistant')) { // Still no ID and no initial message
          console.error("Failed to establish chat session for response.");
          setError("Failed to establish chat. Try creating a new chat.");
          return;
        }
      } else { setError("Chat creation fn not available."); return; }
    }
    if (!effectiveChatId) { setError("Failed to get valid chat ID for response."); return; }

    const userMsg = MessageUtils.createUserMessage(prompt);

    // Add to UI state
    const msgWithId = { ...userMsg, id: userMsg.id || crypto.randomUUID() };
    setMessages((prev: Message[]) => [...prev, msgWithId]);

    // Persist directly with known-good chat ID (fixes closure stale state bug)
    try {
      console.debug(`Appending user msg ${msgWithId.id} to chat ${effectiveChatId}`);
      await ChatStorage.appendMessage(effectiveChatId, msgWithId);
    } catch (err) {
      console.error('Failed to persist user message:', err);
    }
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg = MessageUtils.createAssistantMessage('', assistantMsgId);
    setMessages((prev: Message[]) => [...prev, assistantMsg]);
    setIsGenerating(true); setGeneratingId(assistantMsgId); setError(null);

    const abortCtrl = new AbortController(); currentGenerationRef.current = abortCtrl; try {
      // Build context using shared utility - handles async state bug
      const ctxMsgs = buildContextMessages({
        existingMessages: messagesRef.current,
        newUserMessage: userMsg,
        excludeMessageId: assistantMsgId
      });
      const fmtAPIConfig = prepareAPIConfig(apiConfig);
      const response = await PromptHandler.generateChatResponse(
        effectiveChatId, ctxMsgs, fmtAPIConfig, abortCtrl.signal, characterData
      );

      let fullContent = '';
      let buffer = '';
      // Use a fixed buffer interval for consistent streaming
      const bufferInterval = 50; // 50ms buffer for smooth streaming

      let bufTimer: NodeJS.Timeout | null = null; const updateAssistantMsgContent = (chunk: string, isFinal = false) => {
        buffer += chunk;

        // Always clear existing timer and set a new one for responsive streaming
        if (bufTimer) clearTimeout(bufTimer);
        bufTimer = setTimeout(() => {
          const curBuf = buffer;
          buffer = '';
          fullContent += curBuf;
          const filtContent = shouldUseClientFiltering ? filterText(fullContent) : fullContent;            // Update the UI with the new content
          setMessages((prevMsgs: Message[]) => {
            const updatedMsgs = prevMsgs.map((msg: Message) =>
              msg.id === assistantMsgId ? {
                ...msg,
                content: filtContent,
                variations: [filtContent],
                currentVariation: 0,
                status: 'streaming' as const
              } : msg
            );
            return updatedMsgs;
          });

          if (isFinal) {
            setMessages(finalMsgs => { debouncedSave(finalMsgs); return finalMsgs; });
          }
        }, isFinal ? 0 : bufferInterval); // Immediate update for final content
      }; for await (const chunk of PromptHandler.streamResponse(response)) {
        if (abortCtrl.signal.aborted) {
          console.log('Gen aborted by user.');
          if (bufTimer) clearTimeout(bufTimer);
          if (buffer.length > 0) updateAssistantMsgContent('', true);
          break;
        }
        updateAssistantMsgContent(chunk);
      }
      if (!abortCtrl.signal.aborted && buffer.length > 0) updateAssistantMsgContent('', true);

      // Update the message status to complete and apply to React state
      const finalMsgs = messagesRef.current.map(msg => msg.id === assistantMsgId ? {
        ...msg,
        content: shouldUseClientFiltering ? filterText(fullContent) : fullContent,
        status: 'complete' as const
      } : msg);
      setMessages(finalMsgs); // Apply the final status update to React state
      saveChat(finalMsgs);

      // Auto-retry on empty response
      if (!abortCtrl.signal.aborted && fullContent.trim().length === 0) {
        if (retryCount < 2) {
          console.warn(`Empty response detected, retrying (attempt ${retryCount + 1})...`);
          const msgToRegen = finalMsgs.find(m => m.id === assistantMsgId);
          if (msgToRegen) {
            await regenerateMessage(msgToRegen, retryCount + 1);
            return;
          }
        } else {
          console.error("Empty response received after max retries");
          setError("Received empty response from the model. Please try again.");
        }
      }

      setLastContextWindow((curWin: any) => ({ ...curWin, type: 'response_generated', lastPrompt: prompt, responseLength: fullContent.length }));
    } catch (err) {
      if (!abortCtrl.signal.aborted) handleGenerationError(err, assistantMsgId); else {
        console.log("Gen aborted, error handling skipped.");
        const finalMsgs = messagesRef.current.map(msg => msg.id === assistantMsgId ? { ...msg, content: shouldUseClientFiltering ? filterText(msg.content) : msg.content } : msg);
        saveChat(finalMsgs);
      }
    } finally {
      if (!abortCtrl.signal.aborted) { setIsGenerating(false); setGeneratingId(null); }
      currentGenerationRef.current = null;
    }
  }, [characterData, addMessage, prepareAPIConfig, apiConfig, shouldUseClientFiltering, filterText, handleGenerationError, currentChatId, saveChat, createNewChat, regenerateMessage]);



  const regenerateGreeting = useCallback(async () => {
    if (!characterData || isGenerating) return;

    // Find first assistant message
    const msgs = messagesRef.current;
    const firstAssMsgIdx = msgs.findIndex(m => m.role === 'assistant');
    if (firstAssMsgIdx === -1) {
      console.error("Cannot regenerate greeting: No assistant message found.");
      return;
    }
    const greetingMsg = msgs[firstAssMsgIdx];
    const origContent = greetingMsg.content;
    const origVariations = greetingMsg.variations ? [...greetingMsg.variations] : [origContent];

    setIsGenerating(true); setGeneratingId(greetingMsg.id); setError(null);

    // We don't support aborting this specific call easily since ChatStorage.generateGreetingStream handles it internally or doesn't expose abort signal
    // But we set state to prevent concurrent actions.

    try {
      let fullGreeting = '';

      const result = await ChatStorage.generateGreetingStream(
        characterData,
        apiConfig,
        (chunk) => {
          fullGreeting += chunk;

          setMessages(prevMsgs => prevMsgs.map(msg => {
            if (msg.id === greetingMsg.id) {
              const newVars = [...origVariations, fullGreeting];
              return {
                ...msg,
                content: fullGreeting,
                variations: newVars,
                currentVariation: newVars.length - 1
              };
            }
            return msg;
          }));
        }
      );

      if (result.success && result.greeting) {
        // Final update to ensure consistency and save
        setMessages(prevMsgs => {
          const updatedMsgs = prevMsgs.map(msg => {
            if (msg.id === greetingMsg.id) {
              const newVars = [...origVariations, result.greeting!];
              return {
                ...msg,
                content: result.greeting!,
                variations: newVars,
                currentVariation: newVars.length - 1
              };
            }
            return msg;
          });
          debouncedSave(updatedMsgs);
          return updatedMsgs;
        });
      } else {
        throw new Error(result.message || "Failed to generate new greeting");
      }
    } catch (err) {
      console.error("Error regenerating greeting:", err);
      setError(err instanceof Error ? err.message : 'Failed to regenerate greeting');

      // Revert to original content on error if needed, or just leave the partial generation
      // For now, we leave partial generation as it might be useful, or user can cycle back
    } finally {
      setIsGenerating(false);
      setGeneratingId(null);
    }
  }, [characterData, isGenerating, apiConfig, debouncedSave]);

  const continueResponse = useCallback(async (message: Message) => {
    if (!characterData || message.role !== 'assistant' || !message.content) return;
    if (!currentChatId) { setError("Cannot continue: No active chat."); return; }

    const msgIdx = messagesRef.current.findIndex(m => m.id === message.id);
    if (msgIdx === -1) return; const origContent = message.content;

    setIsGenerating(true); setGeneratingId(message.id); setError(null);
    const abortCtrl = new AbortController(); currentGenerationRef.current = abortCtrl;

    let appendedContent = ''; // Declare here to be available in catch block

    try {
      const ctxMsgs = messagesRef.current.slice(0, msgIdx + 1)
        .filter(msg => msg.role !== 'thinking')
        .map(msg => ({
          role: (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'system') as 'user' | 'assistant' | 'system',
          content: msg.id === message.id ? origContent : msg.content
        }));

      // Get the last part of the message to help the model identify where to continue
      const lastPart = origContent.slice(-100);
      const continuationPrompt = {
        role: 'system' as const,
        content: `The assistant's response was cut off. The last part was: "...${lastPart}"
Continue the response from exactly that point. Do not repeat the existing text. Do not start a new paragraph unless necessary.`
      };

      ctxMsgs.push(continuationPrompt);

      const fmtAPIConfig = prepareAPIConfig(apiConfig); const response = await PromptHandler.generateChatResponse(
        currentChatId, ctxMsgs, fmtAPIConfig, abortCtrl.signal, characterData
      );

      let buffer = ''; const bufferInt = 50;
      let bufTimer: NodeJS.Timeout | null = null; const updateContinueMsgContent = (chunk: string, isFinal = false) => {
        buffer += chunk;
        // Always clear existing timer and set a new one for responsive streaming
        if (bufTimer) clearTimeout(bufTimer);
        bufTimer = setTimeout(() => {
          const curBuf = buffer; buffer = ''; appendedContent += curBuf;
          const combinedContent = origContent + appendedContent; const filtContent = shouldUseClientFiltering ? filterText(combinedContent) : combinedContent;
          setMessages(prevMsgs => prevMsgs.map(msg => {
            if (msg.id === message.id) {
              const newVars = msg.variations ? [...msg.variations] : [origContent];
              newVars[msg.currentVariation ?? newVars.length - 1] = filtContent;
              return { ...msg, content: filtContent, variations: newVars };
            } return msg;
          }));
          if (isFinal) setMessages(finalMsgs => { debouncedSave(finalMsgs); return finalMsgs; });
        }, isFinal ? 0 : bufferInt); // Immediate update for final content
      };

      for await (const chunk of PromptHandler.streamResponse(response)) {
        if (abortCtrl.signal.aborted) { console.log('Continuation aborted.'); if (bufTimer) clearTimeout(bufTimer); if (buffer.length > 0) updateContinueMsgContent('', true); break; }
        updateContinueMsgContent(chunk);
      } if (!abortCtrl.signal.aborted && buffer.length > 0) updateContinueMsgContent('', true);

      const finalMsgs = messagesRef.current.map(msg => {
        if (msg.id === message.id) {
          const finalCombined = origContent + appendedContent;
          const finalFilt = shouldUseClientFiltering ? filterText(finalCombined) : finalCombined;
          const newVars = msg.variations ? [...msg.variations] : [origContent];
          newVars[msg.currentVariation ?? newVars.length - 1] = finalFilt;
          return { ...msg, content: finalFilt, variations: newVars };
        } return msg;
      });
      saveChat(finalMsgs);
    } catch (err) {
      if (!abortCtrl.signal.aborted) handleGenerationError(err, message.id);
      else {
        console.log("Continuation aborted, saving current."); const finalMsgs = messagesRef.current.map(msg => {
          if (msg.id === message.id) {
            const finalCombined = origContent + appendedContent;
            const finalFilt = shouldUseClientFiltering ? filterText(finalCombined) : finalCombined;
            const newVars = msg.variations ? [...msg.variations] : [origContent];
            newVars[msg.currentVariation ?? newVars.length - 1] = finalFilt;
            return { ...msg, content: finalFilt, variations: newVars };
          } return msg;
        });
        saveChat(finalMsgs);
      }
    } finally {
      if (!abortCtrl.signal.aborted) { setIsGenerating(false); setGeneratingId(null); }
      currentGenerationRef.current = null;
    }
  }, [characterData, apiConfig, prepareAPIConfig, shouldUseClientFiltering, filterText, handleGenerationError, currentChatId, saveChat]);

  const stopGeneration = useCallback(() => {
    if (currentGenerationRef.current) {
      currentGenerationRef.current.abort();
      console.log('Gen stop requested.');
      setIsGenerating(false); setGeneratingId(null);
      saveChat(messagesRef.current);
      setLastContextWindow((prev: any) => ({ ...prev, type: 'generation_stopped', timestamp: new Date().toISOString() }));
    }
  }, [saveChat]);

  const cycleVariation = useCallback((messageId: string, direction: 'next' | 'prev') => {
    setMessages(prevMsgs => {
      const updatedMsgs = prevMsgs.map(msg => {
        if (msg.id === messageId && msg.variations && msg.variations.length > 1) {
          let curIdx = msg.currentVariation ?? msg.variations.length - 1;
          curIdx = direction === 'next' ? (curIdx + 1) % msg.variations.length : (curIdx - 1 + msg.variations.length) % msg.variations.length;
          return { ...msg, content: msg.variations[curIdx], currentVariation: curIdx };
        } return msg;
      });
      saveChat(updatedMsgs);
      return updatedMsgs;
    });
  }, [saveChat]);

  const setCurrentUserHandler = useCallback((user: UserProfile | null) => {
    setCurrentUser(user); ChatStorage.saveCurrentUser(user);
  }, []);

  const loadExistingChat = useCallback(async (chatIdToLoad: string) => {
    if (!characterData) { setError("No char data to load chat."); return; }
    console.log(`Loading existing chat: ${chatIdToLoad}`);
    setIsLoading(true); setError(null); setCurrentChatId(null);
    autoSaveEnabled.current = false;

    try {
      // Load chat using database-centric API
      const apiResponse = await fetch('/api/reliable-load-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_session_uuid: chatIdToLoad,
          character_uuid: characterData.data.character_uuid
        })
      });

      let response;
      if (apiResponse.ok) {
        const contentType = apiResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            response = await apiResponse.json();
          } catch (jsonError) {
            console.error('Failed to parse JSON response:', jsonError);
            response = { success: false, error: 'Invalid JSON response from server' };
          }
        } else {
          console.error('Expected JSON response but received:', contentType);
          response = { success: false, error: 'Server returned non-JSON response' };
        }
      } else {
        response = { success: false, error: 'Load failed' };
      }
      // Handle potential data wrapper from backend (DataResponse)
      const sessionData = response.data || response;
      const messages = sessionData.messages || response.messages;

      if (response.success && messages) {
        setMessages(messages);
        const loadedChatSessId = sessionData.chat_session_uuid || sessionData.chatId || chatIdToLoad;
        setCurrentChatId(loadedChatSessId);
        if (sessionData.metadata?.chat_metadata?.lastUser) setCurrentUser(sessionData.metadata.chat_metadata.lastUser);

        let loadedTrigLoreImgs: TriggeredLoreImage[] = [];
        if (sessionData.metadata?.chat_metadata?.triggeredLoreImages) {
          loadedTrigLoreImgs = sessionData.metadata.chat_metadata.triggeredLoreImages;
          setTriggeredLoreImages(loadedTrigLoreImgs);
        } const charImgP = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
          ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
        const newAvailImgs = getAvailableImagesForPreview(charImgP);
        setAvailablePreviewImages(newAvailImgs);

        if (sessionData.metadata?.chat_metadata?.currentDisplayedImage && newAvailImgs.length > 0) {
          const savedDisp = sessionData.metadata.chat_metadata.currentDisplayedImage;
          const foundIdx = newAvailImgs.findIndex(img => img.type === savedDisp.type && (img.type === 'character' || (img.entryId === savedDisp.entryId && img.imageUuid === savedDisp.imageUuid)));
          setCurrentPreviewImageIndex(foundIdx !== -1 ? foundIdx : 0);
        } else { setCurrentPreviewImageIndex(newAvailImgs.length > 0 ? 0 : 0); }

        setLastContextWindow({
          type: 'loaded_specific_chat', timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name, chatId: loadedChatSessId,
          messageCount: messages.length
        });
        setError(null);
      } else {
        console.error('Failed to load specific chat:', response.error);
        setError(response.error || 'Failed to load specified chat.');
        setLastContextWindow({
          type: 'load_specific_chat_failed', timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name, chatId: chatIdToLoad,
          error: response.error || 'Failed to load specified chat.'
        });
      }
    } catch (err) {
      console.error('Error loading existing chat:', err);
      setError(err instanceof Error ? err.message : 'Unexpected error loading chat.');
      setLastContextWindow({
        type: 'load_specific_chat_exception', timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name, chatId: chatIdToLoad,
        error: err instanceof Error ? err.message : 'Unexpected error.'
      });
    } finally { setIsLoading(false); autoSaveEnabled.current = true; }
  }, [characterData]);

  const updateReasoningSettings = useCallback((settings: ReasoningSettings) => {
    setReasoningSettings(settings);
    try { localStorage.setItem('cardshark_reasoning_settings', JSON.stringify(settings)); }
    catch (err) { console.error('Error saving reasoning settings:', err); }
  }, []);

  const navigateToPreviewImage = useCallback((index: number) => {
    if (availablePreviewImages && index >= 0 && index < availablePreviewImages.length) {
      setCurrentPreviewImageIndex(index);
    }
  }, [availablePreviewImages]);
  const trackLoreImages = useCallback((matchedEntries: LoreEntry[], characterUuidFromHook: string) => {
    if (!characterData || characterData.data.character_uuid !== characterUuidFromHook) {
      console.warn("Char mismatch in trackLoreImages or no char data."); return;
    }

    // Process lore entries for image tracking
    processLoreEntriesForImageTracking(matchedEntries, characterUuidFromHook);

    // Get updated available images including character image
    const charImgPath = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
      ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
    const allAvailableImages = getAvailableImagesForPreview(charImgPath);

    setAvailablePreviewImages(allAvailableImages);

    if (currentPreviewImageIndex >= allAvailableImages.length) setCurrentPreviewImageIndex(0);
    else {
      const curImg = availablePreviewImages[currentPreviewImageIndex];
      if (curImg?.type === 'lore') {
        const stillAvail = allAvailableImages.find((img: AvailablePreviewImage) => img.type === 'lore' && img.entryId === curImg.entryId && img.imageUuid === curImg.imageUuid);
        if (!stillAvail) setCurrentPreviewImageIndex(0);
      }
    }
    saveChat(messagesRef.current);
  }, [characterData, currentPreviewImageIndex, availablePreviewImages, saveChat]);

  const clearError = useCallback(() => { setError(null); }, []);

  const contextValue: ChatContextType = {
    messages, isLoading, isGenerating, error, currentUser, lastContextWindow,
    generatingId, reasoningSettings, triggeredLoreImages, availablePreviewImages,
    currentPreviewImageIndex, currentChatId: currentChatId,
    updateMessage, deleteMessage, addMessage, cycleVariation,
    generateResponse, regenerateMessage, regenerateGreeting, continueResponse, stopGeneration,
    setCurrentUser: setCurrentUserHandler, loadExistingChat, createNewChat,
    updateReasoningSettings, navigateToPreviewImage, trackLoreImages,
    resetTriggeredLoreImagesState, clearError,
  };

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
