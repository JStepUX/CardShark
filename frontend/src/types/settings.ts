// types/settings.ts
import { APIConfig, APIProvider, createAPIConfig } from './api';

export interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions: string;
  autoExpandContext: boolean;
}

export interface Settings {
  // App Settings
  character_directory: string;
  save_to_character_directory: boolean;
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
  
  // Reasoning settings
  reasoning: ReasoningSettings;
}

export const DEFAULT_REASONING_SETTINGS: ReasoningSettings = {
  enabled: false,
  visible: true,
  instructions: "Think carefully about what has occurred in the roleplay up to this point. Step inside {{char}}'s shoes and explain what next steps {{char}} would take and why.",
  autoExpandContext: true
};

export const DEFAULT_SETTINGS: Settings = {
  // App defaults
  character_directory: '',
  save_to_character_directory: false,
  theme: 'dark',
  version: '1.0',
  
  // Initialize with a default KoboldCPP configuration
  apis: {
    ['default_kobold']: createAPIConfig(APIProvider.KOBOLD)
  },
  
  // Default reasoning settings
  reasoning: DEFAULT_REASONING_SETTINGS
};

