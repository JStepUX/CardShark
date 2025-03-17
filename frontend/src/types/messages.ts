// types/messages.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'thinking';
  content: string;
  timestamp: number;
  variations?: string[];
  currentVariation?: number;
  aborted?: boolean;
  isFirst?: boolean;
  order?: number;
  parentMessageId?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
  color?: string;
  filename: string;
  size: number;
  modified: number;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  currentUser: UserProfile | null;
  lastContextWindow: any;
}

export interface ChatMetadata {
  lastUser?: UserProfile;
  chat_id?: string;
  character_id?: string;
  api_info?: {
    provider: string;
    model: string;
    url: string;
    template: string;
    enabled: boolean;
  };
  created_at?: number;
  updated_at?: number;
}

export interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions?: string;
}

export const BACKGROUND_SETTINGS_KEY = 'cardshark_background';
export const REASONING_SETTINGS_KEY = 'cardshark_reasoning_settings';