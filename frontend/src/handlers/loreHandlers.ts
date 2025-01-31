import { LoreItem, LorePosition } from '../types/loreTypes';

// Create new lore item
export function createLoreItem(currentLength: number): LoreItem {
  return {
    uid: Date.now(),
    keys: [],
    keysecondary: [],
    comment: '',
    content: '',
    constant: false,
    vectorized: false,
    selective: true,
    selectiveLogic: 0,
    order: currentLength,
    position: LorePosition.AfterCharacter,
    disable: false,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    displayIndex: currentLength,
    probability: 100,
    useProbability: true,
    depth: 4,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: null,
    sticky: null,
    cooldown: null,
    delay: null,
    extensions: {} // Added this required field
  };
}

// Update lore item
export function updateLoreItem(items: LoreItem[], uid: number, updates: Partial<LoreItem>): LoreItem[] {
  return items.map(item =>
    item.uid === uid ? { ...item, ...updates } : item
  );
}

// Delete lore item
export function deleteLoreItem(items: LoreItem[], uid: number): LoreItem[] {
  return items
    .filter(item => item.uid !== uid)
    .map((item, index) => ({
      ...item,
      order: index,
      displayIndex: index
    }));
}

// Move item functions
export function moveLoreItem(items: LoreItem[], uid: number, direction: 'up' | 'down'): LoreItem[] {
  const index = items.findIndex(item => item.uid === uid);
  if (
    index === -1 || 
    (direction === 'up' && index === 0) || 
    (direction === 'down' && index === items.length - 1)
  ) {
    return items;
  }

  const newItems = [...items];
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  
  // Swap items
  [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];

  // Update order and displayIndex
  return newItems.map((item, idx) => ({
    ...item,
    order: idx,
    displayIndex: idx
  }));
}

// Filter items by search term
export function filterLoreItems(items: LoreItem[], searchTerm: string): LoreItem[] {
  if (!searchTerm) return items;

  const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);
  
  return items.filter((item: LoreItem) => {
    const keyTerms = item.keys
      .join(',')
      .toLowerCase()
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
      
    return searchWords.some(word => 
      keyTerms.some(term => term.includes(word)) ||
      item.content.toLowerCase().includes(word)
    );
  });
}

// Helper to update character book entries
export function updateCharacterBookEntries(characterData: any, newEntries: LoreItem[]) {
  if (!characterData) return null;

  return {
    ...characterData,
    data: {
      ...characterData.data,
      character_book: {
        ...(characterData.data?.character_book || {}),
        entries: newEntries
      }
    }
  };
}