/**
 * @file context.ts
 * @description Type definitions for the Context Management V2 system.
 *
 * This module defines the interfaces for:
 * - ContextSource: Generic interface for data access with caching
 * - ContextSnapshot: Assembled context at a point in time
 * - Domain-specific context types (Character, World, Room, Session, etc.)
 * - ContextAssembler configuration
 * - Serialized context for LLM consumption
 *
 * Architecture:
 * ```
 * ContextSources (data access) -> ContextAssembler (pure functions) -> ContextSerializer (LLM format)
 * ```
 */

import type { CharacterCard, NPCThinFrame, LoreEntryInterface, CharacterExtensions } from './schema';
import type { WorldCard, WorldData, RoomInstanceState } from './worldCard';
import type { NPCRelationship, TimeState } from './worldRuntime';
import type { CharacterInventory } from './inventory';
import type { AdventureContext, RoomSummary } from './adventureLog';
import type { GridRoom } from './worldGrid';
import type { Message, PromptContextMessage, CompressionLevel, FieldTokenInfo } from '../services/chat/chatTypes';
import type { Template } from './templateTypes';

// =============================================================================
// ContextSource Interface - Generic Data Access Layer
// =============================================================================

/**
 * Generic interface for context data sources.
 * All sources implement this interface for consistent data access and caching.
 *
 * @template T - The type of data this source provides
 * @template K - The type of key used to identify data (defaults to string)
 *
 * @example
 * ```typescript
 * const characterSource: ContextSource<CharacterCard> = new CharacterSource();
 * const card = await characterSource.get('uuid-123');
 * characterSource.invalidate('uuid-123');
 * ```
 */
export interface ContextSource<T, K = string> {
  /**
   * Get data by identifier. Returns cached data if available and valid.
   * @param id - The unique identifier for the data
   * @returns The data or null if not found
   */
  get(id: K): Promise<T | null>;

  /**
   * Force refresh data from the underlying source, bypassing cache.
   * @param id - The unique identifier for the data
   * @returns Fresh data or null if not found
   */
  refresh(id: K): Promise<T | null>;

  /**
   * Invalidate cached data for a specific identifier.
   * Next get() call will fetch fresh data.
   * @param id - The unique identifier to invalidate
   */
  invalidate(id: K): void;

  /**
   * Check if data exists in cache (without fetching).
   * @param id - The unique identifier to check
   * @returns True if cached data exists
   */
  has(id: K): boolean;

  /**
   * Clear all cached data.
   */
  clear(): void;
}

// =============================================================================
// Domain-Specific Context Types
// =============================================================================

/**
 * Core character data fields required for context building.
 * This is a union-compatible shape that works with both CharacterData and WorldCard.data
 */
export interface MinimalCharacterDataFields {
  name: string;
  description: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  character_uuid?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  alternate_greetings?: string[];
  extensions?: CharacterExtensions | Record<string, unknown>;
  group_only_greetings?: string[];
  character_book?: { entries: unknown[]; name?: string };
  creator_notes?: string;
  spec?: string;
}

/**
 * Minimal character card structure used in context.
 * Represents the essential parts of a CharacterCard for context purposes.
 * Accepts both CharacterData and similar structures (e.g., WorldCard.data).
 */
export interface MinimalCharacterCard {
  spec: string;
  spec_version: string;
  data: MinimalCharacterDataFields;
}

/**
 * Factory function to create a minimal character card with sensible defaults.
 * Use this when building cards dynamically (e.g., from thin frames).
 */
export function createMinimalCharacterCard(
  overrides: Partial<MinimalCharacterDataFields> & { name: string }
): MinimalCharacterCard {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      spec: 'chara_card_v2',
      name: overrides.name,
      description: overrides.description || '',
      personality: overrides.personality || '',
      scenario: overrides.scenario || '',
      first_mes: overrides.first_mes || '',
      mes_example: overrides.mes_example || '',
      creator_notes: overrides.creator_notes || '',
      system_prompt: overrides.system_prompt || '',
      post_history_instructions: overrides.post_history_instructions || '',
      tags: overrides.tags || [],
      creator: overrides.creator || '',
      character_version: overrides.character_version || '',
      alternate_greetings: overrides.alternate_greetings || [],
      extensions: overrides.extensions || {
        talkativeness: '0.5',
        fav: false,
        world: '',
        depth_prompt: { prompt: '', depth: 0, role: '' },
      },
      group_only_greetings: overrides.group_only_greetings || [],
      character_book: overrides.character_book || { entries: [], name: '' },
      character_uuid: overrides.character_uuid,
    },
  };
}

/**
 * Character context data - the resolved character card with metadata.
 */
export interface CharacterContext {
  /** The character card (minimal structure with spec/spec_version/data) */
  readonly card: MinimalCharacterCard;
  /** Character's UUID */
  readonly uuid: string;
  /** Character's display name */
  readonly name: string;
  /** Pre-generated thin frame (if available) */
  readonly thinFrame: NPCThinFrame | null;
  /** URL to character image */
  readonly imagePath: string | null;
}

/**
 * World context data - world card and runtime state.
 */
export interface WorldContext {
  /** The full world card */
  readonly card: WorldCard;
  /** World's UUID */
  readonly uuid: string;
  /** World's display name */
  readonly name: string;
  /** World description */
  readonly description: string;
  /** Current world data extensions */
  readonly worldData: WorldData;
  /** Player position on grid */
  readonly playerPosition: { x: number; y: number };
  /** Player progression */
  readonly progression: {
    readonly xp: number;
    readonly level: number;
    readonly gold: number;
  };
}

/**
 * Room context data - current room state and NPCs.
 */
export interface RoomContext {
  /** Room's UUID */
  readonly uuid: string;
  /** Room's display name */
  readonly name: string;
  /** Room description */
  readonly description: string;
  /** Room introduction text */
  readonly introductionText: string | null;
  /** Room image path */
  readonly imagePath: string | null;
  /** NPCs currently in the room */
  readonly npcs: ReadonlyArray<RoomNPCContext>;
  /** Room instance state (NPC alive/dead/incapacitated) */
  readonly instanceState: RoomInstanceState | null;
  /** Grid room data (full GridRoom object) */
  readonly gridRoom: GridRoom | null;
}

/**
 * NPC context within a room.
 */
export interface RoomNPCContext {
  /** NPC's character UUID */
  readonly uuid: string;
  /** NPC's display name */
  readonly name: string;
  /** URL to NPC image */
  readonly imagePath: string | null;
  /** Whether the NPC is hostile */
  readonly isHostile: boolean;
  /** Monster level (for combat) */
  readonly monsterLevel: number | null;
  /** Current status */
  readonly status: 'alive' | 'incapacitated' | 'dead';
  /** Thin frame for conversations */
  readonly thinFrame: NPCThinFrame | null;
}

/**
 * Session context data - chat session state and settings.
 */
export interface SessionContext {
  /** Chat session UUID */
  readonly chatSessionUuid: string | null;
  /** User notes for this session */
  readonly sessionNotes: string;
  /** Session display name/title */
  readonly sessionName: string;
  /** Compression level setting */
  readonly compressionLevel: CompressionLevel;
  /** Current user profile */
  readonly currentUser: {
    readonly uuid: string | null;
    readonly name: string;
    readonly imagePath: string | null;
  };
  /** Character being chatted with (if in character mode) */
  readonly characterUuid: string | null;
}

/**
 * Lore context data - matched lore entries and tracking.
 */
export interface LoreContext {
  /** Matched lore entries for current context */
  readonly matchedEntries: ReadonlyArray<LoreEntryInterface>;
  /** Triggered lore images for preview */
  readonly triggeredImages: ReadonlyArray<TriggeredLoreImage>;
  /** Total token budget used by lore */
  readonly tokenBudgetUsed: number;
}

/**
 * Triggered lore image for preview system.
 */
export interface TriggeredLoreImage {
  readonly entryId: number;
  readonly imageUuid: string;
  readonly triggeredAt: number;
}

/**
 * Adventure log context - room summaries and journey history.
 */
export interface AdventureLogContext {
  /** Full adventure context from API */
  readonly context: AdventureContext | null;
  /** Most recent room summaries (limited for context) */
  readonly recentSummaries: ReadonlyArray<RoomSummary>;
  /** Total rooms visited */
  readonly totalRoomsVisited: number;
}

/**
 * Thin frame context for NPC conversations.
 */
export interface ThinFrameContext {
  /** The thin frame data */
  readonly frame: NPCThinFrame;
  /** Character UUID this frame belongs to */
  readonly characterUuid: string;
  /** Whether this was LLM-generated or fallback */
  readonly isGenerated: boolean;
  /** Generation timestamp */
  readonly generatedAt: number;
}

// =============================================================================
// Relationship Context Types
// =============================================================================

/**
 * NPC relationship context for affinity tracking.
 */
export interface RelationshipContext {
  /** NPC UUID -> relationship data */
  readonly relationships: Readonly<Record<string, NPCRelationship>>;
  /** Currently bonded ally UUID (if any) */
  readonly bondedAllyUuid: string | null;
  /** Bonded ally's full card (if bonded) */
  readonly bondedAllyCard: CharacterCard | null;
}

/**
 * Time state context for day/night cycle.
 */
export interface TimeContext {
  /** Current time state */
  readonly state: TimeState;
  /** Time system configuration */
  readonly config: {
    readonly messagesPerDay: number;
    readonly enableDayNightCycle: boolean;
  };
}

/**
 * Inventory context for player and ally.
 */
export interface InventoryContext {
  /** Player's inventory */
  readonly playerInventory: CharacterInventory;
  /** Ally's inventory (if bonded) */
  readonly allyInventory: CharacterInventory | null;
}

// =============================================================================
// Assembled Context Snapshot
// =============================================================================

/**
 * Mode of context assembly - determines which sources are combined.
 */
export type ContextMode =
  | 'assistant'     // Direct LLM chat, no character context
  | 'character'     // Character chat mode
  | 'world_narrator' // World narration (no specific NPC)
  | 'npc_conversation' // Talking to NPC (thin frame)
  | 'npc_bonded'    // Bonded ally (full context)
  | 'dual_speaker'; // NPC + bonded ally

/**
 * Complete context snapshot at a point in time.
 * This is the output of ContextAssembler.
 */
export interface ContextSnapshot {
  /** Mode this context was assembled for */
  readonly mode: ContextMode;

  /** Timestamp when this snapshot was created */
  readonly assembledAt: number;

  // Core contexts (always present in some form)
  /** Session context - always present */
  readonly session: SessionContext;

  // Optional contexts based on mode
  /** Character context - present in character/world modes */
  readonly character: CharacterContext | null;
  /** World context - present in world play modes */
  readonly world: WorldContext | null;
  /** Room context - present when in a room */
  readonly room: RoomContext | null;
  /** Lore context - present when lore is available */
  readonly lore: LoreContext | null;
  /** Adventure log context - present in world play */
  readonly adventureLog: AdventureLogContext | null;

  // NPC interaction contexts
  /** Conversation target context - present in npc_conversation mode */
  readonly conversationTarget: {
    readonly uuid: string;
    readonly name: string;
    readonly thinFrame: NPCThinFrame | null;
    readonly card: CharacterCard | null;
  } | null;

  /** Bonded ally context - present in npc_bonded/dual_speaker modes */
  readonly bondedAlly: {
    readonly uuid: string;
    readonly name: string;
    readonly card: CharacterCard;
    readonly relationship: NPCRelationship | null;
  } | null;

  // Runtime state contexts
  /** Relationships - present in world play */
  readonly relationships: RelationshipContext | null;
  /** Time state - present in world play */
  readonly time: TimeContext | null;
  /** Inventory - present in world play */
  readonly inventory: InventoryContext | null;

  // Message context
  /** Recent messages for context window */
  readonly messages: ReadonlyArray<Message>;
}

// =============================================================================
// Context Assembler Types
// =============================================================================

/**
 * Configuration for context assembly.
 */
export interface ContextAssemblerConfig {
  /** Maximum messages to include in context */
  readonly maxMessages: number;
  /** Compression level for field expiration */
  readonly compressionLevel: CompressionLevel;
  /** Whether to include lore matching */
  readonly includeLore: boolean;
  /** Whether to include adventure log */
  readonly includeAdventureLog: boolean;
  /** Number of recent summaries to include */
  readonly maxRecentSummaries: number;
}

/**
 * Default assembler configuration.
 */
export const DEFAULT_ASSEMBLER_CONFIG: ContextAssemblerConfig = {
  maxMessages: 20,
  compressionLevel: 'none',
  includeLore: true,
  includeAdventureLog: true,
  maxRecentSummaries: 5,
};

// =============================================================================
// Serialized Context Types (LLM Output)
// =============================================================================

/**
 * Serialized context ready for LLM consumption.
 * This is the output of ContextSerializer.
 */
export interface SerializedContext {
  /** Memory block (system prompt + character card fields) */
  readonly memory: string;
  /** Formatted conversation history */
  readonly history: string;
  /** Session notes block (if any) */
  readonly notesBlock: string;
  /** Compressed context summary (if compression enabled) */
  readonly compressedContext: string;
  /** Final assembled prompt */
  readonly prompt: string;
  /** Stop sequences for generation */
  readonly stopSequences: string[];

  /** Metadata for debugging/display */
  readonly metadata: {
    /** Mode this was serialized for */
    readonly mode: ContextMode;
    /** Per-field token breakdown */
    readonly fieldBreakdown: ReadonlyArray<FieldTokenInfo>;
    /** Total tokens in memory block */
    readonly totalTokens: number;
    /** Tokens saved by field expiration */
    readonly savedTokens: number;
    /** Message count in history */
    readonly messageCount: number;
    /** Compression cache state */
    readonly compressionCacheValid: boolean;
  };
}

/**
 * Options for context serialization.
 */
export interface SerializerOptions {
  /** Template to use for formatting */
  readonly template: Template | null;
  /** Template ID for lookup */
  readonly templateId: string | null;
  /** User name for variable substitution */
  readonly userName: string;
  /** Character name for variable substitution */
  readonly characterName: string;
  /** Compression level */
  readonly compressionLevel: CompressionLevel;
  /** Message count for field expiration calculation */
  readonly messageCount: number;
  /** Existing compression cache */
  readonly compressionCache: CompressedContextCache | null;
}

/**
 * Cached compression result for performance.
 */
export interface CompressedContextCache {
  /** The compressed summary text */
  readonly compressedText: string;
  /** Message count when compression was done */
  readonly compressedAtMessageCount: number;
  /** Compression level used */
  readonly compressionLevel: CompressionLevel;
  /** Timestamp of compression */
  readonly timestamp: number;
}

// =============================================================================
// Context Source Keys
// =============================================================================

/**
 * Keys for identifying different context sources.
 */
export type ContextSourceKey =
  | 'character'
  | 'world'
  | 'room'
  | 'session'
  | 'lore'
  | 'adventureLog'
  | 'thinFrame';

/**
 * Composite key for room-specific data.
 */
export interface RoomSourceKey {
  readonly worldUuid: string;
  readonly roomUuid: string;
}

/**
 * Composite key for adventure log data.
 */
export interface AdventureLogSourceKey {
  readonly worldUuid: string;
  readonly userUuid: string;
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { Message, PromptContextMessage, CompressionLevel };
