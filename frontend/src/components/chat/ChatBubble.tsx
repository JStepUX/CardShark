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
import { Message, UserProfile } from '../../types/messages';
import RichTextEditor from '../RichTextEditor';
import { formatUserName } from '../../utils/formatters';
import { markdownToHtml, htmlToPlainText } from '../../utils/contentUtils';  // Import markdownToHtml and htmlToPlainText
// removeIncompleteSentences removed
import { useSettings } from '../../contexts/SettingsContext'; // Import the settings context hook

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
    // Only run this cleanup if:
    // 1. Not currently generating
    // 2. Not regenerating a greeting
    // 3. The content has changed (to avoid loops)
    // 4. Message status is not streaming (it's done)
    // 5. It's an assistant message
    // 6. Feature is enabled

    // We disable this during active editing because we can't reliably distinguish between
    // "AI finished generating" and "User is editing and paused typing".
    // If the user edits the message, we assume they are taking control and we shouldn't
    // interfere with their text, even if it looks incomplete.

    if (!isGenerating &&
      !isRegeneratingGreeting &&
      previousContent.current !== message.content &&
      message.status !== 'streaming' &&
      message.role === 'assistant' &&
      settings.remove_incomplete_sentences &&
      message.content) {

      // Commented out to prevent interfering with user edits.
      // The cleanup of incomplete sentences should ideally happen only at the exact moment
      // generation finishes, but doing it in this effect risks catching manual edits too.

      /*
      if (DEBUG_CHAT_PROCESSING) {
        console.debug('[ChatBubble] Applying incomplete sentence removal to:', message.content);
      }
      const processedContent = removeIncompleteSentences(message.content);
      if (DEBUG_CHAT_PROCESSING) {
        console.debug('[ChatBubble] Processed content:', processedContent);
      }
      if (processedContent !== message.content) {
        onContentChange(processedContent);
      }
      */
    }
    previousContent.current = message.content;
  }, [isGenerating, isRegeneratingGreeting, message.content, message.role, message.status, onContentChange, settings.remove_incomplete_sentences]);

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
  const sanitizeChatOutput = useCallback((text: string, charName?: string): string => {
    // Remove "{{user}}:" and "{{char}}:" patterns at the beginning of output
    let sanitized = text
      .replace(/^\s*\{\{user\}\}:\s*/i, '')
      .replace(/^\s*\{\{char\}\}:\s*/i, '');

    // Also remove the actual character name followed by ": " if provided
    if (charName) {
      const charPattern = new RegExp(`^\\s*${charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i');
      sanitized = sanitized.replace(charPattern, '');
    }

    return sanitized;
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
      const sanitizedText = sanitizeChatOutput(text || '', characterName);
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
    const sanitizedText = sanitizeChatOutput(text || '', characterName);
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
    }    // Apply the removeIncompleteSentences feature when:
    // 1. The message is from the assistant
    // 2. The message is not currently generating
    // 3. The feature is enabled in settings
    // 4. The message status is 'complete' (not 'streaming')
    // 5. IMPORTANT: We skip this for processed text derived from edits (handled elsewhere) or if we want to be more conservative
    if (message.role === 'assistant' &&
      !isGenerating &&
      settings.remove_incomplete_sentences &&
      message.status !== 'streaming') {
      // Re-running this on every render can be problematic if it prunes content that was just edited.
      // Ideally, incomplete sentence removal should only happen ONCE after generation finishes.
      // However, processContent is called during render. 

      // FIX: We should rely on the effect at lines 71-93 to update the message content permanently 
      // rather than doing it on-the-fly here, which affects display but not the underlying message if not saved back.
      // OR, we must ensure this doesn't fight with user edits.

      // Current behavior: It modifies 'processedText' which is displayed.
      // If the user edits the text, 'message.content' updates.
      // Then this runs again on the NEW content. If the user just added a sentence but didn't finish it (e.g. typing), 
      // this might visually clip it if it weren't for the fact that this is inside 'processContent'.
      // But 'processContent' is called on render.

      // If the user is editing, they are using RichTextEditor with 'htmlContent'.
      // 'htmlContent' is initialized from 'processContent(message.content)'.
      // When the user types, 'onChange' updates 'htmlContent' locally and calls 'onContentChange' debounced.
      // 'onContentChange' updates the parent 'message.content'.
      // When 'message.content' changes, 'processContent' runs again, creating a NEW 'htmlContent'.

      // If 'removeIncompleteSentences' strips the end of the user's edit because they haven't typed the period yet,
      // it will feel like the text is disappearing.

      // To fix this, we should NOT apply removeIncompleteSentences inside processContent if we can avoid it,
      // or at least be very careful.
      // The Effect at line 71 handles the post-generation cleanup. 
      // Doing it here as well seems redundant and dangerous for edits.

      // Disabling this call here to prevent fighting with edits.
      // processedText = removeIncompleteSentences(processedText);
    }

    // Cache the result
    highlightCache.current.set(cacheKey, processedText);
    return processedText;
  }, [currentUser, characterName, isGenerating, message.role, streamingStarted, trimLeadingNewlines, sanitizeChatOutput, settings.remove_incomplete_sentences]);  // Process the message content with variables replaced
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
  // Debug log for empty messages - only warn for non-assistant messages or completed assistant messages
  if (!message.content && !isGenerating && message.role !== 'assistant') {
    console.warn(`[ChatBubble] Rendering bubble with empty content: ID=${message.id}, Role=${message.role}`);
  }
  // For assistant messages, only warn if they're marked as complete but still empty
  if (!message.content && message.role === 'assistant' && message.status === 'complete') {
    console.warn(`[ChatBubble] Rendering completed assistant message with empty content: ID=${message.id}`);
  }  // Use original styling with performance optimizations
  return (
    <div className="w-full rounded-lg transition-colors bg-stone-800 text-white performance-contain performance-transform">
      {/* Message header - shows name and buttons */}
      <div className="px-4 pt-2 flex justify-between items-center performance-contain">
        <div className="font-medium text-sm text-white/50">
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
            <span className="inline-block w-2 h-4 bg-stone-400 ml-1 animate-pulse"></span>
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
                  // Convert HTML to plain text before storing to prevent HTML pollution in exports
                  const plainText = htmlToPlainText(html);
                  onContentChange(plainText);
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