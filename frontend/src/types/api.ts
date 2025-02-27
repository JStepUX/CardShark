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
  templateId: ChatTemplate;     // Use templateId instead of template
  requiresApiKey: boolean;
  availableModels?: ModelType[];
  defaultModel?: ModelType;
}

export const PROVIDER_CONFIGS: Record<APIProvider, ProviderConfig> = {
  [APIProvider.KOBOLD]: {
    defaultUrl: 'http://localhost:5001',
    templateId: ChatTemplate.MISTRAL,
    requiresApiKey: false
  },
  [APIProvider.OPENAI]: {
    defaultUrl: 'https://api.openai.com/v1',
    templateId: ChatTemplate.OPENAI,
    requiresApiKey: true,
    availableModels: Object.values(OpenAIModel),
    defaultModel: OpenAIModel.GPT35_TURBO
  },
  [APIProvider.CLAUDE]: {
    defaultUrl: 'https://api.anthropic.com/v1/messages',
    templateId: ChatTemplate.CLAUDE,
    requiresApiKey: true,
    availableModels: Object.values(ClaudeModel),
    defaultModel: ClaudeModel.CLAUDE_3_SONNET
  },
  [APIProvider.GEMINI]: {
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    templateId: ChatTemplate.GEMINI,
    requiresApiKey: true,
    availableModels: Object.values(GeminiModel),
    defaultModel: GeminiModel.GEMINI_PRO
  },
  [APIProvider.OPENROUTER]: {
    defaultUrl: 'https://openrouter.ai/api/v1',
    templateId: ChatTemplate.OPENAI,
    requiresApiKey: true
  }
};

export interface GenerationSettings {
  max_length?: number;
  max_context_length?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  top_a?: number;
  typical?: number;
  tfs?: number;
  rep_pen?: number;
  rep_pen_range?: number;
  rep_pen_slope?: number;
  sampler_order?: number[];
  trim_stop?: boolean;
  min_p?: number;
  dynatemp_range?: number;
  dynatemp_exponent?: number;
  smoothing_factor?: number;
  presence_penalty?: number;
}

export interface APIConfig {
  id: string;
  provider: APIProvider;
  url: string;
  apiKey?: string;
  model?: ModelType;
  templateId: string;          // Only templateId, no template
  enabled: boolean;
  generation_settings?: GenerationSettings;
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

// Default generation settings for KoboldCPP
export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  max_length: 220,
  max_context_length: 6144,
  temperature: 1.05,
  top_p: 0.92,
  top_k: 100,
  top_a: 0,
  typical: 1,
  tfs: 1,
  rep_pen: 1.07,
  rep_pen_range: 360,
  rep_pen_slope: 0.7,
  sampler_order: [6, 0, 1, 3, 4, 2, 5],
  trim_stop: true,
  min_p: 0,
  dynatemp_range: 0.45,
  dynatemp_exponent: 1,
  smoothing_factor: 0,
  presence_penalty: 0
};

// Update createAPIConfig to use only templateId and include generation settings
export function createAPIConfig(provider: APIProvider): APIConfig {
  const config = PROVIDER_CONFIGS[provider];
  return {
    id: `api_${Date.now()}`,
    provider,
    url: config.defaultUrl,
    templateId: config.templateId,   // Only use templateId
    enabled: false,
    model: config.defaultModel,
    generation_settings: { ...DEFAULT_GENERATION_SETTINGS } // Include default generation settings
  };
}