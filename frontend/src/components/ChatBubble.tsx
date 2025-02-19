import React, { useRef, useEffect, useCallback } from 'react';
import {
  RotateCw,
  ArrowRight,
  ArrowLeft,
  Pause,
  Trash2,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  variations?: string[];
  currentVariation?: number;
  aborted?: boolean;
}

interface ChatBubbleProps {
  message: Message;
  isGenerating: boolean; // Keep this for disabling buttons
  onContentChange: (content: string) => void;
  onDelete: () => void;
  onStop?: () => void;  // Keep for aborting
  onTryAgain: () => void;
  onNextVariation: () => void;
  onPrevVariation: () => void;
  currentUser?: string;
  characterName?: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isGenerating,
  onContentChange,
  onDelete,
  onStop,
  onTryAgain,
  onNextVariation,
  onPrevVariation,
  currentUser,
  characterName,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true); // Keep for safety

    useEffect(() => {
        return () => {
            isMounted.current = false
        }
    }, [])

  // Use useCallback for event handlers (good practice)
  const handleInput = useCallback(() => {
    if (contentRef.current && isMounted.current) {
      const newContent = contentRef.current.textContent || '';
      onContentChange(newContent);
    }
  }, [onContentChange, isMounted]);

//   const handleFocus = useCallback(() => {
//     setIsEditing(true); //Might not need
//   }, []);

//   const handleBlur = useCallback(() => {
//     setIsEditing(false); //Might not need.
//     if (contentRef.current && isMounted.current) {
//         onContentChange(contentRef.current.textContent || '');
//     }
//   }, [onContentChange, isMounted]);

  // Simplified processContent (for basic highlighting)
    const processContent = (text: string): React.ReactNode[] => {
        const segments = text
        .split(/(".*?"|\*.*?\*|`.*?`|\{\{.*?\}\})/g)
        .filter(Boolean);

        return segments.map((segment, index) => {
        const processedSegment = segment
            .replace(/{{user}}/gi, currentUser || 'User')
            .replace(/{{char}}/gi, characterName || 'Character');

        if (segment.match(/^".*"$/)) {
            return (
            <span key={index} style={{ color: '#FFB86C' }}>
                {processedSegment}
            </span>
            );
        }
        if (segment.match(/^\*.*\*$/)) {
            return (
            <span key={index} style={{ color: '#8BE9FD' }}>
                {processedSegment}
            </span>
            );
        }
        if (segment.match(/^`.*`$/)) {
            return (
            <span key={index} style={{ color: '#F1FA8C' }}>
                {processedSegment}
            </span>
            );
        }
        if (segment.match(/^\{\{.*\}\}$/)) {
            return (
            <span key={index} style={{ color: '#FF79C6' }}>
                {processedSegment}
            </span>
            );
        }
        return processedSegment;
        });
    };

  const bubbleClass =
    message.role === 'user'
      ? 'bg-stone-900 text-white self-end'
      : 'bg-stone-900 text-gray-300 self-start';

  return (
    <div className={`w-full rounded-lg transition-colors ${bubbleClass}`}>
      <div className="px-4 pt-2 flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {message.role === 'user' ? currentUser : characterName || 'Character'}
        </div>

        <div className="flex items-center gap-2">
          {message.variations && message.variations.length > 0 && (
            <>
              <button
                onClick={onPrevVariation}
                className="p-1 text-gray-400 hover:text-gray-200 disabled:opacity-50"
                disabled={isGenerating}
                title="Previous version"
              >
                <ArrowLeft size={16} />
              </button>
              <span className="text-xs text-gray-500">
                {(message.currentVariation ?? 0) + 1}/{message.variations.length}
              </span>
              <button
                onClick={onNextVariation}
                className="p-1 text-gray-400 hover:text-gray-200 disabled:opacity-50"
                disabled={isGenerating}
                title="Next version"
              >
                <ArrowRight size={16} />
              </button>
            </>
          )}

          {isGenerating && onStop ? (
            <button
              onClick={onStop}
              className="p-1 text-gray-400 hover:text-red-400"
              title="Stop generating"
            >
              <Pause size={16} />
            </button>
          ) : (
             message.role === 'assistant' && (
              <button
                onClick={onTryAgain}
                className="p-1 text-gray-400 hover:text-blue-400 disabled:opacity-50"
                disabled={isGenerating}
                title="Regenerate response"
              >
                <RotateCw size={16} />
              </button>
            )
          )}

          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-400 disabled:opacity-50"
            disabled={isGenerating}
            title="Delete message"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="p-4">
        <div
          ref={contentRef}
          contentEditable={!isGenerating} // Always editable unless generating
          suppressContentEditableWarning
          onInput={handleInput}
        //   onFocus={handleFocus}
        //   onBlur={handleBlur}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }}
          className="whitespace-pre-wrap break-words focus:outline-none cursor-text"
          style={{ minHeight: '1em' }}
        >
            {message.aborted
              ? <span className="text-red-400">Generation aborted.</span>
              :  processContent(message.content)
            }
        </div>
      </div>
    </div>
  );
};

export default ChatBubble;