import { LoreEntry, createEmptyLoreEntry } from '../types/schema';
import { useCharacter } from '../contexts/CharacterContext'; // Import useCharacter
import { apiService } from '../services/apiService'; // Import apiService

/**
 * Fetch utility with timeout capability
 */
const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 10000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

/**
 * Parse TSV content into LoreEntry objects
 */
async function parseTsvContent(content: string, startIndex: number): Promise<LoreEntry[]> {
  return content
    .split('\n')
    .filter(line => line.trim())
    .map((line, index) => {
      const [key, value] = line.split('\t').map(s => s.trim());
      if (!key || !value) return null;
      const entry = createEmptyLoreEntry(startIndex + index);
      entry.keys = [key];
      entry.content = value;
      entry.insertion_order = startIndex + index;
      return entry;
    })
    // Change from type predicate to direct type assertion
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null) as LoreEntry[];
}

/**
 * Import TSV file
 */
export async function importTsv(file: File, startIndex: number): Promise<LoreEntry[]> {
  try {
    const content = await file.text();
    return parseTsvContent(content, startIndex);
  } catch (error) {
    console.error('TSV import failed:', error);
    throw new Error(`Failed to import TSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Helper function to map a raw entry from JSON to a LoreEntry object.
 * Ensures consistent ID type (string) and applies field mappings.
 */
function mapRawEntryToLoreEntry(rawEntry: any, index: number, isOriginalDataFormat: boolean): LoreEntry | null {
  if (!rawEntry || typeof rawEntry !== 'object') return null;

  // Create with a temporary insertion_order; it will be set correctly below.
  // createEmptyLoreEntry generates a UUID for `id` by default.
  const loreEntry = createEmptyLoreEntry(0);

  loreEntry.keys = Array.isArray(rawEntry.keys) ? rawEntry.keys.filter((k: any) => typeof k === 'string') : [];
  loreEntry.content = typeof rawEntry.content === 'string' ? rawEntry.content : '';
  loreEntry.comment = typeof rawEntry.comment === 'string' ? rawEntry.comment : '';

  if (isOriginalDataFormat) { // originalData.entries format
    loreEntry.insertion_order = typeof rawEntry.insertion_order === 'number' ? rawEntry.insertion_order : index;
    loreEntry.enabled = typeof rawEntry.enabled === 'boolean' ? rawEntry.enabled : true;
    if (rawEntry.id !== undefined) {
      if (typeof rawEntry.id === 'number') {
        loreEntry.id = rawEntry.id;
      } else if (typeof rawEntry.id === 'string') {
        const parsedId = parseInt(rawEntry.id, 10);
        if (!isNaN(parsedId)) {
          loreEntry.id = parsedId;
        } else {
          // Fallback if ID is a non-numeric string, or rely on createEmptyLoreEntry's default
          // For now, let's ensure it gets a unique number based on index if parsing fails
          loreEntry.id = index + Date.now(); // Simple way to get a somewhat unique number
        }
      }
    } else {
        loreEntry.id = index + Date.now();
    }
  } else { // jsonData.entries (object) format
    loreEntry.insertion_order = typeof rawEntry.order === 'number' ? rawEntry.order : index;
    loreEntry.enabled = typeof rawEntry.disable === 'boolean' ? !rawEntry.disable : true; // Invert 'disable'
    if (rawEntry.uid !== undefined) {
      if (typeof rawEntry.uid === 'number') {
        loreEntry.id = rawEntry.uid;
      } else if (typeof rawEntry.uid === 'string') {
        const parsedUid = parseInt(rawEntry.uid, 10);
        if (!isNaN(parsedUid)) {
          loreEntry.id = parsedUid;
        } else {
          loreEntry.id = index + Date.now();
        }
      }
    } else {
        loreEntry.id = index + Date.now();
    }
  }

  // Handle case_sensitive (can be top-level or in extensions)
  let caseSensitiveValue: boolean | undefined = undefined;
  if (typeof rawEntry.caseSensitive === 'boolean') {
    caseSensitiveValue = rawEntry.caseSensitive;
  } else if (rawEntry.extensions && typeof rawEntry.extensions.caseSensitive === 'boolean') {
    caseSensitiveValue = rawEntry.extensions.caseSensitive;
  }
  if (caseSensitiveValue !== undefined) {
    loreEntry.extensions.case_sensitive = caseSensitiveValue;
  } else {
    loreEntry.extensions.case_sensitive = false; // Default if not found
  }

  // Handle other extensions
  if (rawEntry.extensions && typeof rawEntry.extensions === 'object') {
    const ext = rawEntry.extensions;

    if (typeof ext.depth === 'number') loreEntry.extensions.depth = ext.depth;
    
    if (typeof ext.probability === 'number') loreEntry.extensions.probability = ext.probability;
    else if (typeof ext.weight === 'number') loreEntry.extensions.probability = ext.weight; // Map 'weight' to 'probability'

    if (typeof ext.useProbability === 'boolean') loreEntry.extensions.useProbability = ext.useProbability;
    
    if (typeof ext.selectiveLogic === 'string') {
        const logicMap: { [key: string]: number } = { "AND": 0, "OR": 1, "NOT": 2 };
        loreEntry.extensions.selectiveLogic = logicMap[ext.selectiveLogic.toUpperCase()] ?? loreEntry.extensions.selectiveLogic ?? 0;
    } else if (typeof ext.selectiveLogic === 'number') {
        loreEntry.extensions.selectiveLogic = ext.selectiveLogic;
    }

    if (typeof ext.exclude_recursion === 'boolean') loreEntry.extensions.exclude_recursion = ext.exclude_recursion;
    else if (typeof ext.excludeRecursion === 'boolean') loreEntry.extensions.exclude_recursion = ext.excludeRecursion;

    // addMemo and embedded are not in LoreEntryExtensions, so remove them.
    
    // From existing logic, if relevant and present in LoreEntry.extensions type
    if (typeof ext.position === 'number') loreEntry.extensions.position = ext.position;
    if (typeof ext.display_index === 'number') loreEntry.extensions.display_index = ext.display_index;
    if (typeof ext.group === 'string') loreEntry.extensions.group = ext.group;
    if (typeof ext.group_override === 'boolean') loreEntry.extensions.group_override = ext.group_override;
    if (typeof ext.group_weight === 'number') loreEntry.extensions.group_weight = ext.group_weight;
    if (typeof ext.prevent_recursion === 'boolean') loreEntry.extensions.prevent_recursion = ext.prevent_recursion;
    if (typeof ext.delay_until_recursion === 'boolean') loreEntry.extensions.delay_until_recursion = ext.delay_until_recursion;
  }
  
  // Ensure required extension fields have defaults if not set by import (createEmptyLoreEntry sets most)
  loreEntry.extensions.automation_id = loreEntry.extensions.automation_id ?? "";
  loreEntry.extensions.role = loreEntry.extensions.role ?? 0;
  loreEntry.extensions.vectorized = loreEntry.extensions.vectorized ?? false;
  // case_sensitive is defaulted above or by createEmptyLoreEntry

  // Basic validation: keys and content are essential for a usable lore entry
  if (loreEntry.keys.length === 0 && !loreEntry.content) {
    // Allow content-only or key-only entries if that's a valid use case,
    // but typically both are expected. For now, let's be lenient.
    // If strictness is needed: if (loreEntry.keys.length === 0 || !loreEntry.content) return null;
  }

  return loreEntry;
}

/**
 * Extract entries from various JSON formats, prioritizing specific structures.
 */
function extractEntriesFromJson(jsonData: any): LoreEntry[] {
  if (!jsonData || typeof jsonData !== 'object') return [];

  let rawEntries: any[] = [];
  let isOriginalDataFormat = false; // Flag to indicate which mapping logic to use

  // 1. Preferred: `jsonData.originalData.entries` (array)
  if (jsonData.originalData && Array.isArray(jsonData.originalData.entries) && jsonData.originalData.entries.length > 0) {
    rawEntries = jsonData.originalData.entries;
    isOriginalDataFormat = true;
  }
  // 2. Fallback: `jsonData.entries` (object of entries)
  else if (jsonData.entries && typeof jsonData.entries === 'object' && !Array.isArray(jsonData.entries) && Object.keys(jsonData.entries).length > 0) {
    rawEntries = Object.values(jsonData.entries);
    isOriginalDataFormat = false;
  }
  // 3. Fallback: `jsonData.entries` (array of entries - common in other exports)
  else if (Array.isArray(jsonData.entries) && jsonData.entries.length > 0) {
    rawEntries = jsonData.entries;
    isOriginalDataFormat = true; // Assume array format is similar to originalData.entries
  }
  // 4. Fallback: Top-level array of entries (e.g., direct lorebook export)
  else if (Array.isArray(jsonData) && jsonData.length > 0) {
    rawEntries = jsonData;
    isOriginalDataFormat = true; // Treat as similar to originalData.entries
  }

  if (rawEntries.length === 0) {
    return [];
  }

  return rawEntries
    .map((entry, index) => mapRawEntryToLoreEntry(entry, index, isOriginalDataFormat))
    .filter((entry): entry is LoreEntry => entry !== null);
}

/**
 * Import JSON file, parse lore entries, and save them to the current character.
 */
export async function importJson(
  file: File,
  characterContext: ReturnType<typeof useCharacter>
): Promise<LoreEntry[]> {
  try {
    const fileContent = await file.text();
    const jsonData = JSON.parse(fileContent);
    
    const extractedLoreEntries = extractEntriesFromJson(jsonData);

    if (extractedLoreEntries.length > 0) {
      const { characterData, setCharacterData } = characterContext;
      if (characterData?.data?.character_uuid) {
        try {
          await apiService.saveLoreEntries(characterData.data.character_uuid, extractedLoreEntries);
          
          setCharacterData(prevCharacterData => {
            if (!prevCharacterData) return null;

            const charData = prevCharacterData.data || {};
            const charBook = charData.character_book || { entries: [] };
            const existingEntries = charBook.entries || [];

            const updatedBook = {
              ...charBook,
              entries: [
                ...existingEntries,
                ...extractedLoreEntries
              ]
            };
            return {
              ...prevCharacterData,
              data: {
                ...charData,
                character_book: updatedBook
              }
            };
          });
          console.log('JSON Lore entries saved successfully.');
        } catch (saveError) {
          console.error('Failed to save JSON lore entries:', saveError);
          throw new Error(`Failed to save JSON lore entries: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`);
        }
      } else {
        console.warn('Cannot save JSON lore entries: Character UUID is missing.');
        // Consider notifying the user that a character must be active/saved.
      }
    }
    return extractedLoreEntries;
  } catch (error) {
    console.error('JSON import failed:', error);
    throw new Error(`Failed to import JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Import lore entries from PNG file and save them to the current character
 */
export async function importPng(file: File, characterContext: ReturnType<typeof useCharacter>): Promise<LoreEntry[]> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    // Use timeout utility for fetch request
    const response = await fetchWithTimeout('/api/characters/extract-metadata', {
      method: 'POST',
      body: formData
    }, 30000); // 30 second timeout for image processing

    if (!response.ok) {
      throw new Error(`Failed to extract lore from PNG: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Unknown error extracting lore from PNG');
    }

    let extractedLoreEntries: LoreEntry[] = [];
    // Look for 'lore_book' property which is what the backend sends
    if (data.lore_book && Array.isArray(data.lore_book)) {
      extractedLoreEntries = extractEntriesFromJson(data.lore_book);
    } else if (data.success && data.lore_book === null) {
      // No lore found, which is a valid success case
      extractedLoreEntries = [];
    } else {
      throw new Error('Invalid lore items format in PNG response');
    }

    // Save the extracted lore entries to the character
    if (extractedLoreEntries.length > 0) {
      const { characterData, setCharacterData } = characterContext;
      if (characterData?.data?.character_uuid) {
        try {
          await apiService.saveLoreEntries(characterData.data.character_uuid, extractedLoreEntries);
          // Optionally, update characterData in context if the save operation returns updated character data
          // For now, we assume the UI will refresh or the user will be notified.
          // Example: if the backend returns the updated character with new lore:
          // const updatedCharacter = await apiService.saveLoreEntries(...);
          // setCharacterData(updatedCharacter);

          // Update characterData in context by merging new lore entries
          setCharacterData(prevCharacterData => {
            if (!prevCharacterData) return null;
            const updatedBook = {
              ...prevCharacterData.data.character_book,
              entries: [
                ...(prevCharacterData.data.character_book?.entries || []),
                ...extractedLoreEntries
              ]
            };
            return {
              ...prevCharacterData,
              data: {
                ...prevCharacterData.data,
                character_book: updatedBook
              }
            };
          });

          console.log('Lore entries saved successfully.');
        } catch (saveError) {
          console.error('Failed to save lore entries:', saveError);
          // Propagate or handle the error as needed for the UI
          throw new Error(`Failed to save lore entries: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`);
        }
      } else {
        console.warn('Cannot save lore entries: Character UUID is missing.');
        // Optionally, inform the user that the character needs to be saved first or selected.
      }
    }

    return extractedLoreEntries;
  } catch (error) {
    console.error('PNG import failed:', error);

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Import timed out. The image may be too large or complex.');
    }

    throw new Error(`Failed to import PNG: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}