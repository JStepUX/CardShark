// types/messages.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  variations?: string[];
  currentVariation?: number;
  aborted?: boolean;
}

export interface UserProfile {
  name: string;
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
  lastContextWindow: any | null;
}

export interface UserProfile {
    name: string;
    filename: string;
    size: number;
    modified: number;
  }