// src/types/templateTypes.ts

/**
 * Template format interface that defines the structure of a chat completion template
 */
export interface Template {
  id: string;           // Unique identifier (kebab-case)
  name: string;         // Display name
  description: string;  // Short description
  isBuiltIn: boolean;   // Whether this is a built-in template
  isEditable: boolean;  // Whether user can edit this template
  
  // Template formatting fields
  systemFormat?: string | null | undefined;   // Format for system messages
  userFormat: string;      // Format for user messages
  assistantFormat: string; // Format for assistant messages
  memoryFormat?: string;   // Format for memory/context section
  
  // Detection patterns for auto-detection
  detectionPatterns?: string[]; // Patterns to detect this template format from API responses
  
  // Default stop sequences
  stopSequences?: string[];  // Default stop sequences for this template
  
  // Optional fields for tool support etc.
  tools_start?: string;    // Format for tool definitions start
  tools_end?: string;      // Format for tool definitions end
  
  // Field for backwards compatibility with search patterns
  search?: string[];       // Patterns used to identify this template
}

/**
 * Template category for organization
 */
export enum TemplateCategory {
  CHATML = 'chatml',
  LLAMA = 'llama',
  MISTRAL = 'mistral', 
  GEMINI = 'gemini',
  OTHER = 'other'
}

/**
 * Types of tokens that can be used in templates
 */
export enum TokenType {
  // Standard tokens
  SYSTEM_CONTENT = '{{system}}',    // System prompt content
  USER_CONTENT = '{{content}}',     // User message content
  ASSISTANT_CONTENT = '{{content}}', // Assistant message content
  CHARACTER_NAME = '{{char}}',      // Character name
  
  // Character data tokens
  DESCRIPTION = '{{description}}',   // Character description 
  PERSONALITY = '{{personality}}',   // Character personality
  SCENARIO = '{{scenario}}',         // Character scenario
  EXAMPLES = '{{examples}}',         // Example messages/dialogues
  
  // Conditional tokens
  IF_SYSTEM = '{{#if system}}',      // If system prompt exists
  END_IF = '{{/if}}',                // End if condition
  
  // Custom field tokens
  CUSTOM_FIELD = '{{field:name}}',   // Custom field with name
}

/**
 * Template export/import format
 */
export interface TemplateExport {
  templates: Template[];
  version: string;
  exportedAt: string;
}