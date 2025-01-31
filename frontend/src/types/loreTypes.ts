// Strict numeric positions - no string values allowed
export enum LorePosition {
    BeforeCharacter = 0,    // Before character definition
    AfterCharacter = 1,     // After character definition
    AuthorsNoteTop = 2,     // Top of author's note
    AuthorsNoteBottom = 3,  // Bottom of author's note
    AtDepth = 4,            // At specific chat depth
    BeforeExampleMsgs = 5,  // Before example messages
    AfterExampleMsgs = 6    // After example messages
}

export interface LoreItem {
    uid: number;
    keys: string[];
    keysecondary: string[];
    comment: string;
    content: string;
    constant: boolean;
    vectorized: boolean;
    selective: boolean;
    selectiveLogic: number;
    order: number;
    position: LorePosition; // Must be a numeric value 0-6
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
    extensions: Record<string, unknown>; // Required field, properly typed
}

// Helper to validate position values
export function validatePosition(position: any): LorePosition {
    if (typeof position === 'number' && 
        position >= 0 && 
        position <= 6) {
        return position;
    }
    return LorePosition.AfterCharacter; // Default to 1
}

// Default values when creating new items
export const DEFAULT_LORE_ITEM: Partial<LoreItem> = {
    position: LorePosition.AfterCharacter, // Always default to 1
    keys: [],
    keysecondary: [],
    comment: '',
    content: '',
    constant: false,
    vectorized: false,
    selective: false,
    selectiveLogic: 0,
    order: 0,
    disable: false,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    displayIndex: 0,
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
    extensions: {} // Empty object as default
};