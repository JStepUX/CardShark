// Interface for Backyard.ai LoreItem
export interface BackyardLoreItem {
  id?: string;
  order?: number;
  key: string;
  value: string;
  createdAt?: string;
  updatedAt?: string;
}

// Interface for Backyard.ai Character structure
export interface BackyardCharacter {
  basePrompt?: string;         // Maps to system_prompt
  firstMessage?: string;       // Maps to first_mes
  scenario?: string;           // Maps to scenario
  aiName?: string;            // Maps to name
  aiDisplayName?: string;      // Alternative name field
  aiPersona?: string;         // Maps to description (changed from personality)
  customDialogue?: string;    // Maps to mes_example
  authorNotes?: string;       // Maps to creator_notes
  id?: string;               // Backyard-specific fields
  createdAt?: string;
  updatedAt?: string;
  isNSFW?: boolean;
  model?: string;
  temperature?: number;
  topK?: number;
  topP?: number;
  repeatLastN?: number;
  repeatPenalty?: number;
  minP?: number;
  minPEnabled?: boolean;
  grammar?: string;
  promptTemplate?: string | null;
  canDeleteCustomDialogue?: boolean;
  Chat?: any[];              // Chat history array
  loreItems?: BackyardLoreItem[];
}

// Root interface for Backyard.ai JSON structure
export interface BackyardData {
  character: BackyardCharacter;
  version: number;
}

// Type for conversion result
export interface ConversionResult {
  success: boolean;
  data?: any;
  error?: string;
}