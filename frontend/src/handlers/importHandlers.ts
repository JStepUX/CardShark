import { LoreEntry, createEmptyLoreEntry } from '../types/schema';

// Parse line-based formats into LoreEntry array
async function parseTsvContent(content: string, startIndex: number): Promise<LoreEntry[]> {
  return content
    .split('\n')
    .filter(line => line.trim())
    .map((line, index) => {
      const [key, value] = line.split('\t').map(s => s.trim());
      if (!key || !value) return null;

      const entry = createEmptyLoreEntry(startIndex + index);
      entry.keys = [key]; // Changed key to keys
      entry.content = value;
      entry.insertion_order = startIndex + index; // Changed order to insertion_order
      return entry;
    })
    .filter((entry): entry is LoreEntry => entry !== null);
}

// Import from TSV file
export async function importTsv(file: File, startIndex: number): Promise<LoreEntry[]> {
  try {
    const content = await file.text();
    return parseTsvContent(content, startIndex);
  } catch (error) {
    console.error('TSV import failed:', error);
    throw new Error(`Failed to import TSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Extract entries from JSON data in various formats
function extractEntriesFromJson(data: any): LoreEntry[] {
  if (!data) return [];

  // Handle various JSON formats
  let rawEntries: any[] = [];

  if (Array.isArray(data?.data?.character_book?.entries)) {
    // New format: data.data.character_book.entries is an array
    rawEntries = data.data.character_book.entries;
  } else if (data?.data?.character_book?.entries && typeof data.data.character_book.entries === 'object') {
    // New format: data.data.character_book.entries is an object
    rawEntries = Object.values(data.data.character_book.entries);
  }
   else if (Array.isArray(data.entries)) {
    // Already in array format
    rawEntries = data.entries;
  } else if (data.entries && typeof data.entries === 'object') {
    // Convert object format to array
    rawEntries = Object.values(data.entries);
  }
   else if (Array.isArray(data)) {
    // Direct array format
    rawEntries = data;
  } else if (data.originalData?.entries) {
    // Handle SillyTavern format
    rawEntries = Array.isArray(data.originalData.entries) 
      ? data.originalData.entries 
      : Object.values(data.originalData.entries);
  }

  return rawEntries
    .map((entry: any, index: number) => {
      if (!entry || typeof entry !== 'object') return null;

      // Use the new LoreEntry interface
      return {
        id: entry.id ?? index + 1,
        keys: Array.isArray(entry.keys) ? entry.keys : (entry.keys || '').split(',').map((k: string) => k.trim()),
        secondary_keys: Array.isArray(entry.secondary_keys) ? entry.secondary_keys : (entry.secondary_keys || '').split(',').map((k: string) => k.trim()),
        comment: entry.comment || '',
        content: entry.content || '',
        constant: entry.constant || false,
        selective: entry.selective || false,
        insertion_order: entry.insertion_order ?? 100,
        enabled: entry.enabled ?? true,
        position: entry.position || 1,
        use_regex: entry.use_regex ?? true,
        extensions: {
            position: entry.extensions?.position ?? 1,
            exclude_recursion: entry.extensions?.exclude_recursion ?? false,
            display_index: entry.extensions?.display_index ?? 0,
            probability: entry.extensions?.probability ?? 100,
            useProbability: entry.extensions?.useProbability ?? true,
            depth: entry.extensions?.depth ?? 4,
            selectiveLogic: entry.extensions?.selectiveLogic ?? 0,
            group: entry.extensions?.group ?? "",
            group_override: entry.extensions?.group_override ?? false,
            group_weight: entry.extensions?.group_weight ?? 100,
            prevent_recursion: entry.extensions?.prevent_recursion ?? false,
            delay_until_recursion: entry.extensions?.delay_until_recursion ?? false,
            scan_depth: entry.extensions?.scan_depth ?? null,
            match_whole_words: entry.extensions?.match_whole_words ?? null,
            use_group_scoring: entry.extensions?.use_group_scoring ?? false,
            case_sensitive: entry.extensions?.case_sensitive ?? null,
            automation_id: entry.extensions?.automation_id ?? "",
            role: entry.extensions?.role ?? 0,
            vectorized: entry.extensions?.vectorized ?? false,
            sticky: entry.extensions?.sticky ?? 0,
            cooldown: entry.extensions?.cooldown ?? 0,
            delay: entry.extensions?.delay ?? 0
        }
      };
    })
    .filter((entry): entry is LoreEntry => entry !== null);
}

// Import from JSON data
export async function importJson(jsonData: string | object): Promise<LoreEntry[]> {
  try {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    return extractEntriesFromJson(data);
  } catch (error) {
    console.error('JSON import failed:', error);
    throw new Error(`Failed to import JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Import from PNG character card
export async function importPng(file: File): Promise<LoreEntry[]> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/extract-lore', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to extract lore from PNG');
    }

    const data = await response.json();
    if (!data.success || !data.loreItems) {
      throw new Error('No lore items found in PNG');
    }

    return extractEntriesFromJson(data.loreItems);
  } catch (error) {
    console.error('PNG import failed:', error);
    throw new Error(`Failed to import PNG: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}