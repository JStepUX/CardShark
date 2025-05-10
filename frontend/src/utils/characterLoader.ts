import { CharacterData } from '../contexts/CharacterContext';
import { toast } from 'sonner';

export async function uploadPngFile(file: File): Promise<{ metadata: CharacterData; imageUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/upload-png', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to upload PNG');
    }

    const data = await response.json();
    
    if (!data.metadata) {
      throw new Error('No character data found in PNG');
    }

    // Create a URL for the uploaded image
    const imageUrl = URL.createObjectURL(file);
    const characterName = data.metadata?.data?.name || 'Unknown Character';
    toast.success(`Character "${characterName}" imported successfully from PNG!`);
    return { metadata: data.metadata, imageUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    toast.error(`Character import failed: ${errorMessage}`);
    if (error instanceof Error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
    throw new Error('Upload failed');
  }
}

export function validateCharacterData(data: any): CharacterData {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid character data format');
  }

  if (data.spec !== 'chara_card_v2') {
    throw new Error('Unsupported character card format');
  }

  return data as CharacterData;
}

// utils/characterLoader.ts - Modified getCharacterId function

/**
 * Generate a consistent character ID based on first 2 characters plus description hash
 * This maintains identity across minor name changes or variants
 * 
 * @param character The character data object
 * @returns A character ID string or null if no valid character
 */
export function getCharacterId(character: CharacterData | null): string | null {
  if (!character?.data?.name) return null;
  
  try {
    // Get first 2 characters of name, defaulting to full name if too short
    const name = character.data.name.trim();
    const namePrefix = name.length >= 2 ? name.substring(0, 2) : name;
    
    // Get description snippet for hash calculation
    const desc = character.data.description?.substring(0, 50) || '';
    
    // Simple hash function for consistency
    const simpleHash = (text: string): string => {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16).substring(0, 8);
    };
    
    // Format: first 2 chars of name + description hash
    return `${namePrefix.toLowerCase().replace(/\s+/g, '_')}-${simpleHash(desc)}`;
  } catch (error) {
    console.error('Error generating character ID:', error);
    return `char-${Date.now().toString(36)}`;
  }
}

/**
 * Optional enhancement: Create a function to test if two characters should share chat history
 * This provides more control over the matching logic
 */
export function shouldShareChatHistory(char1: CharacterData, char2: CharacterData): boolean {
  if (!char1?.data?.name || !char2?.data?.name) return false;
  
  // Get the first 2 chars of each name
  const name1 = char1.data.name.trim();
  const name2 = char2.data.name.trim();
  const prefix1 = name1.length >= 2 ? name1.substring(0, 2).toLowerCase() : name1.toLowerCase();
  const prefix2 = name2.length >= 2 ? name2.substring(0, 2).toLowerCase() : name2.toLowerCase();
  
  // Step 1: Check if name prefixes match
  if (prefix1 !== prefix2) return false;
  
  // Step 2: Check if description hash matches (shared chat ID)
  const id1 = getCharacterId(char1);
  const id2 = getCharacterId(char2);
  
  return id1 === id2;
}