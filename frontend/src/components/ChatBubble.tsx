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
  const contentRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);
  const previousContent = useRef<string>(message.content);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const highlightCache = useRef(new Map<string, string>());
  const [copied, setCopied] = useState(false);
  
  // Enhanced cursor position tracking
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isEditingRef = useRef(false);
  const lastCursorPosition = useRef<{
    node: Node | null;
    offset: number;
    textContent: string | null;
    percentPosition?: number;
  }>({
    node: null,
    offset: 0,
    textContent: null
  });

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
  
  // Save cursor position before any content changes
  const saveCursorPosition = useCallback(() => {
    if (!contentRef.current) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    
    // Make sure we're within our content element
    if (!contentRef.current.contains(container)) return;
    
    // Store the current cursor position with more context
    lastCursorPosition.current = {
      node: container,
      offset: range.startOffset,
      textContent: container.textContent
    };
    
    // Also store the full content to help with position restoration
    if (contentRef.current) {
      const fullText = contentRef.current.textContent || '';
      // Find approximate character position within the full text
      if (container.nodeType === Node.TEXT_NODE && container.textContent) {
        // Compute approximate position in the full text
        let charPosition = 0;
        let found = false;
        
        // Simple function to iterate through text nodes
        const findPositionInTextNodes = (node: Node, targetNode: Node): boolean => {
          if (node === targetNode) {
            found = true;
            return true;
          }
          
          if (node.nodeType === Node.TEXT_NODE) {
            if (!found) {
              charPosition += node.textContent?.length || 0;
            }
          } else {
            for (let i = 0; i < node.childNodes.length; i++) {
              if (findPositionInTextNodes(node.childNodes[i], targetNode)) {
                return true;
              }
            }
          }
          
          return false;
        };
        
        findPositionInTextNodes(contentRef.current, container);
        charPosition += range.startOffset;
        
        // Save the global position as a percentage of the total length
        if (fullText.length > 0) {
          const percentPosition = charPosition / fullText.length;
          lastCursorPosition.current.percentPosition = percentPosition;
        }
      }
    }
  }, []);

  // Restore cursor position after content updates
  const restoreCursorPosition = useCallback(() => {
    if (!contentRef.current || !lastCursorPosition.current.node) return;
    
    try {
      const selection = window.getSelection();
      if (!selection) return;
      
      // Don't attempt cursor restoration if we're not in edit mode anymore
      if (!isEditingRef.current) return;
      
      // Create a new range
      const range = document.createRange();
      const fullText = contentRef.current.textContent || '';
      
      // If we have a percentage position from the total text, use that
      if ('percentPosition' in lastCursorPosition.current && 
          lastCursorPosition.current.percentPosition !== undefined && 
          lastCursorPosition.current.percentPosition >= 0 && 
          fullText.length > 0) {
          
        const approxCharPos = Math.floor(lastCursorPosition.current.percentPosition * fullText.length);
        
        // Find the appropriate text node and offset
        let currentPos = 0;
        let targetNode: Node | null = null;
        let targetOffset = 0;
        
        const findNodeAtPosition = (node: Node): boolean => {
          if (node.nodeType === Node.TEXT_NODE) {
            const nodeLength = node.textContent?.length || 0;
            if (currentPos <= approxCharPos && approxCharPos < currentPos + nodeLength) {
              targetNode = node;
              targetOffset = approxCharPos - currentPos;
              return true;
            }
            currentPos += nodeLength;
          } else {
            for (let i = 0; i < node.childNodes.length; i++) {
              if (findNodeAtPosition(node.childNodes[i])) {
                return true;
              }
            }
          }
          return false;
        };
        
        findNodeAtPosition(contentRef.current);
        
        // If we found an appropriate node, set the cursor there
        if (targetNode) {
          range.setStart(targetNode, targetOffset);
          range.setEnd(targetNode, targetOffset);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
      }
      
      // Fallback: try to find a similar text node to where we were
      const savedText = lastCursorPosition.current.textContent;
      const savedOffset = lastCursorPosition.current.offset;
      
      if (savedText) {
        // Get all text nodes
        const textNodes: Node[] = [];
        const findTextNodes = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            textNodes.push(node);
          } else {
            for (let i = 0; i < node.childNodes.length; i++) {
              findTextNodes(node.childNodes[i]);
            }
          }
        };
        
        findTextNodes(contentRef.current);
        
        // Find the best matching text node
        let bestMatchNode = null;
        let bestMatchScore = -1;
        
        for (const node of textNodes) {
          const nodeText = node.textContent || '';
          if (nodeText === savedText) {
            // Perfect match!
            bestMatchNode = node;
            break;
          }
          
          // Check for partial matches
          if (savedText.includes(nodeText) || nodeText.includes(savedText)) {
            const matchLength = Math.min(nodeText.length, savedText.length);
            if (matchLength > bestMatchScore) {
              bestMatchScore = matchLength;
              bestMatchNode = node;
            }
          }
        }
        
        if (bestMatchNode) {
          // Adjust offset if needed
          const offset = Math.min(savedOffset, (bestMatchNode.textContent || '').length);
          range.setStart(bestMatchNode, offset);
          range.setEnd(bestMatchNode, offset);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
      }
      
      // Final fallback: just place cursor at the end
      // Get all text nodes for the final fallback
      const textNodes: Node[] = [];
      const collectTextNodes = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          textNodes.push(node);
        } else {
          for (let i = 0; i < node.childNodes.length; i++) {
            collectTextNodes(node.childNodes[i]);
          }
        }
      };
      
      collectTextNodes(contentRef.current);
      
      if (textNodes.length > 0) {
        const lastNode = textNodes[textNodes.length - 1];
        const offset = lastNode.textContent?.length || 0;
        range.setStart(lastNode, offset);
        range.setEnd(lastNode, offset);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (e) {
      console.error('Error restoring cursor position:', e);
    }
  }, []);

  // Improved handle input with better debouncing
  const handleInput = useCallback(() => {
    if (!contentRef.current || !isMounted.current) return;
    
    // Save cursor position before any updates
    saveCursorPosition();
    
    // Mark that we're actively editing
    isEditingRef.current = true;
    setIsEditing(true);
    
    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set a new timeout
    saveTimeoutRef.current = setTimeout(() => {
      if (!isMounted.current || !contentRef.current) return;
      
      // Double-check the current content at save time
      const finalContent = contentRef.current.textContent || '';
      
      // Save cursor position again right before we update
      saveCursorPosition();
      
      // Only update if content has actually changed
      if (finalContent !== message.content) {
        console.debug(`Calling onContentChange with new content after ${isGenerating ? 'generating' : 'editing'}`);
        onContentChange(finalContent);
        
        // Important: wait for React to process the update then restore cursor
        setTimeout(() => {
          if (isMounted.current) {
            restoreCursorPosition();
          }
        }, 0);
      } else {
        console.debug('Content unchanged, not saving');
      }
      
      // Clear the timeout reference
      saveTimeoutRef.current = null;
    }, 2000); // Increased to 2 seconds for a better user experience
  }, [message.content, onContentChange, saveCursorPosition, restoreCursorPosition, isGenerating]);

  // Improved handle blur to save on focus loss
  const handleBlur = useCallback(() => {
    // When user stops editing, clear any pending save timer
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    // Only process if component is still mounted
    if (!isMounted.current || !contentRef.current) return;
    
    const finalContent = contentRef.current.textContent || '';
    
    // Save cursor position before we lose focus completely
    saveCursorPosition();
    
    // Only save if content actually changed
    if (finalContent !== message.content) {
      onContentChange(finalContent);
    }
    
    // Set a short timeout before marking as no longer editing
    // This helps with any focus-related race conditions
    setTimeout(() => {
      if (isMounted.current) {
        isEditingRef.current = false;
        setIsEditing(false);
      }
    }, 100);
  }, [message.content, onContentChange, saveCursorPosition]);

  // Handle paste events to ensure clean text
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    
    // Save cursor position before paste
    saveCursorPosition();
    
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

    // After paste operation, save new cursor position
    setTimeout(saveCursorPosition, 0);
  }, [handleInput, saveCursorPosition]);

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
            onFocus={() => {
              isEditingRef.current = true;
              saveCursorPosition();
            }}
            onKeyDown={(e) => {
              // Save position on key events to handle more complex editing
              if (e.key !== 'Tab' && e.key !== 'Escape') {
                saveCursorPosition();
              }
            }}
            onMouseUp={() => {
              // Save position on mouse selection changes
              saveCursorPosition();
            }}
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