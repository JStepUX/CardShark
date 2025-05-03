import { useState, useEffect, useCallback } from 'react';
import { worldApi } from '../api/worldApi';
import { WorldState, WorldMetadata } from '../types/world';

interface UseWorldSessionOptions {
  /**
   * Initial world name to load
   */
  initialWorld?: string | null;
  
  /**
   * Auto-save interval in milliseconds (0 to disable)
   * @default 60000 (1 minute)
   */
  autoSaveInterval?: number;
  
  /**
   * Check for updates interval in milliseconds (0 to disable)
   * @default 30000 (30 seconds)
   */
  updateCheckInterval?: number;
  
  /**
   * Callback when world state is loaded
   */
  onWorldLoaded?: (state: WorldState) => void;
  
  /**
   * Callback when world state fails to load
   */
  onWorldError?: (error: Error) => void;
}

/**
 * A hook for managing world sessions with loading, saving, and session tracking
 */
const useWorldSession = ({
  initialWorld = null,
  autoSaveInterval = 60000,
  updateCheckInterval = 30000,
  onWorldLoaded,
  onWorldError
}: UseWorldSessionOptions = {}) => {
  // State
  const [activeWorld, setActiveWorld] = useState<string | null>(initialWorld);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [worldMetadata, setWorldMetadata] = useState<WorldMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastModified, setLastModified] = useState<number>(0);
  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);

  // Load world state
  const loadWorldState = useCallback(async (worldName: string) => {
    if (!worldName) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Load world state and metadata in parallel
      const [stateResult, metadataResult] = await Promise.all([
        worldApi.getWorldState(worldName),
        worldApi.getWorldMetadata(worldName)
      ]);
      
      setWorldState(stateResult);
      setWorldMetadata(metadataResult);
      setLastModified(Date.now());
      setActiveWorld(worldName);
      
      if (onWorldLoaded) {
        onWorldLoaded(stateResult);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Unknown error occurred');
      setError(errorObj);
      
      if (onWorldError) {
        onWorldError(errorObj);
      }
    } finally {
      setLoading(false);
    }
  }, [onWorldLoaded, onWorldError]);

  // Save world state
  const saveWorldState = useCallback(async (force: boolean = false) => {
    if (!activeWorld || !worldState) return false;
    
    // Only save if there are pending changes or force is true
    if (!force && !hasPendingChanges) return true;
    
    try {
      const result = await worldApi.saveWorldState(activeWorld, worldState);
      if (result) {
        setHasPendingChanges(false);
        setLastModified(Date.now());
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error saving world state:', err);
      return false;
    }
  }, [activeWorld, worldState, hasPendingChanges]);

  // Update local world state
  const updateWorldState = useCallback((updater: (state: WorldState) => WorldState) => {
    if (!worldState) return;
    
    const updatedState = updater(worldState);
    setWorldState(updatedState);
    setHasPendingChanges(true);
    worldApi.markPendingChanges(true);
  }, [worldState]);

  // Switch to a different world
  const switchWorld = useCallback(async (worldName: string | null) => {
    // Save current world state if there are pending changes
    if (activeWorld && hasPendingChanges) {
      await saveWorldState(true);
    }
    
    // Clear current world state
    setWorldState(null);
    setWorldMetadata(null);
    setError(null);
    
    // Switch session
    await worldApi.switchWorldSession(worldName);
    
    // Load new world if specified
    if (worldName) {
      await loadWorldState(worldName);
    } else {
      setActiveWorld(null);
    }
  }, [activeWorld, hasPendingChanges, saveWorldState, loadWorldState]);

  // Auto-save effect
  useEffect(() => {
    if (!autoSaveInterval || autoSaveInterval <= 0 || !activeWorld || !hasPendingChanges) {
      return;
    }
    
    const timer = setTimeout(() => {
      saveWorldState();
    }, autoSaveInterval);
    
    return () => clearTimeout(timer);
  }, [activeWorld, worldState, hasPendingChanges, autoSaveInterval, saveWorldState]);

  // Update check effect
  useEffect(() => {
    if (!updateCheckInterval || updateCheckInterval <= 0 || !activeWorld || loading) {
      return;
    }
    
    const checkForUpdates = async () => {
      if (!activeWorld || loading || hasPendingChanges) return;
      
      try {
        const { hasUpdates, newState } = await worldApi.checkForWorldUpdates(
          activeWorld, 
          lastModified
        );
        
        if (hasUpdates && newState) {
          setWorldState(newState);
          setLastModified(Date.now());
        }
      } catch (err) {
        console.error('Error checking for world updates:', err);
      }
    };
    
    const timer = setInterval(checkForUpdates, updateCheckInterval);
    return () => clearInterval(timer);
  }, [activeWorld, loading, hasPendingChanges, lastModified, updateCheckInterval]);

  // Initial load effect
  useEffect(() => {
    if (initialWorld) {
      loadWorldState(initialWorld);
    } else {
      const session = worldApi.getActiveWorldSession();
      if (session.worldName) {
        loadWorldState(session.worldName);
      }
    }
  }, [initialWorld, loadWorldState]);

  return {
    activeWorld,
    worldState,
    worldMetadata,
    loading,
    error,
    hasPendingChanges,
    loadWorldState,
    saveWorldState,
    updateWorldState,
    switchWorld,
  };
};

export default useWorldSession;