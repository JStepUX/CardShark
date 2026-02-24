/**
 * @file compressionService.ts
 * @description Smart context compression with caching for long chat sessions.
 *
 * Handles:
 * - Formatting messages for the compression prompt
 * - Calling the LLM to generate compressed summaries
 * - Smart cache management (reuse valid cache, re-compress when stale)
 *
 * Extracted from PromptHandler (promptHandler.ts:500-706).
 */

import type { CompressionLevel, CompressedContextCache } from '../chat/chatTypes';
import { streamResponse } from './streamParser';

const DEBUG = false;

// Compression constants
export const COMPRESSION_THRESHOLD = 20;           // don't compress below this many messages
export const RECENT_WINDOW = 10;                    // always keep this many verbatim
export const COMPRESSION_REFRESH_THRESHOLD = 20;    // re-compress after this many new messages

type SimpleMessage = { role: 'user' | 'assistant' | 'system'; content: string };

/**
 * Format messages into plain text for the compression prompt.
 */
export function formatMessagesForCompression(
  messages: SimpleMessage[],
  characterName: string
): string {
  return messages
    .map(msg => {
      const role = msg.role === 'assistant' ? characterName : msg.role === 'user' ? 'User' : 'System';
      return `${role}: ${msg.content}`;
    })
    .join('\n\n');
}

/**
 * Call the LLM to compress old messages into a concise narrative summary.
 */
export async function compressMessages(
  messages: SimpleMessage[],
  characterName: string,
  apiConfig: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const systemPrompt = `You are a context compressor for a roleplay chat. Summarize the following messages into a concise narrative that preserves:
- Key plot events and decisions
- Character emotional states and relationship changes
- Established facts about the world/setting
- Any commitments, promises, or plans made

Write in past tense, third person. Be concise but do not lose critical details.
Do not editorialize or add interpretation. Just the facts of what happened.`;

  const userPrompt = `Compress these messages:\n\n${formatMessagesForCompression(messages, characterName)}`;

  const payload = {
    api_config: apiConfig,
    generation_params: {
      prompt: `${systemPrompt}\n\n${userPrompt}\n\nSummary:`,
      memory: '',
      stop_sequence: [],
      quiet: true,
    },
  };

  if (DEBUG) console.log('Calling compression API...');
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Compression API failed with status ${response.status}`);
  }

  let compressedText = '';
  for await (const chunk of streamResponse(response)) {
    compressedText += chunk;
  }

  if (DEBUG) console.log('Compression complete, length:', compressedText.length);
  return compressedText.trim();
}

// ─── Orchestration ──────────────────────────────────────────────────────────

export interface OrchestrateCompressionOptions {
  contextMessages: SimpleMessage[];
  characterName: string;
  apiConfig: Record<string, unknown>;
  compressionLevel: CompressionLevel;
  compressedContextCache: CompressedContextCache | null;
  signal?: AbortSignal;
  onCompressionStart?: () => void;
  onCompressionEnd?: () => void;
}

export interface OrchestrateCompressionResult {
  compressedContextBlock: string;
  messagesToFormat: SimpleMessage[];
  updatedCache: CompressedContextCache | null;
}

/**
 * Smart compression orchestration with caching.
 *
 * Decides whether to compress, reuse cache, or skip compression entirely.
 * Returns the compressed context block (if any), the messages to format verbatim,
 * and an updated cache for the caller to store.
 */
export async function orchestrateCompression(
  options: OrchestrateCompressionOptions
): Promise<OrchestrateCompressionResult> {
  const {
    contextMessages,
    characterName,
    apiConfig,
    compressionLevel,
    compressedContextCache,
    signal,
    onCompressionStart,
    onCompressionEnd,
  } = options;

  const effectiveLevel = compressionLevel || 'none';
  let updatedCache: CompressedContextCache | null = compressedContextCache || null;

  // Below threshold or compression disabled — use all messages verbatim
  const shouldCompress = effectiveLevel !== 'none' && contextMessages.length > COMPRESSION_THRESHOLD;
  if (!shouldCompress) {
    return {
      compressedContextBlock: '',
      messagesToFormat: contextMessages,
      updatedCache,
    };
  }

  if (DEBUG) console.log(`Smart compression check: ${contextMessages.length} messages (threshold: ${COMPRESSION_THRESHOLD})`);

  const splitPoint = contextMessages.length - RECENT_WINDOW;
  const recentMessages = contextMessages.slice(splitPoint);

  // Check cache validity
  const cacheIsValid = compressedContextCache &&
    compressedContextCache.compressionLevel === effectiveLevel &&
    compressedContextCache.compressedAtMessageCount > 0 &&
    (contextMessages.length - compressedContextCache.compressedAtMessageCount) < COMPRESSION_REFRESH_THRESHOLD;

  if (cacheIsValid) {
    if (DEBUG) console.log(`Using cached compression from message ${compressedContextCache!.compressedAtMessageCount}`);
    return {
      compressedContextBlock: `[Previous Events Summary]\n${compressedContextCache!.compressedText}\n[End Summary - Recent conversation follows]`,
      messagesToFormat: recentMessages,
      updatedCache,
    };
  }

  // Need to compress (or re-compress stale cache)
  const oldMessages = contextMessages.slice(0, splitPoint);
  if (DEBUG) console.log(`Compressing: ${oldMessages.length} old messages, ${recentMessages.length} recent messages`);

  try {
    if (onCompressionStart) onCompressionStart();

    const compressed = await compressMessages(oldMessages, characterName, apiConfig, signal);

    updatedCache = {
      compressedText: compressed,
      compressedAtMessageCount: oldMessages.length,
      compressionLevel: effectiveLevel,
      timestamp: Date.now(),
    };

    if (DEBUG) console.log('Compression successful, cache updated');

    return {
      compressedContextBlock: `[Previous Events Summary]\n${compressed}\n[End Summary - Recent conversation follows]`,
      messagesToFormat: recentMessages,
      updatedCache,
    };
  } catch (error) {
    console.error('Compression failed, using full context:', error);
    return {
      compressedContextBlock: '',
      messagesToFormat: contextMessages,
      updatedCache: null,
    };
  } finally {
    if (onCompressionEnd) onCompressionEnd();
  }
}
