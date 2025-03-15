import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, User, Plus, RefreshCw, Eye, Wallpaper } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import HighlightedTextArea from './HighlightedTextArea';
import ChatBubble from './ChatBubble';
import UserSelect from './UserSelect';
import ChatSelectorDialog from './ChatSelectorDialog';
import ContextWindowModal from './ContextWindowModal';
import ChatBackgroundSettings, { BackgroundSettings } from './ChatBackgroundSettings';
import { useChatMessages } from '../hooks/useChatMessages';
import { apiService } from '../services/apiService';
import { UserProfile } from '../types/messages';

// Default background settings
const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  background: null,
  transparency: 85,
  fadeLevel: 30
};

// Local storage key for saving background settings
const BACKGROUND_SETTINGS_KEY = 'cardshark_chat_background';

// Separate hook for scroll management
function useScrollToBottom() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current || !messagesEndRef.current) return;
    
    // Option 1: Use scrollIntoView with specific options
    messagesEndRef.current.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'end',
      inline: 'nearest'
    });
    
    // Double-check scroll position with a slight delay to account for layout adjustments
    setTimeout(() => {
      const container = messagesContainerRef.current;
      const endElement = messagesEndRef.current;
      if (!container || !endElement) return;
      
      // Check if we're actually at the bottom
      const containerRect = container.getBoundingClientRect();
      const endElementRect = endElement.getBoundingClientRect();
      
      // If we're not close enough to the bottom, force direct scrolling
      const scrollOffset = endElementRect.bottom - containerRect.bottom;
      if (Math.abs(scrollOffset) > 20) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }, []);

  return {
    messagesEndRef,
    messagesContainerRef,
    scrollToBottom
  };
}

// Separate InputArea component
const InputArea: React.FC<{
  onSend: (text: string) => void;
  isGenerating: boolean;
  currentUser: UserProfile | null;
  onUserSelect: () => void;
}> = ({ onSend, isGenerating, currentUser, onUserSelect }) => {
  const [inputValue, setInputValue] = useState('');
  const [imageError, setImageError] = useState(false);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isGenerating) {
        onSend(inputValue.trim());
        setInputValue('');
      }
    }
  };

  // Reset image error state when user changes
  useEffect(() => {
    setImageError(false);
  }, [currentUser?.filename]);

  return (
    <div className="flex-none p-4 border-t border-stone-800">
      <div className="flex items-end gap-4">
        <div
          onClick={onUserSelect}
          className="w-24 h-32 rounded-lg cursor-pointer overflow-hidden"
        >
          {currentUser && !imageError ? (
            <img
              src={`/api/user-image/serve/${encodeURIComponent(currentUser.filename)}`}
              alt={currentUser.name}
              className="w-full h-full object-cover"
              onError={() => {
                console.error('User image load failed');
                setImageError(true);
              }}
            />
          ) : (
            <div className="w-full h-full bg-transparent border border-gray-700 rounded-lg flex items-center justify-center">
              <User className="text-gray-400" size={24} />
            </div>
          )}
        </div>

        <div className="flex-1">
          <HighlightedTextArea
            value={inputValue}
            onChange={setInputValue}
            className="bg-stone-950 border border-stone-800 rounded-lg h-24"
            placeholder="Type your message..."
            onKeyDown={handleKeyPress}
          />
        </div>

        <button
          onClick={() => {
            if (inputValue.trim() && !isGenerating) {
              onSend(inputValue.trim());
              setInputValue('');
            }
          }}
          disabled={!inputValue.trim() || isGenerating}
          className="px-4 py-4 bg-transparent text-white rounded-lg hover:bg-orange-700 
                   transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
};

// Main ChatView component
const ChatView: React.FC = () => {
  const { characterData } = useCharacter();
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [showContextWindow, setShowContextWindow] = useState(false);
  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);
  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings>(DEFAULT_BACKGROUND_SETTINGS);
  
  // Use the custom scroll hook
  const { messagesEndRef, messagesContainerRef, scrollToBottom } = useScrollToBottom();

  // Add performance tracking ref
  const streamingPerformanceRef = useRef({
    startTime: 0,
    endTime: 0,
    tokens: 0,
    tokensPerSecond: 0
  });

  const {
    messages,
    isLoading,
    isGenerating,
    error,
    currentUser,
    lastContextWindow,
    generateResponse,
    regenerateMessage,
    cycleVariation,
    stopGeneration,
    deleteMessage,
    updateMessage,
    setCurrentUser,
    loadExistingChat
  } = useChatMessages(characterData);

  // Load saved background settings on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem(BACKGROUND_SETTINGS_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setBackgroundSettings(parsed);
      }
    } catch (err) {
      console.error('Error loading background settings:', err);
    }
  }, []);

  // Save background settings when changed
  const handleBackgroundSettingsChange = (newSettings: BackgroundSettings) => {
    setBackgroundSettings(newSettings);
    try {
      localStorage.setItem(BACKGROUND_SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (err) {
      console.error('Error saving background settings:', err);
    }
  };

  const handleNewChat = async () => {
    if (!characterData?.data?.first_mes) return;
    
    // Clear persisted context window
    try {
      await apiService.clearContextWindow();
    } catch (err) {
      console.error('Error clearing context window:', err);
    }
    
    generateResponse('/new'); // Special command to start new chat
  };

  const handleLoadChat = (chatId: string) => {
    if (!characterData) return;
    loadExistingChat(chatId);
    setShowChatSelector(false);
  };

  // Scroll when messages change, generation status changes, or on sidenav toggling
  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating, scrollToBottom]);

  // Listen for potential layout changes
  useEffect(() => {
    const handleResize = () => {
      scrollToBottom();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scrollToBottom]);

  // Add this effect to track performance
  useEffect(() => {
    if (isGenerating && streamingPerformanceRef.current.startTime === 0) {
      // Started generating
      streamingPerformanceRef.current.startTime = Date.now();
      streamingPerformanceRef.current.tokens = 0;
    } else if (!isGenerating && streamingPerformanceRef.current.startTime > 0) {
      // Finished generating
      streamingPerformanceRef.current.endTime = Date.now();
      const durationSecs = (streamingPerformanceRef.current.endTime - streamingPerformanceRef.current.startTime) / 1000;
      
      // Count tokens in last message
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        const tokenCount = lastMessage.content.split(/\s+/).length;
        streamingPerformanceRef.current.tokens = tokenCount;
        streamingPerformanceRef.current.tokensPerSecond = tokenCount / durationSecs;
        
        console.log(`Generation performance: ${tokenCount} tokens in ${durationSecs.toFixed(2)}s (${streamingPerformanceRef.current.tokensPerSecond.toFixed(2)} tokens/sec)`);
      }
      
      // Reset for next generation
      streamingPerformanceRef.current.startTime = 0;
    }
  }, [isGenerating, messages]);

  // Early return while loading
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="h-full relative flex flex-col overflow-hidden">
      {/* Background Image */}
      {backgroundSettings.background?.url && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ 
            backgroundImage: `url(${backgroundSettings.background.url})`,
            filter: `blur(${backgroundSettings.fadeLevel / 3}px)`
          }}
        />
      )}
      
      {/* Header */}
      <div className="flex-none p-8 pb-4 flex justify-between items-center relative z-10"
           style={{ 
             backgroundColor: backgroundSettings.background?.url 
               ? `rgba(28, 25, 23, ${1 - backgroundSettings.transparency / 100})` 
               : undefined 
           }}>
        <h2 className="text-lg font-semibold">
          {characterData?.data?.name
            ? `Chatting with ${characterData.data.name}`
            : 'Chat'}
        </h2>
        <div className="flex items-center gap-2">
          {/* Background Settings button */}
          <button
            onClick={() => setShowBackgroundSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-transparent text-white rounded-lg hover:bg-gray-600 transition-colors"
            title="Background Settings"
          >
            <Wallpaper size={18} />
            BG
          </button>
          
          {/* Add Context Window button */}
          <button
            onClick={() => setShowContextWindow(true)}
            className="flex items-center gap-2 px-4 py-2 bg-transparent text-white rounded-lg hover:bg-gray-600 transition-colors"
            title="View API Context Window"
          >
            <Eye size={18} />
            View Context
          </button>

          <button
            onClick={() => setShowChatSelector(true)}
            className="flex items-center gap-2 px-4 py-2 bg-transparent text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            <RefreshCw size={18} />
            Load Chat
          </button>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            New Chat
          </button>
        </div>
      </div>

      {error && (
        <div className="flex-none px-8 py-4 bg-red-900/50 text-red-200 relative z-10">
          {error}
        </div>
      )}

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-8 py-4 scroll-smooth relative z-10"
        style={{ 
          backgroundColor: backgroundSettings.background?.url 
            ? `rgba(28, 25, 23, ${1 - backgroundSettings.transparency / 100})` 
            : undefined 
        }}
      >
        <div className="flex flex-col space-y-4">
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              isGenerating={isGenerating}
              onContentChange={(content) => updateMessage(message.id, content)}
              onDelete={() => deleteMessage(message.id)}
              onStop={stopGeneration}
              onTryAgain={() => regenerateMessage(message)}
              onNextVariation={() => cycleVariation(message.id, 'next')}
              onPrevVariation={() => cycleVariation(message.id, 'prev')}
              currentUser={currentUser?.name}
              characterName={characterData?.data?.name}
            />
          ))}
          <div ref={messagesEndRef} className="h-px" />
        </div>
      </div>

      {/* Input Area */}
      <div 
        className="relative z-10"
        style={{ 
          backgroundColor: backgroundSettings.background?.url 
            ? `rgba(28, 25, 23, ${1 - backgroundSettings.transparency / 100})` 
            : undefined 
        }}
      >
        <InputArea
          onSend={generateResponse}
          isGenerating={isGenerating}
          currentUser={currentUser}
          onUserSelect={() => setShowUserSelect(true)}
        />
      </div>

      {/* User Select Modal */}
      <UserSelect
        isOpen={showUserSelect}
        onClose={() => setShowUserSelect(false)}
        onSelect={(user) => {
          setCurrentUser(user);
          setShowUserSelect(false);
        }}
        currentUser={currentUser?.name}
      />

      {/* Chat Selector Dialog */}
      <ChatSelectorDialog
        isOpen={showChatSelector}
        onClose={() => setShowChatSelector(false)}
        onSelectChat={handleLoadChat}
        characterName={characterData?.data?.name || ''}
      />

      {/* Context Window Modal */}
      <ContextWindowModal
        isOpen={showContextWindow}
        onClose={() => setShowContextWindow(false)}
        contextData={lastContextWindow}
        title="API Context Window"
      />

      {/* Background Settings Dialog */}
      {showBackgroundSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <ChatBackgroundSettings
            settings={backgroundSettings}
            onSettingsChange={handleBackgroundSettingsChange}
            onClose={() => setShowBackgroundSettings(false)}
          />
        </div>
      )}
    </div>
  );
};

export default ChatView;