import { CharacterData } from '../contexts/CharacterContext';

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

    return { metadata: data.metadata, imageUrl };
  } catch (error) {
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

/**
 * Generate a consistent character ID based on character data
 */
export function getCharacterId(character: CharacterData | null): string | null {
  if (!character?.data?.name) return null;
  
  try {
    const name = character.data.name;
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
    
    return `${name.replace(/\s+/g, '_').toLowerCase()}-${simpleHash(name + desc)}`;
  } catch (error) {
    console.error('Error generating character ID:', error);
    return `char-${Date.now().toString(36)}`;
  }
}