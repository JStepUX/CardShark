// chatUtils.ts - Chat utility functions and helpers
import { stripHtmlTags } from '../context/ContextSerializer';
import { generateUUID } from '../../utils/generateUUID';
import { CharacterCard } from '../../types/schema';
import { Message } from './chatTypes';

/**
 * Content sanitization utility for message processing
 * Removes HTML markup from message content to prevent XSS and formatting issues
 * 
 * @param html - Raw HTML content to sanitize
 * @returns Sanitized plain text content
 */
export const sanitizeMessageContent = (html: string): string => {
  if (!html) return '';
  return stripHtmlTags(html);
};

/**
 * Generic debounce utility for delaying function execution
 * Useful for auto-save operations, search inputs, and API calls
 * 
 * @param func - Function to debounce
 * @param wait - Delay in milliseconds
 * @returns Debounced function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

/**
 * Creates a user message with proper structure and defaults
 * 
 * @param content - Message content from user input
 * @returns Complete user message object
 */
export const createUserMessage = (content: string): Message => ({
  id: generateUUID(),
  role: 'user',
  content,
  timestamp: Date.now(),
  status: 'complete'
});

/**
 * Creates an assistant message with support for variations and streaming
 * 
 * @param content - Initial message content (optional for streaming)
 * @param status - Message status (streaming, complete, etc.)
 * @returns Complete assistant message object with variations support
 */
export const createAssistantMessage = (content: string = '', status: Message['status'] = 'streaming'): Message => ({
  id: generateUUID(),
  role: 'assistant',
  content,
  timestamp: Date.now(),
  status: status,
  variations: content ? [content] : [],
  currentVariation: content ? 0 : undefined,
});

/**
 * Creates a thinking/reasoning message for AI processing display
 * Used to show users when the AI is in reasoning mode
 * 
 * @returns Complete thinking message object
 */
export const createThinkingMessage = (): Message => ({
  id: generateUUID(),
  role: 'thinking',
  content: '', 
  timestamp: Date.now(),
  status: 'streaming'
});

/**
 * Default assistant character configuration
 * Used when no specific character is selected
 */
export const DEFAULT_ASSISTANT_CHARACTER: CharacterCard = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Assistant",
    description: "A helpful AI assistant.",
    personality: "Helpful, knowledgeable, and concise.",
    scenario: "Chatting with the user.",
    first_mes: "Hello! How can I help you today?",
    mes_example: "", 
    creator_notes: "",
    system_prompt: "You are a helpful AI assistant.",
    post_history_instructions: "Provide helpful and relevant information.",
    tags: ["assistant", "ai"],
    creator: "System",
    character_version: "1.0",
    alternate_greetings: [],
    extensions: {
      talkativeness: "0.5",
      fav: false,
      world: "", 
      depth_prompt: { prompt: "", depth: 1, role: "system" }
    },
    group_only_greetings: [],
    character_book: { entries: [], name: "" },
    spec: ''
  },
  name: "Assistant",
  description: "A helpful AI assistant.",
  personality: "Helpful, knowledgeable, and concise.",
  scenario: "Chatting with the user.",
  first_mes: "Hello! How can I help you today?",
  mes_example: "",
  creatorcomment: "",
  avatar: "none",
  chat: "", 
  talkativeness: "0.5",
  fav: false,
  tags: ["assistant", "ai"],
  create_date: new Date().toISOString() 
};

/**
 * Utility functions for message content processing
 */
export const MessageUtils = {
  /**
   * Validates message content for completeness and safety
   */
  validateContent: (content: string): boolean => {
    return typeof content === 'string' && content.trim().length > 0;
  },

  /**
   * Truncates message content to specified length with ellipsis
   */
  truncateContent: (content: string, maxLength: number = 100): string => {
    if (!content || content.length <= maxLength) return content;
    return content.substring(0, maxLength).trim() + '...';
  },

  /**
   * Estimates token count for message content (rough approximation)
   */
  estimateTokenCount: (content: string): number => {
    if (!content) return 0;
    // Rough approximation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }
};

/**
 * Utility functions for chat session management
 */
export const ChatUtils = {
  /**
   * Generates a unique chat session identifier
   */
  generateSessionId: (): string => {
    return `chat_${generateUUID()}`;
  },

  /**
   * Formats timestamp for display in chat interface
   */
  formatTimestamp: (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  /**
   * Calculates total message count for a chat session
   */
  getMessageCount: (messages: Message[]): { total: number; user: number; assistant: number; thinking: number } => {
    const counts = { total: 0, user: 0, assistant: 0, thinking: 0 };
    
    messages.forEach(message => {
      counts.total++;
      if (message.role === 'user') counts.user++;
      else if (message.role === 'assistant') counts.assistant++;
      else if (message.role === 'thinking') counts.thinking++;
    });
    
    return counts;
  }
};
