import { LoreEntry, createEmptyLoreEntry } from '../types/schema';

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
 * Extract entries from various JSON formats
 */
function extractEntriesFromJson(data: any): LoreEntry[] {
  if (!data) return [];
  
  let rawEntries: any[] = [];
  
  // Detect format and extract entries array
  if (Array.isArray(data?.data?.character_book?.entries)) {
    rawEntries = data.data.character_book.entries;
  } else if (data?.data?.character_book?.entries && typeof data.data.character_book.entries === 'object') {
    rawEntries = Object.values(data.data.character_book.entries);
  } else if (Array.isArray(data.entries)) {
    rawEntries = data.entries;
  } else if (data.entries && typeof data.entries === 'object') {
    rawEntries = Object.values(data.entries);
  } else if (Array.isArray(data)) {
    rawEntries = data;
  } else if (data.originalData?.entries) {
    rawEntries = Array.isArray(data.originalData.entries) ? 
      data.originalData.entries : Object.values(data.originalData.entries);
  }
  
  // Process and validate entries
  return (rawEntries
    .map((entry: any, index: number) => {
      if (!entry || typeof entry !== 'object') return null;
      
      // Create a properly typed LoreEntry
      const loreEntry = createEmptyLoreEntry(index + 1);
      
      // Assign properties with proper type checking
      // Add explicit type annotations to avoid 'any' type errors
      loreEntry.id = typeof entry.id === 'number' ? entry.id : index + 1;
      loreEntry.keys = Array.isArray(entry.keys) ? 
        entry.keys.filter((k: any) => typeof k === 'string') : 
        (typeof entry.keys === 'string' ? entry.keys.split(',').map((k: string) => k.trim()) : []);
      loreEntry.secondary_keys = Array.isArray(entry.secondary_keys) ? 
        entry.secondary_keys.filter((k: any) => typeof k === 'string') : 
        (typeof entry.secondary_keys === 'string' ? entry.secondary_keys.split(',').map((k: string) => k.trim()) : []);
      loreEntry.comment = typeof entry.comment === 'string' ? entry.comment : '';
      loreEntry.content = typeof entry.content === 'string' ? entry.content : '';
      loreEntry.constant = Boolean(entry.constant);
      loreEntry.selective = Boolean(entry.selective);
      loreEntry.insertion_order = typeof entry.insertion_order === 'number' ? entry.insertion_order : 100;
      loreEntry.enabled = entry.enabled !== false; // Default to true
      loreEntry.position = typeof entry.position === 'string' ? entry.position : '1';
      loreEntry.use_regex = entry.use_regex !== false; // Default to true
      
      // Handle extensions with proper type checking
      if (entry.extensions && typeof entry.extensions === 'object') {
        if (typeof entry.extensions.position === 'number') 
          loreEntry.extensions.position = entry.extensions.position;
        if (typeof entry.extensions.exclude_recursion === 'boolean')
          loreEntry.extensions.exclude_recursion = entry.extensions.exclude_recursion;
        if (typeof entry.extensions.display_index === 'number')
          loreEntry.extensions.display_index = entry.extensions.display_index;
        if (typeof entry.extensions.probability === 'number')
          loreEntry.extensions.probability = entry.extensions.probability;
        if (typeof entry.extensions.useProbability === 'boolean')
          loreEntry.extensions.useProbability = entry.extensions.useProbability;
        if (typeof entry.extensions.depth === 'number')
          loreEntry.extensions.depth = entry.extensions.depth;
        if (typeof entry.extensions.selectiveLogic === 'number')
          loreEntry.extensions.selectiveLogic = entry.extensions.selectiveLogic;
        if (typeof entry.extensions.group === 'string')
          loreEntry.extensions.group = entry.extensions.group;
        if (typeof entry.extensions.group_override === 'boolean')
          loreEntry.extensions.group_override = entry.extensions.group_override;
        if (typeof entry.extensions.group_weight === 'number')
          loreEntry.extensions.group_weight = entry.extensions.group_weight;
        if (typeof entry.extensions.prevent_recursion === 'boolean')
          loreEntry.extensions.prevent_recursion = entry.extensions.prevent_recursion;
        if (typeof entry.extensions.delay_until_recursion === 'boolean')
          loreEntry.extensions.delay_until_recursion = entry.extensions.delay_until_recursion;
          
        // Add required fields that were causing errors
        loreEntry.extensions.automation_id = typeof entry.extensions.automation_id === 'string' ? 
          entry.extensions.automation_id : "";
        loreEntry.extensions.role = typeof entry.extensions.role === 'number' ? 
          entry.extensions.role : 0;
        loreEntry.extensions.vectorized = typeof entry.extensions.vectorized === 'boolean' ? 
          entry.extensions.vectorized : false;
      }
      
      return loreEntry;
    })
    // Change from type predicate to direct type assertion
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)) as LoreEntry[];
}

/**
 * Import JSON data from string or object
 */
export async function importJson(jsonData: string | object): Promise<LoreEntry[]> {
  try {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    return extractEntriesFromJson(data);
  } catch (error) {
    console.error('JSON import failed:', error);
    throw new Error(`Failed to import JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Import lore entries from PNG file
 */
export async function importPng(file: File): Promise<LoreEntry[]> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    // Use timeout utility for fetch request
    const response = await fetchWithTimeout('/api/extract-lore', {
      method: 'POST',
      body: formData
    }, 30000); // 30 second timeout for image processing
    
    if (!response.ok) {
      throw new Error(`Failed to extract lore from PNG: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Unknown error extracting lore from PNG');
    }
    
    // Validate the loreItems structure
    if (!data.loreItems || !Array.isArray(data.loreItems)) {
      throw new Error('Invalid lore items format in PNG');
    }
    
    return extractEntriesFromJson(data.loreItems);
  } catch (error) {
    console.error('PNG import failed:', error);
    
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Import timed out. The image may be too large or complex.');
    }
    
    throw new Error(`Failed to import PNG: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}