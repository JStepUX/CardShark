// types/settings.ts
import { APIConfig, APIProvider, createAPIConfig } from './api';

export interface Settings {
  // App Settings
  character_directory: string;
  save_to_character_directory: boolean;
  theme: 'dark' | 'light';
  version: string;
  
  // API Configurations
  apis: Record<string, APIConfig>;
}

export const DEFAULT_SETTINGS: Settings = {
  // App defaults
  character_directory: '',
  save_to_character_directory: false,
  theme: 'dark',
  version: '1.0',
  
  // Initialize with a default KoboldCPP configuration
  apis: {
    ['default_kobold']: createAPIConfig(APIProvider.KOBOLD)
  }
};

// Type guard to validate settings
export function isValidSettings(settings: any): settings is Settings {
  return (
    settings &&
    typeof settings.character_directory === 'string' &&
    typeof settings.save_to_character_directory === 'boolean' &&
    (settings.theme === 'dark' || settings.theme === 'light') &&
    typeof settings.version === 'string' &&
    typeof settings.apis === 'object'
  );
}