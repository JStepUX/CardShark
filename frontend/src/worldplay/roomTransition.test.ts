import {
  applySavedRoomState,
  findRoomGridPosition,
  pruneTravelMessages,
  snapshotRoomState,
  toSummarizeMessages,
  toSummarizeNpcs,
} from './roomTransition';
import type { CombatDisplayNPC, GridWorldState } from '../types/worldGrid';
import type { WorldPlayMessage } from './contracts';

describe('worldplay roomTransition helpers', () => {
  const roomNpcs: CombatDisplayNPC[] = [
    {
      id: 'npc-alive',
      name: 'Alive NPC',
      imageUrl: '',
    },
    {
      id: 'npc-dead',
      name: 'Dead NPC',
      imageUrl: '',
      isDead: true,
    },
    {
      id: 'npc-down',
      name: 'Down NPC',
      imageUrl: '',
      isIncapacitated: true,
    },
  ];

  it('snapshots only runtime NPC states that matter across travel', () => {
    expect(snapshotRoomState(roomNpcs)).toEqual({
      npc_states: {
        'npc-dead': { status: 'dead' },
        'npc-down': { status: 'incapacitated' },
      },
    });
  });

  it('builds summarize payloads from world-play messages and NPCs', () => {
    const messages: WorldPlayMessage[] = [
      {
        id: '1',
        role: 'system',
        content: 'ignore me',
        timestamp: 1,
      },
      {
        id: '2',
        role: 'user',
        content: 'hello',
        timestamp: 2,
      },
      {
        id: '3',
        role: 'assistant',
        content: 'hi there',
        timestamp: 3,
      },
    ];

    expect(toSummarizeMessages(messages)).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
    expect(toSummarizeNpcs(roomNpcs)).toEqual([
      { id: 'npc-alive', name: 'Alive NPC' },
      { id: 'npc-dead', name: 'Dead NPC' },
      { id: 'npc-down', name: 'Down NPC' },
    ]);
  });

  it('prunes travel history to the newest messages', () => {
    const messages = Array.from({ length: 5 }, (_, index) => ({
      id: `${index}`,
      role: 'assistant' as const,
      content: `message-${index}`,
      timestamp: index,
    }));

    expect(pruneTravelMessages(messages, 3).map((message) => message.id)).toEqual(['2', '3', '4']);
    expect(pruneTravelMessages(messages, 10)).toBe(messages);
  });

  it('finds room coordinates in the world grid', () => {
    const worldState: GridWorldState = {
      uuid: 'world',
      metadata: { name: 'World', description: 'Test' },
      player_position: { x: 0, y: 0 },
      starting_position: { x: 0, y: 0 },
      grid: [
        [{
          id: 'room-a',
          name: 'Room A',
          description: '',
          introduction_text: '',
          npcs: [],
          events: [],
          connections: {},
          position: { x: 0, y: 0 },
        }, null],
        [null, {
          id: 'room-b',
          name: 'Room B',
          description: '',
          introduction_text: '',
          npcs: [],
          events: [],
          connections: {},
          position: { x: 1, y: 1 },
        }],
      ],
    };

    expect(findRoomGridPosition(worldState, 'room-b')).toEqual({ x: 1, y: 1 });
    expect(findRoomGridPosition(worldState, 'missing-room')).toBeNull();
  });

  it('applies saved room state by filtering dead NPCs and marking incapacitated ones', () => {
    const restored = applySavedRoomState(roomNpcs, {
      npc_states: {
        'npc-dead': { status: 'dead' },
        'npc-down': { status: 'incapacitated' },
      },
    });

    expect(restored.map((npc) => npc.id)).toEqual(['npc-alive', 'npc-down']);
    expect(restored.find((npc) => npc.id === 'npc-down')?.isIncapacitated).toBe(true);
  });
});
