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
  GitFork,
} from 'lucide-react';
import { Message, UserProfile } from '../../types/messages';
import RichTextEditor from '../RichTextEditor';
import { formatUserName } from '../../utils/formatters';
import { markdownToHtml, htmlToPlainText } from '../../utils/contentUtils';

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
  onFork?: (bringCount: number | 'all') => void; // New prop for forking chat from this message
  currentUser?: string | UserProfile; // Updated to accept both string and UserProfile
  characterName?: string;
  triggeredLoreImages?: string[]; // Lore images to display inline
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
  onFork,
  currentUser,
  characterName,
  triggeredLoreImages = []
}) => {
  const isMounted = useRef(true);
  const previousContent = useRef<string>(message.content);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const highlightCache = useRef(new Map<string, string>());
  const [copied, setCopied] = useState(false);
  const [streamingStarted, setStreamingStarted] = useState(false);
  const hasReceivedContent = useRef(false);
  const generationStartTime = useRef<number | null>(null);

  // Fork dropdown state
  const [showForkDropdown, setShowForkDropdown] = useState(false);
  const forkDropdownRef = useRef<HTMLDivElement>(null);

  // Initialize generation start time
  useEffect(() => {
    if (isGenerating && !generationStartTime.current) {
      generationStartTime.current = Date.now();
    } else if (!isGenerating) {
      generationStartTime.current = null;
    }
  }, [isGenerating]);

  // Track content changes (incomplete sentence removal is now handled in useChatMessages.setGenerationComplete)
  useEffect(() => {
    previousContent.current = message.content;
  }, [message.content]);

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

  // Close fork dropdown when clicking outside
  useEffect(() => {
    if (!showForkDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (forkDropdownRef.current && !forkDropdownRef.current.contains(event.target as Node)) {
        setShowForkDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showForkDropdown]);

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
    }

    // Note: Incomplete sentence removal is now handled in useChatMessages.setGenerationComplete()
    // This ensures it only runs once when generation finishes, not during user edits

    // Cache the result
    highlightCache.current.set(cacheKey, processedText);
    return processedText;
  }, [currentUser, characterName, isGenerating, message.role, streamingStarted, trimLeadingNewlines, sanitizeChatOutput]);  // Process the message content with variables replaced
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

  // Determine the display name for assistant messages
  // Priority: metadata.speakerName > characterName prop > 'Assistant'
  const speakerDisplayName = message.role === 'assistant'
    ? (message.metadata?.speakerName as string | undefined) || characterName || 'Assistant'
    : formattedUserName;

  // Check if this is an ally interjection (for potential visual differentiation)
  const isAllyMessage = message.metadata?.speakerRole === 'ally';

  // Debug log for empty messages - only warn for non-assistant messages or completed assistant messages
  if (!message.content && !isGenerating && message.role !== 'assistant') {
    console.warn(`[ChatBubble] Rendering bubble with empty content: ID=${message.id}, Role=${message.role}`);
  }
  // For assistant messages, only warn if they're marked as complete but still empty
  if (!message.content && message.role === 'assistant' && message.status === 'complete') {
    console.warn(`[ChatBubble] Rendering completed assistant message with empty content: ID=${message.id}`);
  }  // Use original styling with performance optimizations
  return (
    <div className={`group w-full rounded-lg transition-colors text-white performance-contain performance-transform ${
      isAllyMessage ? 'bg-stone-800/90 border-l-2 border-purple-500/50' : 'bg-stone-800'
    }`}>
      {/* Message header - shows name and buttons */}
      <div className="px-4 pt-2 flex justify-between items-center performance-contain">
        <div className={`font-medium text-sm ${isAllyMessage ? 'text-purple-300/70' : 'text-white/50'}`}>
          {speakerDisplayName}
          {isAllyMessage && <span className="ml-1.5 text-xs text-purple-400/50">(companion)</span>}
        </div>

        <div className="flex items-center gap-1 performance-contain performance-transform">
          {/* Show different buttons based on message role and state */}
          {message.role === 'assistant' && (
            <>
              {/* Hover-reveal action buttons */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                {/* Copy button */}
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
              </div>

              {/* Always-visible: Variation controls (pagination) */}
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

              {/* Always-visible: Stop generation button */}
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

          {/* Hover-reveal: Fork and Delete for all message types when not generating */}
          {!isGenerating && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {/* Fork from here dropdown */}
              {onFork && (
                <div className="relative" ref={forkDropdownRef}>
                  <button
                    onClick={() => setShowForkDropdown(!showForkDropdown)}
                    className="p-1.5 text-stone-400 hover:text-purple-400 hover:bg-stone-700 rounded-lg transition-colors"
                    title="Fork chat from here"
                  >
                    <GitFork size={16} />
                  </button>
                  {showForkDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-36 bg-stone-800 border border-stone-600 rounded-lg shadow-lg py-1 z-50">
                      <div className="px-3 py-1.5 text-xs text-stone-400 border-b border-stone-700">
                        Bring History
                      </div>
                      <button
                        onClick={() => {
                          onFork(5);
                          setShowForkDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-stone-700 transition-colors"
                      >
                        Bring 5
                      </button>
                      <button
                        onClick={() => {
                          onFork(10);
                          setShowForkDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-stone-700 transition-colors"
                      >
                        Bring 10
                      </button>
                      <button
                        onClick={() => {
                          onFork('all');
                          setShowForkDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-stone-700 transition-colors"
                      >
                        Bring All
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={onDelete}
                className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors"
                title="Delete message"
              >
                <Trash2 size={16} />
              </button>
            </div>
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

        {/* Triggered lore images - display inline below message */}
        {triggeredLoreImages && triggeredLoreImages.length > 0 && message.role === 'assistant' && (
          <div className="lore-images-container mt-3 flex gap-2 flex-wrap">
            {triggeredLoreImages.map((imagePath, idx) => (
              <img
                key={`${imagePath}-${idx}`}
                src={imagePath}
                className="lore-image rounded max-h-32 object-cover border border-stone-700 hover:border-stone-500 transition-colors"
                alt="Triggered lore"
                title="Lore entry triggered"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatBubble;