import React, { useEffect, useRef, useState } from 'react';
import { Send, User, Plus, RefreshCw } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import HighlightedTextArea from './HighlightedTextArea';
import ChatBubble from './ChatBubble';
import UserSelect from './UserSelect';
import ChatSelectorDialog from './ChatSelectorDialog';
import { useChatMessages, UserProfile } from '../hooks/useChatMessages';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    isGenerating,
    error,
    currentUser,
    generateResponse,
    regenerateMessage,
    cycleVariation,
    stopGeneration,
    deleteMessage,
    updateMessage,
    setCurrentUser,
    loadExistingChat
  } = useChatMessages(characterData);

  const handleNewChat = async () => {
    if (!characterData?.data?.first_mes) return;
    generateResponse('/new'); // Special command to start new chat
  };

  const handleLoadChat = (chatId: string) => {
    if (!characterData) return;
    loadExistingChat(chatId);
    setShowChatSelector(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll when new messages are added or during generation
  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Early return while loading
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none p-8 pb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">
          {characterData?.data?.name
            ? `Chatting with ${characterData.data.name}`
            : 'Chat'}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChatSelector(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
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
        <div className="flex-none px-8 py-4 bg-red-900/50 text-red-200">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-4 scroll-smooth">
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
      <InputArea
        onSend={generateResponse}
        isGenerating={isGenerating}
        currentUser={currentUser}
        onUserSelect={() => setShowUserSelect(true)}
      />

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
    </div>
  );
};

export default ChatView;