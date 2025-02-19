import React, { useRef, useState } from 'react';
import { Send, User, Plus } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import HighlightedTextArea from './HighlightedTextArea';
import ChatBubble from './ChatBubble';
import UserSelect from './UserSelect';
import { useChatMessages } from '../hooks/useChatMessages';

const ChatView: React.FC = () => {
  const { characterData } = useCharacter();
  const [inputValue, setInputValue] = useState('');
  const [showUserSelect, setShowUserSelect] = useState(false);
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
    setCurrentUser
  } = useChatMessages(characterData);

  const handleSend = () => {
    if (!inputValue.trim() || !characterData || isGenerating) return;
    generateResponse(inputValue.trim());
    setInputValue('');
  };

  const handleNewChat = async () => {
    if (!characterData?.data?.first_mes) return;
    generateResponse('/new'); // Special command to start new chat
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          New Chat
        </button>
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
      <div className="flex-none p-4 border-t border-stone-800">
        <div className="flex items-end gap-4">
          <div
            onClick={() => setShowUserSelect(true)}
            className="w-24 h-32 rounded-lg cursor-pointer overflow-hidden"
          >
            {currentUser ? (
              <img
                src={`/api/user-image/${encodeURIComponent(currentUser.path)}`}
                alt={currentUser.name}
                className="w-full h-full object-cover"
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
            onClick={handleSend}
            disabled={!inputValue.trim() || isGenerating}
            className="px-4 py-4 bg-transparent text-white rounded-lg hover:bg-orange-700 
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      <UserSelect
        isOpen={showUserSelect}
        onClose={() => setShowUserSelect(false)}
        onSelect={(user) => {
          setCurrentUser(user);
          setShowUserSelect(false);  // Close the modal after selection
        }}
        currentUser={currentUser?.name}
      />
    </div>
  );
};

export default ChatView;