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

import { Message, PromptContextMessage, CompressionLevel, CompressedContextCache } from '../services/chat/chatTypes';
import { buildContextMessages } from './contextBuilder';
import { PromptHandler } from '../handlers/promptHandler';
import { CharacterCard } from '../types/schema';

/**
 * Type of generation being performed
 */
export type GenerationType =
    | 'generate'      // New response to user message
    | 'regenerate'    // Regenerate assistant response (new variation)
    | 'continue'      // Continue incomplete assistant response
    | 'greeting';     // Generate/regenerate greeting message

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

    /** Cached compression result for performance */
    compressedContextCache?: CompressedContextCache | null;

    /** Callback when compression starts */
    onCompressionStart?: () => void;

    /** Callback when compression ends */
    onCompressionEnd?: () => void;

    /** Callback with payload before sending to API */
    onPayloadReady?: (payload: any) => void;
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

        case 'regenerate': {
            // Regenerate: include messages up to (but not including) the target message
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
    const { chatSessionUuid, characterData, apiConfig, signal, sessionNotes, compressionLevel, compressedContextCache, onCompressionStart, onCompressionEnd, onPayloadReady } = config;

    // Combine session notes with continuation instructions if present
    let effectiveSessionNotes = sessionNotes || '';
    if (context.additionalInstructions) {
        effectiveSessionNotes = effectiveSessionNotes
            ? `${effectiveSessionNotes}\n\n${context.additionalInstructions}`
            : context.additionalInstructions;
    }

    // Thread generation type to backend for LogitShaper (regenerate/continue = non-advancing)
    const enrichedApiConfig = { ...apiConfig, _generation_type: config.type };

    // Use PromptHandler to generate the response
    const response = await PromptHandler.generateChatResponse(
        chatSessionUuid,
        context.contextMessages,
        enrichedApiConfig,
        signal,
        characterData,
        effectiveSessionNotes,
        compressionLevel, // Changed from compressionEnabled
        compressedContextCache, // Added cache parameter
        onCompressionStart,
        onCompressionEnd,
        onPayloadReady,
        context.continuationText // For continue: partial text used as generation prefix
    );

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

    for await (const chunk of PromptHandler.streamResponse(response)) {
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
