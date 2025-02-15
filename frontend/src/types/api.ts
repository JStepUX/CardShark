// types/api.ts

export enum APIProvider {
  KOBOLD = 'KoboldCPP',
  CLAUDE = 'Claude',
  OPENAI = 'OpenAI',
  GEMINI = 'Gemini',
  OPENROUTER = 'OpenRouter'
}

export enum ChatTemplate {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  MISTRAL = 'mistral',
  LLAMA2 = 'llama2'
}

// Display names for templates
export const TEMPLATE_NAMES: Record<ChatTemplate, string> = {
  [ChatTemplate.OPENAI]: 'OpenAI',
  [ChatTemplate.CLAUDE]: 'Claude',
  [ChatTemplate.GEMINI]: 'Gemini',
  [ChatTemplate.MISTRAL]: 'Mistral',
  [ChatTemplate.LLAMA2]: 'Llama2'
};

export enum OpenAIModel {
  GPT4 = 'gpt-4',
  GPT4_TURBO = 'gpt-4-turbo-preview',
  GPT4_LATEST = 'gpt-4-0125-preview',
  GPT35_TURBO = 'gpt-3.5-turbo',
  GPT35_LATEST = 'gpt-3.5-turbo-0125'
}

export enum ClaudeModel {
  CLAUDE_3_OPUS = 'claude-3-opus-20240229',
  CLAUDE_3_SONNET = 'claude-3-sonnet-20240229',
  CLAUDE_3_HAIKU = 'claude-3-haiku-20240307',
  CLAUDE_2_1 = 'claude-2.1'
}

export enum GeminiModel {
  GEMINI_PRO = 'gemini-pro',
  GEMINI_PRO_VISION = 'gemini-pro-vision'
}

export type ModelType = OpenAIModel | ClaudeModel | GeminiModel | string;

export interface ProviderConfig {
  defaultUrl: string;
  template: ChatTemplate;
  requiresApiKey: boolean;
  availableModels?: ModelType[];
  defaultModel?: ModelType;
}

export const PROVIDER_CONFIGS: Record<APIProvider, ProviderConfig> = {
  [APIProvider.KOBOLD]: {
    defaultUrl: 'http://localhost:5001',
    template: ChatTemplate.MISTRAL,
    requiresApiKey: false
  },
  [APIProvider.OPENAI]: {
    defaultUrl: 'https://api.openai.com',
    template: ChatTemplate.OPENAI,
    requiresApiKey: true,
    availableModels: Object.values(OpenAIModel),
    defaultModel: OpenAIModel.GPT35_TURBO
  },
  [APIProvider.CLAUDE]: {
    defaultUrl: 'https://api.anthropic.com/v1/messages',
    template: ChatTemplate.CLAUDE,
    requiresApiKey: true,
    availableModels: Object.values(ClaudeModel),
    defaultModel: ClaudeModel.CLAUDE_3_SONNET
  },
  [APIProvider.GEMINI]: {
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    template: ChatTemplate.GEMINI,
    requiresApiKey: true,
    availableModels: Object.values(GeminiModel),
    defaultModel: GeminiModel.GEMINI_PRO
  },
  [APIProvider.OPENROUTER]: {
    defaultUrl: 'https://openrouter.ai',
    template: ChatTemplate.OPENAI,
    requiresApiKey: true
  }
};

export interface APIConfig {
  id: string;
  provider: APIProvider;
  url: string;
  apiKey?: string;
  model?: ModelType;
  template: ChatTemplate;
  enabled: boolean;
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
}

export function createAPIConfig(provider: APIProvider): APIConfig {
  const config = PROVIDER_CONFIGS[provider];
  return {
    id: `api_${Date.now()}`,
    provider,
    url: config.defaultUrl,
    template: config.template,
    enabled: false,
    model: config.defaultModel
  };
}