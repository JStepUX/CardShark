// Hook utilities for optional provider access
// These hooks return null/default values when providers aren't available

import { useContext } from 'react';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { ChatContext } from '../contexts/ChatContext';

/**
 * Optional API Config hook - returns null when provider isn't available
 */
export const useOptionalAPIConfig = () => {
  const context = useContext(APIConfigContext);
  return context || null;
};

/**
 * Optional Chat hook - returns null when provider isn't available
 */
export const useOptionalChat = () => {
  const context = useContext(ChatContext);
  return context; // ChatContext is already typed as ChatContextType | null
};
