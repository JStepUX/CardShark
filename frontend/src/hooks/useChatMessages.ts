// useChatMessages.ts - refactored as thin wrapper around ChatContext
import { useEffect, useRef } from 'react';
import { CharacterData } from '../contexts/CharacterContext';
import { useChat } from '../contexts/ChatContext';
import { ChatStorage } from '../services/chatStorage';

export function useChatMessages(characterData: CharacterData | null) {
  const chat = useChat(); // Use the central chat context
  const lastCharacterId = useRef<string | null>(null);
  
  // Handle character changes
  useEffect(() => {
    if (!characterData?.data?.name) return;
    
    const currentCharId = ChatStorage.getCharacterId(characterData);
    if (currentCharId === lastCharacterId.current) return;
    
    if (lastCharacterId.current !== null) {
      ChatStorage.clearContextWindow();
    }
    
    console.log('Character changed, loading chat for:', characterData.data.name);
    loadChatForCharacter();
    
    // Function to load character's chat - using methods from ChatContext
    async function loadChatForCharacter() {
      try {
        // This could call a method in the context if needed for special logic
        // For now, just pass through to loadExistingChat() with appropriate setup
        if (characterData?.data?.first_mes) {
          lastCharacterId.current = currentCharId;
        }
      } catch (err) {
        console.error('Chat loading error:', err);
      }
    }
  }, [characterData, chat.loadExistingChat]);
  
  // Return all the same properties and methods as before
  // but now they're just passthroughs to the ChatContext
  return {
    messages: chat.messages,
    isLoading: chat.isLoading,
    isGenerating: chat.isGenerating,
    error: chat.error,
    currentUser: chat.currentUser,
    lastContextWindow: chat.lastContextWindow,
    generatingId: chat.generatingId,
    reasoningSettings: chat.reasoningSettings,
    updateMessage: chat.updateMessage,
    deleteMessage: chat.deleteMessage,
    addMessage: chat.addMessage,
    generateResponse: chat.generateResponse,
    regenerateMessage: chat.regenerateMessage,
    cycleVariation: chat.cycleVariation,
    stopGeneration: chat.stopGeneration,
    setCurrentUser: chat.setCurrentUser,
    loadExistingChat: chat.loadExistingChat,
    clearError: chat.clearError,
    updateReasoningSettings: chat.updateReasoningSettings
  };
}