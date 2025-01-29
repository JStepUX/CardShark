export enum LorePosition {
    BeforeCharacter = 0,    // Before character definition
    AfterCharacter = 1,     // After character definition
    AuthorsNoteTop = 2,     // Top of author's note
    AuthorsNoteBottom = 3,  // Bottom of author's note
    AtDepth = 4,           // At specific chat depth
    BeforeExampleMsgs = 5, // Before example messages
    AfterExampleMsgs = 6  // After example messages
}

export enum SelectiveLogic {
    AND_ANY = 0,  // Match any secondary key (most common)
    NOT_ALL = 1,  // Don't match all secondary keys
    NOT_ANY = 2,  // Don't match any secondary keys
    AND_ALL = 3,  // Match all secondary keys
}

export interface LoreItem {
    uid: number;
    keys: string[];                     // Primary trigger keys
    keysecondary: string[];             // Secondary keys (used when selective is true)
    comment: string;
    content: string;                    // Lore content
    constant: boolean;                  // Constant lore item (if true, remains active indefinitely)
    vectorized: boolean;
    selective: boolean;                 // Controls whether secondary keys are used
    selectiveLogic: SelectiveLogic;     // Logic for secondary key matching
    order: number;                      // Constant entries will be inserted first. Then entries with higher order numbers.
    position: LorePosition;             // Where to place the lore item (see LorePosition)
    disable: boolean;
    excludeRecursion: boolean;          // When this checkbox is selected, the entry will not be activated by other entries. 
    preventRecursion: boolean;          // Prevent recursion for this entry (if true, the entry can't trigger other entries)
    delayUntilRecursion: boolean | number;  // This entry will only be activated during recursive checks, meaning it won't be triggered in the initial pass but can be activated by other entries that have recursion enabled. Now, with the added Recursion Level for those delays, entries are grouped by levels. Initially, only the first level (smallest number) will match. Once no matches are found, the next level becomes eligible for matching, repeating the process until all levels are checked. This allows for more control over how and when deeper layers of information are revealed during recursion, especially in combination with criteria as NOT ANY or NOT ALL combination of key matches.
    displayIndex: number; 
    probability: number;                // 0-100
    useProbability: boolean;            // Use probability for triggering
    depth: number;                      // Chat depth
    group: string;
    groupOverride: boolean;
    groupWeight: number;
    scanDepth: number | null;           // Defines how many messages in the chat history should be scanned for World Info keys.
    caseSensitive: boolean | null;      // Case sensitivity for primary keys
    matchWholeWords: boolean | null;    // Match whole words for primary keys
    useGroupScoring: boolean | null; 
    automationId: string;
    role: number | null;                // Role ID (Works with LorePosition.AtDepth)
    sticky: number | null;              // the entry stays active for N messages after being activated
    cooldown: number | null;            // the entry can't be activated for N messages after being activated
    delay: number | null;               // the entry can't be activated unless there are at least N messages in the chat at the moment of evaluation
                                        // Delay = 0 -> The entry can be activated at any time.
                                        // Delay = 1 -> The entry can't be activated if the chat is empty (no greeting).
                                        // Delay = 2 -> The entry can't be activated if there is zero or only one message in the chat, etc.
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