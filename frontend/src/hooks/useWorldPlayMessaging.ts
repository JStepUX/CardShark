import { useCallback } from 'react';
import type {
  WorldPlayMessage,
  WorldPlayMessageAppender,
  WorldPlayMessageSetter,
  WorldPlayMutableMessage,
} from '../worldplay/contracts';

interface UseWorldPlayMessagingOptions {
  messages: WorldPlayMessage[];
  setMessages: (messages: WorldPlayMessage[]) => void;
  addMessage: (message: WorldPlayMessage) => Promise<unknown> | void;
}

interface UseWorldPlayMessagingReturn {
  normalizeWorldPlayMessage: (message: WorldPlayMutableMessage) => WorldPlayMessage;
  setWorldPlayMessages: WorldPlayMessageSetter;
  appendWorldPlayMessage: WorldPlayMessageAppender;
}

export function useWorldPlayMessaging({
  messages,
  setMessages,
  addMessage,
}: UseWorldPlayMessagingOptions): UseWorldPlayMessagingReturn {
  const normalizeWorldPlayMessage = useCallback((message: WorldPlayMutableMessage): WorldPlayMessage => ({
    ...message,
    role: (message.role === 'user' || message.role === 'assistant' || message.role === 'system' || message.role === 'thinking'
      ? message.role
      : 'assistant') as WorldPlayMessage['role'],
    status: message.status as WorldPlayMessage['status'],
    metadata: message.metadata as WorldPlayMessage['metadata'],
  }), []);

  const setWorldPlayMessages: WorldPlayMessageSetter = useCallback((nextMessages) => {
    const resolvedMessages = typeof nextMessages === 'function'
      ? nextMessages(messages)
      : nextMessages;

    setMessages(resolvedMessages.map((message) => normalizeWorldPlayMessage(message)));
  }, [messages, normalizeWorldPlayMessage, setMessages]);

  const appendWorldPlayMessage: WorldPlayMessageAppender = useCallback((message) => {
    void addMessage(normalizeWorldPlayMessage(message));
  }, [addMessage, normalizeWorldPlayMessage]);

  return {
    normalizeWorldPlayMessage,
    setWorldPlayMessages,
    appendWorldPlayMessage,
  };
}
