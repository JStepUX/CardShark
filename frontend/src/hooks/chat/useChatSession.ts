// useChatSession.ts - Chat session lifecycle management
import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ChatStorage } from '../../services/chatStorage';
import { generateUUID } from '../../utils/generateUUID';
import { 
  Message, 
  UserProfile
} from '../../services/chat/chatTypes';
import { 
  createAssistantMessage,
  DEFAULT_ASSISTANT_CHARACTER 
} from '../../services/chat/chatUtils';
import { CharacterData } from '../../contexts/CharacterContext';

// Session state interface
export interface ChatSessionState {
  chatSessionUuid: string | null;
  currentUser: UserProfile | null;
  isLoading: boolean;
  error: string | null;
}

// Session management hook interface
export interface UseChatSessionReturn {
  // State
  chatSessionUuid: string | null;
  currentUser: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  
  // Session operations
  ensureChatSession: () => Promise<string | null>;
  createNewSession: () => Promise<string | null>;
  loadExistingSession: (characterData: CharacterData) => Promise<{
    sessionUuid: string;
    messages: Message[];
  } | null>;
  clearSession: () => void;
  
  // User management
  setCurrentUser: (user: UserProfile | null) => void;
  
  // Error handling
  clearError: () => void;
}

/**
 * Chat session management hook
 * Handles session lifecycle, user management, and session persistence
 */
export function useChatSession(
  characterData: CharacterData | null,
  isGenericAssistant: boolean = false
): UseChatSessionReturn {
  
  const effectiveCharacterData = characterData || DEFAULT_ASSISTANT_CHARACTER;
  
  // Initialize state with current user from storage
  const [state, setState] = useState<ChatSessionState>(() => {
    const storedUser = ChatStorage.getCurrentUser();
    return {
      chatSessionUuid: null,
      currentUser: storedUser,
      isLoading: false,
      error: null
    };
  });
  
  // Track initialization state
  const hasInitializedSession = useRef<boolean>(false);
  
  /**
   * Clear any error state
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);
  
  /**
   * Set the current user and persist to storage
   */
  const setCurrentUser = useCallback((user: UserProfile | null) => {
    ChatStorage.saveCurrentUser(user);
    setState(prev => ({ ...prev, currentUser: user }));
  }, []);
  
  /**
   * Clear the current session
   */
  const clearSession = useCallback(() => {
    setState(prev => ({
      ...prev,
      chatSessionUuid: null,
      isLoading: false,
      error: null
    }));
    hasInitializedSession.current = false;
  }, []);
  
  /**
   * Create a new chat session
   */
  const createNewSession = useCallback(async (): Promise<string | null> => {
    // For generic assistant, don't create persistent sessions
    if (isGenericAssistant) {
      const tempUuid = generateUUID();
      setState(prev => ({
        ...prev,
        chatSessionUuid: tempUuid,
        isLoading: false,
        error: null
      }));
      return tempUuid;
    }
    
    if (!effectiveCharacterData?.data) {
      console.error("createNewSession: Cannot create session, character data is missing.");
      toast.error("Cannot start chat: Character data not available.");
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Character data not available."
      }));
      return null;
    }
    
    console.log("createNewSession: Creating new chat session.");
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const newChatResult = await ChatStorage.createNewChat(effectiveCharacterData);
      
      const extractedUuid = newChatResult?.chat_session_uuid || newChatResult?.data?.chat_session_uuid;
      
      if (newChatResult && newChatResult.success && extractedUuid) {
        const newUuid = extractedUuid;
        
        setState(prev => ({
          ...prev,
          chatSessionUuid: newUuid,
          isLoading: false,
          error: null
        }));
        
        toast.info("New chat session started.");
        hasInitializedSession.current = true;
        return newUuid;
      } else {
        console.error('createNewSession: Failed to create new chat session:', newChatResult?.error);
        const errorMsg = newChatResult?.error || 'Unknown error creating session';
        toast.error(`Failed to start chat: ${errorMsg}`);
        
        setState(prev => ({
          ...prev,
          error: errorMsg,
          isLoading: false
        }));
        return null;
      }
    } catch (err) {
      console.error("Exception in createNewSession:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Exception creating new chat: ${errorMsg}`);
      
      setState(prev => ({
        ...prev,
        error: errorMsg,
        isLoading: false
      }));
      return null;
    }
  }, [effectiveCharacterData, isGenericAssistant]);
  
  /**
   * Load existing chat session for a character
   */
  const loadExistingSession = useCallback(async (
    targetCharacterData: CharacterData
  ): Promise<{ sessionUuid: string; messages: Message[] } | null> => {
    
    if (isGenericAssistant) {
      // Generic assistant doesn't have persistent sessions
      clearSession();
      return null;
    }
    
    if (!targetCharacterData?.data) {
      console.error("loadExistingSession: Character data is missing.");
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Character data not available."
      }));
      return null;
    }
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log(`[loadExistingSession] Loading latest chat for character: ${targetCharacterData.data.name}`);
      
      const result = await ChatStorage.loadLatestChat(targetCharacterData);
      
      if (result && result.success && result.chat_session_uuid) {
        const sessionUuid = result.chat_session_uuid;
        let messages: Message[] = [];
        
        // Process loaded messages or create first message
        if (result.messages && result.messages.length > 0) {
          messages = result.messages.map((msg: any) => ({
            ...msg,
            status: msg.status || 'complete'
          }));
        } else if (targetCharacterData.data.first_mes) {
          // Create initial assistant message if no messages exist
          messages = [createAssistantMessage(targetCharacterData.data.first_mes, 'complete')];
        }
        
        setState(prev => ({
          ...prev,
          chatSessionUuid: sessionUuid,
          isLoading: false,
          error: null
        }));
        
        console.log(`[loadExistingSession] Successfully loaded chat session: ${sessionUuid}`);
        hasInitializedSession.current = true;
        
        return {
          sessionUuid,
          messages
        };
        
      } else if (result && !result.success && result.error) {
        // Check if this is a recoverable error (no chat history found)
        const isRecoverable = result.error.toLowerCase().includes('no chat') || 
                            result.error.toLowerCase().includes('not found') ||
                            result.error.toLowerCase().includes('history');
        
        if (isRecoverable) {
          console.warn(`[loadExistingSession] No existing chat found for ${targetCharacterData.data.name}, will create new session.`);
          toast.info(`No prior chat history found for ${targetCharacterData.data.name}. Starting a new chat.`);
          
          // Attempt to create new session
          const newSessionUuid = await createNewSession();
          if (newSessionUuid) {
            const initialMessages = targetCharacterData.data.first_mes 
              ? [createAssistantMessage(targetCharacterData.data.first_mes, 'complete')]
              : [];
            
            return {
              sessionUuid: newSessionUuid,
              messages: initialMessages
            };
          }
          return null;
        } else {
          // Non-recoverable error
          console.error("[loadExistingSession] Error loading latest chat:", result.error);
          toast.error(`Error loading chat: ${result.error}`);
          
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: result.error
          }));
          
          hasInitializedSession.current = true;
          return null;
        }
      } else {
        console.error("[loadExistingSession] Unexpected result format:", result);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: "Unexpected response format"
        }));
        return null;
      }
      
    } catch (err) {
      console.error("[loadExistingSession] Exception loading latest chat:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Exception loading chat: ${errorMsg}`);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMsg
      }));
      
      hasInitializedSession.current = true;
      return null;
    }
  }, [isGenericAssistant, createNewSession]);
  
  /**
   * Ensure a chat session exists, creating one if necessary
   */
  const ensureChatSession = useCallback(async (): Promise<string | null> => {
    // If we already have a session, return it
    if (state.chatSessionUuid) {
      return state.chatSessionUuid;
    }
    
    // For generic assistant, create temporary session
    if (isGenericAssistant) {
      return await createNewSession();
    }
    
    // For character chats, create persistent session
    if (!effectiveCharacterData?.data) {
      console.error("ensureChatSession: Cannot create chat, character data is missing.");
      toast.error("Cannot start chat: Character data not available.");
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Character data not available."
      }));
      return null;
    }
    
    console.log("ensureChatSession: No chatSessionUuid, attempting to create a new chat.");
    return await createNewSession();
  }, [state.chatSessionUuid, effectiveCharacterData, isGenericAssistant, createNewSession]);
  
  return {
    // State
    chatSessionUuid: state.chatSessionUuid,
    currentUser: state.currentUser,
    isLoading: state.isLoading,
    error: state.error,
    
    // Session operations
    ensureChatSession,
    createNewSession,
    loadExistingSession,
    clearSession,
    
    // User management
    setCurrentUser,
    
    // Error handling
    clearError
  };
}
