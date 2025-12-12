// Enhanced Chat Session Manager
// Provides consistent chat session lifecycle management with navigation-aware auto-save

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChatStorage } from '../../services/chatStorage';
import { Message, UserProfile } from '../../services/chat/chatTypes';
import { CharacterData } from '../../contexts/CharacterContext';
import { generateUUID } from '../../utils/generateUUID';
import { createAssistantMessage, DEFAULT_ASSISTANT_CHARACTER } from '../../services/chat/chatUtils';

// Enhanced session state
export interface EnhancedChatSessionState {
  chatSessionUuid: string | null;
  currentUser: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  lastSavedMessages: Message[];
  isDirty: boolean; // Track if changes need saving
  lastActivity: number;
}

// Enhanced session management interface
export interface UseEnhancedChatSessionReturn {
  // State
  chatSessionUuid: string | null;
  currentUser: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  isDirty: boolean;
  
  // Session operations
  ensureChatSession: () => Promise<string | null>;
  createNewSession: (preserveCurrent?: boolean) => Promise<string | null>;
  loadExistingSession: (characterData: CharacterData) => Promise<{
    sessionUuid: string;
    messages: Message[];
  } | null>;
  clearSession: () => void;
  
  // Auto-save operations
  markDirty: (messages: Message[]) => void;
  saveIfDirty: () => Promise<boolean>;
  forceNavigationSave: () => Promise<boolean>;
  
  // User management
  setCurrentUser: (user: UserProfile | null) => void;
  
  // Error handling
  clearError: () => void;
}

/**
 * Enhanced chat session management with navigation-aware auto-save
 * Provides Slack/Discord-like behavior for chat persistence
 */
export function useEnhancedChatSession(
  characterData: CharacterData | null,
  isGenericAssistant: boolean = false,
  currentMessages: Message[] = []
): UseEnhancedChatSessionReturn {
    const location = useLocation();
  const effectiveCharacterData = characterData || DEFAULT_ASSISTANT_CHARACTER;
  
  // Initialize state with current user from storage
  const [state, setState] = useState<EnhancedChatSessionState>(() => {
    const storedUser = ChatStorage.getCurrentUser();
    return {
      chatSessionUuid: null,
      currentUser: storedUser,
      isLoading: false,
      error: null,
      lastSavedMessages: [],
      isDirty: false,
      lastActivity: Date.now()
    };
  });
    // Refs for stable references
  const hasInitializedSession = useRef<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingRef = useRef<boolean>(false);
  const lastLocationRef = useRef<string>(location.pathname);
  const currentSessionUuidRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>(currentMessages);
  const isDirtyRef = useRef<boolean>(false);
  const isGenericAssistantRef = useRef<boolean>(isGenericAssistant);
  
  // Update refs when values change
  useEffect(() => {
    messagesRef.current = currentMessages;
    currentSessionUuidRef.current = state.chatSessionUuid;
    isDirtyRef.current = state.isDirty;
    isGenericAssistantRef.current = isGenericAssistant;
  }, [currentMessages, state.chatSessionUuid, state.isDirty, isGenericAssistant]);
  
  /**
   * Auto-save with debouncing
   */
  const performAutoSave = useCallback(async (messages: Message[], sessionUuid: string | null) => {
    if (isGenericAssistant || !sessionUuid || !effectiveCharacterData?.data?.name) {
      return false;
    }
    
    try {
      console.log(`[EnhancedChatSession] Auto-saving ${messages.length} messages for session ${sessionUuid}`);
      
      // Save chat using database-centric API
      const response = await fetch('/api/reliable-save-chat', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_session_uuid: sessionUuid,
          messages: messages,
          title: effectiveCharacterData.data?.name ? `Chat with ${effectiveCharacterData.data.name}` : undefined
        })
      });
      
      const result = response.ok ? await response.json() : { success: false, error: 'Save failed' };
      
      if (result.success) {
        setState(prev => ({
          ...prev,
          lastSavedMessages: [...messages],
          isDirty: false,
          lastActivity: Date.now()
        }));
        console.log(`[EnhancedChatSession] Auto-save successful`);
        return true;
      } else {
        console.error(`[EnhancedChatSession] Auto-save failed:`, result.error);
        return false;
      }
    } catch (error) {
      console.error(`[EnhancedChatSession] Auto-save error:`, error);
      return false;
    }
  }, [isGenericAssistant, effectiveCharacterData, state.currentUser]);
  
  /**
   * Mark session as dirty and schedule auto-save
   */
  const markDirty = useCallback((messages: Message[]) => {
    if (isGenericAssistant) return;
    
    setState(prev => ({
      ...prev,
      isDirty: true,
      lastActivity: Date.now()
    }));
    
    // Clear existing timeout and schedule new one
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      const sessionUuid = currentSessionUuidRef.current;
      if (sessionUuid) {
        performAutoSave(messages, sessionUuid);
      }
    }, 2000); // 2 second debounce
  }, [isGenericAssistant, performAutoSave]);
  
  /**
   * Save if there are unsaved changes
   */
  const saveIfDirty = useCallback(async (): Promise<boolean> => {
    if (!state.isDirty || isGenericAssistant || !state.chatSessionUuid) {
      return true;
    }
    
    const currentMessages = messagesRef.current;
    return await performAutoSave(currentMessages, state.chatSessionUuid);
  }, [state.isDirty, state.chatSessionUuid, isGenericAssistant, performAutoSave]);
  
  /**
   * Force save for navigation scenarios
   */
  const forceNavigationSave = useCallback(async (): Promise<boolean> => {
    if (isGenericAssistant || !state.chatSessionUuid) {
      return true;
    }
    
    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    console.log(`[EnhancedChatSession] Force saving for navigation`);
    const currentMessages = messagesRef.current;
    
    try {
      const result = await performAutoSave(currentMessages, state.chatSessionUuid);
      if (result) {
        console.log(`[EnhancedChatSession] Navigation save successful`);
      } else {
        console.warn(`[EnhancedChatSession] Navigation save failed, but allowing navigation`);
      }
      return result;
    } catch (error) {
      console.error(`[EnhancedChatSession] Navigation save error:`, error);
      return false;
    }
  }, [isGenericAssistant, state.chatSessionUuid, performAutoSave]);
  
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
    // Clear any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    setState(prev => ({
      ...prev,
      chatSessionUuid: null,
      isLoading: false,
      error: null,
      lastSavedMessages: [],
      isDirty: false
    }));
    hasInitializedSession.current = false;
  }, []);
  
  /**
   * Create a new chat session
   */
  const createNewSession = useCallback(async (preserveCurrent: boolean = true): Promise<string | null> => {
    if (!effectiveCharacterData?.data?.character_uuid) {
      setState(prev => ({ ...prev, error: "No character data available for new session" }));
      return null;
    }
    
    // Save current session if needed and requested
    if (preserveCurrent && state.chatSessionUuid && state.isDirty) {
      console.log(`[EnhancedChatSession] Preserving current chat before creating new session`);
      await saveIfDirty();
    }
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log(`[EnhancedChatSession] Creating new session for character: ${effectiveCharacterData.data.name}`);
      
      const result = await ChatStorage.createNewChat(effectiveCharacterData);
      
      if (result.success && result.chat_session_uuid) {
        console.log(`[EnhancedChatSession] New session created: ${result.chat_session_uuid}`);
        
        setState(prev => ({
          ...prev,
          chatSessionUuid: result.chat_session_uuid,
          isLoading: false,
          lastSavedMessages: [],
          isDirty: false,
          lastActivity: Date.now()
        }));
        
        hasInitializedSession.current = true;
        return result.chat_session_uuid;
      } else {
        const errorMsg = result.error || 'Failed to create new session';
        console.error(`[EnhancedChatSession] Session creation failed:`, errorMsg);
        setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
        return null;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error creating session';
      console.error(`[EnhancedChatSession] Session creation error:`, error);
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      return null;
    }
  }, [effectiveCharacterData, state.chatSessionUuid, state.isDirty, saveIfDirty]);
  
  /**
   * Load an existing session for a character
   */
  const loadExistingSession = useCallback(async (targetCharacterData: CharacterData): Promise<{
    sessionUuid: string;
    messages: Message[];
  } | null> => {
    if (!targetCharacterData?.data?.character_uuid) {
      setState(prev => ({ ...prev, error: "Character data not available for loading" }));
      return null;
    }
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log(`[EnhancedChatSession] Loading latest chat for character: ${targetCharacterData.data.name}`);
      
      const result = await ChatStorage.loadLatestChat(targetCharacterData);
      
      if (result && result.success && result.chat_session_uuid) {
        let messages: Message[] = [];
        
        // Process loaded messages or create first message
        if (result.messages && result.messages.length > 0) {
          messages = result.messages.map((msg: any) => ({
            ...msg,
            id: msg.id || generateUUID(),
            timestamp: msg.timestamp || Date.now(),
            status: msg.status || 'complete'
          }));
        } else if (targetCharacterData.data.first_mes) {
          // Create initial greeting if no messages but character has greeting
          messages = [createAssistantMessage(targetCharacterData.data.first_mes, 'complete')];
        }
        
        setState(prev => ({
          ...prev,
          chatSessionUuid: result.chat_session_uuid,
          isLoading: false,
          lastSavedMessages: [...messages],
          isDirty: false,
          lastActivity: Date.now()
        }));
        
        hasInitializedSession.current = true;
        
        console.log(`[EnhancedChatSession] Loaded session ${result.chat_session_uuid} with ${messages.length} messages`);
        
        return {
          sessionUuid: result.chat_session_uuid,
          messages
        };
      } else if (result && result.isRecoverable && result.first_mes_available) {
        // No chat found but can create new one
        console.log(`[EnhancedChatSession] No existing chat found, will create new session`);
        const newSessionUuid = await createNewSession(false);
        
        if (newSessionUuid && targetCharacterData.data.first_mes) {
          const initialMessages = [createAssistantMessage(targetCharacterData.data.first_mes, 'complete')];
          return {
            sessionUuid: newSessionUuid,
            messages: initialMessages
          };
        }
        return null;
      } else {
        // Non-recoverable error
        const errorMsg = result?.error || 'Failed to load chat session';
        console.error(`[EnhancedChatSession] Session load failed:`, errorMsg);
        setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
        return null;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error loading session';
      console.error(`[EnhancedChatSession] Session load error:`, error);
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      return null;
    }
  }, [createNewSession]);
  
  /**
   * Ensure a chat session exists (load existing or create new)
   */
  const ensureChatSession = useCallback(async (): Promise<string | null> => {
    if (state.chatSessionUuid && hasInitializedSession.current) {
      return state.chatSessionUuid;
    }
    
    if (isGenericAssistant) {
      // Generic assistant doesn't need persistent sessions
      const tempUuid = generateUUID();
      setState(prev => ({ ...prev, chatSessionUuid: tempUuid }));
      hasInitializedSession.current = true;
      return tempUuid;
    }
    
    if (!effectiveCharacterData?.data?.character_uuid) {
      setState(prev => ({ ...prev, error: "No character data available for session" }));
      return null;
    }
    
    try {
      // Try to load existing session first
      const sessionData = await loadExistingSession(effectiveCharacterData);
      if (sessionData) {
        return sessionData.sessionUuid;
      }
      
      // If no existing session, create new one
      return await createNewSession(false);
    } catch (error) {
      console.error(`[EnhancedChatSession] Error ensuring session:`, error);
      return null;
    }
  }, [state.chatSessionUuid, isGenericAssistant, effectiveCharacterData, loadExistingSession, createNewSession]);
  
  // Navigation detection and auto-save
  useEffect(() => {
    const currentPath = location.pathname;
    const previousPath = lastLocationRef.current;
    
    // If we're navigating away from chat and have unsaved changes
    if (previousPath !== currentPath && previousPath === '/chat' && state.isDirty) {
      console.log(`[EnhancedChatSession] Navigation detected from ${previousPath} to ${currentPath}, auto-saving...`);
      isNavigatingRef.current = true;
      
      // Immediately save without waiting for debounce
      forceNavigationSave().then((success) => {
        if (success) {
          console.log(`[EnhancedChatSession] Navigation auto-save completed successfully`);
        } else {
          console.warn(`[EnhancedChatSession] Navigation auto-save failed`);
        }
        isNavigatingRef.current = false;
      });
    }
    
    lastLocationRef.current = currentPath;
  }, [location.pathname, state.isDirty, forceNavigationSave]);
  
  // Page unload protection
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (state.isDirty && !isGenericAssistant && state.chatSessionUuid) {
        // Attempt synchronous save (limited by browser)
        const message = 'You have unsaved chat messages. Are you sure you want to leave?';
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && state.isDirty) {
        // Page is being hidden (tab switch, minimize, etc.)
        forceNavigationSave();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isDirty, state.chatSessionUuid, isGenericAssistant, forceNavigationSave]);
    // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Final save attempt if dirty - use refs to avoid stale closures
      if (isDirtyRef.current && currentSessionUuidRef.current && !isGenericAssistantRef.current) {
        // This is fire-and-forget since component is unmounting
        performAutoSave(messagesRef.current, currentSessionUuidRef.current).catch(console.error);
      }
    };
  }, []); // Empty deps - only on unmount, using refs for current values
  
  return {
    // State
    chatSessionUuid: state.chatSessionUuid,
    currentUser: state.currentUser,
    isLoading: state.isLoading,
    error: state.error,
    isDirty: state.isDirty,
    
    // Session operations
    ensureChatSession,
    createNewSession,
    loadExistingSession,
    clearSession,
    
    // Auto-save operations
    markDirty,
    saveIfDirty,
    forceNavigationSave,
    
    // User management
    setCurrentUser,
    
    // Error handling
    clearError
  };
}
