// types/promptTypes.ts

/**
 * Interface for a prompt template
 */
export interface PromptTemplate {
  id: string;           // Unique prompt identifier (key)
  template: string;     // The prompt template with variables
  isCustom: boolean;    // Whether this is a custom user template
  description?: string; // Optional description of the prompt's purpose
}

/**
 * Prompt variable types that can be used in templates
 */
export enum PromptVariable {
  // Character variables
  CHAR_NAME = '{{char}}',            // Character name
  USER_NAME = '{{user}}',            // User name
  DESCRIPTION = '{{description}}',   // Character description
  PERSONALITY = '{{personality}}',   // Character personality
  SCENARIO = '{{scenario}}',         // Character scenario
  
  // Message variables
  MESSAGE = '{{message}}',           // Current user message
  PREVIOUS_RESPONSE = '{{previous_response}}', // Previous AI response
  FIRST_MESSAGE = '{{first_message}}', // Character's first message
  EXAMPLES = '{{examples}}',         // Example messages/dialogues
  
  // Context variables
  KEY_POINTS = '{{key_points}}',     // Key points from conversation
  CONTEXT = '{{context}}',
  CHAT_HISTORY = '{{chat_history}}',  // Full chat history
  EXAMPLE_DIALOGUE = '{{example_dialogue}}', // General context
}

/**
 * Categories for organizing prompts
 */
export enum PromptCategory {
  REASONING = 'reasoning',           // Reasoning/thinking prompts
  VARIATION = 'variation',           // Response variation prompts
  INTRO = 'intro',                   // Introduction/greeting prompts
  SYSTEM = 'system',                 // System instructions/context
  ANALYSIS = 'analysis',             // Analysis/summary prompts
  CUSTOM = 'custom',                 // User-defined custom prompts
  CHAT = 'chat',                     // Chat-related prompts
}

/**
 * Standard prompt keys for the app
 * These should match the keys used in DEFAULT_PROMPTS in usePrompts.ts
 */
export enum StandardPromptKey {
  // System prompts
  SYSTEM_PROMPT = 'system_prompt',       // Main system prompt
  
  // Chat prompts
  CHAT_STARTER = 'chat_starter',         // Start a conversation
  CHAT_CONTINUE = 'chat_continue',       // Continue a conversation
  
  // Reasoning prompts
  REASONING = 'reasoning',               // Thinking/reasoning prompt
  
  // Variation prompts
  REFRESH_VARIATION = 'refresh_variation' // Create variation of response
}

/**
 * Prompt export/import format
 */
export interface PromptExport {
  templates: PromptTemplate[];
  version: string;
  exportedAt: string;
}