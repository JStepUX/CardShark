// utils/generateUUID.ts

let lastTimestampGenerated = 0;
let generationCounter = 0;

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID if available, or falls back to a simple implementation
 * Includes timestamp and a counter prefix to ensure uniqueness across rapid successive calls within the same millisecond.
 */
export function generateUUID(): string {
    const now = Date.now();
    if (now === lastTimestampGenerated) {
        generationCounter++;
    } else {
        lastTimestampGenerated = now;
        generationCounter = 0;
    }

    const timestampPart = now.toString(36);
    const counterPart = generationCounter.toString(36);
    
    // Generate base UUID
    let uuidPart: string;
    
    // Use built-in crypto.randomUUID() if available (modern browsers)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      uuidPart = crypto.randomUUID();
    } else {
      // Fallback implementation for older browsers
      uuidPart = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    
    return `${timestampPart}-${counterPart}-${uuidPart}`;
  }
  
  /**
   * Get a chat UUID, either from existing data or generating a new one
   */
  export function getChatUUID(existingId?: string | null): string {
    if (existingId) {
      return existingId;
    }
    return generateUUID();
  }
  
  /**
   * Get an existing character UUID or generate a consistent one based on character properties
   */
  export function getCharacterUUID(characterData: any): string {
    // First try to get UUID from extensions
    if (characterData?.data?.extensions?.uuid) {
      return characterData.data.extensions.uuid;
    }
    
    // If no UUID exists, generate one based on character data (for backward compatibility)
    const name = characterData?.data?.name || 'unknown';
    const desc = characterData?.data?.description || '';
    
    // Create a simple hash-based UUID
    const stringToHash = `${name}|${desc.substring(0, 100)}`;
    let hash = 0;
    
    for (let i = 0; i < stringToHash.length; i++) {
      const char = stringToHash.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Format as UUID-like string
    const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hashStr}-${Date.now().toString(16)}-${Math.random().toString(16).substring(2, 10)}`;
  }
  
  /**
   * Ensure a character has a UUID in its extensions
   * Returns a new character object with UUID added if needed
   */
  export function ensureCharacterUUID(characterData: any): any {
    if (!characterData) return characterData;
    
    // Deep clone to avoid modifying the original
    const updatedCharacter = JSON.parse(JSON.stringify(characterData));
    
    // Ensure extensions object exists
    if (!updatedCharacter.data) {
      updatedCharacter.data = {};
    }
    if (!updatedCharacter.data.extensions) {
      updatedCharacter.data.extensions = {};
    }
    
    // Add UUID if it doesn't exist
    if (!updatedCharacter.data.extensions.uuid) {
      updatedCharacter.data.extensions.uuid = getCharacterUUID(characterData);
    }
    
    return updatedCharacter;
  }
  
  /**
   * Creates a chat ID that includes character ID for improved organization
   */
  export function createChatId(characterData: any): string {
    const charId = getCharacterUUID(characterData);
    return `${charId.substring(0, 8)}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  }