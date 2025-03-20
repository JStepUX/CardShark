import { LoreEntry } from './schema';

// Define the LoreEntryInterface properly and export it
export interface LoreEntryInterface extends LoreEntry {
  extensions: {
    position: number;
    exclude_recursion: boolean;
    display_index: number;
    probability: number;
    useProbability: boolean;
    depth: number;
    selectiveLogic: number;
    group: string;
    group_override: boolean;
    group_weight: number;
    prevent_recursion: boolean;
    delay_until_recursion: boolean;
    scan_depth: number | null;
    match_whole_words: boolean | null;
    use_group_scoring: boolean;
    case_sensitive: boolean | null;
    automation_id: string;
    role: number;  // Ensuring this property is defined
    vectorized: boolean;
    sticky: number;
    cooldown: number;
    delay: number | null;
  };
}

// Ensure the global namespace includes the interface for type checking
declare global {
  // Just make sure the interface is recognized globally
  interface LoreEntry extends LoreEntryInterface {}
}
