/**
 * @file ChatCompressionContext.tsx
 * @description Manages compression level setting.
 * Standalone context with zero dependencies on other chat contexts.
 *
 * Note: Compression execution moved to backend (Phase 2). This context now
 * only tracks the user's compression level preference, which is sent to the
 * backend in the generation payload for field expiration and compression decisions.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CompressionLevel } from '../services/chat/chatTypes';

interface ChatCompressionContextType {
  compressionLevel: CompressionLevel;
  setCompressionLevel: (level: CompressionLevel) => void;
}

const ChatCompressionContext = createContext<ChatCompressionContextType | null>(null);

export const ChatCompressionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [compressionLevel, setCompressionLevelState] = useState<CompressionLevel>('none');
  const compressionSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Set compression level with debounced save to localStorage
   */
  const setCompressionLevel = useCallback((level: CompressionLevel) => {
    setCompressionLevelState(level);

    if (compressionSaveTimerRef.current) {
      clearTimeout(compressionSaveTimerRef.current);
    }

    compressionSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem('cardshark_compression_level', level);
      } catch (error) {
        console.error('Failed to save compression level:', error);
      }
    }, 1500);
  }, []);

  /**
   * Load global compression level on mount
   */
  useEffect(() => {
    try {
      const savedLevel = localStorage.getItem('cardshark_compression_level') as CompressionLevel | null;
      if (savedLevel && ['none', 'chat_only', 'chat_dialogue', 'aggressive'].includes(savedLevel)) {
        setCompressionLevelState(savedLevel);
      }
    } catch (error) {
      console.error('Failed to load compression level:', error);
    }
  }, []);

  const contextValue: ChatCompressionContextType = {
    compressionLevel,
    setCompressionLevel,
  };

  return (
    <ChatCompressionContext.Provider value={contextValue}>
      {children}
    </ChatCompressionContext.Provider>
  );
};

export const useChatCompression = (): ChatCompressionContextType => {
  const context = useContext(ChatCompressionContext);
  if (!context) throw new Error('useChatCompression must be used within a ChatCompressionProvider');
  return context;
};

export { ChatCompressionContext };
