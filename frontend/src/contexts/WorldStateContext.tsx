import React, { createContext, useState, useContext, useEffect } from 'react';
import { WorldState, EventInfo } from '../types/world';
import { worldApi } from '../api/worldApi';

// Define the context type
interface WorldStateContextType {
  worldState: WorldState | null;
  loading: boolean;
  error: string | null;
  currentEvent: EventInfo | null;
  move: (direction: string) => Promise<void>;
  createAdjacentLocation: (direction: string) => Promise<void>;
  connectLocation: (locationId: string, coordinates: number[]) => Promise<void>;
  resolveCurrentEvent: (choiceId?: string) => Promise<void>;
}

// Props for the provider component
interface WorldStateProviderProps {
  worldName: string;
  children: React.ReactNode;
}

// Create the context with default values
export const WorldStateContext = createContext<WorldStateContextType | undefined>(undefined);

export const WorldStateProvider: React.FC<WorldStateProviderProps> = ({ worldName, children }) => {
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentEvent, setCurrentEvent] = useState<EventInfo | null>(null);
  
  // Load initial state
  useEffect(() => {
    const loadState = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const state = await worldApi.getWorldState(worldName);
        setWorldState(state);
        
        // Check if there's a pending event
        if (state.pending_event) {
          setCurrentEvent(state.pending_event);
        }
        
        setLoading(false);
      } catch (err) {
        console.error(`Failed to load world state for '${worldName}':`, err);
        setError(err instanceof Error ? err.message : "Failed to load world");
        setLoading(false);
      }
    };
    
    loadState();
  }, [worldName]);
  
  // Implement move function
  const move = async (direction: string) => {
    if (!worldState) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const updatedState = await worldApi.movePlayer(worldName, direction);
      setWorldState(updatedState);
      
      // Check for pending event
      if (updatedState.pending_event) {
        setCurrentEvent(updatedState.pending_event);
      }
      
      setLoading(false);
    } catch (err) {
      console.error(`Failed to move in direction '${direction}':`, err);
      setError(err instanceof Error ? err.message : "Failed to move");
      setLoading(false);
    }
  };
  
  // Implement createAdjacentLocation
  const createAdjacentLocation = async (direction: string) => {
    if (!worldState) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const updatedState = await worldApi.createLocation(
        worldName,
        worldState.current_position,
        direction
      );
      
      setWorldState(updatedState);
      
      // Check for pending event
      if (updatedState.pending_event) {
        setCurrentEvent(updatedState.pending_event);
      }
      
      setLoading(false);
    } catch (err) {
      console.error(`Failed to create location in direction '${direction}':`, err);
      setError(err instanceof Error ? err.message : "Failed to create location");
      setLoading(false);
    }
  };
  
  // Implement connectLocation
  const connectLocation = async (locationId: string, coordinates: number[]) => {
    if (!worldState) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const updatedState = await worldApi.connectLocation(
        worldName,
        locationId,
        coordinates
      );
      
      setWorldState(updatedState);
      setLoading(false);
    } catch (err) {
      console.error(`Failed to connect location '${locationId}':`, err);
      setError(err instanceof Error ? err.message : "Failed to connect location");
      setLoading(false);
    }
  };
  
  // Implement resolveCurrentEvent
  const resolveCurrentEvent = async (choiceId: string = "acknowledge") => {
    if (!worldState || !currentEvent) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const updatedState = await worldApi.resolveEvent(
        worldName,
        currentEvent.id,
        choiceId
      );
      
      setWorldState(updatedState);
      setCurrentEvent(null); // Clear the current event
      setLoading(false);
    } catch (err) {
      console.error(`Failed to resolve event:`, err);
      setError(err instanceof Error ? err.message : "Failed to resolve event");
      setLoading(false);
    }
  };
  
  // Return provider with value
  return (
    <WorldStateContext.Provider 
      value={{ 
        worldState, 
        loading, 
        error, 
        currentEvent,
        move, 
        createAdjacentLocation,
        connectLocation,
        resolveCurrentEvent
      }}
    >
      {children}
    </WorldStateContext.Provider>
  );
};

// Custom hook
export const useWorldState = () => {
  const context = useContext(WorldStateContext);
  if (context === undefined) {
    throw new Error("useWorldState must be used within a WorldStateProvider");
  }
  return context;
};