/**
 * @file index.ts
 * @description Barrel exports for the generation services layer.
 *
 * Replaces the monolithic PromptHandler with focused modules:
 * - streamParser: SSE stream parsing (streamResponse)
 * - compressionService: Smart context compression with caching
 * - generationService: LLM generation request orchestration
 */

export { streamResponse } from './streamParser';
export {
  formatMessagesForCompression,
  compressMessages,
  orchestrateCompression,
} from './compressionService';
export {
  generateChatResponse,
  getStopSequences,
  extractEssentialCharacterData,
  buildPostHistoryBlock,
  assemblePrompt,
  formatPromptWithContextMessages,
} from './generationService';
export type { GenerateChatOptions } from './generationService';
