/**
 * @file context/index.ts
 * @description Context Management V2 - Main exports.
 *
 * This module provides a clean, layered architecture for building LLM context:
 *
 * CONTEXT SOURCES (data access layer)
 *   CharacterSource, WorldSource, RoomSource, SessionSource,
 *   LoreSource, AdventureLogSource, ThinFrameSource
 *
 * CONTEXT CACHE (caching utility)
 *   ContextCache, CachePresets, compositeKey
 *
 * CONTEXT ASSEMBLER (pure functions that combine sources)
 *   assembleCharacterContext, assembleWorldContext, assembleRoomContext,
 *   assembleSessionContext, assembleLoreContext, assembleAdventureLogContext,
 *   assembleContextSnapshot, determineContextMode
 *
 * CONTEXT SERIALIZER (converts to LLM format)
 *   serializeContext, createMemoryContext, formatChatHistory, getStopSequences
 */

// =============================================================================
// Context Sources
// =============================================================================
export * from './sources';

// =============================================================================
// Context Cache
// =============================================================================
export {
  ContextCache,
  CachePresets,
  compositeKey,
  type CacheConfig,
  type CacheKeyGenerator,
} from './ContextCache';

// =============================================================================
// Context Assembler
// =============================================================================
export {
  // Assembly functions
  assembleCharacterContext,
  assembleWorldContext,
  assembleRoomContext,
  assembleSessionContext,
  assembleLoreContext,
  assembleAdventureLogContext,
  assembleRelationshipContext,
  assembleTimeContext,
  assembleInventoryContext,
  assembleContextSnapshot,

  // Mode determination
  determineContextMode,

  // Card injection helpers (legacy pattern adapters)
  injectRoomContextIntoCard,
  buildRoomAwarenessSection,
  buildThinContextCard,
  buildDualSpeakerCard,

  // Validation
  validateContextSnapshot,

  // Input types
  type CharacterAssemblyInput,
  type WorldAssemblyInput,
  type RoomAssemblyInput,
  type SessionAssemblyInput,
  type LoreAssemblyInput,
  type AdventureLogAssemblyInput,
  type RelationshipAssemblyInput,
  type TimeAssemblyInput,
  type InventoryAssemblyInput,
  type ConversationTargetInput,
  type BondedAllyInput,
  type FullContextAssemblyInput,
} from './ContextAssembler';

// =============================================================================
// Context Serializer
// =============================================================================
export {
  // Main serialization
  serializeContext,
  resolveCharacterCard,

  // Memory context
  createMemoryContext,

  // History formatting
  formatChatHistory,
  formatMessage,

  // Template utilities
  getTemplate,
  replaceVariables,
  stripHtmlTags,
  estimateTokens,

  // Stop sequences
  getStopSequences,

  // Compression utilities
  compressionLevelIncludes,
  shouldExpireField,

  // Constants
  COMPRESSION_LEVEL_HIERARCHY,
  FIELD_EXPIRATION_CONFIG,
} from './ContextSerializer';

// =============================================================================
// Types (re-export from types/context.ts for convenience)
// =============================================================================
export type {
  // Core interfaces
  ContextSource,
  ContextSnapshot,
  ContextMode,
  ContextAssemblerConfig,
  SerializedContext,
  SerializerOptions,
  CompressedContextCache,

  // Domain contexts
  CharacterContext,
  MinimalCharacterCard,
  MinimalCharacterDataFields,
  WorldContext,
  RoomContext,
  RoomNPCContext,
  SessionContext,
  LoreContext,
  TriggeredLoreImage,
  AdventureLogContext,
  ThinFrameContext,
  RelationshipContext,
  TimeContext,
  InventoryContext,

  // Keys
  ContextSourceKey,
  RoomSourceKey,
  AdventureLogSourceKey,

  // Re-exports
  Message,
  PromptContextMessage,
  CompressionLevel,
} from '../../types/context';

export { DEFAULT_ASSEMBLER_CONFIG, createMinimalCharacterCard } from '../../types/context';
