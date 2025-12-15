import React, { useState, useEffect } from 'react';
import { Send, User } from 'lucide-react';
import RichTextEditor from '../RichTextEditor';
import MoodIndicator from '../MoodIndicator';
import { UserProfile } from '../../types/messages';
import { EmotionState } from '../../hooks/useEmotionDetection';

interface ChatInputAreaProps {
  onSend: (text: string) => void;
  isGenerating: boolean;
  currentUser: UserProfile | null;
  onUserSelect: () => void;
  emotion: EmotionState;
}

const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  onSend,
  isGenerating,
  currentUser,
  onUserSelect,
  emotion,
}) => {
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
        {/* User Image */}
        <div
          onClick={onUserSelect}
          className="w-24 h-32 rounded-lg cursor-pointer overflow-hidden flex-shrink-0"
        >
          {currentUser && !imageError ? (
            <img
              src={`/api/user-image/${encodeURIComponent(currentUser.filename)}`}
              alt={currentUser.name || 'User'}
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

        {/* Text Input Area */}
        <div className="flex-1 h-32 flex flex-col overflow-hidden">
          <RichTextEditor
            content={inputValue}
            onChange={setInputValue}
            className="bg-stone-950 border border-stone-800 rounded-lg flex-1 overflow-y-auto"
            placeholder="Type your message..."
            onKeyDown={handleKeyPress}
            preserveWhitespace={true}
          />
        </div>

        {/* Send Button & Mood Indicator */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <MoodIndicator emotion={emotion} size={24} showLabel={false} />
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
    </div>
  );
};

export default ChatInputArea;
