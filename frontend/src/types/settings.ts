// types/settings.ts
import { APIConfig, APIProvider, createAPIConfig } from './api';

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

export interface GenerationSettings {
  temperature: number;
  top_p: number;
  top_k: number;
  dynatemp_enabled: boolean;
  dynatemp_min: number;
  dynatemp_max: number;
  dynatemp_exponent: number;
}

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
  remove_incomplete_sentences: false, // Default to not removing incomplete sentences
  theme: 'dark',
  version: '1.0',
  
  // Initialize with a default KoboldCPP configuration
  apis: {
    ['default_kobold']: createAPIConfig(APIProvider.KOBOLD)
  },
  // Default reasoning settings
  reasoning: DEFAULT_REASONING_SETTINGS,
  
  // Default syntax highlighting settings
  syntaxHighlighting: DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS
};


