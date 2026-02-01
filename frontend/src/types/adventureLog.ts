/**
 * @file adventureLog.ts
 * @description Types for adventure log and room summarization.
 *
 * The adventure log tracks the player's journey through a world, summarizing
 * each room visit for narrative continuity. These summaries are injected into
 * the LLM context so the AI can reference past events.
 */

/**
 * Summary of a single interaction with an NPC during a room visit.
 */
export interface NPCInteractionSummary {
  /** UUID of the NPC character */
  readonly npcUuid: string;
  /** Display name of the NPC */
  readonly npcName: string;
  /** How the relationship changed during this interaction */
  readonly relationshipChange: 'improved' | 'worsened' | 'neutral';
  /** Brief description of the notable interaction (max 60 chars) */
  readonly notableInteraction: string;
}

/**
 * Record of an item change during a room visit.
 */
export interface ItemChange {
  /** Name of the item */
  readonly item: string;
  /** What happened to the item */
  readonly action: 'acquired' | 'used' | 'lost' | 'traded';
}

/**
 * Summary of a single room visit.
 * Generated either by LLM summarization or keyword extraction fallback.
 */
export interface RoomSummary {
  /** UUID of the room */
  readonly roomUuid: string;
  /** Display name of the room */
  readonly roomName: string;
  /** Epoch milliseconds when the player entered */
  readonly visitedAt: number;
  /** Epoch milliseconds when the player departed */
  readonly departedAt: number;
  /** Number of messages exchanged during the visit */
  readonly messageCount: number;
  /** Key events that occurred (max 3) */
  readonly keyEvents: string[];
  /** NPCs the player interacted with */
  readonly npcsInteracted: NPCInteractionSummary[];
  /** Items acquired, used, lost, or traded */
  readonly itemsChanged: ItemChange[];
  /** Plot threads left unresolved (max 2) */
  readonly unresolvedThreads: string[];
  /** The player's emotional state when leaving */
  readonly moodOnDeparture: string;
}

/**
 * Cumulative adventure context for a world playthrough.
 * Used for injecting journey history into LLM context.
 */
export interface AdventureContext {
  /** UUID of the world */
  readonly worldUuid: string;
  /** UUID of the user */
  readonly userUuid: string;
  /** All room visit summaries in chronological order */
  readonly entries: RoomSummary[];
  /** Current objectives/quests the player is tracking */
  readonly currentObjectives: string[];
  /** Total number of unique rooms visited */
  readonly totalRoomsVisited: number;
  /** Total message count across all visits */
  readonly totalMessageCount: number;
}

/**
 * Request payload for the summarize-room endpoint.
 */
export interface SummarizeRoomRequest {
  /** UUID of the world */
  worldUuid: string;
  /** UUID of the user */
  userUuid: string;
  /** UUID of the room being summarized */
  roomUuid: string;
  /** Display name of the room */
  roomName: string;
  /** Epoch milliseconds when the visit started */
  visitedAt: number;
  /** Chat messages from the room visit */
  messages: SummarizeMessage[];
  /** NPCs present in the room for matching */
  npcs: SummarizeNPC[];
}

/**
 * Simplified message format for summarization.
 */
export interface SummarizeMessage {
  /** Message role */
  role: 'user' | 'assistant' | 'system';
  /** Message content (plain text) */
  content: string;
}

/**
 * Simplified NPC data for summarization matching.
 */
export interface SummarizeNPC {
  /** NPC UUID */
  id: string;
  /** NPC display name */
  name: string;
}

/**
 * Response from the summarize-room endpoint.
 */
export interface SummarizeRoomResponse {
  /** The generated summary */
  summary: RoomSummary;
  /** Method used to generate the summary */
  method: 'llm' | 'fallback';
}

/**
 * Create an empty/default RoomSummary.
 */
export function createEmptyRoomSummary(
  roomUuid: string,
  roomName: string,
  visitedAt: number
): RoomSummary {
  return {
    roomUuid,
    roomName,
    visitedAt,
    departedAt: Date.now(),
    messageCount: 0,
    keyEvents: [],
    npcsInteracted: [],
    itemsChanged: [],
    unresolvedThreads: [],
    moodOnDeparture: 'neutral',
  };
}

/**
 * Create an empty AdventureContext for a new playthrough.
 */
export function createEmptyAdventureContext(
  worldUuid: string,
  userUuid: string
): AdventureContext {
  return {
    worldUuid,
    userUuid,
    entries: [],
    currentObjectives: [],
    totalRoomsVisited: 0,
    totalMessageCount: 0,
  };
}
