import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  RotateCw,
  ArrowRight,
  ArrowLeft,
  Pause,
  Trash2,
  StepForward,
  Sparkles,
} from 'lucide-react';
import { Message } from '../types/messages';
import RichTextEditor from './RichTextEditor';
import { formatUserName } from '../utils/formatters'; // Import formatter

interface ChatBubbleProps {
  message: Message;
  isGenerating: boolean;
  isFirstMessage?: boolean; // New prop to identify if this is the first message
  isRegeneratingGreeting?: boolean; // New prop specifically for greeting regeneration
  onContentChange: (content: string) => void;
  onDelete: () => void;
  onStop?: () => void;
  onTryAgain?: () => void;
  onContinue?: () => void;
  onNextVariation: () => void;
  onPrevVariation: () => void;
  onRegenerateGreeting?: () => void; // New prop for greeting regeneration
  currentUser?: string;
  characterName?: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = React.memo(({
  message,
  isGenerating,
  isFirstMessage = false, // Default to false
  isRegeneratingGreeting = false, // Default to false
  onContentChange,
  onDelete,
  onStop,
  onTryAgain,
  onContinue,
  onNextVariation,
  onPrevVariation,
  onRegenerateGreeting,
  currentUser,
  characterName
}) => {
  const isMounted = useRef(true);
  const previousContent = useRef<string>(message.content);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const highlightCache = useRef(new Map<string, string>());
  const [copied, setCopied] = useState(false);

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

  // Enhanced cursor position tracking
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to trim leading newlines while preserving content
  const trimLeadingNewlines = useCallback((content: string) => {
    if (message.role !== 'assistant') return content; // Only trim assistant messages
    return content.replace(/^\n+/, ''); // Remove leading newlines
  }, [message.role]);

  // Function to process content with variable replacements and highlighting
  const processContent = useCallback((text: string): string => {
    // First trim leading newlines
    const trimmedContent = trimLeadingNewlines(text);

    // Create a cache key based on content and variables
    const cacheKey = `${trimmedContent}_${currentUser || ''}_${characterName || ''}`;

    // Check if we have this content processed already
    if (highlightCache.current.has(cacheKey)) {
      return highlightCache.current.get(cacheKey)!;
    }

    // Replace variables while preserving asterisks and other syntax
    let processedText = trimmedContent;
    if (currentUser) {
      processedText = processedText.replace(/\{\{user\}\}/gi, currentUser);
    }
    if (characterName) {
      processedText = processedText.replace(/\{\{char\}\}/gi, characterName);
    }

    // Cache the result
    highlightCache.current.set(cacheKey, processedText);

    return processedText;
  }, [currentUser, characterName, trimLeadingNewlines]);

  // Enhanced streaming content processing with simple HTML tag removal
  const getStreamingDisplay = useCallback((text: string): string => {
    // Also trim leading newlines for streaming content
    const trimmedContent = trimLeadingNewlines(text);

    // Replace variables first
    let processedText = trimmedContent;
    if (currentUser) {
      processedText = processedText.replace(/\{\{user\}\}/gi, currentUser);
    }
    if (characterName) {
      processedText = processedText.replace(/\{\{char\}\}/gi, characterName);
    }
    
    // Strip any HTML tags for cleaner streaming display
    // Using a basic regex instead of DOMPurify for simplicity
    return processedText.replace(/<[^>]*>/g, '');
  }, [currentUser, characterName, trimLeadingNewlines]);

  // Track whether this is the first time we're displaying the content
  const [isFirstRender, setIsFirstRender] = useState(true);

  // Update htmlContent when message content changes
  useEffect(() => {
    previousContent.current = message.content;

    // Apply variable substitution and trim leading newlines
    if (!isGenerating || message.role !== 'assistant') {
      setHtmlContent(processContent(message.content));
      setIsFirstRender(true); // Reset for future streaming
    } else if (isGenerating && message.role === 'assistant') {
      // For streaming content, do basic variable replacement and remove HTML
      setHtmlContent(getStreamingDisplay(message.content));
      
      // After small delay, mark as not first render to enable animations
      if (isFirstRender) {
        setTimeout(() => setIsFirstRender(false), 50);
      }
    }
  }, [message.content, isGenerating, processContent, getStreamingDisplay, message.role, isFirstRender]);

  // Improved handle input with better debouncing
  const handleContentChange = useCallback((newContent: string) => {
    if (!isMounted.current) return;

    // Only update if content has actually changed
    if (newContent !== message.content) {
      console.debug(`Calling onContentChange with new content`);
      onContentChange(newContent);
    } else {
      console.debug('Content unchanged, not saving');
    }
  }, [message.content, onContentChange]);

  // Replace the deprecated document.queryCommandSupported and document.execCommand
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
          {message.role === 'user' ? formatUserName(currentUser || '') : characterName || 'Character'}
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

          {/* Continue button */}
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
            // Show special "Regenerate Greeting" button for the first assistant message
            // Show standard regeneration button for other assistant messages
            message.role === 'assistant' && (
              <>
                {isFirstMessage && onRegenerateGreeting ? (
                  <button
                    onClick={onRegenerateGreeting}
                    className="p-1 text-gray-400 hover:text-purple-400 disabled:opacity-50"
                    disabled={isGenerating || isRegeneratingGreeting}
                    title="Regenerate greeting and update character"
                  >
                    {isRegeneratingGreeting ? (
                      <svg className="animate-spin h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <Sparkles size={16} />
                    )}
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
              </>
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
          // Enhanced streaming content display
          <div className="streaming-content whitespace-pre-wrap break-words">
            {htmlContent}
            <span className={`cursor ${isFirstRender ? '' : 'animate-blink'}`}></span>
          </div>
        ) : isRegeneratingGreeting && isFirstMessage ? (
          // New special loading state for greeting regeneration
          <div className="relative">
            {/* Ghosted content with purple loading overlay */}
            <div className="whitespace-pre-wrap break-words opacity-30">
              {htmlContent}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="p-4 flex flex-col items-center">
                <svg className="animate-spin h-8 w-8 text-purple-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm text-purple-400 font-medium">Regenerating greeting...</span>
              </div>
            </div>
          </div>
        ) : (
          // For viewing/editing - use TipTap with proper newline handling
          <RichTextEditor
            content={htmlContent} // Use processed content with substitutions
            onChange={handleContentChange}
            readOnly={isGenerating || isRegeneratingGreeting}
            className="chat-bubble-editor"
            autofocus={false}
            preserveWhitespace={true} // Enable whitespace preservation
          />
        )}
      </div>
    </div>
  );
});

export default ChatBubble;