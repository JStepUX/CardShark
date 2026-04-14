/**
 * generationOrchestrator.ts - Unified LLM Generation Orchestrator
 * 
 * This module consolidates all LLM generation patterns (generate, regenerate, continue, greeting)
 * into a single, consistent orchestration layer. It ensures:
 * - Consistent context building using buildContextMessages
 * - Unified streaming and buffering logic
 * - Consistent error handling and retry logic
 * - Proper variation management
 * - Consistent state updates and persistence
 * 
 * Design Philosophy:
 * - Each generation type (generate, regenerate, continue, greeting) has unique INTENT
 * - But they all share the same MECHANICS (context building, streaming, state updates)
 * - This module extracts the shared mechanics while allowing intent-specific customization
 */

import { Message, PromptContextMessage, CompressionLevel } from '../services/chat/chatTypes';
import { buildContextMessages } from './contextBuilder';
import { streamResponse, generateChatResponse } from '../services/generation';
import { CharacterCard } from '../types/schema';

/**
 * Type of generation being performed
 */
export type GenerationType =
    | 'generate'       // New response to user message
    | 'regenerate'     // Regenerate assistant response (new variation)
    | 'hard_regenerate'// Regenerate with sampler perturbation to break lock-in
    | 'continue'       // Continue incomplete assistant response
    | 'greeting';      // Generate/regenerate greeting message

/**
 * Frontend mirror of backend `_PROTECTED_WORDS` frozenset in
 * `backend/logit_shaper.py`. Common English structural words that should
 * never be placed in `banned_tokens` because they lack clean synonyms and
 * banning them causes cross-lingual substitution artifacts.
 *
 * Keep in sync with backend. This is intentionally duplicated (not fetched)
 * to keep Hard Regenerate a pure client-side perturbation with no extra
 * network round-trip.
 */
export const HARD_REGEN_PROTECTED_WORDS: ReadonlySet<string> = new Set([
    'about', 'above', 'across', 'after', 'again', 'against', 'along',
    'already', 'also', 'always', 'among', 'another', 'around', 'asked',
    'away', 'back', 'because', 'been', 'before', 'began', 'behind',
    'being', 'below', 'between', 'both', 'bring', 'called', 'came',
    'could', 'didn', 'does', 'doing', 'down', 'during', 'each',
    'either', 'else', 'enough', 'even', 'every', 'felt', 'first',
    'found', 'from', 'going', 'gotten', 'hadn', 'hasn', 'have',
    'having', 'here', 'into', 'itself', 'just', 'knew', 'know',
    'least', 'like', 'long', 'made', 'make', 'many', 'might', 'more',
    'most', 'much', 'must', 'near', 'never', 'next', 'none', 'nothing',
    'now', 'once', 'only', 'other', 'over', 'own', 'part', 'perhaps',
    'quite', 'really', 'right', 'same', 'should', 'since', 'some',
    'something', 'still', 'such', 'than', 'that', 'their', 'them',
    'then', 'there', 'these', 'they', 'thing', 'think', 'this',
    'those', 'though', 'through', 'toward', 'towards', 'under',
    'until', 'upon', 'very', 'want', 'wasn', 'well', 'were', 'what',
    'when', 'where', 'whether', 'which', 'while', 'who', 'whom',
    'whose', 'will', 'with', 'within', 'without', 'would', 'yet',
]);

/**
 * Extract up to `max` candidate ban words from the first N tokens of a
 * message. Tokenizes on whitespace + punctuation, lowercases, drops short
 * and protected words.
 */
export function extractHardRegenBanWords(
    messageContent: string,
    windowTokens: number = 20,
    maxBans: number = 3
): string[] {
    if (!messageContent) return [];
    // Split into raw tokens on whitespace + punctuation, keep word-like only
    const rawTokens = messageContent
        .toLowerCase()
        .split(/[\s\p{P}]+/u)
        .filter(Boolean);
    const first = rawTokens.slice(0, windowTokens);
    const candidates: string[] = [];
    const seen = new Set<string>();
    for (const tok of first) {
        if (tok.length < 5) continue;
        if (HARD_REGEN_PROTECTED_WORDS.has(tok)) continue;
        if (seen.has(tok)) continue;
        seen.add(tok);
        candidates.push(tok);
        if (candidates.length >= maxBans) break;
    }
    return candidates;
}

/**
 * Hard Regenerate break-strategy perturbation. Produces a NEW generation
 * settings object for a single request — never mutates the input.
 *
 * Strategy rotation by attempt counter:
 *   0: ban top words from current message
 *   1: dynatemp bump (range=3, exponent=1) — temperature unchanged
 *   2: sampler widening (top_p=1, min_p=0, top_k=0)
 *   3+: all three combined
 */
export function applyHardRegenStrategy(
    baseSettings: Record<string, any> | undefined | null,
    attempt: number,
    targetMessageContent: string
): Record<string, any> {
    // Deep-ish clone: generation_settings is a flat primitive/array bag
    const next: Record<string, any> = baseSettings
        ? JSON.parse(JSON.stringify(baseSettings))
        : {};

    const applyBan = () => {
        const words = extractHardRegenBanWords(targetMessageContent);
        if (words.length === 0) return;
        const existing: string[] = Array.isArray(next.banned_tokens)
            ? [...next.banned_tokens]
            : [];
        // Merge + dedupe
        const merged = Array.from(new Set([...existing, ...words]));
        next.banned_tokens = merged;
    };
    const applyDynatemp = () => {
        next.dynatemp_range = 3.0;
        next.dynatemp_exponent = 1.0;
    };
    const applyWidening = () => {
        next.top_p = 1.0;
        next.min_p = 0;
        next.top_k = 0;
    };

    const a = Math.max(0, Math.floor(attempt));
    if (a === 0) {
        applyBan();
    } else if (a === 1) {
        applyDynatemp();
    } else if (a === 2) {
        applyWidening();
    } else {
        // 3+ : nuclear option
        applyBan();
        applyDynatemp();
        applyWidening();
    }
    return next;
}

/**
 * Configuration for a generation request
 */
export interface GenerationConfig {
    /** Type of generation */
    type: GenerationType;

    /** Current chat session UUID */
    chatSessionUuid: string;

    /** Character card data */
    characterData: CharacterCard;

    /** API configuration */
    apiConfig: any;

    /** Abort signal for cancellation */
    signal?: AbortSignal;

    /** Session notes to inject into context */
    sessionNotes?: string;

    /** Compression level for intelligent context management */
    compressionLevel?: CompressionLevel;

    /** Callback with payload before sending to API */
    onPayloadReady?: (payload: any) => void;

    /**
     * For 'hard_regenerate': which break strategy to apply. Cycles 0→1→2→3+.
     * See `applyHardRegenStrategy` for the rotation.
     */
    hardRegenAttempt?: number;

    /**
     * For 'hard_regenerate': content of the message being regenerated.
     * Needed so the token-ban strategy can derive ban words from what the
     * model just produced.
     */
    targetMessageContent?: string;
}

/**
 * Context options specific to each generation type
 */
export interface GenerationContextOptions {
    /** All messages in current state */
    existingMessages: Message[];

    /** For 'generate': the new user message */
    newUserMessage?: Message;

    /** For 'regenerate'/'continue': the message being regenerated/continued */
    targetMessage?: Message;

    /** For 'continue': whether to include the target message in context */
    includeTargetInContext?: boolean;

    /** Message ID to exclude from context (typically the assistant placeholder) */
    excludeMessageId?: string;
}

/**
 * Result of building generation context
 */
export interface GenerationContextResult {
    /** Context messages to send to API */
    contextMessages: PromptContextMessage[];

    /** Additional prompt instructions (e.g., for continuation) */
    additionalInstructions?: string;

    /** For 'continue': the partial assistant response to use as generation prefix */
    continuationText?: string;

    /** Context window metadata */
    metadata: {
        type: GenerationType;
        messageCount: number;
        targetMessageId?: string;
    };
}

/**
 * Builds context messages for a specific generation type
 */
export function buildGenerationContext(
    config: GenerationConfig,
    options: GenerationContextOptions
): GenerationContextResult {
    const { type } = config;
    const { existingMessages, newUserMessage, targetMessage, excludeMessageId } = options;

    let contextMessages: PromptContextMessage[];
    let additionalInstructions: string | undefined;
    let targetMessageId: string | undefined;

    switch (type) {
        case 'generate': {
            // New response: include all existing messages + new user message
            contextMessages = buildContextMessages({
                existingMessages,
                newUserMessage,
                excludeMessageId
            });
            break;
        }

        case 'regenerate':
        case 'hard_regenerate': {
            // Regenerate (and hard_regenerate): include messages up to
            // (but not including) the target message. The perturbation for
            // hard_regenerate is applied in executeGeneration, not here —
            // context building is identical.
            if (!targetMessage) {
                throw new Error('targetMessage required for regenerate');
            }

            const targetIdx = existingMessages.findIndex(m => m.id === targetMessage.id);
            if (targetIdx === -1) {
                throw new Error('targetMessage not found in existingMessages');
            }

            // Slice to include messages up to (but not including) the target
            contextMessages = buildContextMessages({
                existingMessages: existingMessages.slice(0, targetIdx),
                excludeMessageId: targetMessage.id
            });

            targetMessageId = targetMessage.id;
            break;
        }

        case 'continue': {
            // Continue: exclude the target message from context, pass its content
            // as a generation prefix so the model continues mid-stream (like impersonate)
            if (!targetMessage) {
                throw new Error('targetMessage required for continue');
            }

            const targetIdx = existingMessages.findIndex(m => m.id === targetMessage.id);
            if (targetIdx === -1) {
                throw new Error('targetMessage not found in existingMessages');
            }

            // Exclude the target message — its content becomes the generation prefix
            contextMessages = buildContextMessages({
                existingMessages: existingMessages.slice(0, targetIdx),
                excludeMessageId
            });

            targetMessageId = targetMessage.id;
            break;
        }

        case 'greeting': {
            // Greeting: no context messages, just character data
            // The greeting is generated from character data alone
            contextMessages = buildContextMessages({
                existingMessages: [],
                excludeMessageId
            });

            if (targetMessage) {
                targetMessageId = targetMessage.id;
            }
            break;
        }

        default:
            throw new Error(`Unknown generation type: ${type}`);
    }

    return {
        contextMessages,
        additionalInstructions,
        // For continue: pass the target message content as generation prefix
        continuationText: type === 'continue' && targetMessage ? targetMessage.content : undefined,
        metadata: {
            type,
            messageCount: contextMessages.length,
            targetMessageId
        }
    };
}

/**
 * Executes a generation request with unified streaming and error handling
 */
export async function executeGeneration(
    config: GenerationConfig,
    context: GenerationContextResult
): Promise<Response> {
    const { chatSessionUuid, characterData, apiConfig, signal, sessionNotes, compressionLevel, onPayloadReady } = config;

    // Combine session notes with continuation instructions if present
    let effectiveSessionNotes = sessionNotes || '';
    if (context.additionalInstructions) {
        effectiveSessionNotes = effectiveSessionNotes
            ? `${effectiveSessionNotes}\n\n${context.additionalInstructions}`
            : context.additionalInstructions;
    }

    // Thread generation type to backend for LogitShaper
    // (regenerate/hard_regenerate/continue = non-advancing)
    let enrichedApiConfig: any = { ...apiConfig, _generation_type: config.type };

    // For hard_regenerate, apply the break-strategy perturbation to a CLONED
    // generation_settings so the user's saved sampler settings are untouched
    // and the perturbed values are visible in the Raw Payload tab.
    if (config.type === 'hard_regenerate') {
        const attempt = config.hardRegenAttempt ?? 0;
        const targetContent = config.targetMessageContent ?? '';
        const perturbed = applyHardRegenStrategy(
            apiConfig?.generation_settings,
            attempt,
            targetContent
        );
        enrichedApiConfig = {
            ...enrichedApiConfig,
            generation_settings: perturbed,
        };
    }

    const response = await generateChatResponse({
        chatSessionUuid,
        contextMessages: context.contextMessages,
        apiConfig: enrichedApiConfig,
        signal,
        characterCard: characterData,
        sessionNotes: effectiveSessionNotes,
        compressionLevel,
        onPayloadReady,
        continuationText: context.continuationText,
        backendHistory: config.type === 'generate',
    });

    return response;
}

/**
 * Streaming buffer configuration
 */
export interface StreamingConfig {
    /** Buffer interval in milliseconds */
    bufferInterval?: number;

    /** Whether to apply client-side content filtering */
    applyFiltering?: boolean;

    /** Content filter function */
    filterFunction?: (content: string) => string;
}

/**
 * Handles streaming response with buffering
 */
export async function* streamWithBuffering(
    response: Response,
    config: StreamingConfig = {}
): AsyncGenerator<{ chunk: string; fullContent: string; isFiltered: boolean }, void, unknown> {
    const { bufferInterval = 50, applyFiltering = false, filterFunction } = config;

    let fullContent = '';
    let buffer = '';
    let lastYieldTime = Date.now();

    for await (const chunk of streamResponse(response)) {
        buffer += chunk;
        fullContent += chunk;

        const now = Date.now();
        const shouldYield = (now - lastYieldTime) >= bufferInterval || buffer.length > 100;

        if (shouldYield) {
            const contentToYield = buffer;
            buffer = '';
            lastYieldTime = now;

            const filteredContent = applyFiltering && filterFunction
                ? filterFunction(fullContent)
                : fullContent;

            yield {
                chunk: contentToYield,
                fullContent: filteredContent,
                isFiltered: applyFiltering
            };
        }
    }

    // Yield any remaining buffer
    if (buffer.length > 0) {
        const filteredContent = applyFiltering && filterFunction
            ? filterFunction(fullContent)
            : fullContent;

        yield {
            chunk: buffer,
            fullContent: filteredContent,
            isFiltered: applyFiltering
        };
    }
}

/**
 * Variation management helper
 */
export interface VariationUpdate {
    /** Original variations array */
    originalVariations: string[];

    /** New content to add as variation */
    newContent: string;

    /** Whether to append to existing variations or replace current */
    mode: 'append' | 'replace';

    /** Current variation index (for replace mode) */
    currentVariationIndex?: number;
}

/**
 * Updates variations array based on mode
 */
export function updateVariations(update: VariationUpdate): { variations: string[]; currentVariation: number } {
    const { originalVariations, newContent, mode, currentVariationIndex } = update;

    if (mode === 'append') {
        // Add as new variation
        const variations = [...originalVariations, newContent];
        return {
            variations,
            currentVariation: variations.length - 1
        };
    } else {
        // Replace current variation
        const variations = [...originalVariations];
        const targetIndex = currentVariationIndex ?? variations.length - 1;
        variations[targetIndex] = newContent;
        return {
            variations,
            currentVariation: targetIndex
        };
    }
}
