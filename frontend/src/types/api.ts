// API Template Types
export enum ChatTemplate {
  ALPACA = 'alpaca',
  CHATML = 'chatml',
  COMMAND_R = 'command-r',
  GEMMA_2 = 'gemma-2',
  DEEPSEEK_V2 = 'deepseek-v2',
  LLAMA_2 = 'llama-2',
  LLAMA_3 = 'llama-3',
  METHARME = 'metharme',
  MISTRAL_V1 = 'mistral-v1',
  MISTRAL_V2 = 'mistral-v2',
  MISTRAL_V3 = 'mistral-v3',
  PHI_3 = 'phi-3',
  VICUNA = 'vicuna'
}

// API Settings Interface
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

// Default Settings
export const DEFAULT_API_SETTINGS: APISettings = {
  enabled: false,
  url: 'http://localhost:5001',
  apiKey: '',
  template: ChatTemplate.CHATML,
  lastConnectionStatus: undefined
};

// Template Display Names
export const TEMPLATE_NAMES: Record<ChatTemplate, string> = {
  [ChatTemplate.ALPACA]: 'Alpaca',
  [ChatTemplate.CHATML]: 'ChatML',
  [ChatTemplate.COMMAND_R]: 'Command-R',
  [ChatTemplate.GEMMA_2]: 'Gemma 2',
  [ChatTemplate.DEEPSEEK_V2]: 'DeepSeek V2',
  [ChatTemplate.LLAMA_2]: 'Llama 2',
  [ChatTemplate.LLAMA_3]: 'Llama 3',
  [ChatTemplate.METHARME]: 'Metharme',
  [ChatTemplate.MISTRAL_V1]: 'Mistral V1',
  [ChatTemplate.MISTRAL_V2]: 'Mistral V2',
  [ChatTemplate.MISTRAL_V3]: 'Mistral V3',
  [ChatTemplate.PHI_3]: 'Phi-3',
  [ChatTemplate.VICUNA]: 'Vicuna'
};