// types/settings.ts

import { ChatTemplate } from './api';

export interface APISettings {
  enabled: boolean;
  url: string;
  apiKey: string;
  template: ChatTemplate;
  lastConnectionStatus?: {
    connected: boolean;
    timestamp: number;
    error?: string;
  }
}

export interface Settings {
    api: {
      model_info: { id: string; owned_by?: string | undefined; created?: number | undefined; } | undefined;
      enabled: boolean; // Add the enabled property
      url: string;
      apiKey: string;
      template: ChatTemplate;
      lastConnectionStatus?: {
        connected: boolean;
        timestamp: number;
        error?: string;
      };
    };
    character_directory: string;
    save_to_character_directory: boolean;
    theme: string;
    version: string;
  }

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  character_directory: '',
  save_to_character_directory: false,
  theme: 'dark',
  version: '1.0',
  api: {
    enabled: false,
    url: 'http://localhost:5001',
    apiKey: '',
    template: ChatTemplate.MISTRAL_V1,
    lastConnectionStatus: undefined,
    model_info: undefined // Add the model_info property
  }
};