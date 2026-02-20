/**
 * @file ChatMessageContext.tsx
 * @description Manages messages array, CRUD operations, persistence (saveChat, debouncedSave, appendMessage).
 * Consumes useChatSession() for currentChatId and autoSaveDisabledCount.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Message } from '../types/messages';
import { useCharacter } from '../contexts/CharacterContext';
import { ChatStorage } from '../services/chatStorage';
import { MessageUtils } from '../utils/messageUtils';
import { useChatSession } from './ChatSessionContext';

interface ChatMessageContextType {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  messagesRef: React.MutableRefObject<Message[]>;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  addMessage: (message: Message) => Promise<{ success: boolean; error?: string }>;
  cycleVariation: (messageId: string, direction: 'next' | 'prev') => void;
  clearError: () => void;
  saveChat: (messageList: Message[]) => Promise<boolean>;
  debouncedSave: (msgs: Message[]) => void;
}

const ChatMessageContext = createContext<ChatMessageContextType | null>(null);

export const ChatMessageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { characterData } = useCharacter();
  const { currentChatId, setCurrentChatId, autoSaveDisabledCount } = useChatSession();

  const [messages, setMessagesState] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>(messages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Wrapper to allow both direct set and updater function
  const setMessages = useCallback((update: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesState(update as Message[]);
  }, []);

  const saveChat = useCallback(async (messageList: Message[]) => {
    if (!characterData?.data?.name || autoSaveDisabledCount.current > 0) {
      return false;
    }

    let chatToSaveId = currentChatId;

    try {
      if (!chatToSaveId) {
        if (!characterData) {
          setError('Cannot create new chat session: No character selected.');
          return false;
        }
        const newChatResponse = await ChatStorage.createNewChat(characterData);
        if (newChatResponse.success && newChatResponse.chat_session_uuid) {
          chatToSaveId = newChatResponse.chat_session_uuid;
          setCurrentChatId(chatToSaveId);
        } else {
          setError(newChatResponse.error || 'Failed to create new chat session.');
          return false;
        }
      }

      const response = await fetch('/api/reliable-save-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_session_uuid: chatToSaveId,
          messages: messageList,
          title: characterData.data.name ? `Chat with ${characterData.data.name}` : undefined
        })
      });

      const result = response.ok ? await response.json() : { success: false, error: 'Save failed' };
      const data = result?.data || result;

      if (result?.success) {
        const returnedId = data?.chat_session_uuid || data?.chatId;
        if (returnedId && returnedId !== chatToSaveId) {
          setCurrentChatId(returnedId);
        }
      }
      return result?.success || false;
    } catch (err) {
      console.error('Error saving chat:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during save.');
      return false;
    }
  }, [characterData, currentChatId, setCurrentChatId, autoSaveDisabledCount]);

  const debouncedSave = MessageUtils.createDebouncedSave(
    (msgs: Message[]): Promise<boolean> => saveChat(msgs).catch(e => { console.error("Debounced saveChat err:", e); throw e; }), 500
  );

  const appendMessage = useCallback(async (message: Message): Promise<{ success: boolean; message: Message | null; error?: string }> => {
    if (!characterData?.data?.name) {
      return { success: false, message: null, error: 'No character data' };
    }
    if (!currentChatId) {
      const err = 'No active chat session.';
      setError(err);
      return { success: false, message: null, error: err };
    }

    try {
      const msgToAppend = { ...message, id: message.id || crypto.randomUUID(), timestamp: message.timestamp || Date.now() };
      const result = await ChatStorage.appendMessage(currentChatId, msgToAppend);
      if (!result?.success) {
        const err = result?.error || "Failed to append message.";
        setError(err);
        return { success: false, message: msgToAppend, error: err };
      }
      return { success: true, message: msgToAppend };
    } catch (err) {
      console.error('Error appending message:', err);
      const errorMsg = err instanceof Error ? err.message : "Failed to append message.";
      setError(errorMsg);
      return { success: false, message: null, error: errorMsg };
    }
  }, [characterData, currentChatId]);

  const updateMessage = useCallback((messageId: string, content: string) => {
    setMessagesState((prev: Message[]) => {
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
    setMessagesState((prev: Message[]) => {
      const updatedMsgs = prev.filter(msg => msg.id !== messageId);
      debouncedSave(updatedMsgs);
      return updatedMsgs;
    });
  }, [debouncedSave]);

  const addMessage = useCallback(async (message: Message): Promise<{ success: boolean; error?: string }> => {
    const msgWithId = { ...message, id: message.id || crypto.randomUUID() };

    setMessagesState((prev: Message[]) => [...prev, msgWithId]);
    messagesRef.current = [...messagesRef.current, msgWithId];

    if (message.role === 'user') {
      if (currentChatId) {
        const result = await appendMessage(msgWithId);
        if (!result.success) {
          console.error('Failed to persist message, removing from state:', result.error);
          setMessagesState((prev: Message[]) => prev.filter(m => m.id !== msgWithId.id));
          messagesRef.current = messagesRef.current.filter(m => m.id !== msgWithId.id);
          return { success: false, error: result.error };
        }
        return { success: true };
      } else {
        debouncedSave(messagesRef.current);
        return { success: true };
      }
    }

    return { success: true };
  }, [debouncedSave, appendMessage, currentChatId]);

  const cycleVariation = useCallback((messageId: string, direction: 'next' | 'prev') => {
    setMessagesState(prevMsgs => {
      const updatedMsgs = prevMsgs.map(msg => {
        if (msg.id === messageId && msg.variations && msg.variations.length > 1) {
          let curIdx = msg.currentVariation ?? msg.variations.length - 1;
          curIdx = direction === 'next' ? (curIdx + 1) % msg.variations.length : (curIdx - 1 + msg.variations.length) % msg.variations.length;
          return { ...msg, content: msg.variations[curIdx], currentVariation: curIdx };
        }
        return msg;
      });
      saveChat(updatedMsgs);
      return updatedMsgs;
    });
  }, [saveChat]);

  const clearError = useCallback(() => { setError(null); }, []);

  const contextValue: ChatMessageContextType = {
    messages,
    isLoading,
    error,
    messagesRef,
    setMessages,
    setIsLoading,
    setError,
    updateMessage,
    deleteMessage,
    addMessage,
    cycleVariation,
    clearError,
    saveChat,
    debouncedSave,
  };

  return (
    <ChatMessageContext.Provider value={contextValue}>
      {children}
    </ChatMessageContext.Provider>
  );
};

export const useChatMessageStore = (): ChatMessageContextType => {
  const context = useContext(ChatMessageContext);
  if (!context) throw new Error('useChatMessageStore must be used within a ChatMessageProvider');
  return context;
};

export { ChatMessageContext };
