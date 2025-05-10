// types/api.ts
// Types for API configuration and generation settings
// Define generation settings first since it's needed for createAPIConfig
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

export enum APIProvider {
  KOBOLD = 'KoboldCPP',
  CLAUDE = 'Claude',
  OPENAI = 'OpenAI',
  GEMINI = 'Gemini',
  OPENROUTER = 'OpenRouter',
  FEATHERLESS = 'Featherless'
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
  defaultName?: string;
}

export const PROVIDER_CONFIGS: Record<APIProvider, ProviderConfig> = {
  [APIProvider.KOBOLD]: {
    defaultUrl: 'http://localhost:5001',
    templateId: ChatTemplate.MISTRAL,
    requiresApiKey: false,
    defaultName: 'Local KoboldCPP'
  },
  [APIProvider.OPENAI]: {
    defaultUrl: 'https://api.openai.com/v1',
    templateId: ChatTemplate.OPENAI,
    requiresApiKey: true,
    availableModels: Object.values(OpenAIModel),
    defaultModel: OpenAIModel.GPT35_TURBO,
    defaultName: 'OpenAI'
  },
  [APIProvider.CLAUDE]: {
    defaultUrl: 'https://api.anthropic.com/v1/messages',
    templateId: ChatTemplate.CLAUDE,
    requiresApiKey: true,
    availableModels: Object.values(ClaudeModel),
    defaultModel: ClaudeModel.CLAUDE_3_SONNET,
    defaultName: 'Anthropic Claude'
  },
  [APIProvider.GEMINI]: {
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    templateId: ChatTemplate.GEMINI,
    requiresApiKey: true,
    availableModels: Object.values(GeminiModel),
    defaultModel: GeminiModel.GEMINI_PRO,
    defaultName: 'Google Gemini'
  },
  [APIProvider.OPENROUTER]: {
    defaultUrl: 'https://openrouter.ai/api/v1',
    templateId: ChatTemplate.OPENAI,
    requiresApiKey: true,
    defaultName: 'OpenRouter'
  },
  [APIProvider.FEATHERLESS]: {
    defaultUrl: 'https://api.featherless.ai/v1',
    templateId: ChatTemplate.OPENAI,
    requiresApiKey: true,
    defaultName: 'Featherless AI'
  }
};

import { z } from 'zod';

// Define the model info interface
export interface ModelInfo {
  id: string;
  name?: string;
  provider?: string;
  contextLength?: number;
}
// Define the Featherless model info interface based on backend adapter
export interface FeatherlessModelInfo {
  id: string;
  name?: string;
  model_class?: string;
  context_length?: number;
  max_tokens?: number; // Corresponds to max_completion_tokens from API
  description?: string;
  is_gated?: boolean;
  available_on_current_plan?: boolean; // Only present for authenticated requests
}

// Define the connection status interface
export interface ConnectionStatus {
  connected: boolean;
  timestamp: number;
  error?: string;
}

// API Configuration Schema
export const APIConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(), // Added name field for user-friendly identification
  provider: z.enum(['KoboldCPP', 'OpenAI', 'Claude', 'Gemini', 'OpenRouter', 'Featherless']),
  url: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  templateId: z.string().optional(),
  generation_settings: z.record(z.any()).optional(),
  enabled: z.boolean().default(false),
  lastConnectionStatus: z.object({
    connected: z.boolean(),
    timestamp: z.number(),
    error: z.string().optional()
  }).optional(),
  model_info: z.object({
    id: z.string(),
    name: z.string().optional(),
    provider: z.string().optional(),
    contextLength: z.number().optional()
  }).optional()
});

// Define the APIConfig interface using the Zod schema
export type APIConfig = z.infer<typeof APIConfigSchema>;

// Generation Response Schema
export const GenerationResponseSchema = z.object({
  content: z.string(),
  model: z.string().optional(),
  finish_reason: z.enum(['stop', 'length', 'content_filter']).optional(),
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional()
  }).optional()
});

export type GenerationResponse = z.infer<typeof GenerationResponseSchema>;

// Function to create an API config with appropriate defaults
export function createAPIConfig(provider: APIProvider): APIConfig {
  const config = PROVIDER_CONFIGS[provider];
  
  // Create a unique ID for the new API configuration
  const id = `api_${Date.now()}`;
  
  // Generate a complete API configuration with all necessary fields
  return {
    id,
    name: config.defaultName || `${provider} API`,
    provider,
    url: config.defaultUrl,
    apiKey: '',
    templateId: config.templateId,
    enabled: false,
    model: config.defaultModel || '', // Ensure we have at least an empty string
    generation_settings: { ...DEFAULT_GENERATION_SETTINGS },
    lastConnectionStatus: {
      connected: false,
      timestamp: Date.now()
    },
    // Add model_info even if empty to avoid undefined issues in the UI
    model_info: {
      id: '',
      name: 'No model selected'
    }
  };
}
