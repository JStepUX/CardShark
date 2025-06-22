/**
 * useMessageState.ts
 * 
 * Manages message state for chat conversations including:
 * - Message array operations (CRUD)
 * - Generation state tracking
 * - Error state management
 * - Streaming updates with race condition prevention
 * 
 * Extracted from useChatMessages.ts as part of Phase 1.3 refactoring
 */

import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { 
  Message, 
  UserProfile,
  MessageCreationParams
} from '../../services/chat/chatTypes';
import { 
  sanitizeMessageContent,
  createUserMessage,
  createAssistantMessage,
  createThinkingMessage
} from '../../services/chat/chatUtils';

// Internal state interface for message management
interface MessageState {
  messages: Message[];
  isGenerating: boolean;
  generatingId: string | null;
  error: string | null;
}

// Parameters for message operations
interface MessageOperationParams {
  chatSessionUuid: string | null;
  currentUser: UserProfile | null;
  autoSaveEnabled: boolean;
  isGenericAssistant: boolean;
}

// Hook configuration options
interface UseMessageStateOptions {
  onSaveRequired?: (messages: Message[]) => void;
  enableAutoSave?: boolean;
}

// Return type for the hook
export interface UseMessageStateReturn {
  // State values
  messages: Message[];
  isGenerating: boolean;
  generatingId: string | null;
  error: string | null;
  
  // Message CRUD operations
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (messageId: string) => void;
  
  // Generation state management
  setGenerationState: (generating: boolean, messageId?: string | null) => void;
  
  // Content update operations
  updateMessageContent: (messageId: string, content: string, isStreaming?: boolean) => void;
  appendToMessage: (messageId: string, chunk: string) => void;
  
  // Bulk operations
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  
  // Error management
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Message creation helpers
  createAndAddUserMessage: (content: string, params?: Partial<MessageCreationParams>) => Message;
  createAndAddAssistantMessage: (content: string, status?: Message['status']) => Message;
  createAndAddThinkingMessage: (content: string) => Message;
  
  // Variation management
  updateMessageVariations: (messageId: string, variations: string[], currentIndex?: number) => void;
  
  // Status management
  updateMessageStatus: (messageId: string, status: Message['status']) => void;
  
  // Filtering utilities
  getVisibleMessages: () => Message[];
  getMessageById: (messageId: string) => Message | undefined;
}

/**
 * Custom hook for managing chat message state
 * 
 * Provides atomic operations for message management with proper race condition prevention
 * and type safety. Handles streaming updates, generation state, and error management.
 */
export function useMessageState(
  operationParams: MessageOperationParams,
  options: UseMessageStateOptions = {}
): UseMessageStateReturn {
  
  const { onSaveRequired, enableAutoSave = true } = options;
  
  // Core message state
  const [state, setState] = useState<MessageState>(() => ({
    messages: [],
    isGenerating: false,
    generatingId: null,
    error: null
  }));
  
  // Refs to prevent stale closures in async operations
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Helper function to trigger save when needed
  const triggerSaveIfNeeded = useCallback((messages: Message[]) => {
    if (!enableAutoSave || operationParams.isGenericAssistant || !operationParams.chatSessionUuid) {
      return;
    }
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      onSaveRequired?.(messages);
    }, 500); // Debounce saves
  }, [enableAutoSave, operationParams.isGenericAssistant, operationParams.chatSessionUuid, onSaveRequired]);
  
  // Core message operations with atomic updates
  const addMessage = useCallback((message: Message) => {
    setState(prev => {
      const newMessages = [...prev.messages, message];
      triggerSaveIfNeeded(newMessages);
      return { ...prev, messages: newMessages };
    });
  }, [triggerSaveIfNeeded]);
  
  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setState(prev => {
      let messageFound = false;
      const newMessages = prev.messages.map(msg => {
        if (msg.id === messageId) {
          messageFound = true;
          return { ...msg, ...updates };
        }
        return msg;
      });
      
      if (!messageFound) {
        console.warn(`[useMessageState] Message with ID ${messageId} not found for update`);
        return prev;
      }
      
      triggerSaveIfNeeded(newMessages);
      return { ...prev, messages: newMessages };
    });
  }, [triggerSaveIfNeeded]);
  
  const deleteMessage = useCallback((messageId: string) => {
    setState(prev => {
      const newMessages = prev.messages.filter(msg => msg.id !== messageId);
      triggerSaveIfNeeded(newMessages);
      toast.info("Message deleted.");
      return { ...prev, messages: newMessages };
    });
  }, [triggerSaveIfNeeded]);
  
  // Generation state management with atomic updates
  const setGenerationState = useCallback((generating: boolean, messageId?: string | null) => {
    setState(prev => ({
      ...prev,
      isGenerating: generating,
      generatingId: generating ? (messageId ?? null) : null
    }));
  }, []);
  
  // Content update operations optimized for streaming
  const updateMessageContent = useCallback((messageId: string, content: string, isStreaming = false) => {
    setState(prev => {
      // Race condition prevention - only update if we're generating the right message
      if (isStreaming && (!prev.isGenerating || prev.generatingId !== messageId)) {
        return prev;
      }
      
      let messageFound = false;
      const newMessages = prev.messages.map(msg => {
        if (msg.id === messageId) {
          messageFound = true;
          const sanitizedContent = isStreaming ? content : sanitizeMessageContent(content);
          const updatedMessage: Message = {
            ...msg,
            content: sanitizedContent,
            status: isStreaming ? 'streaming' : 'complete'
          };
          
          // Update variations if not streaming
          if (!isStreaming) {
            updatedMessage.variations = [sanitizedContent];
            updatedMessage.currentVariation = 0;
          }
          
          return updatedMessage;
        }
        return msg;
      });
      
      if (!messageFound) {
        console.warn(`[useMessageState] Message with ID ${messageId} not found for content update`);
        return prev;
      }
      
      if (!isStreaming) {
        triggerSaveIfNeeded(newMessages);
      }
      
      return { ...prev, messages: newMessages };
    });
  }, [triggerSaveIfNeeded]);
  
  const appendToMessage = useCallback((messageId: string, chunk: string) => {
    setState(prev => {
      // Race condition prevention for streaming
      if (!prev.isGenerating || prev.generatingId !== messageId) {
        return prev;
      }
      
      let messageFound = false;
      const newMessages = prev.messages.map(msg => {
        if (msg.id === messageId) {
          messageFound = true;
          return {
            ...msg,
            content: msg.content + chunk,
            status: 'streaming' as Message['status']
          };
        }
        return msg;
      });
      
      if (!messageFound) {
        console.warn(`[useMessageState] Message with ID ${messageId} not found for chunk append`);
        return prev;
      }
      
      return { ...prev, messages: newMessages };
    });
  }, []);
  
  // Bulk operations
  const setMessages = useCallback((messages: Message[]) => {
    setState(prev => ({ ...prev, messages }));
  }, []);
  
  const clearMessages = useCallback(() => {
    setState(prev => ({ ...prev, messages: [] }));
  }, []);
  
  // Error management
  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);
  
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);
    // Message creation helpers that add to state
  const createAndAddUserMessage = useCallback((content: string, params?: Partial<MessageCreationParams>) => {
    const message = createUserMessage(content);
    // Apply any additional parameters after creation
    if (params) {
      Object.assign(message, params);
    }
    addMessage(message);
    return message;
  }, [addMessage]);
  
  const createAndAddAssistantMessage = useCallback((content: string, status: Message['status'] = 'complete') => {
    const message = createAssistantMessage(content, status);
    addMessage(message);
    return message;
  }, [addMessage]);
    const createAndAddThinkingMessage = useCallback((content: string) => {
    const message = createThinkingMessage();
    // Set the content after creation since the function doesn't accept parameters
    message.content = content;
    addMessage(message);
    return message;
  }, [addMessage]);
  
  // Variation management
  const updateMessageVariations = useCallback((
    messageId: string, 
    variations: string[], 
    currentIndex?: number
  ) => {
    const sanitizedVariations = variations.map(sanitizeMessageContent);
    const safeCurrentIndex = currentIndex !== undefined ? currentIndex : sanitizedVariations.length - 1;
    
    updateMessage(messageId, {
      variations: sanitizedVariations,
      currentVariation: Math.max(0, Math.min(safeCurrentIndex, sanitizedVariations.length - 1)),
      content: sanitizedVariations[safeCurrentIndex] || ''
    });
  }, [updateMessage]);
  
  // Status management
  const updateMessageStatus = useCallback((messageId: string, status: Message['status']) => {
    updateMessage(messageId, { status });
  }, [updateMessage]);
  
  // Filtering utilities
  const getVisibleMessages = useCallback(() => {
    return state.messages.filter(msg => msg.role !== 'thinking');
  }, [state.messages]);
  
  const getMessageById = useCallback((messageId: string) => {
    return state.messages.find(msg => msg.id === messageId);
  }, [state.messages]);
  
  // Cleanup on unmount
  useState(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  });
  
  return {
    // State values
    messages: state.messages,
    isGenerating: state.isGenerating,
    generatingId: state.generatingId,
    error: state.error,
    
    // Message CRUD operations
    addMessage,
    updateMessage,
    deleteMessage,
    
    // Generation state management
    setGenerationState,
    
    // Content update operations
    updateMessageContent,
    appendToMessage,
    
    // Bulk operations
    setMessages,
    clearMessages,
    
    // Error management
    setError,
    clearError,
    
    // Message creation helpers
    createAndAddUserMessage,
    createAndAddAssistantMessage,
    createAndAddThinkingMessage,
    
    // Variation management
    updateMessageVariations,
    
    // Status management
    updateMessageStatus,
    
    // Filtering utilities
    getVisibleMessages,
    getMessageById
  };
}
