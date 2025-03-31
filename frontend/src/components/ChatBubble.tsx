import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  RotateCw,
  ArrowRight,
  ArrowLeft,
  Pause,
  Trash2,
  StepForward,
} from 'lucide-react';
import { Message } from '../types/messages'; // Import Message type from message.ts
import RichTextEditor from './RichTextEditor';

interface ChatBubbleProps {
  message: Message;
  isGenerating: boolean;
  onContentChange: (content: string) => void;
  onDelete: () => void;
  onStop?: () => void;
  onTryAgain?: () => void;
  onContinue?: () => void; // New prop for continue functionality
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
  onContinue, // Add the new continue handler
  onNextVariation,
  onPrevVariation,
  currentUser,
  characterName
}) => {
  const isMounted = useRef(true);
  const previousContent = useRef<string>(message.content);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const highlightCache = useRef(new Map<string, string>());
  const [copied, setCopied] = useState(false);
  
  // Enhanced cursor position tracking
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isEditingRef = useRef(false);

  // Track if component is mounted to prevent state updates after unmounting
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Clean up any pending timeouts
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
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
  const [, setIsEditing] = useState(false);

  // Improved handle input with better debouncing
  const handleContentChange = useCallback((newContent: string) => {
    if (!isMounted.current) return;

    // Only update if content has actually changed
    if (newContent !== message.content) {
      console.debug(`Calling onContentChange with new content after ${isGenerating ? 'generating' : 'editing'}`);
      onContentChange(newContent);
    } else {
      console.debug('Content unchanged, not saving');
    }
  }, [message.content, onContentChange, isGenerating]);

  // Replace the deprecated document.queryCommandSupported and document.execCommand
  // with modern clipboard API
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      // Show visual feedback that text was copied
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }, [message.content]);

  // Skip rendering system messages in chat bubbles
  if (message.role === 'system') {
    return null;
  }

  const bubbleClass = message.role === 'user'
    ? 'bg-stone-900 text-white self-end'
    : 'bg-stone-900 text-gray-300 self-start';

  return (
    <div className={`w-full rounded-lg transition-colors ${bubbleClass}`}>
      <div className="px-4 pt-2 flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {message.role === 'user' ? currentUser : characterName || 'Character'}
          {copied && <span className="ml-2 text-green-500 text-xs">Copied!</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-gray-200 disabled:opacity-50"
            title="Copy message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>

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

          {/* Continue button - new addition for this feature */}
          {message.role === 'assistant' && onContinue && (
            <button
              onClick={onContinue}
              className="p-1 text-gray-400 hover:text-blue-400 disabled:opacity-50"
              disabled={isGenerating}
              title="Continue response"
            >
              <StepForward size={16} />
            </button>
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
            onTryAgain && (
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
          // For streaming content - keep as plain text with animation
          <div className="whitespace-pre-wrap break-words">
            {htmlContent}
            <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse"></span>
          </div>
        ) : (
          // For viewing/editing - use TipTap
          <RichTextEditor
            content={message.content}
            onChange={(newContent) => {
              // Only trigger change if we're in edit mode
              if (isEditingRef.current) {
                handleContentChange(newContent);
              }
            }}
            readOnly={!isEditingRef.current || isGenerating}
            className="chat-bubble-editor"
            onKeyDown={(e) => {
              // Handle special key combinations
              if (e.key === 'Escape') {
                // Exit edit mode
                isEditingRef.current = false;
                setIsEditing(false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
});

export default ChatBubble;