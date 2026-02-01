/**
 * @file ContextAssembler.ts
 * @description Pure functions for assembling context from multiple sources.
 *
 * The ContextAssembler takes data from various ContextSources and combines
 * them into a ContextSnapshot based on the current mode (assistant, character,
 * world_narrator, npc_conversation, npc_bonded, dual_speaker).
 *
 * This module contains NO side effects - all functions are pure and testable.
 *
 * Architecture:
 * ```
 * ContextSources (data) -> ContextAssembler (pure) -> ContextSnapshot
 * ContextSnapshot -> ContextSerializer -> LLM Prompt
 * ```
 */

import type {
  ContextSnapshot,
  ContextMode,
  ContextAssemblerConfig,
  CharacterContext,
  WorldContext,
  RoomContext,
  RoomNPCContext,
  SessionContext,
  LoreContext,
  AdventureLogContext,
  RelationshipContext,
  TimeContext,
  InventoryContext,
  MinimalCharacterCard,
  TriggeredLoreImage,
} from '../../types/context';
import { createMinimalCharacterCard } from '../../types/context';
import type { CharacterCard, NPCThinFrame, LoreEntryInterface } from '../../types/schema';
import type { WorldCard, WorldData, RoomInstanceState, NpcInstanceState } from '../../types/worldCard';
import type { GridRoom } from '../../types/worldGrid';
import type { RoomNPC } from '../../types/room';
import type { NPCRelationship, TimeState } from '../../types/worldRuntime';
import type { CharacterInventory } from '../../types/inventory';
import type { AdventureContext } from '../../types/adventureLog';
import type { Message, CompressionLevel } from '../chat/chatTypes';

// =============================================================================
// Input Types for Assembly Functions
// =============================================================================

/**
 * Input data for character context assembly.
 */
export interface CharacterAssemblyInput {
  card: MinimalCharacterCard | CharacterCard;
  thinFrame?: NPCThinFrame | null;
}

/**
 * Input data for world context assembly.
 */
export interface WorldAssemblyInput {
  card: WorldCard;
}

/**
 * Input data for room context assembly.
 */
export interface RoomAssemblyInput {
  gridRoom: GridRoom;
  instanceState?: RoomInstanceState | null;
  npcThinFrames?: Record<string, NPCThinFrame>;
}

/**
 * Input data for session context assembly.
 */
export interface SessionAssemblyInput {
  chatSessionUuid: string | null;
  sessionNotes: string;
  sessionName: string;
  compressionLevel: CompressionLevel;
  currentUser: {
    uuid: string | null;
    name: string;
    imagePath: string | null;
  };
  characterUuid?: string | null;
}

/**
 * Input data for lore context assembly.
 */
export interface LoreAssemblyInput {
  matchedEntries: LoreEntryInterface[];
  triggeredImages: TriggeredLoreImage[];
  tokenBudgetUsed?: number;
}

/**
 * Input data for adventure log context assembly.
 */
export interface AdventureLogAssemblyInput {
  context: AdventureContext | null;
  maxRecentSummaries?: number;
}

/**
 * Input data for relationship context assembly.
 */
export interface RelationshipAssemblyInput {
  relationships: Record<string, NPCRelationship>;
  bondedAllyUuid?: string | null;
  bondedAllyCard?: CharacterCard | null;
}

/**
 * Input data for time context assembly.
 */
export interface TimeAssemblyInput {
  state: TimeState;
  config: {
    messagesPerDay: number;
    enableDayNightCycle: boolean;
  };
}

/**
 * Input data for inventory context assembly.
 */
export interface InventoryAssemblyInput {
  playerInventory: CharacterInventory;
  allyInventory?: CharacterInventory | null;
}

/**
 * Input data for conversation target assembly.
 */
export interface ConversationTargetInput {
  uuid: string;
  name: string;
  thinFrame?: NPCThinFrame | null;
  card?: CharacterCard | null;
}

/**
 * Input data for bonded ally assembly.
 */
export interface BondedAllyInput {
  uuid: string;
  name: string;
  card: CharacterCard;
  relationship?: NPCRelationship | null;
}

/**
 * Complete input for full context assembly.
 */
export interface FullContextAssemblyInput {
  mode: ContextMode;
  session: SessionAssemblyInput;
  character?: CharacterAssemblyInput | null;
  world?: WorldAssemblyInput | null;
  room?: RoomAssemblyInput | null;
  lore?: LoreAssemblyInput | null;
  adventureLog?: AdventureLogAssemblyInput | null;
  conversationTarget?: ConversationTargetInput | null;
  bondedAlly?: BondedAllyInput | null;
  relationships?: RelationshipAssemblyInput | null;
  time?: TimeAssemblyInput | null;
  inventory?: InventoryAssemblyInput | null;
  messages?: Message[];
  config?: Partial<ContextAssemblerConfig>;
}

// =============================================================================
// Character Context Assembly
// =============================================================================

/**
 * Assemble character context from card and optional thin frame.
 * Pure function - no side effects.
 */
export function assembleCharacterContext(
  input: CharacterAssemblyInput
): CharacterContext {
  const { card, thinFrame = null } = input;
  const data = card.data;

  return {
    card: {
      spec: card.spec,
      spec_version: card.spec_version,
      data: card.data,
    },
    uuid: data.character_uuid || '',
    name: data.name || 'Unknown Character',
    thinFrame,
    imagePath: data.character_uuid
      ? `/api/character/${data.character_uuid}/image`
      : null,
  };
}

// =============================================================================
// World Context Assembly
// =============================================================================

/**
 * Assemble world context from world card.
 * Pure function - no side effects.
 */
export function assembleWorldContext(
  input: WorldAssemblyInput
): WorldContext {
  const { card } = input;
  const data = card.data;
  const worldData = data.extensions?.world_data || {} as WorldData;

  return {
    card,
    uuid: data.character_uuid || '',
    name: data.name || 'Unknown World',
    description: data.description || '',
    worldData,
    playerPosition: worldData.player_position || { x: 0, y: 0 },
    progression: {
      xp: worldData.player_xp || 0,
      level: worldData.player_level || 1,
      gold: worldData.player_gold || 0,
    },
  };
}

// =============================================================================
// Room Context Assembly
// =============================================================================

/**
 * Get NPC status from instance state.
 * Pure function - no side effects.
 */
function getNpcStatus(
  npcState: NpcInstanceState | undefined
): 'alive' | 'incapacitated' | 'dead' {
  if (!npcState) return 'alive';
  return npcState.status;
}

/**
 * Assemble room context from grid room and instance state.
 * Pure function - no side effects.
 */
export function assembleRoomContext(
  input: RoomAssemblyInput
): RoomContext {
  const { gridRoom, instanceState = null, npcThinFrames = {} } = input;

  // Build NPC contexts
  const npcs: RoomNPCContext[] = (gridRoom.npcs || []).map((npc: RoomNPC) => {
    const npcState = instanceState?.npc_states?.[npc.character_uuid];
    const status = getNpcStatus(npcState);

    return {
      uuid: npc.character_uuid,
      name: npc.character_uuid, // Will be resolved from display_name if available
      imagePath: `/api/character/${npc.character_uuid}/image`,
      isHostile: npc.hostile || false,
      monsterLevel: npc.monster_level || null,
      status,
      thinFrame: npcThinFrames[npc.character_uuid] || null,
    };
  });

  // GridRoom uses `id` not `room_uuid`
  const roomUuid = gridRoom.id || '';

  return {
    uuid: roomUuid,
    name: gridRoom.name,
    description: gridRoom.description || '',
    introductionText: gridRoom.introduction_text || null,
    imagePath: roomUuid
      ? `/api/room/${roomUuid}/image`
      : null,
    npcs,
    instanceState,
    gridRoom,
  };
}

// =============================================================================
// Session Context Assembly
// =============================================================================

/**
 * Assemble session context from session data.
 * Pure function - no side effects.
 */
export function assembleSessionContext(
  input: SessionAssemblyInput
): SessionContext {
  return {
    chatSessionUuid: input.chatSessionUuid,
    sessionNotes: input.sessionNotes || '',
    sessionName: input.sessionName || 'Untitled Session',
    compressionLevel: input.compressionLevel || 'none',
    currentUser: {
      uuid: input.currentUser.uuid,
      name: input.currentUser.name || 'User',
      imagePath: input.currentUser.imagePath,
    },
    characterUuid: input.characterUuid || null,
  };
}

// =============================================================================
// Lore Context Assembly
// =============================================================================

/**
 * Assemble lore context from matched entries.
 * Pure function - no side effects.
 */
export function assembleLoreContext(
  input: LoreAssemblyInput
): LoreContext {
  return {
    matchedEntries: input.matchedEntries || [],
    triggeredImages: input.triggeredImages || [],
    tokenBudgetUsed: input.tokenBudgetUsed || 0,
  };
}

// =============================================================================
// Adventure Log Context Assembly
// =============================================================================

/**
 * Assemble adventure log context with recent summaries.
 * Pure function - no side effects.
 */
export function assembleAdventureLogContext(
  input: AdventureLogAssemblyInput
): AdventureLogContext {
  const { context, maxRecentSummaries = 5 } = input;

  if (!context) {
    return {
      context: null,
      recentSummaries: [],
      totalRoomsVisited: 0,
    };
  }

  // AdventureContext uses `entries` not `room_summaries`
  const allSummaries = context.entries || [];
  const recentSummaries = allSummaries.slice(-maxRecentSummaries);

  return {
    context,
    recentSummaries,
    totalRoomsVisited: context.totalRoomsVisited || allSummaries.length,
  };
}

// =============================================================================
// Relationship Context Assembly
// =============================================================================

/**
 * Assemble relationship context.
 * Pure function - no side effects.
 */
export function assembleRelationshipContext(
  input: RelationshipAssemblyInput
): RelationshipContext {
  return {
    relationships: input.relationships || {},
    bondedAllyUuid: input.bondedAllyUuid || null,
    bondedAllyCard: input.bondedAllyCard || null,
  };
}

// =============================================================================
// Time Context Assembly
// =============================================================================

/**
 * Assemble time context.
 * Pure function - no side effects.
 */
export function assembleTimeContext(
  input: TimeAssemblyInput
): TimeContext {
  return {
    state: input.state,
    config: {
      messagesPerDay: input.config.messagesPerDay || 50,
      enableDayNightCycle: input.config.enableDayNightCycle ?? true,
    },
  };
}

// =============================================================================
// Inventory Context Assembly
// =============================================================================

/**
 * Assemble inventory context.
 * Pure function - no side effects.
 */
export function assembleInventoryContext(
  input: InventoryAssemblyInput
): InventoryContext {
  return {
    playerInventory: input.playerInventory,
    allyInventory: input.allyInventory || null,
  };
}

// =============================================================================
// Full Context Snapshot Assembly
// =============================================================================

/**
 * Assemble a complete context snapshot from all inputs.
 * This is the main entry point for context assembly.
 * Pure function - no side effects.
 *
 * @param input - All input data for assembly
 * @returns Complete context snapshot
 *
 * @example
 * ```typescript
 * const snapshot = assembleContextSnapshot({
 *   mode: 'npc_conversation',
 *   session: { chatSessionUuid: '...', sessionNotes: '', ... },
 *   character: { card: worldCard },
 *   world: { card: worldCard },
 *   room: { gridRoom: currentRoom },
 *   conversationTarget: { uuid: npcUuid, name: 'Marcus', thinFrame },
 *   messages: recentMessages,
 * });
 * ```
 */
export function assembleContextSnapshot(
  input: FullContextAssemblyInput
): ContextSnapshot {
  const { mode, session, config } = input;

  // Assemble session context (always required)
  const sessionContext = assembleSessionContext(session);

  // Assemble optional contexts based on what's provided
  const characterContext = input.character
    ? assembleCharacterContext(input.character)
    : null;

  const worldContext = input.world
    ? assembleWorldContext(input.world)
    : null;

  const roomContext = input.room
    ? assembleRoomContext(input.room)
    : null;

  const loreContext = input.lore
    ? assembleLoreContext(input.lore)
    : null;

  const adventureLogContext = input.adventureLog
    ? assembleAdventureLogContext({
        ...input.adventureLog,
        maxRecentSummaries: config?.maxRecentSummaries,
      })
    : null;

  const relationshipsContext = input.relationships
    ? assembleRelationshipContext(input.relationships)
    : null;

  const timeContext = input.time
    ? assembleTimeContext(input.time)
    : null;

  const inventoryContext = input.inventory
    ? assembleInventoryContext(input.inventory)
    : null;

  // Assemble conversation target (for npc_conversation and dual_speaker modes)
  const conversationTarget = input.conversationTarget
    ? {
        uuid: input.conversationTarget.uuid,
        name: input.conversationTarget.name,
        thinFrame: input.conversationTarget.thinFrame || null,
        card: input.conversationTarget.card || null,
      }
    : null;

  // Assemble bonded ally (for npc_bonded and dual_speaker modes)
  const bondedAlly = input.bondedAlly
    ? {
        uuid: input.bondedAlly.uuid,
        name: input.bondedAlly.name,
        card: input.bondedAlly.card,
        relationship: input.bondedAlly.relationship || null,
      }
    : null;

  // Limit messages if config specifies
  const maxMessages = config?.maxMessages ?? 20;
  const messages = input.messages
    ? input.messages.slice(-maxMessages)
    : [];

  return {
    mode,
    assembledAt: Date.now(),
    session: sessionContext,
    character: characterContext,
    world: worldContext,
    room: roomContext,
    lore: loreContext,
    adventureLog: adventureLogContext,
    conversationTarget,
    bondedAlly,
    relationships: relationshipsContext,
    time: timeContext,
    inventory: inventoryContext,
    messages,
  };
}

// =============================================================================
// Mode-Specific Assembly Helpers
// =============================================================================

/**
 * Determine the appropriate context mode based on the current state.
 * Pure function - no side effects.
 *
 * @param options - State flags to determine mode
 * @returns The appropriate ContextMode
 */
export function determineContextMode(options: {
  isAssistantMode: boolean;
  isWorldPlay: boolean;
  isConversing: boolean;
  isBonded: boolean;
  hasBondedAllyPresent: boolean;
}): ContextMode {
  const {
    isAssistantMode,
    isWorldPlay,
    isConversing,
    isBonded,
    hasBondedAllyPresent,
  } = options;

  if (isAssistantMode) {
    return 'assistant';
  }

  if (!isWorldPlay) {
    return 'character';
  }

  // In world play mode
  if (isConversing) {
    if (isBonded) {
      return 'npc_bonded';
    }
    if (hasBondedAllyPresent) {
      return 'dual_speaker';
    }
    return 'npc_conversation';
  }

  return 'world_narrator';
}

// =============================================================================
// Character Card Injection (Legacy Pattern Adapters)
// =============================================================================

/**
 * Convert NPCThinFrame to a description string.
 * Pure function.
 */
function getThinFrameDescription(frame: NPCThinFrame): string {
  const parts: string[] = [];
  if (frame.appearance_hook) parts.push(frame.appearance_hook);
  if (frame.motivation) parts.push(`Motivated by: ${frame.motivation}`);
  return parts.join('. ');
}

/**
 * Convert NPCThinFrame to a personality string.
 * Pure function.
 */
function getThinFramePersonality(frame: NPCThinFrame): string {
  const parts: string[] = [];
  if (frame.key_traits && frame.key_traits.length > 0) {
    parts.push(frame.key_traits.join(', '));
  }
  if (frame.speaking_style) {
    parts.push(`Speaking style: ${frame.speaking_style}`);
  }
  return parts.join('. ');
}

/**
 * Inject room context into a character card's scenario field.
 * This adapts the legacy injectRoomContext pattern to the new architecture.
 * Pure function - returns a new card without mutating the original.
 *
 * @param card - The character card to modify
 * @param roomContext - Room context to inject
 * @param worldContext - World context for location name
 * @returns New card with injected scenario
 */
export function injectRoomContextIntoCard(
  card: MinimalCharacterCard,
  roomContext: RoomContext,
  worldContext: WorldContext | null
): MinimalCharacterCard {
  const worldName = worldContext?.name || 'the world';
  const roomName = roomContext.name || 'this location';
  const roomDescription = roomContext.description || '';

  // Build room awareness section
  const awarenessSection = buildRoomAwarenessSection(
    roomContext.npcs,
    roomName,
    worldName
  );

  // Combine into scenario
  const injectedScenario = `${roomDescription}

${awarenessSection}`.trim();

  return {
    ...card,
    data: {
      ...card.data,
      scenario: injectedScenario,
    },
  };
}

/**
 * Build the room awareness section describing NPCs present.
 * Pure function - no side effects.
 */
export function buildRoomAwarenessSection(
  npcs: ReadonlyArray<RoomNPCContext>,
  roomName: string,
  worldName: string
): string {
  if (!npcs || npcs.length === 0) {
    return `You are in ${roomName} in ${worldName}. The area appears empty.`;
  }

  // Filter to alive NPCs only
  const aliveNpcs = npcs.filter(npc => npc.status === 'alive');

  if (aliveNpcs.length === 0) {
    return `You are in ${roomName} in ${worldName}. The area appears empty.`;
  }

  // Build NPC descriptions
  const npcDescriptions = aliveNpcs.map(npc => {
    const hostile = npc.isHostile ? ' (hostile)' : '';
    return `- ${npc.name}${hostile}`;
  }).join('\n');

  return `You are in ${roomName} in ${worldName}.

Present in this location:
${npcDescriptions}`;
}

/**
 * Build thin NPC context for lightweight conversations.
 * This adapts the legacy buildThinNPCContext pattern.
 * Pure function - returns a new card.
 *
 * @param thinFrame - NPC thin frame data
 * @param npcName - Display name for the NPC
 * @param worldContext - World context
 * @param roomContext - Room context
 * @returns Character card suitable for thin context conversation
 */
export function buildThinContextCard(
  thinFrame: NPCThinFrame,
  npcName: string,
  worldContext: WorldContext | null,
  roomContext: RoomContext | null
): MinimalCharacterCard {
  const worldName = worldContext?.name || 'this world';
  const roomName = roomContext?.name || 'this location';

  const description = getThinFrameDescription(thinFrame);
  const personality = getThinFramePersonality(thinFrame);

  // Build scenario from thin frame
  const scenario = `${npcName} is a character in ${worldName}.
Location: ${roomName}

${description}`.trim();

  return createMinimalCharacterCard({
    name: npcName,
    description,
    personality,
    scenario,
  });
}

/**
 * Build dual-speaker context card for conversations with ally present.
 * This adapts the legacy buildDualSpeakerContext pattern.
 * Pure function - returns a new card.
 *
 * @param targetThinFrame - Target NPC thin frame
 * @param targetName - Target NPC display name
 * @param allyCard - Bonded ally's full card
 * @param worldContext - World context
 * @param roomContext - Room context
 * @returns Character card with dual-speaker system prompt
 */
export function buildDualSpeakerCard(
  targetThinFrame: NPCThinFrame,
  targetName: string,
  allyCard: CharacterCard,
  worldContext: WorldContext | null,
  roomContext: RoomContext | null
): MinimalCharacterCard {
  const worldName = worldContext?.name || 'this world';
  const roomName = roomContext?.name || 'this location';
  const allyName = allyCard.data.name || 'Companion';

  // Extract ally personality summary (first 2 sentences or 200 chars)
  const allyPersonality = allyCard.data.personality || '';
  let allyPersonalitySummary = '';

  if (allyPersonality) {
    const sentences = allyPersonality.match(/[^.!?]+[.!?]/g);
    if (sentences && sentences.length > 0) {
      allyPersonalitySummary = sentences.slice(0, 2).join(' ').trim();
      if (allyPersonalitySummary.length > 200) {
        allyPersonalitySummary = allyPersonalitySummary.substring(0, 200).trim() + '...';
      }
    } else {
      allyPersonalitySummary = allyPersonality.length > 200
        ? allyPersonality.substring(0, 200).trim() + '...'
        : allyPersonality.trim();
    }
  }

  // Extract ally description snippet
  const allyDescription = allyCard.data.description || '';
  let allyDescSnippet = '';
  if (allyDescription) {
    const descMatch = allyDescription.match(/^[^.!?]+[.!?]/);
    allyDescSnippet = descMatch ? descMatch[0].trim() : '';
  }

  const targetDescription = getThinFrameDescription(targetThinFrame);
  const targetPersonality = getThinFramePersonality(targetThinFrame);

  // Build the dual-speaker system prompt
  const dualSpeakerPrompt = `You are roleplaying a scene with two characters present. The player is speaking with ${targetName}.

PRIMARY SPEAKER - ${targetName}:
${targetDescription || `A character in ${roomName}.`}

COMPANION PRESENT - ${allyName}:
${allyDescSnippet ? allyDescSnippet + ' ' : ''}${allyPersonalitySummary || 'A companion traveling with the player.'}

DUAL-SPEAKER INSTRUCTIONS:
- Respond primarily as ${targetName} - they are the main conversation partner
- ${allyName} may occasionally interject (roughly 1 in 3-4 responses) when:
  * The topic relates to them personally
  * They have valuable input or a strong opinion
  * It would be natural for a companion to speak up
  * The situation calls for their expertise or reaction
- When ${allyName} speaks, format their dialogue as:
  [${allyName}]: "Their dialogue here" or *their action here*
- Keep ${allyName}'s interjections brief (1-2 sentences typically)
- ${allyName} should NOT dominate the conversation - ${targetName} is the focus
- Both characters should feel distinct in voice and personality

LOCATION: ${roomName} in ${worldName}`;

  return createMinimalCharacterCard({
    name: targetName,
    description: targetDescription,
    personality: targetPersonality,
    system_prompt: dualSpeakerPrompt,
  });
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate that a context snapshot has the required data for its mode.
 * Pure function - no side effects.
 *
 * @param snapshot - The snapshot to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateContextSnapshot(
  snapshot: ContextSnapshot
): string[] {
  const errors: string[] = [];

  // Session is always required
  if (!snapshot.session) {
    errors.push('Session context is required');
  }

  // Validate based on mode
  switch (snapshot.mode) {
    case 'assistant':
      // No additional requirements
      break;

    case 'character':
      if (!snapshot.character) {
        errors.push('Character context required for character mode');
      }
      break;

    case 'world_narrator':
      if (!snapshot.world) {
        errors.push('World context required for world_narrator mode');
      }
      if (!snapshot.room) {
        errors.push('Room context required for world_narrator mode');
      }
      break;

    case 'npc_conversation':
      if (!snapshot.conversationTarget) {
        errors.push('Conversation target required for npc_conversation mode');
      }
      break;

    case 'npc_bonded':
      if (!snapshot.bondedAlly) {
        errors.push('Bonded ally required for npc_bonded mode');
      }
      break;

    case 'dual_speaker':
      if (!snapshot.conversationTarget) {
        errors.push('Conversation target required for dual_speaker mode');
      }
      if (!snapshot.bondedAlly) {
        errors.push('Bonded ally required for dual_speaker mode');
      }
      break;
  }

  return errors;
}
