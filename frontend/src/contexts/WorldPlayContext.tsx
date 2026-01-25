/**
 * WorldPlayContext
 * Manages state for playing/navigating through a world
 */
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { WorldCard } from '../types/worldCard';
import type { RoomCard } from '../types/room';
import type { NPCRelationship } from '../types/worldRuntime';
import { AffinityTier } from '../types/worldRuntime';
import {
  createDefaultRelationship,
  updateRelationshipAffinity
} from '../utils/affinityUtils';

interface Position {
  x: number;
  y: number;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface RoomHistory {
  [roomUuid: string]: Message[];
}

interface WorldPlayState {
  world: WorldCard | null;
  currentRoom: RoomCard | null;
  playerPosition: Position | null;
  roomHistory: RoomHistory;
  relationships: Record<string, NPCRelationship>;
  isLoading: boolean;
  error: string | null;
}

interface WorldPlayContextType extends WorldPlayState {
  setWorld: (world: WorldCard) => void;
  setCurrentRoom: (room: RoomCard) => void;
  setPlayerPosition: (position: Position) => void;
  addMessage: (roomUuid: string, message: Message) => void;
  clearRoomHistory: (roomUuid: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // Relationship management
  updateRelationship: (npcUuid: string, affinityDelta: number, reason?: string) => void;
  getRelationship: (npcUuid: string) => NPCRelationship;
  getAffinityTier: (npcUuid: string) => AffinityTier;
}

const WorldPlayContext = createContext<WorldPlayContextType | undefined>(undefined);

const initialState: WorldPlayState = {
  world: null,
  currentRoom: null,
  playerPosition: null,
  roomHistory: {},
  relationships: {},
  isLoading: false,
  error: null,
};

export const WorldPlayProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WorldPlayState>(initialState);

  const setWorld = useCallback((world: WorldCard) => {
    setState(prev => ({ ...prev, world }));
  }, []);

  const setCurrentRoom = useCallback((room: RoomCard) => {
    setState(prev => ({ ...prev, currentRoom: room }));
  }, []);

  const setPlayerPosition = useCallback((position: Position) => {
    setState(prev => ({ ...prev, playerPosition: position }));
  }, []);

  const addMessage = useCallback((roomUuid: string, message: Message) => {
    setState(prev => ({
      ...prev,
      roomHistory: {
        ...prev.roomHistory,
        [roomUuid]: [...(prev.roomHistory[roomUuid] || []), message],
      },
    }));
  }, []);

  const clearRoomHistory = useCallback((roomUuid: string) => {
    setState(prev => ({
      ...prev,
      roomHistory: {
        ...prev.roomHistory,
        [roomUuid]: [],
      },
    }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  // Relationship management methods
  const updateRelationship = useCallback((npcUuid: string, affinityDelta: number, reason?: string) => {
    setState(prev => {
      const currentRelationship = prev.relationships[npcUuid] || createDefaultRelationship(npcUuid);
      const updatedRelationship = updateRelationshipAffinity(currentRelationship, affinityDelta);

      // Log the change for debugging
      console.log(`[Affinity] ${npcUuid}: ${currentRelationship.affinity} -> ${updatedRelationship.affinity} (${affinityDelta > 0 ? '+' : ''}${affinityDelta})${reason ? ` - ${reason}` : ''}`);

      return {
        ...prev,
        relationships: {
          ...prev.relationships,
          [npcUuid]: updatedRelationship,
        },
      };
    });
  }, []);

  const getRelationship = useCallback((npcUuid: string): NPCRelationship => {
    return state.relationships[npcUuid] || createDefaultRelationship(npcUuid);
  }, [state.relationships]);

  const getAffinityTier = useCallback((npcUuid: string): AffinityTier => {
    const relationship = state.relationships[npcUuid];
    if (!relationship) return AffinityTier.STRANGER;
    return relationship.tier;
  }, [state.relationships]);

  return (
    <WorldPlayContext.Provider
      value={{
        ...state,
        setWorld,
        setCurrentRoom,
        setPlayerPosition,
        addMessage,
        clearRoomHistory,
        setLoading,
        setError,
        reset,
        updateRelationship,
        getRelationship,
        getAffinityTier,
      }}
    >
      {children}
    </WorldPlayContext.Provider>
  );
};

export const useWorldPlay = () => {
  const context = useContext(WorldPlayContext);
  if (!context) {
    throw new Error('useWorldPlay must be used within a WorldPlayProvider');
  }
  return context;
};
