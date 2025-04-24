// frontend/src/types/character.ts

/**
 * Defines the combat statistics for an NPC.
 * Mirrors backend/models/character_data.py:NpcCombatStats
 */
export interface NpcCombatStats {
  health: number;
  attack_damage_min: number;
  attack_damage_max: number;
  attack_speed: number;
  damage_reduction: number; // Percentage (0.0 to 1.0)
  armor: number; // Flat reduction
  crit_chance: number; // Percentage (0.0 to 1.0)
  crit_multiplier: number; // e.g., 1.5 for 150%
  // Add other relevant stats corresponding to the backend model
}

/**
 * Represents the core data fields within the character metadata.
 * Mirrors backend/models/character_data.py:CharacterCoreData
 */
export interface CharacterCoreData {
  name: string;
  description?: string | null;
  personality?: string | null;
  scenario?: string | null;
  first_mes?: string | null;
  mes_example?: string | null;
  creator_notes?: string | null;
  system_prompt?: string | null;
  post_history_instructions?: string | null;
  alternate_greetings?: string[] | null;
  character_book?: Record<string, any> | null; // Using Record<string, any> for flexibility
  tags?: string[] | null;
  creator?: string | null;
  character_version?: string | null;
  // World Card Specific Additions
  combat_stats?: NpcCombatStats | null;
}

/**
 * Represents the full structure of the character metadata stored in PNG files.
 * Mirrors backend/models/character_data.py:CharacterData
 */
export interface CharacterData {
  spec: string; // e.g., "chara_card_v2"
  spec_version?: string | null; // e.g., "1.0"
  data: CharacterCoreData;
}