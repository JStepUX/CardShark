import React, { useRef, useEffect, useCallback, useState } from 'react';
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
  isGenerating: boolean;
  onContentChange: (content: string) => void;
  onDelete: () => void;
  onStop?: () => void;
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
  const isMounted = useRef(true);
  const previousContent = useRef<string>(message.content);

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, []);

  // Update previousContent when message content changes from external sources
  useEffect(() => {
    previousContent.current = message.content;
  }, [message.content]);

  // Track if user is currently editing (for debounced saves)
  const [isEditing, setIsEditing] = useState(false);
  
  // Use a timer for debounced saves during continuous editing
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Improved handler that tracks and detects actual changes
  const handleInput = useCallback(() => {
    if (contentRef.current && isMounted.current) {
      const newContent = contentRef.current.textContent || '';
      
      // Only update if content has actually changed
      if (newContent !== previousContent.current) {
        // Update our tracking ref
        previousContent.current = newContent;
        
        // Update UI immediately
        onContentChange(newContent);
        
        // Set editing state if not already set
        if (!isEditing) {
          setIsEditing(true);
        }
        
        // Clear any existing timer
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }
        
        // Set a debounced save timer
        saveTimerRef.current = setTimeout(() => {
          console.log(`Debounced content update for message ${message.id}`);
          // This will trigger the actual save
          onContentChange(newContent);
          saveTimerRef.current = null;
        }, 1500); // 1.5 second debounce
        
        // Log that we're updating context due to user edit
        console.log(`Content updated for message ${message.id}. Updating context...`);
      }
    }
  }, [onContentChange, message.id, isEditing]);

  // Process content to highlight special formatting
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

  // Handle blur events to ensure we save when focus leaves the element
  const handleBlur = useCallback(() => {
    // When user stops editing (blur), clear any pending save timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    
    // Only process the blur if we were editing
    if (isEditing) {
      setIsEditing(false);
      
      // Get the final content
      const finalContent = contentRef.current?.textContent || '';
      
      // Only save if content actually changed
      if (finalContent !== message.content) {
        console.log(`Saving content on blur for message ${message.id}`);
        onContentChange(finalContent);
      }
    }
  }, [isEditing, message.id, message.content, onContentChange]);

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
          contentEditable={!isGenerating}
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}  
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
              : processContent(message.content)
            }
        </div>
      </div>
    </div>
  );
};

export default ChatBubble;