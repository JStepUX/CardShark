// types/loreTypes.ts

export enum LorePosition {
    BeforeCharacter = 0,    // Before character definition
    AfterCharacter = 1,     // After character definition
    AuthorsNoteTop = 2,     // Top of author's note
    AuthorsNoteBottom = 3,  // Bottom of author's note
    AtDepth = 4,           // At specific chat depth
    BeforeExampleMsgs = 5, // Top of extension prompt
    AfterExampleMsgs = 6 // Bottom of extension prompt
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
    position: LorePosition;
    disable: boolean;
    excludeRecursion: boolean;
    preventRecursion: boolean;
    delayUntilRecursion: boolean | number;
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
}

// UI helper type for lore card controls
export interface LoreCardControls {
    canMoveUp: boolean;
    canMoveDown: boolean;
    isEnabled: boolean;
    hasAdvancedSettings: boolean;
}

// State management helper for lore editing
export interface LoreEditState {
    selectedLoreId: number | null;
    isEditing: boolean;
    showAdvancedSettings: boolean;
}