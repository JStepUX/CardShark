/**
 * @file generationService.ts
 * @description LLM generation request orchestration.
 *
 * Drop-in replacement for PromptHandler.generateChatResponse().
 * Uses an options-object API instead of 12 positional parameters.
 *
 * Delegates to:
 * - ContextSerializer (V2) for createMemoryContext, getTemplate
 * - compressionService for smart context compression
 * - Inline payload construction (matching worldGenerationService pattern)
 *
 * Also exports helper functions previously buried in PromptHandler:
 * - getStopSequences
 * - extractEssentialCharacterData
 * - buildPostHistoryBlock
 * - assemblePrompt
 * - formatPromptWithContextMessages
 */

import type { CharacterCard } from '../../types/schema';
import type { Template } from '../../types/templateTypes';
import type {
  CompressionLevel,
  CompressedContextCache,
  MemoryContextResult,
} from '../chat/chatTypes';
import { ChatStorage } from '../chatStorage';
import {
  getTemplate,
  createMemoryContext,
  replaceVariables,
  stripHtmlTags,
} from '../context/ContextSerializer';
import { orchestrateCompression } from './compressionService';

const DEBUG = false;

// ─── Types ──────────────────────────────────────────────────────────────────

type SimpleMessage = { role: string; content: string };

export interface GenerateChatOptions {
  chatSessionUuid: string;
  contextMessages: SimpleMessage[];
  apiConfig: Record<string, unknown> & {
    templateId?: string;
    generation_settings?: Record<string, unknown>;
    _generation_type?: string;
  };
  signal?: AbortSignal;
  characterCard?: CharacterCard;
  sessionNotes?: string;
  compressionLevel?: CompressionLevel;
  compressedContextCache?: CompressedContextCache | null;
  onCompressionStart?: () => void;
  onCompressionEnd?: () => void;
  onPayloadReady?: (payload: Record<string, unknown>) => void;
  continuationText?: string;
}

// ─── Stop Sequences ─────────────────────────────────────────────────────────

/**
 * Get stop sequences from template or generate defaults.
 * Replaces PromptHandler.getStopSequences().
 */
export function getStopSequences(
  template: Template | null,
  characterName: string,
  userName: string = 'User'
): string[] {
  const defaultStopSequences = [
    `\n${userName}:`,
    '\nUser:',
    '\nAssistant:',
  ];

  if (!template || !template.stopSequences || template.stopSequences.length === 0) {
    return defaultStopSequences;
  }

  return template.stopSequences.map(seq =>
    seq.replace(/\{\{char\}\}/g, characterName)
       .replace(/\{\{user\}\}/g, userName)
  );
}

// ─── Character Data Extraction ──────────────────────────────────────────────

/**
 * Extract essential character data for the payload, excluding character_book
 * and alternate_greetings to keep the payload lean.
 */
export function extractEssentialCharacterData(card: CharacterCard): Record<string, unknown> {
  return {
    spec: card.spec,
    spec_version: card.spec_version,
    data: {
      name: card.data.name,
      description: card.data.description,
      personality: card.data.personality,
      scenario: card.data.scenario,
      first_mes: card.data.first_mes,
      mes_example: card.data.mes_example,
      system_prompt: card.data.system_prompt,
      post_history_instructions: card.data.post_history_instructions,
      character_uuid: card.data.character_uuid,
      tags: card.data.tags,
      creator: card.data.creator,
      character_version: card.data.character_version,
      // Explicitly exclude character_book — lore matching happens on backend
      // Explicitly exclude alternate_greetings — only selected greeting is in chat_history
    },
  };
}

// ─── Post-History Block ─────────────────────────────────────────────────────

/**
 * Build the post-history instructions block (session notes + card post_history_instructions).
 * Injected right before the {{char}}: suffix — the strongest prompt position.
 */
export function buildPostHistoryBlock(
  card: CharacterCard | undefined,
  sessionNotes: string | undefined,
  characterName: string,
  userName: string
): string {
  const cardPostHistory = card?.data?.post_history_instructions?.trim() || '';
  const trimmedNotes = sessionNotes?.trim() || '';

  if (!cardPostHistory && !trimmedNotes) return '';

  const parts: string[] = [];
  if (cardPostHistory) parts.push(cardPostHistory);
  if (trimmedNotes) parts.push(trimmedNotes);

  let block = `[Session Notes]\n${parts.join('\n')}\n[End Session Notes]`;

  // Resolve {{char}} and {{user}} tokens
  block = block
    .replace(/\{\{char\}\}/gi, characterName)
    .replace(/\{\{user\}\}/gi, userName);

  return block;
}

// ─── Prompt Assembly ────────────────────────────────────────────────────────

/**
 * Format chat history using the template system.
 * Handles variation selection and HTML stripping.
 */
function formatChatHistory(
  messages: SimpleMessage[],
  characterName: string,
  templateId?: string
): string {
  if (!messages || messages.length === 0) return '';

  const template = getTemplate(templateId);

  const processedMessages = messages
    .filter((msg: Record<string, unknown>) => msg.role !== 'thinking')
    .map(msg => {
      // Support variations (duck-typed)
      const msgAny = msg as Record<string, unknown>;
      let finalContent = msg.content;
      if (
        Array.isArray(msgAny.variations) &&
        msgAny.variations.length > 0 &&
        typeof msgAny.currentVariation === 'number' &&
        msgAny.variations[msgAny.currentVariation]
      ) {
        finalContent = msgAny.variations[msgAny.currentVariation] as string;
      }

      const cleanContent = stripHtmlTags(finalContent);
      return { role: msg.role, content: cleanContent };
    });

  if (!template) {
    return processedMessages
      .map(msg => {
        if (msg.role === 'assistant') return `${characterName}: ${msg.content}`;
        return msg.content;
      })
      .join('\n\n');
  }

  try {
    return processedMessages
      .map(msg => {
        if (msg.role === 'assistant') {
          return replaceVariables(template.assistantFormat, {
            content: msg.content,
            char: characterName,
          });
        } else if (msg.role === 'system' && template.systemFormat) {
          return replaceVariables(template.systemFormat, { content: msg.content });
        }
        return replaceVariables(template.userFormat, { content: msg.content });
      })
      .join('\n');
  } catch (error) {
    console.error('Error formatting chat history:', error);
    return processedMessages
      .map(msg => {
        if (msg.role === 'assistant') return `${characterName}: ${msg.content}`;
        return msg.content;
      })
      .join('\n\n');
  }
}

/**
 * Assemble the final prompt string from its constituent parts.
 */
export function assemblePrompt(
  compressedCtx: string,
  history: string,
  postHistory: string,
  characterName: string,
  hasCharacterCard: boolean,
  continuationText?: string
): string {
  let finalPrompt = '';

  if (compressedCtx) {
    finalPrompt += `${compressedCtx}\n\n`;
  }

  finalPrompt += history;

  // Ensure non-empty prompt
  if (!finalPrompt.trim()) {
    finalPrompt = `${characterName}:`;
  }

  // Post-history instructions right before character turn marker
  if (postHistory) {
    finalPrompt += `\n${postHistory}`;
  }

  // Ghost suffix / continuation prefix
  if (hasCharacterCard) {
    if (continuationText) {
      finalPrompt += `\n${characterName}: ${continuationText}`;
    } else {
      finalPrompt += `\n${characterName}:`;
    }
  }

  return finalPrompt;
}

// ─── Format Prompt With Context Messages ────────────────────────────────────

/**
 * Format a complete prompt with memory context + history + user message + assistant prefix.
 * Used by reasoning and NPC introduction flows.
 * Replaces PromptHandler.formatPromptWithContextMessages().
 */
export function formatPromptWithContextMessages(
  character: CharacterCard,
  prompt: string,
  contextMessages: Array<{ role: string; content: string }>,
  userName: string,
  templateId?: string
): string {
  const template = getTemplate(templateId);
  const characterName = character.data.name || 'Character';
  const currentUser = userName || 'User';

  // Create memory context (no compression for this use case)
  const memoryResult = createMemoryContext(
    {
      spec: character.spec,
      spec_version: character.spec_version,
      data: character.data,
    },
    template,
    currentUser,
    'none',
    0
  );
  const memoryContext = memoryResult.memory;

  // Format history
  let history = '';
  if (contextMessages.length > 0) {
    history = contextMessages
      .map(msg => {
        const messageVariables = {
          content: msg.content,
          char: characterName,
          user: currentUser,
        };
        if (!template) {
          if (msg.role === 'assistant') {
            return replaceVariables(`{{char}}: {{content}}`, messageVariables);
          } else if (msg.role === 'system') {
            return replaceVariables(`[System: {{content}}]`, messageVariables);
          }
          return replaceVariables(`{{user}}: {{content}}`, messageVariables);
        }

        if (msg.role === 'assistant') {
          return replaceVariables(template.assistantFormat || '{{char}}: {{content}}', messageVariables);
        } else if (msg.role === 'system' && template.systemFormat) {
          return replaceVariables(template.systemFormat, messageVariables);
        }
        return replaceVariables(template.userFormat || '{{user}}: {{content}}', messageVariables);
      })
      .join('\n');
  }

  // Format current user prompt
  const currentUserPromptFormatted = template?.userFormat
    ? replaceVariables(template.userFormat, { content: prompt, user: currentUser, char: characterName })
    : replaceVariables(`{{user}}: {{content}}`, { content: prompt, user: currentUser });

  const assistantPrefixFormatted = template?.assistantFormat
    ? replaceVariables(template.assistantFormat, { content: '', char: characterName, user: currentUser })
    : replaceVariables(`{{char}}:`, { char: characterName });

  return `${memoryContext}\n\n${history}\n\n${currentUserPromptFormatted}\n\n${assistantPrefixFormatted}`;
}

// ─── Main Generation Function ───────────────────────────────────────────────

/**
 * Generate a chat response via the /api/generate endpoint.
 *
 * Drop-in replacement for PromptHandler.generateChatResponse() with an
 * options-object API instead of 12 positional parameters.
 */
export async function generateChatResponse(options: GenerateChatOptions): Promise<Response> {
  const {
    chatSessionUuid,
    contextMessages,
    apiConfig,
    signal,
    characterCard,
    sessionNotes,
    compressionLevel,
    compressedContextCache,
    onCompressionStart,
    onCompressionEnd,
    onPayloadReady,
    continuationText,
  } = options;

  if (!chatSessionUuid) {
    throw new Error('chat_session_uuid is required for chat generation');
  }

  if (!apiConfig) {
    throw new Error('apiConfig is required for LLM generation');
  }

  try {
    // Ghost Request Guard
    if ((!contextMessages || contextMessages.length === 0) && !characterCard?.data?.first_mes) {
      if (DEBUG) console.warn('Blocked potential Ghost Request: No context messages and no character greeting');
      return new Response(JSON.stringify({ error: 'Ghost Request Blocked: Insufficient context' }), { status: 400 });
    }

    const templateId = apiConfig?.templateId as string | undefined;
    const template = getTemplate(templateId);
    const characterName = characterCard?.data?.name || 'Character';
    const effectiveCompressionLevel: CompressionLevel = compressionLevel || 'none';

    // Create memory context for field breakdown / token display (Context Window Modal).
    // The actual memory string is built by the backend from character_data.
    let memoryResult: MemoryContextResult | null = null;
    if (characterCard?.data) {
      memoryResult = createMemoryContext(
        {
          spec: characterCard.spec,
          spec_version: characterCard.spec_version,
          data: characterCard.data,
        },
        template,
        'User',
        effectiveCompressionLevel,
        contextMessages.length
      );
    }

    // Smart compression with caching
    const compressionResult = await orchestrateCompression({
      contextMessages: contextMessages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
      characterName,
      apiConfig: apiConfig as Record<string, unknown>,
      compressionLevel: effectiveCompressionLevel,
      compressedContextCache: compressedContextCache || null,
      signal,
      onCompressionStart,
      onCompressionEnd,
    });

    const { compressedContextBlock, messagesToFormat, updatedCache } = compressionResult;

    // Build post-history block
    const currentUserProfile = ChatStorage.getCurrentUser();
    const resolvedUserName = currentUserProfile?.name || 'User';
    const userPersona = currentUserProfile?.description?.trim() || '';

    const postHistoryBlock = buildPostHistoryBlock(
      characterCard,
      sessionNotes,
      characterName,
      resolvedUserName
    );

    // Format conversation history
    const history = formatChatHistory(
      messagesToFormat.map(msg => ({
        role: msg.role as string,
        content: msg.content,
      })),
      characterName,
      templateId
    );

    // Assemble final prompt
    const finalPrompt = assemblePrompt(
      compressedContextBlock,
      history,
      postHistoryBlock,
      characterName,
      !!characterCard,
      continuationText
    );

    // Stop sequences
    const stopSequences = getStopSequences(template, characterName, resolvedUserName);

    // Excluded fields from field expiration
    const excludedFields = memoryResult?.fieldBreakdown
      .filter(f => f.status === 'expired')
      .map(f => f.fieldKey) || [];

    // Essential character data (no lore book, no alternate greetings)
    const essentialCharacterData = characterCard
      ? extractEssentialCharacterData(characterCard)
      : null;

    // Build payload
    const payload = {
      api_config: apiConfig,
      generation_params: {
        ...(apiConfig.generation_settings as Record<string, unknown> || {}),
        prompt: finalPrompt,
        excluded_fields: excludedFields,
        user_name: resolvedUserName,
        ...(userPersona ? { user_persona: userPersona } : {}),
        stop_sequence: stopSequences,
        chat_session_uuid: chatSessionUuid,
        character_data: essentialCharacterData,
        chat_history: contextMessages,
        ...(continuationText ? { continuation_text: continuationText } : {}),
        generation_type: (apiConfig as Record<string, unknown>)._generation_type || 'generate',
        quiet: true,
      },
    };

    // Payload callback for debugging / Context Window Modal
    if (onPayloadReady) {
      onPayloadReady({
        ...payload,
        displayMemory: memoryResult?.memory || '',
        fieldBreakdown: memoryResult?.fieldBreakdown || [],
        savedTokens: memoryResult?.savedTokens || 0,
        compressedContextCache: updatedCache,
      });
    }

    // Fetch
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    return response;
  } catch (error) {
    console.error('Error generating chat response:', error);
    throw error;
  }
}
