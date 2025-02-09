// src/types/loreTypes.ts
export enum SelectiveLogic {
    AND_ANY = 0,
    NOT_ALL = 1,
    NOT_ANY = 2,
    AND_ALL = 3,
}

export enum LorePosition {
    BeforeCharacter = 0,
    AfterCharacter = 1,
    AuthorsNoteTop = 2,
    AuthorsNoteBottom = 3,
    AtDepth = 4,
    BeforeExampleMsgs = 5,
    AfterExampleMsgs = 6
}

export interface LoreItem {
    uid: number;
    key: string[];          // Array of trigger strings
    keysecondary: string[];
    comment: string;
    content: string;
    constant: boolean;
    vectorized: boolean;
    selective: boolean;
    selectiveLogic: SelectiveLogic;
    addMemo: boolean;       // Added to match ST format
    order: number;
    position: LorePosition;
    disable: boolean;
    excludeRecursion: boolean;
    preventRecursion: boolean;
    delayUntilRecursion: boolean;
    displayIndex: number;
    probability: number;
    useProbability: boolean;
    depth: number;
    group: string;
    groupOverride: boolean;
    groupWeight: number;
    scanDepth: number | null;
    caseSensitive: boolean | null;
    matchWholeWords: boolean | null;
    useGroupScoring: boolean | null;
    automationId: string;
    role: number | null;
    sticky: number | null;
    cooldown: number | null;
    delay: number | null;
    extensions: Record<string, unknown>;
}

// Create new lore item with current length info
export function createLoreItem(currentLength: number): LoreItem {
    return {
        ...DEFAULT_LORE_ITEM,
        uid: Date.now() + Math.floor(Math.random() * 1000), // Direct numeric UID
        order: currentLength,
        displayIndex: currentLength
    };
}

// Modified to handle string/number mapping
export function ensureLoreItemUID(item: Partial<LoreItem>, index: number): LoreItem {
    let uid: number;
    
    if (item.uid !== undefined) {
        // Convert string UIDs to numbers if needed
        uid = typeof item.uid === 'string' ? parseInt(item.uid) : Number(item.uid);
    } else {
        // Generate new UID if none exists
        uid = Date.now() + index;
    }

    return {
        ...DEFAULT_LORE_ITEM,
        ...item,
        uid
    };
}

// NOTE: This default item MUST match the Python DEFAULT_LORE_ITEM in character_validator.py
// If you update this, you MUST also update the Python version
export const DEFAULT_LORE_ITEM: Omit<LoreItem, 'uid'> = {
    key: [],              // Array of trigger strings
    keysecondary: [],     // Array of secondary keys
    comment: '',          // User notes about this entry
    content: '',          // The actual lore content
    constant: false,      // Always included regardless of trigger
    vectorized: false,    
    selective: false,
    selectiveLogic: 0,    // Logic for combining primary/secondary keys
    addMemo: true,        // Matches ST format
    order: 100,
    position: 1,          // Default position
    disable: false,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    probability: 100,
    useProbability: true,
    depth: 0,            // Depth for insertion
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: 0,             // Keeping original default
    sticky: 0,           // Keeping original default
    cooldown: 0,         // Keeping original default
    delay: 0,            // Keeping original default
    displayIndex: 0,
    extensions: {}       // Preserved extensions field
};

// Update generateStableUID to return a number
export function generateStableUID(seed: string): number {
    // Convert seed into a stable numeric hash
    const timestamp = Date.now();
    const hashCode = seed.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0))|0, 0);
    return timestamp + hashCode;
}