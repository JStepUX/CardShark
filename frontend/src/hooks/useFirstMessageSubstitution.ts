import { useCallback, useEffect } from 'react';
import { substituteVariables } from '../utils/variableUtils';

/**
 * This hook ensures that first_mes content is properly substituted with variables
 * when a new chat is started or loaded.
 * 
 * @param userName The current user name for {{user}} substitution
 * @param characterName The character name for {{char}} substitution
 */
export function useFirstMessageSubstitution(
  userName: string | null | undefined,
  characterName: string | null | undefined
) {
  // Process the first message when it's being created
  const processFirstMessage = useCallback((content: string): string => {
    return substituteVariables(content, userName, characterName);
  }, [userName, characterName]);

  // Set up an event to allow intercepting first message creation
  useEffect(() => {
    const handleFirstMessageEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.messageContent) {
        // Run the substitution
        const substitutedContent = processFirstMessage(customEvent.detail.messageContent);
        
        // Return substituted content
        customEvent.detail.substituteWith = substitutedContent;
      }
    };
    
    // Listen for first message creation events
    window.addEventListener('cardshark:process-first-message', handleFirstMessageEvent);
    
    return () => {
      window.removeEventListener('cardshark:process-first-message', handleFirstMessageEvent);
    };
  }, [processFirstMessage]);
  
  return processFirstMessage;
}
