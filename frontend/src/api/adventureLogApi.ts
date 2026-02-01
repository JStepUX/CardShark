/**
 * @file adventureLogApi.ts
 * @description API client for Adventure Log and Room Summarization operations.
 *
 * Handles room visit summaries for narrative continuity during world play.
 */

import type {
  SummarizeRoomRequest,
  SummarizeRoomResponse,
  AdventureContext,
  SummarizeMessage,
  SummarizeNPC,
} from '../types/adventureLog';

const BASE_URL = '/api/context';

/**
 * API response wrapper from the backend.
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * API client for adventure log operations.
 */
export const adventureLogApi = {
  /**
   * Summarize a room visit using LLM or fallback extraction.
   *
   * @param params - Summarization request parameters
   * @returns The generated summary and method used
   */
  async summarizeRoom(params: {
    worldUuid: string;
    userUuid: string;
    roomUuid: string;
    roomName: string;
    visitedAt: number;
    messages: SummarizeMessage[];
    npcs: SummarizeNPC[];
  }): Promise<SummarizeRoomResponse> {
    const request: SummarizeRoomRequest = {
      worldUuid: params.worldUuid,
      userUuid: params.userUuid,
      roomUuid: params.roomUuid,
      roomName: params.roomName,
      visitedAt: params.visitedAt,
      messages: params.messages,
      npcs: params.npcs,
    };

    const response = await fetch(`${BASE_URL}/summarize-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        world_uuid: request.worldUuid,
        user_uuid: request.userUuid,
        room_uuid: request.roomUuid,
        room_name: request.roomName,
        visited_at: request.visitedAt,
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        npcs: request.npcs.map(n => ({
          id: n.id,
          name: n.name,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to summarize room' }));
      throw new Error(error.detail || 'Failed to summarize room');
    }

    // Backend returns snake_case, need to cast as unknown first
    const rawData = await response.json();
    const data = rawData as ApiResponse<Record<string, unknown>>;
    const rawSummary = data.data.summary as Record<string, unknown>;

    // Transform snake_case response to camelCase
    return {
      summary: {
        roomUuid: rawSummary.room_uuid as string,
        roomName: rawSummary.room_name as string,
        visitedAt: rawSummary.visited_at as number,
        departedAt: rawSummary.departed_at as number,
        messageCount: rawSummary.message_count as number,
        keyEvents: (rawSummary.key_events || []) as string[],
        npcsInteracted: ((rawSummary.npcs_interacted || []) as Array<Record<string, unknown>>).map(n => ({
          npcUuid: n.npc_uuid as string,
          npcName: n.npc_name as string,
          relationshipChange: n.relationship_change as 'improved' | 'worsened' | 'neutral',
          notableInteraction: n.notable_interaction as string,
        })),
        itemsChanged: ((rawSummary.items_changed || []) as Array<Record<string, unknown>>).map(i => ({
          item: i.item as string,
          action: i.action as 'acquired' | 'used' | 'lost' | 'traded',
        })),
        unresolvedThreads: (rawSummary.unresolved_threads || []) as string[],
        moodOnDeparture: (rawSummary.mood_on_departure || 'neutral') as string,
      },
      method: data.data.method as 'llm' | 'fallback',
    };
  },

  /**
   * Get the adventure context for a world playthrough.
   *
   * @param worldUuid - UUID of the world
   * @param userUuid - UUID of the user
   * @param maxEntries - Maximum number of entries to return (default 10)
   * @returns The adventure context with recent room summaries
   */
  async getAdventureContext(
    worldUuid: string,
    userUuid: string,
    maxEntries: number = 10
  ): Promise<AdventureContext> {
    const url = `${BASE_URL}/adventure-log/${worldUuid}/${userUuid}?max_entries=${maxEntries}`;

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get adventure context' }));
      throw new Error(error.detail || 'Failed to get adventure context');
    }

    const data: ApiResponse<Record<string, unknown>> = await response.json();
    const ctx = data.data;

    // Transform snake_case response to camelCase
    return {
      worldUuid: ctx.world_uuid as string,
      userUuid: ctx.user_uuid as string,
      entries: ((ctx.entries as Array<Record<string, unknown>>) || []).map(entry => ({
        roomUuid: entry.room_uuid as string,
        roomName: entry.room_name as string,
        visitedAt: entry.visited_at as number,
        departedAt: entry.departed_at as number,
        messageCount: entry.message_count as number,
        keyEvents: (entry.key_events || []) as string[],
        npcsInteracted: ((entry.npcs_interacted as Array<Record<string, unknown>>) || []).map(n => ({
          npcUuid: n.npc_uuid as string,
          npcName: n.npc_name as string,
          relationshipChange: n.relationship_change as 'improved' | 'worsened' | 'neutral',
          notableInteraction: n.notable_interaction as string,
        })),
        itemsChanged: ((entry.items_changed as Array<Record<string, unknown>>) || []).map(i => ({
          item: i.item as string,
          action: i.action as 'acquired' | 'used' | 'lost' | 'traded',
        })),
        unresolvedThreads: (entry.unresolved_threads || []) as string[],
        moodOnDeparture: (entry.mood_on_departure || 'neutral') as string,
      })),
      currentObjectives: (ctx.current_objectives || []) as string[],
      totalRoomsVisited: (ctx.total_rooms_visited || 0) as number,
      totalMessageCount: (ctx.total_message_count || 0) as number,
    };
  },

  /**
   * Delete all adventure log entries for a world+user.
   * Used when starting a new game or clearing progress.
   *
   * @param worldUuid - UUID of the world
   * @param userUuid - UUID of the user
   * @returns Number of entries deleted
   */
  async deleteAdventureLog(
    worldUuid: string,
    userUuid: string
  ): Promise<number> {
    const response = await fetch(`${BASE_URL}/adventure-log/${worldUuid}/${userUuid}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to delete adventure log' }));
      throw new Error(error.detail || 'Failed to delete adventure log');
    }

    const data: ApiResponse<{ deleted_count: number }> = await response.json();
    return data.data.deleted_count;
  },
};
