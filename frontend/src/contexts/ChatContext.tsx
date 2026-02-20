/**
 * @file ChatContext.tsx
 * @description Facade that composes 4 sub-contexts into a single backward-compatible ChatContext.
 * Contains ChatInitializer (renderless component for auto-load + cross-cutting operations)
 * and the backward-compatible useChat() hook.
 *
 * Sub-contexts:
 * - ChatSessionContext: session lifecycle, UUID, settings
 * - ChatMessageContext: messages, CRUD, persistence
 * - ChatCompressionContext: compression level, cache
 * - ChatGenerationContext: generation, streaming, lore images
 */
import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { Message, UserProfile } from '../types/messages';
import { useCharacter } from '../contexts/CharacterContext';
import { ChatStorage } from '../services/chatStorage';
import { MessageUtils } from '../utils/messageUtils';
import {
  TriggeredLoreImage,
  AvailablePreviewImage,
  getAvailableImagesForPreview,
} from '../handlers/loreHandler';
import { LoreEntry, CharacterCard } from '../types/schema';
import { chatService } from '../services/chat/chatService';
import { CompressionLevel, CompressedContextCache } from '../services/chat/chatTypes';

// Sub-context providers and hooks
import { ChatSessionProvider, useChatSession } from './ChatSessionContext';
import { ChatMessageProvider, useChatMessageStore } from './ChatMessageContext';
import { ChatCompressionProvider, useChatCompression } from './ChatCompressionContext';
import { ChatGenerationProvider, useChatGeneration } from './ChatGenerationContext';

interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions?: string;
}

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
  sessionNotes: string;
  sessionName: string;
  compressionLevel: CompressionLevel;
  isCompressing: boolean;
  compressedContextCache: CompressedContextCache | null;
  characterDataOverride: CharacterCard | null;
  setCharacterDataOverride: (characterData: CharacterCard | null) => void;
  updateMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  addMessage: (message: Message) => Promise<{ success: boolean; error?: string }>;
  setMessages: (messages: Message[]) => void;
  cycleVariation: (messageId: string, direction: 'next' | 'prev') => void;
  generateResponse: (prompt: string, retryCount?: number) => Promise<void>;
  regenerateMessage: (message: Message, retryCount?: number) => Promise<void>;
  regenerateGreeting: () => Promise<void>;
  impersonateUser: (partialMessage?: string, onChunk?: (chunk: string) => void) => Promise<{ success: boolean; response?: string; error?: string }>;
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
  setSessionNotes: (notes: string) => void;
  setSessionName: (name: string) => void;
  saveSessionNameNow: (nameOverride?: string) => Promise<void>;
  setCompressionLevel: (level: CompressionLevel) => void;
  invalidateCompressionCache: () => void;
  forkChat: (atMessageIndex: number, bringCount?: number | 'all') => Promise<string | null>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export { ChatContext };

/**
 * Renderless component that handles cross-cutting operations requiring access
 * to all 4 sub-contexts: auto-load, loadExistingChat, createNewChat, forkChat.
 */
const ChatInitializer: React.FC<{
  disableAutoLoad: boolean;
  initialSessionId?: string;
  onReady: (ops: {
    loadExistingChat: (chatId: string) => Promise<void>;
    createNewChat: () => Promise<string | null>;
    forkChat: (atMessageIndex: number, bringCount?: number | 'all') => Promise<string | null>;
  }) => void;
}> = ({ disableAutoLoad, initialSessionId, onReady }) => {
  const { characterData } = useCharacter();
  const session = useChatSession();
  const messageStore = useChatMessageStore();
  const compression = useChatCompression();
  const generation = useChatGeneration();

  /**
   * Load an existing chat by ID
   */
  const loadExistingChat = useCallback(async (chatIdToLoad: string) => {
    if (!characterData) { messageStore.setError("No char data to load chat."); return; }

    const currentCharacterUuid = ChatStorage.getCharacterId(characterData);
    if (!currentCharacterUuid || currentCharacterUuid === 'unknown-character') {
      messageStore.setError('Character is missing a valid UUID. Please re-save the character.');
      return;
    }

    if (session.isLoadingChatRef.current && session.loadingForCharacterRef.current === currentCharacterUuid) {
      return;
    }

    session.isLoadingChatRef.current = true;
    session.loadingForCharacterRef.current = currentCharacterUuid;

    messageStore.setIsLoading(true); messageStore.setError(null);
    session.setCurrentChatId(null);
    compression.setCompressedContextCache(null);
    session.autoSaveDisabledCount.current++;

    try {
      const apiResponse = await fetch('/api/reliable-load-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_session_uuid: chatIdToLoad,
          character_uuid: characterData.data.character_uuid
        })
      });

      let response;
      if (apiResponse.ok) {
        const contentType = apiResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try { response = await apiResponse.json(); }
          catch { response = { success: false, error: 'Invalid JSON response from server' }; }
        } else {
          response = { success: false, error: 'Server returned non-JSON response' };
        }
      } else {
        response = { success: false, error: 'Load failed' };
      }

      const sessionData = response.data || response;
      const messages = sessionData.messages || response.messages;

      if (response.success && messages) {
        messageStore.setMessages(messages);
        const loadedChatSessId = sessionData.chat_session_uuid || sessionData.chatId || chatIdToLoad;
        session.setCurrentChatId(loadedChatSessId);
        if (sessionData.metadata?.chat_metadata?.lastUser) session.setCurrentUser(sessionData.metadata.chat_metadata.lastUser);

        if (sessionData.metadata?.chat_metadata?.triggeredLoreImages) {
          generation.setTriggeredLoreImages(sessionData.metadata.chat_metadata.triggeredLoreImages);
        }

        const charImgP = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
          ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
        const newAvailImgs = getAvailableImagesForPreview(charImgP);
        generation.setAvailablePreviewImages(newAvailImgs);

        if (sessionData.metadata?.chat_metadata?.currentDisplayedImage && newAvailImgs.length > 0) {
          const savedDisp = sessionData.metadata.chat_metadata.currentDisplayedImage;
          const foundIdx = newAvailImgs.findIndex(img => img.type === savedDisp.type && (img.type === 'character' || (img.entryId === savedDisp.entryId && img.imageUuid === savedDisp.imageUuid)));
          generation.setCurrentPreviewImageIndex(foundIdx !== -1 ? foundIdx : 0);
        } else {
          generation.setCurrentPreviewImageIndex(0);
        }

        session.setLastContextWindow({
          type: 'loaded_specific_chat', timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name, chatId: loadedChatSessId,
          messageCount: messages.length
        });
        messageStore.setError(null);
      } else {
        messageStore.setError(response.error || 'Failed to load specified chat.');
        session.setLastContextWindow({
          type: 'load_specific_chat_failed', timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name, chatId: chatIdToLoad,
          error: response.error || 'Failed to load specified chat.'
        });
      }
    } catch (err) {
      console.error('Error loading existing chat:', err);
      messageStore.setError(err instanceof Error ? err.message : 'Unexpected error loading chat.');
      session.setLastContextWindow({
        type: 'load_specific_chat_exception', timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name, chatId: chatIdToLoad,
        error: err instanceof Error ? err.message : 'Unexpected error.'
      });
    } finally {
      messageStore.setIsLoading(false);
      session.autoSaveDisabledCount.current = Math.max(0, session.autoSaveDisabledCount.current - 1);
      session.isLoadingChatRef.current = false;
      session.loadingForCharacterRef.current = null;
    }
  }, [characterData, session, messageStore, compression, generation]);

  /**
   * Create a new chat session
   */
  const createNewChat = useCallback(async (): Promise<string | null> => {
    if (!characterData) return null;

    if (session.isCreatingChatRef.current) {
      return null;
    }

    session.isCreatingChatRef.current = true;
    messageStore.setIsLoading(true); messageStore.setError(null);
    session.setCurrentChatId(null);
    messageStore.setMessages([]);
    compression.setCompressedContextCache(null);
    messageStore.messagesRef.current = [];

    try {
      await ChatStorage.clearContextWindow();
      const newChatResp = await ChatStorage.createNewChat(characterData);
      if (!newChatResp.success || !newChatResp.chat_session_uuid) {
        messageStore.setError(newChatResp.error || 'Failed to create new chat session.');
        messageStore.setIsLoading(false);
        session.isCreatingChatRef.current = false;
        return null;
      }
      const newCId = newChatResp.chat_session_uuid;
      session.setCurrentChatId(newCId);

      let initMsgs: Message[] = [];
      if (characterData.data.first_mes && characterData.data.first_mes.trim()) {
        const charN = characterData.data.name || 'Character';
        const userN = session.currentUser?.name || 'User';
        const subContent = characterData.data.first_mes.replace(/\{\{char\}\}/g, charN).replace(/\{\{user\}\}/g, userN);
        const firstM = MessageUtils.createAssistantMessage(subContent);

        if (characterData.data.alternate_greetings && Array.isArray(characterData.data.alternate_greetings) && characterData.data.alternate_greetings.length > 0) {
          const alternates = characterData.data.alternate_greetings.map(alt =>
            alt.replace(/\{\{char\}\}/g, charN).replace(/\{\{user\}\}/g, userN)
          );
          firstM.variations = [subContent, ...alternates];
          firstM.currentVariation = 0;
        }

        initMsgs = [firstM];
        session.setLastContextWindow({
          type: 'new_chat_first_message', timestamp: new Date().toISOString(),
          characterName: characterData.data?.name || 'Unknown', firstMessage: characterData.data.first_mes, chatId: newCId
        });
      } else {
        session.setLastContextWindow({
          type: 'new_chat_empty', timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name || 'Unknown', chatId: newCId
        });
      }

      if (messageStore.messagesRef.current.length === 0) {
        messageStore.setMessages(initMsgs);
      } else {
        if (initMsgs.length > 0) {
          messageStore.setMessages((prev: Message[]) => [...initMsgs, ...prev]);
        }
      }

      try {
        await fetch('/api/reliable-save-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_session_uuid: newCId,
            messages: messageStore.messagesRef.current.length === 0 ? initMsgs : [...initMsgs, ...messageStore.messagesRef.current],
            title: characterData.data.name ? `Chat with ${characterData.data.name}` : undefined
          })
        });
      } catch (err) {
        console.warn(`Initial save for new chat ${newCId} failed:`, err);
      }

      return newCId;
    } catch (err) {
      console.error('Error creating new chat:', err);
      messageStore.setError(err instanceof Error ? err.message : 'Failed to create new chat');
      session.setLastContextWindow({
        type: 'new_chat_error', timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown',
        error: err instanceof Error ? err.message : 'Failed to create new chat'
      });
      return null;
    } finally {
      messageStore.setIsLoading(false);
      session.isCreatingChatRef.current = false;
    }
  }, [characterData, session, messageStore, compression]);

  /**
   * Fork the current chat at a specific message index
   */
  const forkChat = useCallback(async (atMessageIndex: number, bringCount: number | 'all' = 'all'): Promise<string | null> => {
    if (!characterData?.data?.character_uuid) {
      messageStore.setError('No character selected');
      return null;
    }
    if (!session.currentChatId) {
      messageStore.setError('No active chat to fork');
      return null;
    }
    if (atMessageIndex < 0 || atMessageIndex >= messageStore.messages.length) {
      messageStore.setError('Invalid message index for fork');
      return null;
    }

    let startIndex = 0;
    if (bringCount !== 'all') {
      startIndex = Math.max(0, atMessageIndex - bringCount + 1);
    }

    messageStore.setIsLoading(true);
    messageStore.setError(null);

    try {
      const newChatId = await chatService.forkChat(
        session.currentChatId,
        atMessageIndex,
        characterData.data.character_uuid,
        session.currentUser?.id,
        startIndex
      );

      compression.setCompressedContextCache(null);

      const loadResponse = await ChatStorage.loadChat(newChatId, characterData);
      if (loadResponse.success) {
        const sessionData = loadResponse.data || loadResponse;
        const loadedMessages = sessionData.messages || [];
        messageStore.setMessages(loadedMessages);
        session.setCurrentChatId(newChatId);
        session.setLastContextWindow({
          type: 'forked_chat', timestamp: new Date().toISOString(),
          characterName: characterData.data?.name,
          sourceChatId: session.currentChatId,
          newChatId: newChatId,
          messageCount: loadedMessages.length
        });
      }
      return newChatId;
    } catch (err) {
      console.error('Error forking chat:', err);
      messageStore.setError(err instanceof Error ? err.message : 'Failed to fork chat');
      return null;
    } finally {
      messageStore.setIsLoading(false);
    }
  }, [characterData, session, messageStore, compression]);

  // Expose refs for createNewChat/loadExistingChat
  useEffect(() => {
    session.createNewChatRef.current = createNewChat;
  }, [createNewChat, session]);

  useEffect(() => {
    session.loadExistingChatRef.current = loadExistingChat;
  }, [loadExistingChat, session]);

  // Notify parent of composed operations
  useEffect(() => {
    onReady({ loadExistingChat, createNewChat, forkChat });
  }, [loadExistingChat, createNewChat, forkChat, onReady]);

  /**
   * Auto-load chat session when character is selected
   */
  useEffect(() => {
    if (disableAutoLoad || !characterData?.data?.name) {
      return;
    }

    const currentCharacterFileId = ChatStorage.getCharacterId(characterData);
    if (!currentCharacterFileId || currentCharacterFileId === 'unknown-character') {
      messageStore.setError('Character is missing a valid UUID. Please re-save the character.');
      return;
    }

    const isCharacterChanged = session.lastCharacterId.current !== null && session.lastCharacterId.current !== currentCharacterFileId;

    session.hasMountedRef.current = true;

    if (isCharacterChanged) {
      ChatStorage.clearContextWindow();
    }

    generation.resetTriggeredLoreImagesState();

    async function loadChatForCharacterInternal() {
      if (session.isLoadingChatRef.current) {
        return;
      }
      session.isLoadingChatRef.current = true;
      session.loadingForCharacterRef.current = currentCharacterFileId;

      try {
        messageStore.setIsLoading(true);
        messageStore.setError(null);
        if (!characterData) throw new Error('No character data available');

        if (initialSessionId && session.loadExistingChatRef.current) {
          session.isLoadingChatRef.current = false;
          await session.loadExistingChatRef.current(initialSessionId);
          return;
        }

        const response = await ChatStorage.loadLatestChat(characterData);

        if (session.loadingForCharacterRef.current !== currentCharacterFileId) {
          return;
        }

        const sessionData = response.data || response;
        const messages = sessionData.messages;

        const loadedCharacterUuid = sessionData.metadata?.character_uuid || sessionData.character_uuid;
        if (loadedCharacterUuid && loadedCharacterUuid !== currentCharacterFileId) {
          messageStore.setError('Loaded chat belongs to a different character. Please try again.');
          return;
        }

        if (response.success && messages && Array.isArray(messages) && messages.length > 0) {
          messageStore.setMessages(messages);
          const loadedChatSessionId = sessionData.chat_session_uuid || sessionData.chatId || sessionData.metadata?.chat_metadata?.chat_id || null;
          session.setCurrentChatId(loadedChatSessionId);
          if (sessionData.metadata?.chat_metadata?.lastUser) session.setCurrentUser(sessionData.metadata.chat_metadata.lastUser);

          if (sessionData.metadata?.chat_metadata?.triggeredLoreImages) {
            generation.setTriggeredLoreImages(sessionData.metadata.chat_metadata.triggeredLoreImages);
          }

          const charImgP = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
            ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
          const newAvailImgs = getAvailableImagesForPreview(charImgP);
          generation.setAvailablePreviewImages(newAvailImgs);

          if (sessionData.metadata?.chat_metadata?.currentDisplayedImage && newAvailImgs.length > 0) {
            const savedDisp = sessionData.metadata.chat_metadata.currentDisplayedImage;
            const foundIdx = newAvailImgs.findIndex(img =>
              img.type === savedDisp.type &&
              (img.type === 'character' || (img.entryId === savedDisp.entryId && img.imageUuid === savedDisp.imageUuid))
            );
            generation.setCurrentPreviewImageIndex(foundIdx !== -1 ? foundIdx : 0);
          } else {
            generation.setCurrentPreviewImageIndex(0);
          }

          session.setLastContextWindow({
            type: 'loaded_chat', timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name, chatId: loadedChatSessionId || 'unknown',
            messageCount: messages.length
          });
          messageStore.setError(null);
        } else if (response.isRecoverable || (response.success && (!messages || messages.length === 0))) {
          const charName = characterData?.data?.name || 'Character';
          const uName = session.currentUser?.name || 'User';
          const rawFirstMes = characterData?.data?.first_mes || '';
          const subContent = rawFirstMes.replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, uName);
          const firstMsg = MessageUtils.createAssistantMessage(subContent);

          if (characterData?.data?.alternate_greetings && Array.isArray(characterData.data.alternate_greetings) && characterData.data.alternate_greetings.length > 0) {
            const alternates = characterData.data.alternate_greetings.map(alt =>
              alt.replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, uName)
            );
            firstMsg.variations = [subContent, ...alternates];
            firstMsg.currentVariation = 0;
          }

          messageStore.setMessages([firstMsg]);
          session.setLastContextWindow({
            type: 'initial_message_used', timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name, firstMessage: rawFirstMes || '(empty)',
            originalLoadError: response.error
          });

          const saveOk = await messageStore.saveChat([firstMsg]);
          messageStore.setError(saveOk ? null : "Failed to save initial message.");

          const charImgP = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
            ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
          const defAvail = getAvailableImagesForPreview(charImgP);
          generation.setAvailablePreviewImages(defAvail);
          generation.setCurrentPreviewImageIndex(0);
          generation.setTriggeredLoreImages([]);
        } else {
          const errorMsg = !characterData?.data?.first_mes
            ? 'No greeting message (first_mes) is set for this character. Please add one in the character editor.'
            : (response.error || 'Failed to load chat. Please try creating a new chat.');
          messageStore.setError(errorMsg);
          messageStore.setMessages([]);
          session.setLastContextWindow({
            type: 'load_failed_or_no_fallback', timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name,
            error: response.error || 'Failed to load chat & no initial message.'
          });
        }
      } catch (err) {
        console.error('Unexpected error during chat loading:', err);
        messageStore.setError(err instanceof Error ? err.message : 'Unexpected error loading chat.');
        messageStore.setMessages([]);
        session.setLastContextWindow({
          type: 'unexpected_load_error', timestamp: new Date().toISOString(),
          characterName: characterData?.data?.name,
          error: err instanceof Error ? err.message : 'Unexpected error.'
        });
      } finally {
        messageStore.setIsLoading(false);
        session.lastCharacterId.current = currentCharacterFileId;
        session.isLoadingChatRef.current = false;
        session.loadingForCharacterRef.current = null;
      }
    }

    loadChatForCharacterInternal();

    return () => {
      session.hasMountedRef.current = false;
      session.isLoadingChatRef.current = false;
      session.loadingForCharacterRef.current = null;
    };
  }, [characterData, generation.resetTriggeredLoreImagesState, initialSessionId]);

  return null;
};

/**
 * ChatProvider: Nests all 4 sub-providers and includes ChatInitializer.
 * Backward-compatible wrapper.
 */
export const ChatProvider: React.FC<{
  children: React.ReactNode;
  disableAutoLoad?: boolean;
  initialSessionId?: string;
}> = ({ children, disableAutoLoad = false, initialSessionId }) => {
  // Ref to hold composed operations from ChatInitializer
  const opsRef = React.useRef<{
    loadExistingChat: (chatId: string) => Promise<void>;
    createNewChat: () => Promise<string | null>;
    forkChat: (atMessageIndex: number, bringCount?: number | 'all') => Promise<string | null>;
  } | null>(null);

  const handleReady = useCallback((ops: typeof opsRef.current) => {
    opsRef.current = ops;
  }, []);

  return (
    <ChatSessionProvider>
      <ChatMessageProvider>
        <ChatCompressionProvider>
          <ChatGenerationProvider>
            <ChatInitializer
              disableAutoLoad={disableAutoLoad}
              initialSessionId={initialSessionId}
              onReady={handleReady}
            />
            <ChatContextBridge opsRef={opsRef}>
              {children}
            </ChatContextBridge>
          </ChatGenerationProvider>
        </ChatCompressionProvider>
      </ChatMessageProvider>
    </ChatSessionProvider>
  );
};

/**
 * Bridge component that assembles the backward-compatible ChatContext from all sub-contexts.
 * Must be rendered inside all 4 providers.
 */
const ChatContextBridge: React.FC<{
  children: React.ReactNode;
  opsRef: React.MutableRefObject<{
    loadExistingChat: (chatId: string) => Promise<void>;
    createNewChat: () => Promise<string | null>;
    forkChat: (atMessageIndex: number, bringCount?: number | 'all') => Promise<string | null>;
  } | null>;
}> = ({ children, opsRef }) => {
  const session = useChatSession();
  const messageStore = useChatMessageStore();
  const compressionCtx = useChatCompression();
  const generation = useChatGeneration();

  const loadExistingChat = useCallback(async (chatId: string) => {
    if (opsRef.current) await opsRef.current.loadExistingChat(chatId);
  }, [opsRef]);

  const createNewChat = useCallback(async (): Promise<string | null> => {
    if (opsRef.current) return opsRef.current.createNewChat();
    return null;
  }, [opsRef]);

  const forkChat = useCallback(async (atMessageIndex: number, bringCount?: number | 'all'): Promise<string | null> => {
    if (opsRef.current) return opsRef.current.forkChat(atMessageIndex, bringCount);
    return null;
  }, [opsRef]);

  const contextValue: ChatContextType = {
    // Session
    currentChatId: session.currentChatId,
    currentUser: session.currentUser,
    sessionNotes: session.sessionNotes,
    sessionName: session.sessionName,
    characterDataOverride: session.characterDataOverride,
    lastContextWindow: session.lastContextWindow,
    setCurrentUser: session.setCurrentUser,
    setSessionNotes: session.setSessionNotes,
    setSessionName: session.setSessionName,
    saveSessionNameNow: session.saveSessionNameNow,
    setCharacterDataOverride: session.setCharacterDataOverride,

    // Messages
    messages: messageStore.messages,
    isLoading: messageStore.isLoading,
    error: messageStore.error,
    setMessages: messageStore.setMessages as (messages: Message[]) => void,
    updateMessage: messageStore.updateMessage,
    deleteMessage: messageStore.deleteMessage,
    addMessage: messageStore.addMessage,
    cycleVariation: messageStore.cycleVariation,
    clearError: messageStore.clearError,

    // Compression
    compressionLevel: compressionCtx.compressionLevel,
    isCompressing: compressionCtx.isCompressing,
    compressedContextCache: compressionCtx.compressedContextCache,
    setCompressionLevel: compressionCtx.setCompressionLevel,
    invalidateCompressionCache: compressionCtx.invalidateCompressionCache,

    // Generation
    isGenerating: generation.isGenerating,
    generatingId: generation.generatingId,
    reasoningSettings: generation.reasoningSettings,
    triggeredLoreImages: generation.triggeredLoreImages,
    availablePreviewImages: generation.availablePreviewImages,
    currentPreviewImageIndex: generation.currentPreviewImageIndex,
    generateResponse: generation.generateResponse,
    regenerateMessage: generation.regenerateMessage,
    regenerateGreeting: generation.regenerateGreeting,
    impersonateUser: generation.impersonateUser,
    continueResponse: generation.continueResponse,
    stopGeneration: generation.stopGeneration,
    updateReasoningSettings: generation.updateReasoningSettings,
    navigateToPreviewImage: generation.navigateToPreviewImage,
    trackLoreImages: generation.trackLoreImages,
    resetTriggeredLoreImagesState: generation.resetTriggeredLoreImagesState,

    // Cross-cutting operations
    loadExistingChat,
    createNewChat,
    forkChat,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
