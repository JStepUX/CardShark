// types/settings.ts
import { APIConfig, APIProvider, createAPIConfig } from './api';
import { WordSwapRule } from '../utils/contentProcessing';

export interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions: string;
  autoExpandContext: boolean;
}

export interface SyntaxHighlightSettings {
  bold: {
    textColor: string;
    backgroundColor: string;
  };
  italic: {
    textColor: string;
    backgroundColor: string;
  };
  code: {
    textColor: string;
    backgroundColor: string;
  };
  quote: {
    textColor: string;
    backgroundColor: string;
  };
  variable: {
    textColor: string;
    backgroundColor: string;
  };
}

// GenerationSettings is defined in types/api.ts (single source of truth)
export type { GenerationSettings } from './api';

export interface Settings {
  // App Settings
  character_directory: string | null;  // Updated to allow null
  save_to_character_directory: boolean;
  models_directory?: string;  // Directory for AI model files
  model_directory?: string;   // Legacy field for backward compatibility
  show_koboldcpp_launcher?: boolean; // Whether to show KoboldCPP launcher on startup
  remove_incomplete_sentences?: boolean; // Whether to remove incomplete sentences from chat responses
  theme: 'dark' | 'light';
  version: string;

  // Audio Settings
  sfxVolume?: number;   // Sound effects volume 0-100
  musicVolume?: number; // Music volume 0-100
  
  // API Configuration - backwards compatibility
  api?: {
    enabled: boolean;
    url: string;
    apiKey: string | null;
    templateId: string;
    lastConnectionStatus?: {
      connected: boolean;
      timestamp: number;
      error?: string;
    };
    model_info?: {
      id: string;
      name?: string;
      provider?: string;
    };
  };
  
  // API Configurations
  apis: Record<string, APIConfig>;
  // ID of the currently active API
  activeApiId?: string;
  
  // Reasoning settings
  reasoning: ReasoningSettings;
  
  // Syntax highlighting settings
  syntaxHighlighting?: SyntaxHighlightSettings;
  
  // Content filtering
  wordSwapRules?: WordSwapRule[];

  // Default Journal entry for new chat sessions (supports {{char}} / {{user}} tokens)
  default_journal_entry?: string;

  // Dismissal flags for one-time banners
  gallery_sync_dismissed?: boolean; // "Never show again" for character directory sync tip

  // Gallery folder management
  gallery_folders?: {
    migrated: boolean;
    folders: Array<{
      id: string;
      name: string;
      isDefault: boolean;
      color: string;
      sortOrder?: number;
    }>;
  };
}

export const DEFAULT_REASONING_SETTINGS: ReasoningSettings = {
  enabled: false,
  visible: true,
  instructions: "Think carefully about what has occurred in the roleplay up to this point. Step inside {{char}}'s shoes and explain what next steps {{char}} would take and why.",
  autoExpandContext: true
};

export const DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS: SyntaxHighlightSettings = {
  bold: {
    textColor: '#f97316', // Orange for bold
    backgroundColor: 'transparent',
  },
  italic: {
    textColor: '#3b82f6', // Blue for italic
    backgroundColor: 'transparent',
  },
  code: {
    textColor: '#a3e635', // Lime for code
    backgroundColor: 'rgba(30, 41, 59, 0.5)', // Semi-transparent dark blue
  },
  quote: {
    textColor: '#f59e0b', // Amber for quotes
    backgroundColor: 'transparent',
  },
  variable: {
    textColor: '#ec4899', // Pink for variables
    backgroundColor: 'rgba(236, 72, 153, 0.1)', // Semi-transparent pink
  },
};

export const DEFAULT_SETTINGS: Settings = {
  // App defaults
  character_directory: '',  // Keep as empty string in defaults
  save_to_character_directory: false,
  models_directory: '', // Explicitly initialize
  model_directory: '',  // Explicitly initialize
  show_koboldcpp_launcher: false, // Default to not showing KoboldCPP launcher on startup
  remove_incomplete_sentences: true, // Default to removing incomplete sentences
  theme: 'dark',
  version: '1.0',

  // Audio defaults
  sfxVolume: 50,    // 50% for sound effects
  musicVolume: 30,  // 30% for music
  
  // Initialize with a default KoboldCPP configuration
  apis: {
    ['default_kobold']: createAPIConfig(APIProvider.KOBOLD)
  },
  // Default reasoning settings
  reasoning: DEFAULT_REASONING_SETTINGS,
  
  // Default syntax highlighting settings
  syntaxHighlighting: DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS
};


