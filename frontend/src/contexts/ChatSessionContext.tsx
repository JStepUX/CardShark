/**
 * @file ChatSessionContext.tsx
 * @description Manages chat session lifecycle: currentChatId, user, session settings,
 * characterDataOverride, lastContextWindow, and all session-related refs.
 * Consumes only useSettings() from external contexts.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { UserProfile } from '../types/messages';
import { CharacterCard } from '../types/schema';
import { ChatStorage } from '../services/chatStorage';
import { chatService, SessionSettings } from '../services/chat/chatService';
import { useSettings } from '../contexts/SettingsContext';

interface ChatSessionContextType {
  currentChatId: string | null;
  currentUser: UserProfile | null;
  sessionNotes: string;
  sessionName: string;
  characterDataOverride: CharacterCard | null;
  lastContextWindow: any;
  setCurrentChatId: (id: string | null) => void;
  setCurrentUser: (user: UserProfile | null) => void;
  setSessionNotes: (notes: string) => void;
  setSessionName: (name: string) => void;
  saveSessionNameNow: (nameOverride?: string) => Promise<void>;
  setCharacterDataOverride: (characterData: CharacterCard | null) => void;
  setLastContextWindow: (value: any) => void;
  // Refs exposed for cross-cutting operations
  hasMountedRef: React.MutableRefObject<boolean>;
  lastCharacterId: React.MutableRefObject<string | null>;
  isLoadingChatRef: React.MutableRefObject<boolean>;
  loadingForCharacterRef: React.MutableRefObject<string | null>;
  autoSaveDisabledCount: React.MutableRefObject<number>;
  isCreatingChatRef: React.MutableRefObject<boolean>;
  settingsRef: React.MutableRefObject<any>;
  createNewChatRef: React.MutableRefObject<(() => Promise<string | null>) | null>;
  loadExistingChatRef: React.MutableRefObject<((chatId: string) => Promise<void>) | null>;
}

const ChatSessionContext = createContext<ChatSessionContextType | null>(null);

export const ChatSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentUser, setCurrentUserState] = useState<UserProfile | null>(() => ChatStorage.getCurrentUser());
  const [sessionNotes, setSessionNotesState] = useState<string>('');
  const [sessionName, setSessionNameState] = useState<string>('');
  const [characterDataOverride, setCharacterDataOverride] = useState<CharacterCard | null>(null);
  const [lastContextWindow, setLastContextWindow] = useState<any>(null);

  // Session refs
  const hasMountedRef = useRef(false);
  const lastCharacterId = useRef<string | null>(null);
  const isLoadingChatRef = useRef(false);
  const loadingForCharacterRef = useRef<string | null>(null);
  const autoSaveDisabledCount = useRef(0);
  const isCreatingChatRef = useRef(false);
  const createNewChatRef = useRef<(() => Promise<string | null>) | null>(null);
  const loadExistingChatRef = useRef<((chatId: string) => Promise<void>) | null>(null);

  // Session settings save infrastructure
  const settingsSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const settingsSaveRetryCountRef = useRef<number>(0);

  // Context window persistence
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

  /**
   * Debounced session settings save with retry logic
   */
  const saveSessionSettings = useCallback(async (
    chatSessionUuid: string,
    sessionSettings: Partial<SessionSettings>,
    retryCount: number = 0
  ) => {
    try {
      await chatService.updateSessionSettings(chatSessionUuid, sessionSettings);
      settingsSaveRetryCountRef.current = 0;
    } catch (error) {
      console.warn(`Failed to save session settings (attempt ${retryCount + 1}):`, error);
      if (retryCount < 2) {
        const delayMs = 1000 * Math.pow(2, retryCount);
        setTimeout(() => {
          saveSessionSettings(chatSessionUuid, sessionSettings, retryCount + 1);
        }, delayMs);
      } else {
        console.error('Failed to save session settings after 3 attempts:', error);
      }
    }
  }, []);

  /**
   * Set session notes with debounced save
   */
  const setSessionNotes = useCallback((notes: string) => {
    setSessionNotesState(notes);
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
    }
    if (currentChatId) {
      settingsSaveTimerRef.current = setTimeout(() => {
        saveSessionSettings(currentChatId, { session_notes: notes || null });
      }, 1500);
    }
  }, [currentChatId, saveSessionSettings]);

  /**
   * Set session name (title) - local state only, no auto-save
   */
  const setSessionName = useCallback((name: string) => {
    setSessionNameState(name);
  }, []);

  /**
   * Manually save session name immediately
   */
  const saveSessionNameNow = useCallback(async (nameOverride?: string) => {
    const nameToSave = nameOverride !== undefined ? nameOverride : sessionName;
    if (currentChatId && nameToSave !== undefined) {
      await saveSessionSettings(currentChatId, { title: nameToSave || null });
    }
  }, [currentChatId, sessionName, saveSessionSettings]);

  const setCurrentUser = useCallback((user: UserProfile | null) => {
    setCurrentUserState(user);
    ChatStorage.saveCurrentUser(user);
  }, []);

  /**
   * Load session settings when chat session changes
   */
  useEffect(() => {
    const loadSessionSettings = async () => {
      if (!currentChatId) {
        setSessionNotesState('');
        setSessionNameState('');
        return;
      }
      try {
        const loadedSettings = await chatService.getSessionSettings(currentChatId);
        setSessionNotesState(loadedSettings.session_notes || '');
        setSessionNameState(loadedSettings.title || '');
      } catch (error) {
        console.error('Failed to load session settings:', error);
        setSessionNotesState('');
        setSessionNameState('');
      }
    };
    loadSessionSettings();
    return () => {
      if (settingsSaveTimerRef.current) {
        clearTimeout(settingsSaveTimerRef.current);
        settingsSaveTimerRef.current = null;
      }
    };
  }, [currentChatId]);

  const contextValue: ChatSessionContextType = {
    currentChatId,
    currentUser,
    sessionNotes,
    sessionName,
    characterDataOverride,
    lastContextWindow,
    setCurrentChatId,
    setCurrentUser,
    setSessionNotes,
    setSessionName,
    saveSessionNameNow,
    setCharacterDataOverride,
    setLastContextWindow,
    hasMountedRef,
    lastCharacterId,
    isLoadingChatRef,
    loadingForCharacterRef,
    autoSaveDisabledCount,
    isCreatingChatRef,
    settingsRef,
    createNewChatRef,
    loadExistingChatRef,
  };

  return (
    <ChatSessionContext.Provider value={contextValue}>
      {children}
    </ChatSessionContext.Provider>
  );
};

export const useChatSession = (): ChatSessionContextType => {
  const context = useContext(ChatSessionContext);
  if (!context) throw new Error('useChatSession must be used within a ChatSessionProvider');
  return context;
};

export { ChatSessionContext };
