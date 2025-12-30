/**
 * WorldPlayContext
 * Manages state for playing/navigating through a world
 */
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { WorldCard } from '../types/worldCard';
import type { RoomCard } from '../types/room';

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
}

const WorldPlayContext = createContext<WorldPlayContextType | undefined>(undefined);

const initialState: WorldPlayState = {
  world: null,
  currentRoom: null,
  playerPosition: null,
  roomHistory: {},
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
