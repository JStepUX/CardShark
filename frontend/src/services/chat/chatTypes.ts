// chatTypes.ts - Centralized chat type definitions and validation
import { z } from 'zod';

// Import base types from their respective files
import type { IMessage, IUserProfile, IChatState } from '../../types/messages';
import type { ReasoningSettings } from '../../types/settings';

// Re-export types with cleaner names for convenience
export type Message = IMessage;
export type UserProfile = IUserProfile;  
export type ChatState = IChatState;
export type { ReasoningSettings };

/**
 * Enhanced chat state interface extending the base ChatState
 * Used specifically by the chat system for generation tracking
 * Note: Session management (currentUser, chatSessionUuid) moved to useChatSession hook
 */
export interface EnhancedChatState {
  messages: Message[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  lastContextWindow: any;
  generatingId: string | null;
  reasoningSettings: ReasoningSettings;
}

/**
 * Message creation parameters for consistent message generation
 */
export interface MessageCreationParams {
  content: string;
  role: 'user' | 'assistant' | 'system' | 'thinking';
  status?: 'streaming' | 'complete' | 'aborted' | 'error' | 'generating_variation';
  variations?: string[];
  currentVariation?: number;
}

/**
 * Chat session metadata for persistence and API calls
 */
export interface ChatSession {
  chatSessionUuid: string;
  characterId?: string;
  userId?: string;
  created_at: number;
  updated_at: number;
  metadata?: Record<string, any>;
}

/**
 * Generation state tracking for UI updates
 */
export interface GenerationState {
  isGenerating: boolean;
  generatingId: string | null;
  abortController: AbortController | null;
}

/**
 * Stream processing state for real-time updates
 */
export interface StreamState {
  isStreaming: boolean;
  currentMessageId: string | null;
  buffer: string;
  timeoutId: NodeJS.Timeout | null;
}

/**
 * Context message type for prompt handling
 * Stricter type than the general Message interface
 */
export interface PromptContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Save chat operation parameters
 */
export interface SaveChatParams {
  chatSessionUuid: string;
  messages: Message[];
  user: UserProfile | null;
}

/**
 * Save chat result for error handling
 */
export interface SaveChatResult {
  success: boolean;
  error?: string;
  chatSessionUuid?: string;
}

// === TYPE GUARDS ===

/**
 * Type guard to validate Message objects
 */
export const isValidMessage = (obj: unknown): obj is Message => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Message).id === 'string' &&
    typeof (obj as Message).role === 'string' &&
    ['user', 'assistant', 'system', 'thinking'].includes((obj as Message).role) &&
    typeof (obj as Message).content === 'string' &&
    typeof (obj as Message).timestamp === 'number'
  );
};

/**
 * Type guard to validate UserProfile objects
 */
export const isValidUserProfile = (obj: unknown): obj is UserProfile => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as UserProfile).name === 'string' &&
    (obj as UserProfile).name.length > 0
  );
};

/**
 * Type guard to validate ChatSession objects
 */
export const isValidChatSession = (obj: unknown): obj is ChatSession => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as ChatSession).chatSessionUuid === 'string' &&
    (obj as ChatSession).chatSessionUuid.length > 0 &&
    typeof (obj as ChatSession).created_at === 'number' &&
    typeof (obj as ChatSession).updated_at === 'number'
  );
};

/**
 * Type guard to validate ReasoningSettings objects
 */
export const isValidReasoningSettings = (obj: unknown): obj is ReasoningSettings => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as ReasoningSettings).enabled === 'boolean' &&
    typeof (obj as ReasoningSettings).visible === 'boolean' &&
    (
      (obj as ReasoningSettings).instructions === undefined ||
      typeof (obj as ReasoningSettings).instructions === 'string'
    )
  );
};

/**
 * Type guard to validate an array of messages
 */
export const isValidMessageArray = (obj: unknown): obj is Message[] => {
  return Array.isArray(obj) && obj.every(isValidMessage);
};

/**
 * Type guard to validate PromptContextMessage objects
 */
export const isValidPromptContextMessage = (obj: unknown): obj is PromptContextMessage => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as PromptContextMessage).role === 'string' &&
    ['user', 'assistant', 'system'].includes((obj as PromptContextMessage).role) &&
    typeof (obj as PromptContextMessage).content === 'string'
  );
};

// === ZOD SCHEMAS FOR RUNTIME VALIDATION ===

/**
 * Enhanced message schema with stricter validation
 */
export const EnhancedMessageSchema = z.object({
  id: z.string().min(1, 'Message ID cannot be empty'),
  role: z.enum(['user', 'assistant', 'system', 'thinking']),
  content: z.string(),
  timestamp: z.number().int().positive(),
  status: z.enum(['streaming', 'complete', 'aborted', 'error', 'generating_variation']).optional(),
  variations: z.array(z.string()).optional(),
  currentVariation: z.number().int().nonnegative().optional(),
  aborted: z.boolean().optional(),
  isFirst: z.boolean().optional(),
  order: z.number().int().optional(),
  parentMessageId: z.string().optional(),
  rawContent: z.string().optional()
});

/**
 * Enhanced user profile schema
 */
export const EnhancedUserProfileSchema = z.object({
  id: z.string().min(1, 'User ID cannot be empty'),
  name: z.string().min(1, 'User name cannot be empty'),
  avatar: z.string().optional(),
  color: z.string().optional(),
  filename: z.string().min(1, 'Filename cannot be empty'),
  size: z.number().nonnegative('Size must be non-negative'),
  modified: z.number().nonnegative('Modified timestamp must be non-negative')
});

/**
 * Chat session schema for validation
 */
export const ChatSessionSchema = z.object({
  chatSessionUuid: z.string().min(1, 'Chat session UUID cannot be empty'),
  characterId: z.string().optional(),
  userId: z.string().optional(),
  created_at: z.number().int().positive(),
  updated_at: z.number().int().positive(),
  metadata: z.record(z.string(), z.any()).optional()
});

/**
 * Save chat parameters schema
 */
export const SaveChatParamsSchema = z.object({
  chatSessionUuid: z.string().min(1, 'Chat session UUID cannot be empty'),
  messages: z.array(EnhancedMessageSchema),
  user: EnhancedUserProfileSchema.nullable()
});

// === VALIDATION FUNCTIONS ===

/**
 * Validates and parses message data with detailed error reporting
 */
export const validateMessage = (data: unknown): { success: true; data: Message } | { success: false; error: string } => {
  try {
    const result = EnhancedMessageSchema.parse(data);
    return { success: true, data: result as Message };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') };
    }
    return { success: false, error: 'Unknown validation error' };
  }
};

/**
 * Validates and parses user profile data
 */
export const validateUserProfile = (data: unknown): { success: true; data: UserProfile } | { success: false; error: string } => {
  try {
    const result = EnhancedUserProfileSchema.parse(data);
    return { success: true, data: result as UserProfile };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') };
    }
    return { success: false, error: 'Unknown validation error' };
  }
};

/**
 * Validates save chat parameters
 */
export const validateSaveChatParams = (data: unknown): { success: true; data: SaveChatParams } | { success: false; error: string } => {
  try {
    const result = SaveChatParamsSchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') };
    }
    return { success: false, error: 'Unknown validation error' };
  }
};

// === CONSTANTS ===

/**
 * Default reasoning settings ensuring it's disabled by default
 */
export const DEFAULT_REASONING_SETTINGS: ReasoningSettings = {
  enabled: false,
  visible: false,
  instructions: "!important! Embody {{char}}. **Think** through the context of this interaction with <thinking></thinking> tags. Consider your character, your relationship with the user, and relevant context from the conversation history.",
  autoExpandContext: true
};

/**
 * Local storage keys for settings persistence
 */
export const STORAGE_KEYS = {
  REASONING_SETTINGS: 'cardshark_reasoning_settings',
  CONTEXT_WINDOW: 'cardshark_context_window',
  BACKGROUND_SETTINGS: 'cardshark_background'
} as const;

/**
 * Default debounce delay for auto-save operations
 */
export const DEBOUNCE_DELAY = 1000;

/**
 * Stream timeout settings
 */
export const STREAM_SETTINGS = {
  INACTIVITY_TIMEOUT_MS: 30000,
  BUFFER_FLUSH_DELAY: 100
} as const;
