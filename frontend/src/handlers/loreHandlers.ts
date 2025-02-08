// src/handlers/loreHandlers.ts
import { DEFAULT_LORE_ITEM, LoreItem, generateStableUID } from '../types/loreTypes';

// Create new lore item with stable UID
export function createLoreItem(currentLength: number): LoreItem {
    return {
        ...DEFAULT_LORE_ITEM,
        uid: generateStableUID(`new_item_${currentLength}_${Date.now()}`),
        order: currentLength,
        displayIndex: currentLength
    };
}

// Ensure any lore item has a UID
export function ensureLoreItemUID(item: Partial<LoreItem>, index: number): LoreItem {
    if (!item.uid) {
        // Generate a stable UID based on content or index
        const seed = Array.isArray(item.key) ? item.key.join(',') : (item.content || item.key || `imported_item_${index}_${Date.now()}`);
        item.uid = generateStableUID(seed);
    }
    
    // Ensure all required fields exist by merging with defaults
    return {
        ...DEFAULT_LORE_ITEM,
        ...item,
        uid: item.uid
    };
}

// Update character book entries with UID validation
export function updateCharacterBookEntries(characterData: any, newEntries: LoreItem[]) {
    if (!characterData) return null;

    // Ensure all entries have UIDs
    const validatedEntries = newEntries.map((entry, index) => 
        ensureLoreItemUID(entry, index)
    );

    return {
        ...characterData,
        data: {
            ...characterData.data,
            character_book: characterData.data?.character_book 
                ? {
                    ...characterData.data.character_book,
                    entries: validatedEntries
                }
                : {
                    entries: validatedEntries,
                    name: '',
                    description: '',
                    scan_depth: 100,
                    token_budget: 2048,
                    recursive_scanning: false,
                    extensions: {}
                }
        }
    };
}

// Delete lore item and reindex remaining items
export function deleteLoreItem(items: LoreItem[], uid: number): LoreItem[] {
    return items
        .filter(item => item.uid !== uid)
        .map((item, index) => ({
            ...item,
            order: index,
            displayIndex: index
        }));
}

// Update a single lore item while preserving UID
export function updateLoreItem(items: LoreItem[], uid: number, updates: Partial<LoreItem>): LoreItem[] {
    return items.map(item => {
        if (item.uid !== uid) {
            return item;
        }

        const updatedItem = { ...item };

        if (updates.position !== undefined) {
            updatedItem.position = updates.position;
            if (updates.role !== undefined) {
                updatedItem.role = updates.role;
            }
        }

        return {
            ...updatedItem,
            ...updates,
            uid: item.uid, // Ensure UID is preserved
            position: updatedItem.position,
            role: updatedItem.role
        };
    });
}

// Move item up or down in the list
export function moveLoreItem(items: LoreItem[], uid: number, direction: 'up' | 'down'): LoreItem[] {
    const index = items.findIndex(item => item.uid !== undefined && item.uid === uid);
    if (
        index === -1 || 
        (direction === 'up' && index === 0) || 
        (direction === 'down' && index === items.length - 1)
    ) {
        return items;
    }

    const newItems = [...items];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    
    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];

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
    
    return items.filter(item => {
        if (!item.key) return false;
        
        const keyTerms = Array.isArray(item.key)
            ? item.key.map(k => k.toLowerCase())
            : (item.key as string).toLowerCase()
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0);
        
        return searchWords.some(word =>
            keyTerms.some(term => term.includes(word)) ||
            (item.content || '').toLowerCase().includes(word)
        );
    });
}