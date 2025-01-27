// types/loreTypes.ts

export enum LorePosition {
    BeforeCharacter = 0,    // Before character definition
    AfterCharacter = 1,     // After character definition
    AuthorsNoteTop = 2,     // Top of author's note
    AuthorsNoteBottom = 3,  // Bottom of author's note
    AtDepth = 4,           // At specific chat depth
    BeforeExampleMsgs = 5, // Before example messages
    AfterExampleMsgs = 6   // After example messages
}

export enum SelectiveLogic {
    AND_ANY = 0,  // Default - matches any primary key
    NOT_ALL = 1,  // Does not match all secondary keys
    NOT_ANY = 2,  // Does not match any secondary keys
    AND_ALL = 3   // Matches all secondary keys
}

export interface LoreItem {
    // Required core fields
    uid: number;              // Unique identifier
    keys: string[];           // Primary trigger keys
    content: string;          // Lore content
    position: LorePosition;   // Position in prompt
    order: number;           // Sort/insertion order
    depth: number;           // Chat depth for insertion
    probability: number;      // Chance of insertion (0-100)

    // Toggles and flags
    disable: boolean;         // Whether entry is disabled
    constant: boolean;        // Whether entry is always included
    selective: boolean;       // Whether entry uses selective logic
    vectorized: boolean;      // Whether entry uses vector search
    excludeRecursion: boolean; // Whether to exclude from recursive scanning
    preventRecursion: boolean; // Whether to prevent recursion
    delayUntilRecursion: boolean; // Whether to delay until recursion
    
    // Optional fields
    keysecondary?: string[];  // Secondary trigger keys
    comment?: string;         // Optional comment/note
    selectiveLogic: number;   // Logic for secondary keys
    displayIndex?: number;    // UI display order
    useProbability?: boolean; // Whether to use probability
    group?: string;          // Group identifier
    groupOverride?: boolean;  // Override group settings
    groupWeight?: number;     // Weight within group
    role?: number | null;     // Role when using @depth position
    
    // Advanced settings
    scanDepth?: number | null;     // Custom scan depth
    caseSensitive?: boolean | null; // Case-sensitive matching
    matchWholeWords?: boolean | null; // Whole word matching
    useGroupScoring?: boolean | null; // Use group scoring
    automationId?: string;    // For automation features
    sticky?: number | null;   // Sticky message handling
    cooldown?: number | null; // Insertion cooldown
    delay?: number | null;    // Insertion delay
}

// UI helper types
export interface LoreCardControls {
    canMoveUp: boolean;
    canMoveDown: boolean;
    isEnabled: boolean;
    hasAdvancedSettings: boolean;
}

export interface LoreEditState {
    selectedLoreId: number | null;
    isEditing: boolean;
    showAdvancedSettings: boolean;
}