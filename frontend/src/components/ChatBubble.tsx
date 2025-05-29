import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  RotateCw,
  ArrowRight,
  ArrowLeft,
  Pause,
  Trash2,
  StepForward,
  Sparkles,
  Copy,
} from 'lucide-react';
import { Message, UserProfile } from '../types/messages';
import RichTextEditor from './RichTextEditor';
import { formatUserName } from '../utils/formatters';
import { markdownToHtml } from '../utils/contentUtils';  // Import markdownToHtml directly
import { removeIncompleteSentences } from '../utils/contentProcessing'; // Import the utility function
import { useSettings } from '../contexts/SettingsContext'; // Import the settings context hook

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
  currentUser?: string | UserProfile; // Updated to accept both string and UserProfile
  characterName?: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = React.memo(({
  message,
  isGenerating,
  isFirstMessage = false,
  isRegeneratingGreeting = false,
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
  const [streamingStarted, setStreamingStarted] = useState(false);
  const hasReceivedContent = useRef(false);
  const generationStartTime = useRef<number | null>(null);
  const { settings } = useSettings(); // Get settings from context
  
  // Initialize generation start time
  useEffect(() => {
    if (isGenerating && !generationStartTime.current) {
      generationStartTime.current = Date.now();
    } else if (!isGenerating) {
      generationStartTime.current = null;
    }
  }, [isGenerating]);
  
  // Process incomplete sentences when generation completes
  useEffect(() => {
    if (!isGenerating && previousContent.current !== message.content) {
      // Only apply incomplete sentence removal when configured in settings
      // and only for assistant messages being generated
      if (message.role === 'assistant' && settings.remove_incomplete_sentences && message.content) {
        const processedContent = removeIncompleteSentences(message.content);
        if (processedContent !== message.content) {
          onContentChange(processedContent);
        }
      }
      previousContent.current = message.content;
    }
  }, [isGenerating, message.content, message.role, onContentChange, settings.remove_incomplete_sentences]);

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
  // Function to sanitize chat content by removing "{{user}}:" and "{{char}}:" patterns
  const sanitizeChatOutput = useCallback((text: string): string => {
    // Remove "{{user}}:" and "{{char}}:" patterns at the beginning of output
    return text
      .replace(/^\s*\{\{user\}\}:\s*/i, '')
      .replace(/^\s*\{\{char\}\}:\s*/i, '');
  }, []);

  // Function to process content with variable replacements and highlighting
  const processContent = useCallback((text: string): string => {
    // Special handling for empty content during streaming
    if (isGenerating && message.role === 'assistant') {
      // Mark that streaming has started, even with empty content
      if (!streamingStarted) {
        setStreamingStarted(true);
      }
      
      // Track if we've received non-empty content
      if (text && text.trim() !== '') {
        hasReceivedContent.current = true;
      }
      
      // Return the content we have so far, even if it's empty
      // This ensures we start showing content as soon as it arrives
      // First sanitize the text, then trim leading newlines
      const sanitizedText = sanitizeChatOutput(text || '');
      const trimmedContent = trimLeadingNewlines(sanitizedText);
      
      // Create a cache key based on content and variables
      const cacheKey = `${trimmedContent}_${currentUser || ''}_${characterName || ''}`;

      // Check if we have this content processed already
      if (highlightCache.current.has(cacheKey)) {
        return highlightCache.current.get(cacheKey)!;
      }      // Replace variables while preserving asterisks and other syntax
      let processedText = trimmedContent;
      if (currentUser) {
        const userName = typeof currentUser === 'object' ? formatUserName(currentUser) : currentUser;
        processedText = processedText.replace(/\{\{user\}\}/gi, userName);
      }
      if (characterName) {
        processedText = processedText.replace(/\{\{char\}\}/gi, characterName);
      }

      // Cache the result
      highlightCache.current.set(cacheKey, processedText);

      return processedText;
    }
    
    // Non-generating messages should always be processed without special handling
    
    // Handle completely empty content for non-streaming cases
    if ((!text || text.trim() === '') && !isGenerating) {
      // For completed messages with no content, return an empty space
      // This ensures the bubble renders properly
      return ' '; 
    }
    // Regular processing for non-generating messages
    // First sanitize the text, then trim leading newlines
    const sanitizedText = sanitizeChatOutput(text || '');
    const trimmedContent = trimLeadingNewlines(sanitizedText);
    const cacheKey = `${trimmedContent}_${currentUser || ''}_${characterName || ''}`;
    
    if (highlightCache.current.has(cacheKey)) {
      return highlightCache.current.get(cacheKey)!;
    }    
    let processedText = trimmedContent;
    if (currentUser) {
      const userName = typeof currentUser === 'object' ? formatUserName(currentUser) : currentUser;
      processedText = processedText.replace(/\{\{user\}\}/gi, userName);
    }
    if (characterName) {
      processedText = processedText.replace(/\{\{char\}\}/gi, characterName);
    }

    // Apply the removeIncompleteSentences feature when:
    // 1. The message is from the assistant
    // 2. The message is not currently generating
    // 3. The feature is enabled in settings
    if (message.role === 'assistant' && !isGenerating && settings.remove_incomplete_sentences) {
      processedText = removeIncompleteSentences(processedText);
    }

    // Cache the result
    highlightCache.current.set(cacheKey, processedText);    
    return processedText;
  }, [currentUser, characterName, isGenerating, message.role, streamingStarted, trimLeadingNewlines, sanitizeChatOutput, settings.remove_incomplete_sentences]);

  // Process the message content with variables replaced
  useEffect(() => {
    const processedContent = processContent(message.content);
    
    // Process any markdown images that might be in the content
    // This ensures images render properly in both editing and generating states
    let contentWithImages = processedContent;
    if (processedContent.includes('![')) {
      // Use the existing markdownToHtml function from your utils
      contentWithImages = markdownToHtml(processedContent);
    }
    
    setHtmlContent(contentWithImages);
    previousContent.current = message.content;
  }, [message.content, processContent]);

  // Handle copy message action
  const handleCopy = () => {
    navigator.clipboard.writeText(htmlContent);
    setCopied(true);
    setTimeout(() => {
      if (isMounted.current) {
        setCopied(false);
      }
    }, 2000);
  };

  // Determine if variations are available
  const hasVariations = message.variations && message.variations.length > 1;
  const variationIndex = message.currentVariation || 0;
  const variationCount = message.variations ? message.variations.length : 0;
  // Helper to get user name display - already using formatUserName function which handles both string and UserProfile objects
  const formattedUserName = currentUser ? formatUserName(currentUser) : 'User';
  
  // Debug log for empty messages
  if (!message.content && !isGenerating) {
    console.warn(`[ChatBubble] Rendering bubble with empty content: ID=${message.id}, Role=${message.role}`);
  }
  // Use original styling with performance optimizations
  return (
    <div className="w-full rounded-lg transition-colors bg-stone-800 text-white performance-contain performance-transform">
      {/* Message header - shows name and buttons */}
      <div className="px-4 pt-2 flex justify-between items-center performance-contain">
        <div className="font-medium text-sm">
          {message.role === 'assistant' ? characterName : formattedUserName}
        </div>

        <div className="flex items-center gap-1 performance-contain performance-transform">
          {/* Show different buttons based on message role and state */}
          {message.role === 'assistant' && (
            <>
              {/* Copy button - use the copy functionality */}
              <button
                onClick={handleCopy}
                className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors"
                title={copied ? "Copied!" : "Copy message"}
              >
                <Copy size={16} />
                {copied && <span className="sr-only">Copied!</span>}
              </button>
              
              {/* Regeneration buttons */}
              {isFirstMessage && onRegenerateGreeting && !isGenerating && (
                <button
                  onClick={onRegenerateGreeting}
                  disabled={isRegeneratingGreeting}
                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors"
                  title="Regenerate greeting"
                >
                  <Sparkles size={16} />
                </button>
              )}
              
              {/* Try again button for non-greeting messages */}
              {!isFirstMessage && onTryAgain && !isGenerating && (
                <button
                  onClick={onTryAgain}
                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors"
                  title="Regenerate response"
                >
                  <RotateCw size={16} />
                </button>
              )}
              
              {/* Continue button */}
              {onContinue && !isGenerating && (
                <button
                  onClick={onContinue}
                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors"
                  title="Continue response"
                >
                  <StepForward size={16} />
                </button>
              )}
              
              {/* Variation controls */}
              {hasVariations && !isGenerating && (
                <div className="flex items-center">
                  <button
                    onClick={onPrevVariation}
                    disabled={variationIndex <= 0}
                    className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Previous variation"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  
                  <span className="text-xs text-stone-500 mx-1">
                    {variationIndex + 1}/{variationCount}
                  </span>
                  
                  <button
                    onClick={onNextVariation}
                    disabled={variationIndex >= variationCount - 1}
                    className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Next variation"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              
              {/* Stop generation button */}
              {isGenerating && onStop && (
                <button
                  onClick={onStop}
                  className="p-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
                  title="Stop generation"
                >
                  <Pause size={16} />
                </button>
              )}
            </>
          )}

          {/* Show delete button for all message types when not generating */}
          {!isGenerating && (
            <button
              onClick={onDelete}
              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors"
              title="Delete message"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>      {/* Message content */}
      <div className="p-4 pt-2 performance-contain">
        {isGenerating || isRegeneratingGreeting ? (
          /* Show non-editable content with cursor while generating */
          <div className="streaming-content whitespace-pre-wrap break-words performance-contain performance-transform">
            <div 
              className="prose prose-invert max-w-none performance-contain"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
            {/* Animating cursor for generating state */}
            <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse"></span>
          </div>
        ) : (
          /* Rich text editor for editable content */
          <RichTextEditor
            content={htmlContent}
            onChange={(html) => {
              if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
              }
              
              // Debounce saving changes
              saveTimeoutRef.current = setTimeout(() => {
                if (html !== htmlContent) {
                  // The content passed to onContentChange will be stored directly 
                  // without going through processContent again, which is correct
                  // because we don't want to remove incomplete sentences from user edits
                  onContentChange(html);
                }
              }, 1000);
              
              setHtmlContent(html);
            }}
            className="chat-bubble-editor"
            preserveWhitespace={true}
          />
        )}
      </div>
    </div>
  );
});

export default ChatBubble;