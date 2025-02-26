// Updated types/api.ts with templateId support
export enum APIProvider {
  KOBOLD = 'KoboldCPP',
  CLAUDE = 'Claude',
  OPENAI = 'OpenAI',
  GEMINI = 'Gemini',
  OPENROUTER = 'OpenRouter'
}

// Keep this enum for backward compatibility
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
  template: ChatTemplate;     // Default template (legacy)
  requiresApiKey: boolean;
  availableModels?: ModelType[];
  defaultModel?: ModelType;
  defaultTemplateId?: string; // Default template ID for the new system
}

export const PROVIDER_CONFIGS: Record<APIProvider, ProviderConfig> = {
  [APIProvider.KOBOLD]: {
    defaultUrl: 'http://localhost:5001',
    template: ChatTemplate.MISTRAL,
    requiresApiKey: false,
    defaultTemplateId: 'mistral'
  },
  [APIProvider.OPENAI]: {
    defaultUrl: 'https://api.openai.com/v1',
    template: ChatTemplate.OPENAI,
    requiresApiKey: true,
    availableModels: Object.values(OpenAIModel),
    defaultModel: OpenAIModel.GPT35_TURBO,
    defaultTemplateId: 'chatml'
  },
  [APIProvider.CLAUDE]: {
    defaultUrl: 'https://api.anthropic.com/v1/messages',
    template: ChatTemplate.CLAUDE,
    requiresApiKey: true,
    availableModels: Object.values(ClaudeModel),
    defaultModel: ClaudeModel.CLAUDE_3_SONNET,
    defaultTemplateId: 'claude'
  },
  [APIProvider.GEMINI]: {
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    template: ChatTemplate.GEMINI,
    requiresApiKey: true,
    availableModels: Object.values(GeminiModel),
    defaultModel: GeminiModel.GEMINI_PRO,
    defaultTemplateId: 'gemini'
  },
  [APIProvider.OPENROUTER]: {
    defaultUrl: 'https://openrouter.ai/api/v1',
    template: ChatTemplate.OPENAI,
    requiresApiKey: true,
    defaultTemplateId: 'chatml'
  }
};

export interface APIConfig {
  id: string;
  provider: APIProvider;
  url: string;
  apiKey?: string;
  model?: ModelType;
  template?: ChatTemplate;   // Keep for backward compatibility
  templateId?: string;       // New field for template ID
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
    templateId: config.defaultTemplateId,
    enabled: false,
    model: config.defaultModel
  };
}