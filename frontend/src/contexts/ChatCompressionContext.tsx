/**
 * @file ChatCompressionContext.tsx
 * @description Manages compression level, compression state, and compressed context cache.
 * Standalone context with zero dependencies on other chat contexts.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CompressionLevel, CompressedContextCache } from '../services/chat/chatTypes';

interface ChatCompressionContextType {
  compressionLevel: CompressionLevel;
  isCompressing: boolean;
  compressedContextCache: CompressedContextCache | null;
  setCompressionLevel: (level: CompressionLevel) => void;
  invalidateCompressionCache: () => void;
  setIsCompressing: (value: boolean) => void;
  setCompressedContextCache: (cache: CompressedContextCache | null) => void;
}

const ChatCompressionContext = createContext<ChatCompressionContextType | null>(null);

export const ChatCompressionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [compressionLevel, setCompressionLevelState] = useState<CompressionLevel>('none');
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [compressedContextCache, setCompressedContextCache] = useState<CompressedContextCache | null>(null);
  const compressionSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Invalidate compression cache (called when compression level changes or messages are modified)
   */
  const invalidateCompressionCache = useCallback(() => {
    setCompressedContextCache(null);
  }, []);

  /**
   * Set compression level with debounced save to localStorage
   * Invalidates compression cache when level changes
   */
  const setCompressionLevel = useCallback((level: CompressionLevel) => {
    setCompressionLevelState(level);
    invalidateCompressionCache();

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
  }, [invalidateCompressionCache]);

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
    isCompressing,
    compressedContextCache,
    setCompressionLevel,
    invalidateCompressionCache,
    setIsCompressing,
    setCompressedContextCache,
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
