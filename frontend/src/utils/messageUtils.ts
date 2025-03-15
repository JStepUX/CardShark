// messageUtils.ts
import { Message } from '../types/messages';
import { generateUUID } from './generateUUID';

export class MessageUtils {
  // Create a new user message
  static createUserMessage(content: string): Message {
    return {
      id: generateUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
      variations: [content],
      currentVariation: 0,
    };
  }

  // Create a new assistant message
  static createAssistantMessage(content: string = ''): Message {
    return {
      id: generateUUID(),
      role: 'assistant',
      content,
      timestamp: Date.now() + 1, // Add 1ms to ensure proper ordering
      variations: content ? [content] : [],
      currentVariation: 0,
    };
  }

  // Add a variation to a message
  static addVariation(message: Message, content: string): Message {
    const variations = [...(message.variations || [])];
    if (!variations.includes(content)) {
      variations.push(content);
    }
    
    return {
      ...message,
      content,
      variations,
      currentVariation: variations.length - 1
    };
  }
  
  // Cycle to next/previous variation
  static cycleVariation(message: Message, direction: 'next' | 'prev'): Message {
    if (!message.variations?.length) return message;
    
    const currentIndex = message.currentVariation ?? 0;
    const totalVariations = message.variations.length;
    const newIndex = direction === 'next' 
      ? (currentIndex + 1) % totalVariations 
      : (currentIndex - 1 + totalVariations) % totalVariations;
    
    return {
      ...message,
      content: message.variations[newIndex],
      currentVariation: newIndex
    };
  }
  
  // Create debounced save function
  static createDebouncedSave(saveFunction: Function) {
    const timers: Record<string, NodeJS.Timeout> = {};
    
    return (messageId: string, messages: Message[]) => {
      if (timers[messageId]) {
        clearTimeout(timers[messageId]);
      }
      
      timers[messageId] = setTimeout(() => {
        console.log(`Debounced save triggered for message ${messageId}`);
        saveFunction(messages);
        delete timers[messageId];
      }, 1500);
    };
  }
}