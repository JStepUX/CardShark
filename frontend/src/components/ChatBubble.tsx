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

// Create an optimized highlighter with variable replacement
const ChatBubble: React.FC<ChatBubbleProps> = React.memo(({
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
  const highlightCache = useRef(new Map<string, string>());

  // Track if component is mounted to prevent state updates after unmounting
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Function to process content with variable replacements and highlighting
  const processContent = useCallback((text: string): string => {
    // Create a cache key based on content and variables
    const cacheKey = `${text}_${currentUser || ''}_${characterName || ''}`;
    
    // Check if we have this content processed already
    if (highlightCache.current.has(cacheKey)) {
      return highlightCache.current.get(cacheKey)!;
    }
    
    // Replace variables first
    let processedText = text;
    if (currentUser) {
      processedText = processedText.replace(/\{\{user\}\}/gi, currentUser);
    }
    if (characterName) {
      processedText = processedText.replace(/\{\{char\}\}/gi, characterName);
    }
    
    // Apply syntax highlighting
    const highlighted = processedText
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("([^"\\]|\\.)*")/g, '<span class="text-orange-400">$1</span>')
      .replace(/(\*([^*\n]|\\.)*\*)/g, '<span class="text-blue-300">$1</span>')
      .replace(/(`([^`\n]|\\.)*`)/g, '<span class="text-yellow-300">$1</span>')
      .replace(/(\{\{([^}\n]|\\.)*\}\})/g, '<span class="text-pink-300">$1</span>');
    
    // Cache the result
    highlightCache.current.set(cacheKey, highlighted);
    
    return highlighted;
  }, [currentUser, characterName]);

  // Update htmlContent when message content changes
  useEffect(() => {
    previousContent.current = message.content;
    
    // Only apply full highlighting when not generating
    // This improves performance during streaming
    if (!isGenerating || message.role !== 'assistant') {
      setHtmlContent(processContent(message.content));
    } else if (isGenerating && message.role === 'assistant') {
      // For streaming content, only do basic variable replacement
      let processedText = message.content;
      if (currentUser) {
        processedText = processedText.replace(/\{\{user\}\}/gi, currentUser);
      }
      if (characterName) {
        processedText = processedText.replace(/\{\{char\}\}/gi, characterName);
      }
      
      // Set content without syntax highlighting during streaming
      setHtmlContent(processedText);
    }
  }, [message.content, isGenerating, processContent, message.role, currentUser, characterName]);

  // Track if user is currently editing
  const [isEditing, setIsEditing] = useState(false);
  
  // Use a timer for debounced saves during continuous editing
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Safely get the text content from contentRef
  const getContentSafely = useCallback(() => {
    if (!contentRef.current) return "";
    return contentRef.current.textContent || "";
  }, []);
  
  // Handler that tracks and detects actual changes
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
            // This will trigger the actual save
            onContentChange(finalContent);
            saveTimerRef.current = null;
          }
        }, 1000); // 1 second debounce
      }
    }
  }, [onContentChange, isEditing, getContentSafely]);

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
        onContentChange(finalContent);
      }
    }
  }, [isEditing, message.content, onContentChange, getContentSafely]);

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

  const bubbleClass = message.role === 'user'
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
      {message.aborted ? (
        <div className="text-red-400">Generation failed.</div>
      ) : isGenerating && message.role === 'assistant' ? (
        // For streaming content
        <div className="whitespace-pre-wrap break-words">
          {htmlContent}
          <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse"></span>
        </div>
      ) : (
        // For static content with editing
        <div
          ref={contentRef}
          contentEditable={!isGenerating}
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          onPaste={handlePaste}
          className="whitespace-pre-wrap break-words focus:outline-none cursor-text"
          style={{ minHeight: '1em' }}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      )}
      </div>
    </div>
  );
});

export default ChatBubble;