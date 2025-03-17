// utils/messageUtils.ts
import { Message } from '../types/messages';
import { generateUUID } from './generateUUID';

export class MessageUtils {
  /**
   * Create a debounced save function for efficient message saving
   * @param saveFunction The function to call when debounce completes
   * @param delay Debounce delay in ms (default: 1000ms)
   */
  static createDebouncedSave(
    saveFunction: (messages: Message[]) => void,
    delay: number = 1000
  ) {
    const pendingSaves = new Map<string, NodeJS.Timeout>();
    
    return (messageId: string, messages: Message[]) => {
      console.debug(`Debounced save requested for message ${messageId}`);
      
      // Clear any existing timer for this message
      if (pendingSaves.has(messageId)) {
        clearTimeout(pendingSaves.get(messageId)!);
        console.debug(`Cleared existing timer for message ${messageId}`);
      }
      
      // Create a new timer
      const timer = setTimeout(() => {
        console.debug(`Executing debounced save for message ${messageId}`);
        saveFunction(messages);
        pendingSaves.delete(messageId);
      }, delay);
      
      // Store the timer reference
      pendingSaves.set(messageId, timer);
    };
  }
  
  /**
   * Create a user message
   * @param content Message content
   * @returns Message object
   */
  static createUserMessage(content: string): Message {
    return {
      id: generateUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    };
  }
  
  /**
   * Create an assistant message
   * @param content Optional initial content
   * @returns Message object
   */
  static createAssistantMessage(content: string = ''): Message {
    return {
      id: generateUUID(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      variations: content ? [content] : [],
      currentVariation: 0
    };
  }
  
  /**
   * Add a variation to a message
   * @param message Original message
   * @param newContent New content to add as variation
   * @returns Updated message with the new variation
   */
  static addVariation(message: Message, newContent: string): Message {
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
  }
  
  /**
   * Cycle to the next or previous variation
   * @param message Message with variations
   * @param direction 'next' or 'prev'
   * @returns Updated message with new current variation
   */
  static cycleVariation(message: Message, direction: 'next' | 'prev'): Message {
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
}