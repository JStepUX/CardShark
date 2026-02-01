/**
 * @file useContextSnapshot.ts
 * @description Hook for assembling and serializing context for LLM prompts.
 *
 * This hook is the primary interface for components that need to build
 * context for LLM interactions. It combines:
 * - Character context (base character or world narrator)
 * - World context (if in world play)
 * - Room context (current room state)
 * - Session context (chat session, notes, user)
 * - Lore context (triggered lore entries)
 * - Adventure log context (narrative history)
 * - NPC context (conversation target, bonded ally)
 * - Runtime context (time, relationships, inventory)
 *
 * Architecture:
 * ```
 * Component -> useContextSnapshot -> ContextAssembler -> ContextSnapshot
 *                                 -> ContextSerializer -> SerializedContext
 * ```
 */

import { useMemo, useCallback } from 'react';
import type {
  ContextSnapshot,
  ContextMode,
  SerializedContext,
  SerializerOptions,
  CharacterContext,
  WorldContext,
  RoomContext,
  SessionContext,
  LoreContext,
  AdventureLogContext,
  RelationshipContext,
  TimeContext,
  InventoryContext,
  MinimalCharacterCard,
  TriggeredLoreImage,
} from '../types/context';
import type { CharacterCard, LoreEntryInterface } from '../types/schema';
import type { WorldCard } from '../types/worldCard';
import type { GridRoom } from '../types/worldGrid';
import type { NPCRelationship, TimeState, TimeConfig } from '../types/worldRuntime';
import type { CharacterInventory } from '../types/inventory';
import type { AdventureContext } from '../types/adventureLog';
import type { Message, CompressionLevel } from '../services/chat/chatTypes';

import {
  assembleContextSnapshot,
  determineContextMode,
  assembleCharacterContext,
  assembleWorldContext,
  assembleRoomContext,
  assembleSessionContext,
  assembleLoreContext,
  assembleAdventureLogContext,
  type CharacterAssemblyInput,
  type WorldAssemblyInput,
  type RoomAssemblyInput,
  type SessionAssemblyInput,
  type LoreAssemblyInput,
  type AdventureLogAssemblyInput,
  type ConversationTargetInput,
  type BondedAllyInput,
} from '../services/context/ContextAssembler';

import {
  serializeContext,
} from '../services/context/ContextSerializer';

// =============================================================================
// Types
// =============================================================================

/**
 * Input data for context snapshot assembly.
 * This is the main input interface for the hook.
 */
export interface ContextSnapshotInput {
  // Character/World base
  characterCard?: MinimalCharacterCard | CharacterCard | null;
  worldCard?: WorldCard | null;

  // Room context (world play only)
  currentRoom?: GridRoom | null;

  // NPC interaction state
  conversationTarget?: ConversationTargetInput | null;
  bondedAlly?: BondedAllyInput | null;

  // Session data
  chatSessionUuid?: string | null;
  sessionNotes?: string;
  sessionName?: string;
  compressionLevel?: CompressionLevel;
  currentUser?: {
    uuid: string | null;
    name: string;
    imagePath: string | null;
  };

  // Lore data
  matchedLoreEntries?: LoreEntryInterface[];
  triggeredLoreImages?: TriggeredLoreImage[];

  // Adventure log (world play only)
  adventureContext?: AdventureContext | null;

  // Runtime state (world play only)
  npcRelationships?: Record<string, NPCRelationship>;
  timeState?: TimeState;
  timeConfig?: TimeConfig;
  playerInventory?: CharacterInventory;
  allyInventory?: CharacterInventory | null;

  // Chat history
  messages?: Message[];
}

/**
 * Options for serializing context to LLM format.
 */
export interface UseContextSnapshotOptions {
  /** Template ID to use for serialization */
  templateId?: string | null;

  /** Maximum tokens for memory block */
  maxMemoryTokens?: number;

  /** Include lore in context */
  includeLore?: boolean;

  /** Include adventure log in context */
  includeAdventureLog?: boolean;
}

/**
 * Return value from useContextSnapshot hook.
 */
export interface UseContextSnapshotResult {
  /** Current context mode based on input state */
  contextMode: ContextMode;

  /** Assemble a context snapshot from current input */
  assembleSnapshot: () => ContextSnapshot;

  /** Serialize context snapshot to LLM-ready format */
  serializeSnapshot: (snapshot: ContextSnapshot, options?: Partial<SerializerOptions>) => SerializedContext;

  /** Convenience: assemble and serialize in one step */
  getSerializedContext: (options?: Partial<SerializerOptions>) => SerializedContext;

  /** Get just the character context portion */
  characterContext: CharacterContext | null;

  /** Get just the world context portion */
  worldContext: WorldContext | null;

  /** Get just the room context portion */
  roomContext: RoomContext | null;

  /** Get just the session context portion */
  sessionContext: SessionContext | null;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for assembling and serializing context for LLM prompts.
 *
 * @param input - Input data for context assembly
 * @param options - Serialization options
 * @returns Context assembly and serialization utilities
 *
 * @example
 * ```typescript
 * const {
 *   contextMode,
 *   getSerializedContext,
 * } = useContextSnapshot({
 *   characterCard,
 *   worldCard,
 *   currentRoom,
 *   messages,
 *   sessionNotes,
 * });
 *
 * // Get serialized context for LLM
 * const serialized = getSerializedContext({ templateId: 'default' });
 * ```
 */
export function useContextSnapshot(
  input: ContextSnapshotInput,
  options: UseContextSnapshotOptions = {}
): UseContextSnapshotResult {
  const {
    characterCard,
    worldCard,
    currentRoom,
    conversationTarget,
    bondedAlly,
    chatSessionUuid,
    sessionNotes = '',
    sessionName = 'Chat',
    compressionLevel = 'none',
    currentUser,
    matchedLoreEntries = [],
    triggeredLoreImages = [],
    adventureContext,
    npcRelationships = {},
    timeState,
    timeConfig,
    playerInventory,
    allyInventory,
    messages = [],
  } = input;

  const {
    templateId,
    maxMemoryTokens: _maxMemoryTokens,
    includeLore = true,
    includeAdventureLog = true,
  } = options;

  // ==========================================================================
  // Determine Context Mode
  // ==========================================================================

  const contextMode = useMemo<ContextMode>(() => {
    return determineContextMode({
      isAssistantMode: !characterCard && !worldCard,
      isWorldPlay: !!worldCard,
      isConversing: !!conversationTarget,
      isBonded: !!bondedAlly,
      hasBondedAllyPresent: !!bondedAlly && !!conversationTarget,
    });
  }, [characterCard, worldCard, conversationTarget, bondedAlly]);

  // ==========================================================================
  // Assemble Individual Contexts
  // ==========================================================================

  const characterContext = useMemo<CharacterContext | null>(() => {
    if (!characterCard) return null;

    const assemblyInput: CharacterAssemblyInput = {
      card: characterCard as MinimalCharacterCard,
      thinFrame: null,
    };

    return assembleCharacterContext(assemblyInput);
  }, [characterCard]);

  const worldContext = useMemo<WorldContext | null>(() => {
    if (!worldCard) return null;

    const assemblyInput: WorldAssemblyInput = {
      card: worldCard,
    };

    return assembleWorldContext(assemblyInput);
  }, [worldCard]);

  const roomContext = useMemo<RoomContext | null>(() => {
    if (!currentRoom) return null;

    const assemblyInput: RoomAssemblyInput = {
      gridRoom: currentRoom,
      instanceState: null,
      npcThinFrames: {},
    };

    return assembleRoomContext(assemblyInput);
  }, [currentRoom]);

  const sessionContext = useMemo<SessionContext | null>(() => {
    const assemblyInput: SessionAssemblyInput = {
      chatSessionUuid: chatSessionUuid || null,
      sessionNotes,
      sessionName,
      compressionLevel,
      currentUser: currentUser || {
        uuid: null,
        name: 'User',
        imagePath: null,
      },
      characterUuid: characterCard?.data?.character_uuid || null,
    };

    return assembleSessionContext(assemblyInput);
  }, [chatSessionUuid, sessionNotes, sessionName, compressionLevel, currentUser, characterCard]);

  const loreContext = useMemo<LoreContext | null>(() => {
    if (!includeLore || matchedLoreEntries.length === 0) return null;

    const assemblyInput: LoreAssemblyInput = {
      matchedEntries: [...matchedLoreEntries], // Create mutable copy
      triggeredImages: [...triggeredLoreImages], // Create mutable copy
    };

    return assembleLoreContext(assemblyInput);
  }, [includeLore, matchedLoreEntries, triggeredLoreImages]);

  const adventureLogContext = useMemo<AdventureLogContext | null>(() => {
    if (!includeAdventureLog || !adventureContext) return null;

    const assemblyInput: AdventureLogAssemblyInput = {
      context: adventureContext,
      maxRecentSummaries: 5,
    };

    return assembleAdventureLogContext(assemblyInput);
  }, [includeAdventureLog, adventureContext]);

  // ==========================================================================
  // Assembly Function
  // ==========================================================================

  const assembleSnapshot = useCallback((): ContextSnapshot => {
    // Build relationship context
    const relationshipContext: RelationshipContext | null = Object.keys(npcRelationships).length > 0
      ? {
          relationships: npcRelationships,
          bondedAllyUuid: bondedAlly?.uuid || null,
          bondedAllyCard: bondedAlly?.card || null,
        }
      : null;

    // Build time context
    const timeContextValue: TimeContext | null = timeState && timeConfig
      ? {
          state: timeState,
          config: {
            messagesPerDay: timeConfig.messagesPerDay,
            enableDayNightCycle: timeConfig.enableDayNightCycle,
          },
        }
      : null;

    // Build inventory context
    const inventoryContext: InventoryContext | null = playerInventory
      ? {
          playerInventory,
          allyInventory: allyInventory || null,
        }
      : null;

    // Use the full assembly function
    return assembleContextSnapshot({
      mode: contextMode,
      session: {
        chatSessionUuid: chatSessionUuid || null,
        sessionNotes,
        sessionName,
        compressionLevel,
        currentUser: currentUser || {
          uuid: null,
          name: 'User',
          imagePath: null,
        },
        characterUuid: characterContext?.uuid,
      },
      character: characterContext
        ? { card: characterContext.card, thinFrame: characterContext.thinFrame }
        : undefined,
      world: worldContext ? { card: worldContext.card } : undefined,
      room: roomContext && currentRoom
        ? { gridRoom: currentRoom, instanceState: null, npcThinFrames: {} }
        : undefined,
      lore: loreContext
        ? { matchedEntries: [...loreContext.matchedEntries], triggeredImages: [...loreContext.triggeredImages] }
        : undefined,
      adventureLog: adventureLogContext && adventureContext
        ? { context: adventureContext }
        : undefined,
      conversationTarget: conversationTarget || undefined,
      bondedAlly: bondedAlly || undefined,
      relationships: relationshipContext
        ? { relationships: relationshipContext.relationships, bondedAllyUuid: bondedAlly?.uuid }
        : undefined,
      time: timeContextValue && timeState && timeConfig
        ? { state: timeState, config: timeConfig }
        : undefined,
      inventory: inventoryContext && playerInventory
        ? { playerInventory, allyInventory }
        : undefined,
      messages,
    });
  }, [
    contextMode,
    characterContext,
    worldContext,
    roomContext,
    loreContext,
    adventureLogContext,
    conversationTarget,
    bondedAlly,
    npcRelationships,
    timeState,
    timeConfig,
    playerInventory,
    allyInventory,
    currentRoom,
    adventureContext,
    messages,
    chatSessionUuid,
    sessionNotes,
    sessionName,
    compressionLevel,
    currentUser,
  ]);

  // ==========================================================================
  // Serialization Function
  // ==========================================================================

  const serializeSnapshot = useCallback((
    snapshot: ContextSnapshot,
    serializerOptions?: Partial<SerializerOptions>
  ): SerializedContext => {
    const defaultOptions: SerializerOptions = {
      template: null,
      templateId: serializerOptions?.templateId || templateId || null,
      userName: currentUser?.name || 'User',
      characterName: characterContext?.name || 'Assistant',
      compressionLevel,
      messageCount: messages.length,
      compressionCache: null,
    };

    return serializeContext(snapshot, {
      ...defaultOptions,
      ...serializerOptions,
    });
  }, [templateId, currentUser, characterContext, compressionLevel, messages.length]);

  // ==========================================================================
  // Convenience Function
  // ==========================================================================

  const getSerializedContext = useCallback((
    serializerOptions?: Partial<SerializerOptions>
  ): SerializedContext => {
    const snapshot = assembleSnapshot();
    return serializeSnapshot(snapshot, serializerOptions);
  }, [assembleSnapshot, serializeSnapshot]);

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    contextMode,
    assembleSnapshot,
    serializeSnapshot,
    getSerializedContext,
    characterContext,
    worldContext,
    roomContext,
    sessionContext,
  };
}
