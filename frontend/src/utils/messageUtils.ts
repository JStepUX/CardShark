// utils/messageUtils.ts
import { Message } from '../types/messages';
import { generateUUID } from './uuidUtils';
import { substituteVariables } from './variableUtils';

export const MessageUtils = {
  /**
   * Generate a unique ID for a message
   */
  generateUUID,
  
  /**
   * Create a debounced save function for efficient message saving
   */
  createDebouncedSave: (
    // Allow saveFunction to be async and return a Promise
    saveFunction: (messages: Message[]) => Promise<any>,
    delay: number = 1000
  ) => {
    let timer: NodeJS.Timeout | null = null;
    
    return (messages: Message[]) => {
      console.debug(`Debounced save requested for chat`);
      
      // Clear any existing timer
      if (timer) {
        clearTimeout(timer);
        console.debug(`Cleared existing chat save timer`);
      }
      
      // Create a new timer
      timer = setTimeout(async () => {
        console.debug(`Executing debounced save for chat`);
        try {
          await saveFunction(messages);
        } catch (error) {
          console.error("Error during debounced save:", error);
          // Optionally, handle or propagate the error
        } finally {
          timer = null; // Clear the timer reference after execution
        }
      }, delay);
    };
  },
  
  /**
   * Create a user message
   * @param content Message content
   * @returns Message object
   */
  createUserMessage: (content: string): Message => {
    return {
      id: generateUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    };
  },
  
  /**
   * Create an assistant message with variable substitution
   * @param content Optional initial content
   * @param userName User name for substitution
   * @param characterName Character name for substitution
   * @returns Message object
   */
  createAssistantMessage: (
    content: string = '', 
    userName?: string | null,
    characterName?: string | null
  ): Message => {
    // Apply variable substitution if userName or characterName are provided
    const processedContent = substituteVariables(content, userName, characterName);
    
    return {
      id: generateUUID(),
      role: 'assistant',
      content: processedContent,
      timestamp: Date.now(),
      variations: processedContent ? [processedContent] : [],
      currentVariation: 0
    };
  },
  
  /**
   * Add a variation to a message
   * @param message Original message
   * @param newContent New content to add as variation
   * @returns Updated message with the new variation
   */
  addVariation: (message: Message, newContent: string): Message => {
    // Create a copy of variations or initialize it
    const variations = [...(message.variations || [])];
    
    // Add the new content if it doesn't already exist
    if (!variations.includes(newContent)) {
      variations.push(newContent);
    }
    
    // Find the index of the new content
    const variationIndex = variations.indexOf(newContent);
    
    return {
      ...message,
      content: newContent,
      variations: variations,
      currentVariation: variationIndex
    };
  },
  
  /**
   * Cycle to the next or previous variation
   * @param message Message with variations
   * @param direction 'next' or 'prev'
   * @returns Updated message with new current variation
   */
  cycleVariation: (message: Message, direction: 'next' | 'prev'): Message => {
    if (!message.variations || message.variations.length <= 1) {
      return message;
    }
    
    const currentIndex = message.currentVariation ?? 0;
    const count = message.variations.length;
    
    let newIndex: number;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % count;
    } else {
      newIndex = (currentIndex - 1 + count) % count;
    }
    
    return {
      ...message,
      content: message.variations[newIndex],
      currentVariation: newIndex
    };
  }
};