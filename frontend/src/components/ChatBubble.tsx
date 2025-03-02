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
  const [htmlContent, setHtmlContent] = useState<string>('');

  // Track if component is mounted to prevent state updates after unmounting
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Update previousContent and generate html when message content changes from external sources
  useEffect(() => {
    previousContent.current = message.content;
    
    // Generate HTML with syntax highlighting
    const html = formatMessageWithSyntaxHighlighting(message.content);
    setHtmlContent(html);
  }, [message.content, currentUser, characterName]);

  // Track if user is currently editing (for debounced saves)
  const [isEditing, setIsEditing] = useState(false);
  
  // Use a timer for debounced saves during continuous editing
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Safely get the text content from contentRef
  const getContentSafely = useCallback(() => {
    if (!contentRef.current) return "";
    
    // Get the text content directly
    return contentRef.current.textContent || "";
  }, []);
  
  // Format message content with syntax highlighting
  const formatMessageWithSyntaxHighlighting = (text: string): string => {
    if (!text) return "";
    
    // Replace {{user}} and {{char}} variables with their values
    let processedText = text
      .replace(/{{user}}/gi, currentUser || 'User')
      .replace(/{{char}}/gi, characterName || 'Character');
      
    // Add syntax highlighting by wrapping different patterns with colored spans
    processedText = processedText
      // Quoted text in orange
      .replace(/"([^"\\]|\\.)*"/g, '<span style="color: #FFB86C;">$&</span>')
      // Code blocks in green
      .replace(/`([^`\\]|\\.)*`/g, '<span style="color: #A7FF78;">$&</span>')
      // Bold text in cyan
      .replace(/\*([^*\\\n]|\\.)*\*/g, '<span style="color: #80CBC4;">$&</span>')
      // Italic text in purple
      .replace(/_([^_\\\n]|\\.)*_/g, '<span style="color: #C381E6;">$&</span>');
      
    return processedText;
  };
  
  // Improved handler that tracks and detects actual changes
  const handleInput = useCallback(() => {
    if (contentRef.current && isMounted.current) {
      // Get content safely to avoid DOM mutation issues
      const newContent = getContentSafely();
      
      // Only update if content has actually changed
      if (newContent !== previousContent.current) {
        // Update our tracking ref
        previousContent.current = newContent;
        
        // Set editing state if not already set
        if (!isEditing) {
          setIsEditing(true);
        }
        
        // Update HTML content for live syntax highlighting while typing
        const html = formatMessageWithSyntaxHighlighting(newContent);
        setHtmlContent(html);
        
        // Clear any existing timer
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }
        
        // Set a debounced save timer
        saveTimerRef.current = setTimeout(() => {
          // Only proceed if component is still mounted
          if (isMounted.current) {
            // Get content again safely, in case it changed during the timeout
            const finalContent = getContentSafely();
            console.log(`Debounced content update for message ${message.id}`);
            // This will trigger the actual save
            onContentChange(finalContent);
            saveTimerRef.current = null;
          }
        }, 1500); // 1.5 second debounce
        
        // Log that we're updating context due to user edit
        console.log(`Content updated for message ${message.id}. Updating context...`);
      }
    }
  }, [onContentChange, message.id, isEditing, getContentSafely, formatMessageWithSyntaxHighlighting]);

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
    
    // Only process the blur if we were editing and component is still mounted
    if (isEditing && isMounted.current) {
      setIsEditing(false);
      
      // Get the final content safely
      const finalContent = getContentSafely();
      
      // Only save if content actually changed
      if (finalContent !== message.content) {
        console.log(`Saving content on blur for message ${message.id}`);
        onContentChange(finalContent);
      }
    }
  }, [isEditing, message.id, message.content, onContentChange, getContentSafely]);

  // Handle paste events to ensure clean text
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    
    // Use the safer insertText command instead of execCommand when possible
    if (document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, text);
    } else {
      // Fallback to selection API
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
      }
    }
    
    // Make sure to trigger the input handler for highlighting
    handleInput();
  }, [handleInput]);

  // Get the final HTML content
  const getFinalContent = (): string => {
    if (message.aborted) {
      return '<span style="color: #FF6B6B;">Generation aborted.</span>';
    }
    
    return htmlContent || formatMessageWithSyntaxHighlighting(message.content);
  };

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
          onPaste={handlePaste}
          className="whitespace-pre-wrap break-words focus:outline-none cursor-text"
          style={{ minHeight: '1em' }}
          dangerouslySetInnerHTML={{ __html: getFinalContent() }}
        />
      </div>
    </div>
  );
};

export default ChatBubble;