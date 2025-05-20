import { useState, useCallback } from 'react';
import { characterInventoryService } from '../services/characterInventoryService';

export function useCharacterUuid() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const getCharacterUuid = useCallback(async (characterId: string, characterName?: string): Promise<string | null> => {
    if (!characterId) return null;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const uuid = await characterInventoryService.getCharacterUuid(characterId, characterName);
      return uuid;
    } catch (err) {
      console.error('Failed to get character UUID:', err);
      setError('Failed to get character UUID');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  return {
    getCharacterUuid,
    isLoading,
    error,
  };
}
