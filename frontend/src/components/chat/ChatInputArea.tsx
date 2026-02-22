import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Loader2, Sparkles } from 'lucide-react';
import RichTextEditor from '../RichTextEditor';
import MoodIndicator from '../MoodIndicator';
import { UserProfile } from '../../types/messages';
import { EmotionState } from '../../hooks/useEmotionDetection';
import { htmlToPlainText } from '../../utils/contentUtils';

interface ChatInputAreaProps {
  onSend: (text: string) => void;
  onImpersonate?: (partialMessage: string, onChunk: (chunk: string) => void) => Promise<{ success: boolean; response?: string; error?: string }>;
  isGenerating: boolean;
  isCompressing?: boolean;
  currentUser: UserProfile | null;
  onUserSelect: () => void;
  disableUserSelect?: boolean;
  emotion: EmotionState;
  hideUserAvatar?: boolean; // Optional prop to hide user avatar
}

const MIN_INPUT_HEIGHT = 128; // h-32 in pixels
const MAX_INPUT_HEIGHT = 400; // Maximum height before scrolling

const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  onSend,
  onImpersonate,
  isGenerating,
  isCompressing = false,
  currentUser,
  onUserSelect,
  disableUserSelect = false,
  emotion,
  hideUserAvatar = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [imageError, setImageError] = useState(false);
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isGenerating && !isCompressing) {
        onSend(inputValue.trim());
        setInputValue('');
      }
    }
  };

  // Reset image error state when user changes
  useEffect(() => {
    setImageError(false);
  }, [currentUser?.filename]);

  // Auto-grow input area based on content
  useEffect(() => {
    if (editorRef.current) {
      const editorElement = editorRef.current.querySelector('.ProseMirror') as HTMLElement;
      if (editorElement) {
        // Get the scroll height of the content
        const scrollHeight = editorElement.scrollHeight;
        const padding = 24; // Account for padding (0.75rem * 2)
        const newHeight = Math.min(Math.max(scrollHeight + padding, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);

        setInputHeight(newHeight);

        // Scroll to cursor position after height adjustment
        requestAnimationFrame(() => {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const editorRect = editorElement.getBoundingClientRect();

            // Check if cursor is below visible area
            if (rect.bottom > editorRect.bottom) {
              editorElement.scrollTop += (rect.bottom - editorRect.bottom + 10);
            }
            // Check if cursor is above visible area
            else if (rect.top < editorRect.top) {
              editorElement.scrollTop -= (editorRect.top - rect.top + 10);
            }
          }
        });
      }
    }
  }, [inputValue]);

  // Reset height when input is cleared
  useEffect(() => {
    if (!inputValue) {
      setInputHeight(MIN_INPUT_HEIGHT);
    }
  }, [inputValue]);

  return (
    <div className="flex-none p-4 border-t border-stone-800">
      {/* Compression Indicator */}
      {isCompressing && (
        <div className="mb-2 flex items-center gap-2 text-sm text-blue-400 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Preparing context...</span>
        </div>
      )}
      <div className="flex items-end gap-4">
        {/* User Image - conditionally rendered */}
        {!hideUserAvatar && (
          <div
            onClick={disableUserSelect ? undefined : onUserSelect}
            className={`w-24 h-32 rounded-lg overflow-hidden flex-shrink-0 ${disableUserSelect ? '' : 'cursor-pointer'}`}
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
        )}

        {/* Text Input Area with Auto-grow */}
        <div
          ref={editorRef}
          className="flex-1 flex flex-col overflow-hidden transition-all duration-200 ease-out"
          style={{ height: `${inputHeight}px` }}
        >
          <RichTextEditor
            content={inputValue}
            onChange={(html) => setInputValue(htmlToPlainText(html))}
            className="bg-stone-950 border border-stone-800 rounded-lg flex-1 overflow-y-auto"
            placeholder="Type your message..."
            onKeyDown={handleKeyPress}
            preserveWhitespace={true}
          />
        </div>

        {/* Send Button, Impersonate Button & Mood Indicator */}
        <div className="flex flex-col items-center justify-end gap-2 flex-shrink-0">
          <MoodIndicator emotion={emotion} size={20} showLabel={false} />
          <button
            onClick={() => {
              if (inputValue.trim() && !isGenerating && !isCompressing && !isImpersonating) {
                onSend(inputValue.trim());
                setInputValue('');
              }
            }}
            disabled={!inputValue.trim() || isGenerating || isCompressing || isImpersonating}
            className="p-2 bg-transparent text-white rounded-lg hover:bg-orange-700
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send message"
          >
            <Send size={18} />
          </button>

          {/* Impersonate Button (Sparkles) */}
          {onImpersonate && (
            <button
              onClick={async () => {
                if (isGenerating || isCompressing || isImpersonating) return;

                setIsImpersonating(true);
                const startingText = inputValue.trim();

                // For autocomplete, we want to append to existing text
                // For fresh generation, we start empty
                const result = await onImpersonate(startingText, (chunk) => {
                  // Append each chunk to the input
                  setInputValue(prev => {
                    // If we started with text, keep it and append
                    // Otherwise just use the streamed content
                    if (startingText && !prev.startsWith(startingText)) {
                      return startingText + chunk;
                    }
                    return prev + chunk;
                  });
                });

                if (!result.success) {
                  console.error('Impersonate failed:', result.error);
                }

                setIsImpersonating(false);
              }}
              disabled={isGenerating || isCompressing || isImpersonating}
              className="p-2 bg-transparent text-white rounded-lg hover:bg-purple-700
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={inputValue.trim() ? "Continue your message with AI" : "Generate a response as you"}
            >
              {isImpersonating ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Sparkles size={18} />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInputArea;
