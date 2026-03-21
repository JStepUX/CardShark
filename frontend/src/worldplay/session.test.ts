import {
  createWorldPlaySessionState,
  worldPlaySessionReducer,
  type WorldPlaySessionState,
} from './session';
import type { CharacterInventory } from '../types/inventory';
import type { TimeState } from '../types/worldRuntime';
import type { PlayerProgression } from '../utils/progressionUtils';

function makeTimeState(overrides: Partial<TimeState> = {}): TimeState {
  return {
    currentDay: 1,
    currentPeriod: 'morning' as const,
    totalMessages: 0,
    periodsPerDay: 4,
    messagesPerPeriod: 12,
    ...overrides,
  };
}

function makeProgression(overrides: Partial<PlayerProgression> = {}): PlayerProgression {
  return { xp: 0, level: 1, gold: 0, ...overrides };
}

function makeInventory(overrides: Partial<CharacterInventory> = {}): CharacterInventory {
  return { items: [], maxSlots: 20, gold: 0, ...overrides };
}

function makeState(overrides: Partial<WorldPlaySessionState> = {}): WorldPlaySessionState {
  return createWorldPlaySessionState({
    playerProgression: makeProgression(),
    timeState: makeTimeState(),
    playerInventory: makeInventory(),
    ...overrides,
  });
}

describe('worldPlaySessionReducer', () => {
  describe('hydrate', () => {
    it('preserves existing timeState when payload.timeState is undefined', () => {
      const existingTime = makeTimeState({ currentDay: 5, totalMessages: 42 });
      const state = makeState({ timeState: existingTime });

      const result = worldPlaySessionReducer(state, {
        type: 'hydrate',
        payload: {
          playerProgression: makeProgression({ xp: 100 }),
          // timeState intentionally omitted (undefined)
        },
      });

      expect(result.timeState).toBe(existingTime);
      expect(result.playerProgression.xp).toBe(100);
    });

    it('preserves existing playerInventory when payload.playerInventory is undefined', () => {
      const existingInv = makeInventory({ gold: 500 });
      const state = makeState({ playerInventory: existingInv });

      const result = worldPlaySessionReducer(state, {
        type: 'hydrate',
        payload: {
          playerProgression: makeProgression({ level: 10 }),
          // playerInventory intentionally omitted (undefined)
        },
      });

      expect(result.playerInventory).toBe(existingInv);
      expect(result.playerProgression.level).toBe(10);
    });

    it('replaces timeState when payload provides a value', () => {
      const state = makeState({ timeState: makeTimeState({ currentDay: 1 }) });
      const newTime = makeTimeState({ currentDay: 7, totalMessages: 100 });

      const result = worldPlaySessionReducer(state, {
        type: 'hydrate',
        payload: { timeState: newTime },
      });

      expect(result.timeState).toBe(newTime);
    });

    it('extracts bondedAlly fields and splits inventory', () => {
      const state = makeState();
      const allyInv = makeInventory({ gold: 50 });

      const result = worldPlaySessionReducer(state, {
        type: 'hydrate',
        payload: {
          bondedAlly: {
            id: 'ally-1',
            name: 'Test Ally',
            card: null,
            inventory: allyInv,
          },
        },
      });

      expect(result.bondedAlly).toEqual({ id: 'ally-1', name: 'Test Ally', card: null });
      expect(result.allyInventory).toBe(allyInv);
    });

    it('clears bondedAlly when payload.bondedAlly is null', () => {
      const state = makeState();
      state.bondedAlly = { id: 'old', name: 'Old', card: null };
      state.allyInventory = makeInventory();

      const result = worldPlaySessionReducer(state, {
        type: 'hydrate',
        payload: { bondedAlly: null },
      });

      expect(result.bondedAlly).toBeNull();
      expect(result.allyInventory).toBeNull();
    });

    it('leaves bondedAlly unchanged when payload.bondedAlly is undefined', () => {
      const existingAlly = { id: 'keep', name: 'Keep', card: null };
      const state = makeState();
      state.bondedAlly = existingAlly;

      const result = worldPlaySessionReducer(state, {
        type: 'hydrate',
        payload: { playerProgression: makeProgression({ xp: 50 }) },
      });

      expect(result.bondedAlly).toBe(existingAlly);
    });
  });
});
