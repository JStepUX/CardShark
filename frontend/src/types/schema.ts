// World Info Position Constants
export enum WorldInfoPosition {
    BEFORE_CHAR = 0,
    AFTER_CHAR = 1,
    AN_TOP = 2,
    AN_BOTTOM = 3,
    AT_DEPTH = 4,
    BEFORE_EXAMPLE = 5,
    AFTER_EXAMPLE = 6
}

// World Info Logic Constants
export enum WorldInfoLogic {
    AND_ANY = 0,  // Entry activates if any primary key AND any secondary key are found
    NOT_ALL = 1,  // Entry activates if not all secondary keys are present
    NOT_ANY = 2,  // Entry activates if no secondary keys are present
    AND_ALL = 3   // Entry activates if any primary key AND all secondary keys are found
}

// Main Lore Entry Interface
export interface LoreEntryInterface {
    id: number;              // Unique identifier
    keys: string[];           // Primary trigger keywords
    secondary_keys: string[];     // Secondary/optional filter keywords
    comment: string;         // User notes (not used by AI)
    content: string;         // The actual lore content
    constant: boolean;          // Always included regardless of triggers
    selective: boolean;         // Use secondary key logic
    insertion_order: number;           // Insertion priority (higher = later insertion)
    enabled: boolean;       // Entry is disabled if true
    position: string; // Where to insert in the prompt
    use_regex: boolean;
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
        use_group_scoring: boolean | null;
        case_sensitive: boolean | null;
        automation_id: string;
        role: number; // Add missing role property
        vectorized: boolean;
        sticky: number | null;
        cooldown: number | null;
        delay: number | null;
    }
}

// Character Book Interface
export interface CharacterBook {
    entries: any[];
    name: string;
}

// Main Character Data Interface
export interface CharacterData {
    spec: string;
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes: string;
    system_prompt: string;
    post_history_instructions: string;
    tags: string[];
    creator: string;
    character_version: string;
    alternate_greetings: string[];
    extensions: {
        talkativeness: string;
        fav: boolean;
        world: string;
        depth_prompt: {
            prompt: string;
            depth: number;
            role: string;
        }
    },
    group_only_greetings: string[];
    character_book: CharacterBook;
    character_uuid?: string; // Added for canonical character identification
}

// Complete Character Card Interface (V2 Spec)
export interface CharacterCard {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creatorcomment: string;
    avatar: string;
    chat: string;
    talkativeness: string;
    fav: boolean;
    tags: string[];
    spec: string;
    spec_version: string;
    data: CharacterData; // Use the CharacterData interface here
    create_date: string;
}

// Helper Functions
export function createEmptyLoreEntry(index: number): LoreEntryInterface {
    return {
        id: 1 + index,
        keys: [],
        secondary_keys: [],
        comment: '',
        content: '',
        constant: false,
        selective: false,
        insertion_order: 100,
        enabled: true,
        position: "1",
        use_regex: true,
        extensions: {
            position: 1,
            exclude_recursion: false,
            display_index: 0,
            probability: 100,
            useProbability: true,
            depth: 4,
            selectiveLogic: 0,
            group: "",
            group_override: false,
            group_weight: 100,
            prevent_recursion: false,
            delay_until_recursion: false,
            scan_depth: null,
            match_whole_words: null,
            use_group_scoring: false,
            case_sensitive: null,
            automation_id: "",
            role: 0, // Ensure role is initialized correctly
            vectorized: false,
            sticky: 0,
            cooldown: 0,
            delay: 0
        }
    };
}

export function createEmptyCharacterCard(): CharacterCard {
    return {
        name: "",
        description: "",
        personality: "",
        scenario: "",
        first_mes: "",
        mes_example: "",
        creatorcomment: "",
        avatar: "none",
        chat: "",
        talkativeness: "0.5",
        fav: false,
        tags: [],
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: { // Initialize CharacterData fields
            spec: "",
            name: "",
            description: "",
            personality: "",
            scenario: "",
            first_mes: "",
            mes_example: "",
            creator_notes: "",
            system_prompt: "",
            post_history_instructions: "",
            tags: [],
            creator: "",
            character_version: "",
            alternate_greetings: [],
            extensions: {
                talkativeness: "0.5",
                fav: false,
                world: "Fresh",
                depth_prompt: {
                    prompt: "",
                    depth: 4,
                    role: "system"
                }
            },
            group_only_greetings: [],
            character_book: {
                entries: [],
                name: "Fresh"
            }
            // character_uuid is optional and will be undefined by default
        },
        create_date: ""
    };
}

// src/types/schema.ts
import { z } from 'zod';

// Extend existing enums with Zod
export const WorldInfoPositionSchema = z.enum([
  'BEFORE_CHAR', 'AFTER_CHAR', 'AN_TOP', 'AN_BOTTOM', 
  'AT_DEPTH', 'BEFORE_EXAMPLE', 'AFTER_EXAMPLE'
]).transform(val => WorldInfoPosition[val]);

export const WorldInfoLogicSchema = z.enum([
  'AND_ANY', 'NOT_ALL', 'NOT_ANY', 'AND_ALL'
]).transform(val => WorldInfoLogic[val]);

// Lore Entry Schema
export const LoreEntrySchema = z.object({
  id: z.number(),
  keys: z.array(z.string()),
  secondary_keys: z.array(z.string()),
  comment: z.string().default(""),
  content: z.string(),
  constant: z.boolean().default(false),
  selective: z.boolean().default(false),
  insertion_order: z.number().default(100),
  enabled: z.boolean().default(true),
  position: z.string(),
  use_regex: z.boolean().default(false),
  extensions: z.object({
    position: z.number(),
    exclude_recursion: z.boolean().default(false),
    display_index: z.number(),
    probability: z.number().min(0).max(100).optional(),
    useProbability: z.boolean().default(false),
    depth: z.number().default(0),
    selectiveLogic: z.number().default(0),
    group: z.string().default(""),
    group_override: z.boolean().default(false),
    group_weight: z.number().default(1),
    prevent_recursion: z.boolean().default(false),
    delay_until_recursion: z.boolean().default(false),
    scan_depth: z.number().nullable().default(null),
    match_whole_words: z.boolean().nullable().default(null),
    use_group_scoring: z.boolean().nullable().default(null),
    case_sensitive: z.boolean().nullable().default(null),
    automation_id: z.string().default(""),
    role: z.number().default(0),
    vectorized: z.boolean().default(false),
    sticky: z.number().nullable().optional(),
    cooldown: z.number().nullable().optional(),
    delay: z.number().nullable().optional()
  })
});

export type LoreEntry = z.infer<typeof LoreEntrySchema>;