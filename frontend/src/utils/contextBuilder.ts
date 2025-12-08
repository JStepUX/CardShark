/**
 * contextBuilder.ts - Shared utility for building LLM context messages
 * 
 * This module centralizes the context-building logic that was previously duplicated
 * in ChatContext.tsx and useChatMessages.ts. It ensures consistent handling of:
 * - Message filtering (thinking messages, excluded IDs)
 * - User message inclusion (fixes async state bug)
 * - Content sanitization
 * - Reasoning insertion
 * - Context window limits
 */

import type { Message, PromptContextMessage } from '../services/chat/chatTypes';
import { sanitizeMessageContent } from '../services/chat/chatUtils';

/**
 * Default maximum number of messages to include in context
 */
const DEFAULT_MAX_MESSAGES = 20;

/**
 * Options for building context messages
 */
export interface BuildContextOptions {
  /** Existing messages from state (may be stale due to async React state) */
  existingMessages: Message[];
  
  /** 
   * New user message to explicitly include.
   * CRITICAL: This fixes the async state bug where the user's message
   * might not be in existingMessages yet due to React's async state updates.
   */
  newUserMessage?: Message;
  
  /** Message ID to exclude from context (e.g., the assistant placeholder being generated) */
  excludeMessageId?: string;
  
  /** 
   * Optional reasoning text to append after the user message.
   * This represents the assistant's internal thoughts before generating the response.
   */
  reasoning?: string | null;
  
  /** Maximum number of messages to include (default: 20) */
  maxMessages?: number;
}

/**
 * Builds a properly formatted array of context messages for LLM generation.
 * 
 * This function handles all the edge cases that previously caused bugs:
 * 1. Filters out 'thinking' messages (internal reasoning, not for context)
 * 2. Excludes specified message IDs (e.g., the assistant placeholder)
 * 3. Limits context to maxMessages (prevents token overflow)
 * 4. Explicitly includes newUserMessage (fixes async state bug)
 * 5. Sanitizes content (strips HTML, normalizes whitespace)
 * 6. Maps to API format { role, content }
 * 7. Appends reasoning AFTER user message (correct position for LLM)
 * 
 * @param options - Configuration options for building context
 * @returns Array of formatted context messages ready for API
 * 
 * @example
 * // Basic usage in generateResponse
 * const context = buildContextMessages({
 *   existingMessages: state.messages,
 *   newUserMessage: userMessage,
 *   excludeMessageId: assistantMessage.id
 * });
 * 
 * @example
 * // With reasoning enabled
 * const context = buildContextMessages({
 *   existingMessages: state.messages,
 *   newUserMessage: userMessage,
 *   excludeMessageId: assistantMessage.id,
 *   reasoning: "The user seems to be asking about..."
 * });
 * 
 * @example
 * // For regeneration (user message already in state)
 * const context = buildContextMessages({
 *   existingMessages: state.messages.slice(0, messageIndex),
 *   excludeMessageId: messageToRegenerate.id,
 *   reasoning: reasoningText
 * });
 */
export function buildContextMessages(options: BuildContextOptions): PromptContextMessage[] {
  const {
    existingMessages,
    newUserMessage,
    excludeMessageId,
    reasoning,
    maxMessages = DEFAULT_MAX_MESSAGES
  } = options;

  // Step 1: Filter existing messages
  // - Remove 'thinking' messages (internal reasoning, not for API context)
  // - Remove excluded message ID (typically the assistant placeholder being generated)
  let filteredMessages = existingMessages.filter(msg => 
    msg.role !== 'thinking' && 
    msg.id !== excludeMessageId
  );

  // Step 2: Apply context window limit (take most recent messages)
  filteredMessages = filteredMessages.slice(-maxMessages);

  // Step 3: Handle variations - use current variation content if available
  const messagesWithVariations = filteredMessages.map(msg => {
    const content = (msg.variations && typeof msg.currentVariation === 'number')
      ? msg.variations[msg.currentVariation]
      : msg.content;
    return { ...msg, content: content || '' };
  });

  // Step 4: Add new user message if provided
  // CRITICAL: This fixes the async state bug where React state updates are async
  // and the user's message might not be in existingMessages yet
  const allMessages = newUserMessage 
    ? [...messagesWithVariations, newUserMessage]
    : messagesWithVariations;

  // Step 5: Map to API format with sanitized content
  // - Only include roles that the API expects (user, assistant, system)
  // - Sanitize content to strip HTML and normalize whitespace
  let contextMessages: PromptContextMessage[] = allMessages
    .filter(msg => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system')
    .map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: sanitizeMessageContent(msg.content)
    }));

  // Step 6: Append reasoning if provided
  // IMPORTANT: Reasoning comes AFTER the user message, not before!
  // The reasoning represents the assistant's thoughts about what the user said,
  // so it should appear after the user's message in the context.
  if (reasoning) {
    contextMessages = [
      ...contextMessages,
      { role: 'assistant' as const, content: `(Thinking: ${reasoning})` }
    ];
  }

  return contextMessages;
}

/**
 * Builds context messages specifically for reasoning generation.
 * 
 * This is a convenience wrapper that builds context WITHOUT the user's new message
 * in the base context (since it's passed separately to the reasoning prompt),
 * but ensures the existing conversation history is properly formatted.
 * 
 * @param existingMessages - Messages from state
 * @param excludeMessageId - Message ID to exclude
 * @param maxMessages - Maximum context length
 * @returns Formatted context messages for reasoning
 */
export function buildReasoningContext(
  existingMessages: Message[],
  excludeMessageId?: string,
  maxMessages: number = DEFAULT_MAX_MESSAGES
): PromptContextMessage[] {
  return buildContextMessages({
    existingMessages,
    excludeMessageId,
    maxMessages
    // Note: No newUserMessage - the user input is passed separately to the reasoning prompt
  });
}

/**
 * Type guard to check if a message role is valid for API context
 */
export function isValidContextRole(role: string): role is 'user' | 'assistant' | 'system' {
  return role === 'user' || role === 'assistant' || role === 'system';
}

