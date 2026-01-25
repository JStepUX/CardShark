// hooks/useScrollToBottom.ts
import { useRef, useCallback } from 'react';

/**
 * Dispatches a global event to scroll to a newly added API card
 */
export function scrollToNewApiCard() {
  window.dispatchEvent(new Event('cardshark:scroll-to-api-card'));
}

/**
 * Custom hook for managing scroll-to-bottom behavior in container elements
 * @returns Object with refs and scrollToBottom function
 */
export function useScrollToBottom() {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (!containerRef.current || !endRef.current) return;

    // Use scrollIntoView with specific options
    endRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
      inline: 'nearest'
    });

    // Double-check scroll position with a slight delay to account for layout adjustments
    setTimeout(() => {
      const container = containerRef.current;
      const endElement = endRef.current;
      if (!container || !endElement) return;

      // Check if we're actually at the bottom
      const containerRect = container.getBoundingClientRect();
      const endElementRect = endElement.getBoundingClientRect();

      // If we're not close enough to the bottom, force direct scrolling
      const scrollOffset = endElementRect.bottom - containerRect.bottom;
      if (Math.abs(scrollOffset) > 20) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }, []);

  return {
    endRef,
    containerRef,
    scrollToBottom
  };
}

/**
 * Dispatches a global event to trigger scroll-to-bottom in any listening component
 * Use this when updating message content during streaming from outside ChatView
 */
export function dispatchScrollToBottom() {
  window.dispatchEvent(new Event('cardshark:scroll-to-bottom'));
}

// Add an event listener wrapper for global scrolling
export function setupScrollToBottomEvent(scrollCallback: () => void) {
  // Create the event handler
  const handleScrollToBottom = () => {
    scrollCallback();
  };
  
  // Add the event listener
  window.addEventListener('cardshark:scroll-to-bottom', handleScrollToBottom);
  
  // Return a cleanup function
  return () => {
    window.removeEventListener('cardshark:scroll-to-bottom', handleScrollToBottom);
  };
}
