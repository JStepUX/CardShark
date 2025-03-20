import { z } from 'zod';

/**
 * Zod schema for validating prompt keys
 */
export const promptKeySchema = z.string()
  .min(1, "Prompt key is required")
  .regex(/^[a-zA-Z0-9_]+$/, "Prompt key can only contain letters, numbers, and underscores");

/**
 * Zod schema for validating prompt templates
 */
export const promptTemplateSchema = z.string()
  .min(1, "Prompt template is required");

/**
 * Schema for validating new prompt creation
 */
export const newPromptSchema = z.object({
  key: promptKeySchema,
  template: promptTemplateSchema,
});

/**
 * Schema for validating prompt exports/imports
 */
export const PromptExportSchema = z.object({
  prompts: z.record(z.string()),
  custom: z.array(z.object({
    key: promptKeySchema,
    template: promptTemplateSchema
  })).optional(),
  version: z.string().optional()
});

/**
 * Type definition inferred from the export schema
 */
export type PromptExport = z.infer<typeof PromptExportSchema>;

/**
 * Interface for a prompt template
 */
export interface PromptTemplate {
  key: string;
  template: string;
  isCustom?: boolean;
}
