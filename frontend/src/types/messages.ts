// types/messages.ts
import { z } from 'zod';

/**
 * Base message interface definition
 */
export interface IMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'thinking';
  content: string; // Now contains HTML content
  rawContent?: string; // Optional plain text version for API calls
  timestamp: number;
  variations?: string[];
  currentVariation?: number;
  aborted?: boolean;
  isFirst?: boolean;
  order?: number;
  parentMessageId?: string;
  status?: 'streaming' | 'complete' | 'aborted' | 'error' | 'generating_variation'; // Added status field
  metadata?: MessageMetadata; // Optional metadata for special message types (e.g., combat events, speaker attribution)
}

/**
 * User profile interface definition
 */
export interface IUserProfile {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  color?: string;
  filename: string;
  size: number;
  modified: number;
}

/**
 * Chat state interface for component props and state
 */
export interface IChatState {
  messages: IMessage[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  currentUser: IUserProfile | null;
  lastContextWindow: any;
}

export interface ChatMetadata {
  lastUser?: IUserProfile;
  chat_id?: string;
  character_id?: string;
  api_info?: {
    provider: string;
    model: string;
    url: string;
    template: string;
    enabled: boolean;
  };
  created_at?: number;
  updated_at?: number;
}

export interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions?: string;
}

/**
 * Speaker metadata for multi-speaker conversations (e.g., bonded ally interjections)
 * Used when multiple NPCs can speak in a single conversation
 */
export interface SpeakerMetadata {
  /** UUID of the speaking character */
  speakerId?: string;
  /** Display name for the chat bubble header */
  speakerName?: string;
  /** Role of the speaker in the conversation */
  speakerRole?: 'target' | 'ally' | 'narrator';
}

/**
 * Extended message metadata that includes speaker information
 * This extends the base Record<string, unknown> with typed speaker fields
 */
export interface MessageMetadata extends SpeakerMetadata {
  /** Type of special message (e.g., 'combat_event', 'affinity_change', etc.) */
  type?: string;
  [key: string]: unknown;
}

export const BACKGROUND_SETTINGS_KEY = 'cardshark_background';
export const REASONING_SETTINGS_KEY = 'cardshark_reasoning_settings';

/**
 * Zod schema for message validation
 */
export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system', 'thinking']),
  content: z.string(),
  timestamp: z.number().int().positive(),
  variations: z.array(z.string()).optional(),
  currentVariation: z.number().optional(),
  aborted: z.boolean().optional(),
  isFirst: z.boolean().optional(),
  order: z.number().optional(),
  metadata: z.record(z.unknown()).optional()
});

/**
 * Zod schema for user profile validation
 */
export const UserProfileSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  filename: z.string().optional(),
  id: z.string().optional(),
  size: z.number().optional(),
  modified: z.number().optional()
});

/**
 * Zod schema for chat state validation
 */
export const ChatStateSchema = z.object({
  messages: z.array(MessageSchema),
  isLoading: z.boolean(),
  isGenerating: z.boolean(),
  error: z.string().nullable(),
  currentUser: UserProfileSchema.nullable(),
  lastContextWindow: z.any().nullable(),
  reasoningSettings: z.object({
    enabled: z.boolean(),
    visible: z.boolean(),
    instructions: z.string().optional()
  }).optional()
});

/**
 * Type definitions derived from Zod schemas
 */
export type MessageType = z.infer<typeof MessageSchema>;
export type UserProfileType = z.infer<typeof UserProfileSchema>;
export type ChatStateType = z.infer<typeof ChatStateSchema>;

/**
 * Expose the interface types as the primary exports,
 * with the Zod-inferred types as alternative options
 */
// For backward compatibility, export main interface types
export type Message = IMessage;
export type UserProfile = IUserProfile;
export type ChatState = IChatState;