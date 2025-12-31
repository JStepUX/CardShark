// frontend/src/components/WorkshopPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import { useChat } from '../contexts/ChatContext';
import { usePrompts } from '../hooks/usePrompts';
import { StandardPromptKey } from '../types/promptTypes';
import ChatInputArea from './chat/ChatInputArea';
import ChatBubble from './chat/ChatBubble';

interface WorkshopPanelProps {
  onClose: () => void;
}

const WorkshopPanel: React.FC<WorkshopPanelProps> = ({ onClose }) => {
  const { characterData } = useCharacter();
  const {
    messages,
    isGenerating,
    currentUser,
    generateResponse,
    setCharacterDataOverride,
    error,
    clearError
  } = useChat();
  const { getPrompt, getDefaultPrompt } = usePrompts();

  const [isInitialized, setIsInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize workshop session on mount
  useEffect(() => {
    const initWorkshop = async () => {
      if (!characterData || isInitialized) return;

      console.log('Initializing workshop session for:', characterData.data.name);

      // Get workshop prompt from settings (or use default)
      const workshopPrompt = getPrompt(StandardPromptKey.WORKSHOP_PROMPT) ||
        getDefaultPrompt(StandardPromptKey.WORKSHOP_PROMPT);

      // Override system prompt for workshop mode
      // Note: We don't override first_mes because we don't want to use it at all
      const workshopCharacter = {
        ...characterData,
        data: {
          ...characterData.data,
          system_prompt: workshopPrompt
        }
      };
      setCharacterDataOverride(workshopCharacter);

      // Don't create a chat session - Workshop doesn't need one
      // The chat context will handle message state without persisting
      setIsInitialized(true);

      console.log('Workshop session initialized successfully');
    };

    initWorkshop();

    // Cleanup: reset character override on unmount
    return () => {
      console.log('Cleaning up workshop session');
      setCharacterDataOverride(null);
    };
  }, [characterData, isInitialized, setCharacterDataOverride, getPrompt, getDefaultPrompt]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isGenerating) return;
    await generateResponse(text);
  };

  return (
    <div className="h-full flex flex-col bg-stone-900 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex justify-between items-center border-b border-stone-800">
        <div>
          <h2 className="text-lg font-semibold">Character Workshop</h2>
          <p className="text-sm text-gray-400">
            Collaborate with AI to develop {characterData?.data?.name || 'your character'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-stone-800 transition-colors"
          title="Close workshop"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-900/50 text-red-200 rounded-lg">
            <div className="flex justify-between items-center">
              <span>{error}</span>
              <button
                onClick={clearError}
                className="ml-2 text-sm underline hover:text-red-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {!isInitialized && messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-2"></div>
              <div>Initializing workshop session...</div>
            </div>
          </div>
        )}

        {/* Initial Greeting - shown when initialized but no messages yet */}
        {isInitialized && messages.length === 0 && (
          <div className="flex justify-start mb-4">
            <div className="max-w-[80%] bg-stone-800 rounded-lg p-4 shadow-md">
              <div className="text-sm text-gray-400 mb-1">Workshop Assistant</div>
              <div className="text-gray-100">How can I help you?</div>
            </div>
          </div>
        )}

        {/* Message List */}
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            characterName="Workshop Assistant"
            currentUser={currentUser || undefined}
            isGenerating={isGenerating && message.role === 'assistant'}
            // Simplified handlers for workshop v1
            onTryAgain={() => { }}
            onContinue={() => { }}
            onDelete={() => { }}
            onContentChange={() => { }}
            onNextVariation={() => { }}
            onPrevVariation={() => { }}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-none">
        <ChatInputArea
          onSend={handleSend}
          isGenerating={isGenerating}
          currentUser={null}
          onUserSelect={() => { }} // No user switching in workshop
          emotion={{ primary: 'neutral', intensity: 0, valence: 0, arousal: 0 }} // Static emotion for workshop
          hideUserAvatar={true} // Hide user avatar in workshop mode
        />
      </div>
    </div>
  );
};

export default WorkshopPanel;
