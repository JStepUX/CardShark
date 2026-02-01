/**
 * @file ContextSerializer.ts
 * @description Pure functions for serializing context snapshots to LLM-ready format.
 *
 * The ContextSerializer takes a ContextSnapshot and converts it into the
 * format expected by the LLM API, including:
 * - Memory block (system prompt + character fields)
 * - Formatted conversation history
 * - Session notes block
 * - Stop sequences
 *
 * This module extracts logic from PromptHandler.ts and makes it testable.
 * All functions are pure - no side effects.
 */

import type {
  ContextSnapshot,
  SerializedContext,
  SerializerOptions,
  MinimalCharacterCard,
  WorldContext,
  RoomContext,
} from '../../types/context';
import { createMinimalCharacterCard } from '../../types/context';
import type { Template } from '../../types/templateTypes';
import type { NPCThinFrame } from '../../types/schema';
import type { Message, CompressionLevel, FieldTokenInfo, MemoryContextResult } from '../chat/chatTypes';
import { templateService } from '../templateService';

// =============================================================================
// Constants
// =============================================================================

/**
 * Compression level hierarchy - order matters (higher index = more aggressive)
 */
export const COMPRESSION_LEVEL_HIERARCHY: CompressionLevel[] = [
  'none',
  'chat_only',
  'chat_dialogue',
  'aggressive',
];

/**
 * Field expiration configuration for V2 spec fields.
 * Defines when each character card field should be excluded from context.
 */
interface FieldExpirationConfig {
  permanent: boolean;
  expiresAtMessage: number | null;
  minimumCompressionLevel: CompressionLevel;
}

export const FIELD_EXPIRATION_CONFIG: Record<string, FieldExpirationConfig> = {
  system_prompt: {
    permanent: true,
    expiresAtMessage: null,
    minimumCompressionLevel: 'none',
  },
  description: {
    permanent: true,
    expiresAtMessage: null,
    minimumCompressionLevel: 'none',
  },
  personality: {
    permanent: true,
    expiresAtMessage: null,
    minimumCompressionLevel: 'none',
  },
  scenario: {
    permanent: false,
    expiresAtMessage: 3,
    minimumCompressionLevel: 'aggressive',
  },
  mes_example: {
    permanent: false,
    expiresAtMessage: 5,
    minimumCompressionLevel: 'chat_dialogue',
  },
  first_mes: {
    permanent: false,
    expiresAtMessage: 3,
    minimumCompressionLevel: 'aggressive',
  },
};

// =============================================================================
// Template Utilities
// =============================================================================

/**
 * Get a template by ID from the template service.
 * Pure function - no side effects (reads from service singleton).
 */
export function getTemplate(templateId?: string | null): Template | null {
  if (templateId) {
    const template = templateService.getTemplateById(templateId);
    if (template) {
      return template;
    }
    console.warn(`Template not found for ID: ${templateId}`);
  }

  // Fallback to mistral template or first available
  return (
    templateService.getTemplateById('mistral') ||
    templateService.getAllTemplates()[0] ||
    null
  );
}

/**
 * Replace template variables in a string.
 * Pure function - no side effects.
 */
export function replaceVariables(
  template: string,
  variables: Record<string, string>
): string {
  if (!template) return '';

  let result = template;

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  });

  return result;
}

/**
 * Strip HTML tags from content.
 * Pure function - no side effects.
 */
export function stripHtmlTags(content: string): string {
  if (!content) return '';

  // Use DOMParser for safe HTML parsing (browser environment)
  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = content;
    const textContent = temp.textContent || temp.innerText || '';
    return textContent.trim() || content;
  }

  // Fallback for non-browser environments (basic regex stripping)
  return content.replace(/<[^>]*>/g, '').trim();
}

/**
 * Estimate token count for a string.
 * Uses ~4 characters per token approximation for English text.
 * Pure function - no side effects.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// =============================================================================
// Compression Level Utilities
// =============================================================================

/**
 * Check if current compression level meets or exceeds required level.
 * Pure function - no side effects.
 */
export function compressionLevelIncludes(
  current: CompressionLevel,
  required: CompressionLevel
): boolean {
  return (
    COMPRESSION_LEVEL_HIERARCHY.indexOf(current) >=
    COMPRESSION_LEVEL_HIERARCHY.indexOf(required)
  );
}

/**
 * Determine if a field should be expired from context.
 * Pure function - no side effects.
 */
export function shouldExpireField(
  fieldKey: string,
  compressionLevel: CompressionLevel,
  messageCount: number
): boolean {
  const config = FIELD_EXPIRATION_CONFIG[fieldKey];
  if (!config || config.permanent) return false;
  if (compressionLevel === 'none') return false;

  const meetsCompressionLevel = compressionLevelIncludes(
    compressionLevel,
    config.minimumCompressionLevel
  );
  const meetsMessageThreshold =
    messageCount >= (config.expiresAtMessage || Infinity);

  return meetsCompressionLevel && meetsMessageThreshold;
}

// =============================================================================
// Memory Context Creation
// =============================================================================

/**
 * Create memory context from character card using template.
 * Applies intelligent field expiration based on compression settings.
 * Pure function - no side effects.
 */
export function createMemoryContext(
  card: MinimalCharacterCard | null,
  template: Template | null,
  userName: string,
  compressionLevel: CompressionLevel = 'none',
  messageCount: number = 0
): MemoryContextResult {
  if (!card?.data) {
    return {
      memory: '',
      fieldBreakdown: [],
      totalTokens: 0,
      savedTokens: 0,
    };
  }

  const currentUser = userName || 'User';
  const data = card.data;

  // Define field mappings for all V2 spec fields
  const fieldMappings = [
    {
      key: 'system_prompt',
      label: 'System Prompt',
      templateVar: 'system',
      getValue: () => data.system_prompt || '',
    },
    {
      key: 'description',
      label: 'Description',
      templateVar: 'description',
      getValue: () => data.description || '',
    },
    {
      key: 'personality',
      label: 'Personality',
      templateVar: 'personality',
      getValue: () => data.personality || '',
    },
    {
      key: 'scenario',
      label: 'Scenario',
      templateVar: 'scenario',
      getValue: () => data.scenario || '',
    },
    {
      key: 'mes_example',
      label: 'Example Dialogue',
      templateVar: 'examples',
      getValue: () => data.mes_example || '',
    },
  ];

  // Process each field for inclusion/exclusion
  const fieldBreakdown: FieldTokenInfo[] = [];
  const includedVariables: Record<string, string> = { user: currentUser };
  let totalTokens = 0;
  let savedTokens = 0;

  for (const field of fieldMappings) {
    const value = field.getValue();
    const tokens = estimateTokens(value);
    const config = FIELD_EXPIRATION_CONFIG[field.key];

    const isExpired = shouldExpireField(
      field.key,
      compressionLevel,
      messageCount
    );

    if (isExpired) {
      fieldBreakdown.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        tokens,
        status: 'expired',
        expiredAtMessage: config?.expiresAtMessage ?? undefined,
      });
      savedTokens += tokens;
      includedVariables[field.templateVar] = '';
    } else {
      fieldBreakdown.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        tokens,
        status: config?.permanent ? 'permanent' : 'active',
      });
      totalTokens += tokens;
      includedVariables[field.templateVar] = value;
    }
  }

  // Build memory string using template or default format
  let memory: string;

  if (!template || !template.memoryFormat) {
    // Default memory format
    let scenario = includedVariables.scenario || '';
    scenario = scenario.replace(/\{\{user\}\}/g, currentUser);

    memory = `${includedVariables.system || ''}
Persona: ${includedVariables.description || ''}
Personality: ${includedVariables.personality || ''}
[Scenario: ${scenario}]
${includedVariables.examples || ''}
***`;
  } else {
    try {
      memory = replaceVariables(template.memoryFormat, includedVariables);
    } catch (error) {
      console.error('Error formatting memory context:', error);
      // Fallback to default format
      let scenario = includedVariables.scenario || '';
      scenario = scenario.replace(/\{\{user\}\}/g, currentUser);
      memory = `${includedVariables.system || ''}
Persona: ${includedVariables.description || ''}
Personality: ${includedVariables.personality || ''}
[Scenario: ${scenario}]
${includedVariables.examples || ''}
***`;
    }
  }

  return {
    memory: memory.trim(),
    fieldBreakdown,
    totalTokens,
    savedTokens,
  };
}

// =============================================================================
// History Formatting
// =============================================================================

/**
 * Format a single message using template.
 * Pure function - no side effects.
 */
export function formatMessage(
  message: { role: string; content: string },
  characterName: string,
  userName: string,
  template: Template | null
): string {
  const cleanContent = stripHtmlTags(message.content);
  const variables = {
    content: cleanContent,
    char: characterName,
    user: userName,
  };

  if (!template) {
    // Fallback formatting
    if (message.role === 'assistant') {
      return `${characterName}: ${cleanContent}`;
    } else if (message.role === 'system') {
      return `[System: ${cleanContent}]`;
    }
    return cleanContent;
  }

  try {
    if (message.role === 'assistant') {
      return replaceVariables(template.assistantFormat, variables);
    } else if (message.role === 'system' && template.systemFormat) {
      return replaceVariables(template.systemFormat, variables);
    }
    return replaceVariables(template.userFormat, variables);
  } catch {
    // Fallback formatting
    if (message.role === 'assistant') {
      return `${characterName}: ${cleanContent}`;
    }
    return cleanContent;
  }
}

/**
 * Format chat history into template format.
 * Filters thinking messages and uses latest edited version.
 * Pure function - no side effects.
 */
export function formatChatHistory(
  messages: ReadonlyArray<Message>,
  characterName: string,
  userName: string,
  template: Template | null
): string {
  if (!messages || messages.length === 0) return '';

  // Process each message
  const processedMessages = messages
    .filter((msg) => msg.role !== 'thinking')
    .map((msg) => {
      // Use the current variation if available
      let finalContent = msg.content;
      if (
        msg.variations &&
        msg.variations.length > 0 &&
        typeof msg.currentVariation === 'number' &&
        msg.variations[msg.currentVariation]
      ) {
        finalContent = msg.variations[msg.currentVariation];
      }

      const cleanContent = stripHtmlTags(finalContent);

      return {
        role: msg.role as 'user' | 'assistant' | 'system',
        content: cleanContent,
      };
    });

  return processedMessages
    .map((msg) => formatMessage(msg, characterName, userName, template))
    .join('\n');
}

// =============================================================================
// Stop Sequence Generation
// =============================================================================

/**
 * Get stop sequences from template or generate defaults.
 * Pure function - no side effects.
 */
export function getStopSequences(
  template: Template | null,
  characterName: string
): string[] {
  if (template?.stopSequences && template.stopSequences.length > 0) {
    // Replace {{char}} in stop sequences
    return template.stopSequences.map((seq) =>
      seq.replace(/\{\{char\}\}/g, characterName)
    );
  }

  // Default stop sequences
  return [
    '\nUser:',
    '\n{{user}}:',
    '[/INST]',
    '</s>',
  ];
}

// =============================================================================
// Main Serialization Functions
// =============================================================================

/**
 * Serialize a context snapshot to LLM-ready format.
 * This is the main entry point for context serialization.
 * Pure function - no side effects (except template service read).
 *
 * @param snapshot - The context snapshot to serialize
 * @param options - Serialization options
 * @returns Serialized context ready for LLM API
 *
 * @example
 * ```typescript
 * const serialized = serializeContext(snapshot, {
 *   template: null,
 *   templateId: 'mistral',
 *   userName: 'User',
 *   characterName: 'Character',
 *   compressionLevel: 'none',
 *   messageCount: 10,
 *   compressionCache: null,
 * });
 * ```
 */
export function serializeContext(
  snapshot: ContextSnapshot,
  options: SerializerOptions
): SerializedContext {
  const {
    template: providedTemplate,
    templateId,
    userName,
    characterName,
    compressionLevel,
    messageCount,
    compressionCache,
  } = options;

  // Resolve template
  const template = providedTemplate || getTemplate(templateId);

  // Get character card to use for memory context
  const characterCard = resolveCharacterCard(snapshot);

  // Create memory context with field expiration
  const memoryResult = createMemoryContext(
    characterCard,
    template,
    userName,
    compressionLevel,
    messageCount
  );

  // Build session notes block
  const notesBlock = snapshot.session.sessionNotes?.trim()
    ? `[Session Notes]\n${snapshot.session.sessionNotes.trim()}\n[End Session Notes]`
    : '';

  // Build compressed context block
  const compressedContext = compressionCache?.compressedText
    ? `[Previous Events Summary]\n${compressionCache.compressedText}\n[End Summary - Recent conversation follows]`
    : '';

  // Format chat history
  const history = formatChatHistory(
    snapshot.messages,
    characterName,
    userName,
    template
  );

  // Get stop sequences
  const stopSequences = getStopSequences(template, characterName);

  // Assemble final prompt
  let prompt = '';

  if (compressedContext) {
    prompt += `${compressedContext}\n\n`;
  }

  if (notesBlock) {
    prompt += `${notesBlock}\n\n`;
  }

  prompt += history;

  // Ensure non-empty prompt
  if (!prompt.trim()) {
    prompt = `${characterName}:`;
  }

  // Add ghost suffix for character modes
  if (characterCard && snapshot.mode !== 'assistant') {
    prompt += `\n${characterName}:`;
  }

  return {
    memory: memoryResult.memory,
    history,
    notesBlock,
    compressedContext,
    prompt,
    stopSequences,
    metadata: {
      mode: snapshot.mode,
      fieldBreakdown: memoryResult.fieldBreakdown,
      totalTokens: memoryResult.totalTokens,
      savedTokens: memoryResult.savedTokens,
      messageCount: snapshot.messages.length,
      compressionCacheValid: !!compressionCache?.compressedText,
    },
  };
}

/**
 * Resolve which character card to use for serialization based on mode.
 * Pure function - no side effects.
 */
export function resolveCharacterCard(
  snapshot: ContextSnapshot
): MinimalCharacterCard | null {
  switch (snapshot.mode) {
    case 'assistant':
      return null;

    case 'character':
      return snapshot.character?.card || null;

    case 'world_narrator':
      // Use world card for narration
      return snapshot.world?.card
        ? {
            spec: snapshot.world.card.spec,
            spec_version: snapshot.world.card.spec_version,
            data: snapshot.world.card.data,
          }
        : null;

    case 'npc_conversation':
      // Use conversation target's card if available, otherwise build from thin frame
      if (snapshot.conversationTarget?.card) {
        return {
          spec: snapshot.conversationTarget.card.spec,
          spec_version: snapshot.conversationTarget.card.spec_version,
          data: snapshot.conversationTarget.card.data,
        };
      }
      // Fall back to building card from thin frame
      if (snapshot.conversationTarget?.thinFrame) {
        return buildCardFromThinFrame(
          snapshot.conversationTarget.thinFrame,
          snapshot.conversationTarget.name,
          snapshot.world,
          snapshot.room
        );
      }
      return null;

    case 'npc_bonded':
      // Use bonded ally's full card
      return snapshot.bondedAlly?.card
        ? {
            spec: snapshot.bondedAlly.card.spec,
            spec_version: snapshot.bondedAlly.card.spec_version,
            data: snapshot.bondedAlly.card.data,
          }
        : null;

    case 'dual_speaker':
      // Build dual-speaker card
      if (
        snapshot.conversationTarget?.thinFrame &&
        snapshot.bondedAlly?.card
      ) {
        return buildDualSpeakerCardFromSnapshot(snapshot);
      }
      return null;

    default:
      return snapshot.character?.card || null;
  }
}

// =============================================================================
// Thin Frame Helpers
// =============================================================================

/**
 * Convert NPCThinFrame to a description string.
 * Pure function.
 */
function getThinFrameDescription(frame: NPCThinFrame): string {
  const parts: string[] = [];
  if (frame.appearance_hook) parts.push(frame.appearance_hook);
  if (frame.motivation) parts.push(`Motivated by: ${frame.motivation}`);
  return parts.join('. ');
}

/**
 * Convert NPCThinFrame to a personality string.
 * Pure function.
 */
function getThinFramePersonality(frame: NPCThinFrame): string {
  const parts: string[] = [];
  if (frame.key_traits && frame.key_traits.length > 0) {
    parts.push(frame.key_traits.join(', '));
  }
  if (frame.speaking_style) {
    parts.push(`Speaking style: ${frame.speaking_style}`);
  }
  return parts.join('. ');
}

/**
 * Build a minimal character card from thin frame data.
 * Pure function - no side effects.
 */
function buildCardFromThinFrame(
  thinFrame: NPCThinFrame,
  npcName: string,
  worldContext: WorldContext | null,
  roomContext: RoomContext | null
): MinimalCharacterCard {
  const worldName = worldContext?.name || 'this world';
  const roomName = roomContext?.name || 'this location';

  const description = getThinFrameDescription(thinFrame);
  const personality = getThinFramePersonality(thinFrame);

  const scenario = `${npcName} is a character in ${worldName}.
Location: ${roomName}

${description}`.trim();

  return createMinimalCharacterCard({
    name: npcName,
    description,
    personality,
    scenario,
  });
}

/**
 * Build a dual-speaker card from snapshot data.
 * Pure function - no side effects.
 */
function buildDualSpeakerCardFromSnapshot(
  snapshot: ContextSnapshot
): MinimalCharacterCard | null {
  if (
    !snapshot.conversationTarget?.thinFrame ||
    !snapshot.bondedAlly?.card
  ) {
    return null;
  }

  const thinFrame = snapshot.conversationTarget.thinFrame;
  const targetName = snapshot.conversationTarget.name;
  const allyCard = snapshot.bondedAlly.card;
  const worldName = snapshot.world?.name || 'this world';
  const roomName = snapshot.room?.name || 'this location';
  const allyName = allyCard.data.name || 'Companion';

  // Extract ally personality summary
  const allyPersonality = allyCard.data.personality || '';
  let allyPersonalitySummary = '';

  if (allyPersonality) {
    const sentences = allyPersonality.match(/[^.!?]+[.!?]/g);
    if (sentences && sentences.length > 0) {
      allyPersonalitySummary = sentences.slice(0, 2).join(' ').trim();
      if (allyPersonalitySummary.length > 200) {
        allyPersonalitySummary =
          allyPersonalitySummary.substring(0, 200).trim() + '...';
      }
    } else {
      allyPersonalitySummary =
        allyPersonality.length > 200
          ? allyPersonality.substring(0, 200).trim() + '...'
          : allyPersonality.trim();
    }
  }

  // Extract ally description snippet
  const allyDescription = allyCard.data.description || '';
  let allyDescSnippet = '';
  if (allyDescription) {
    const descMatch = allyDescription.match(/^[^.!?]+[.!?]/);
    allyDescSnippet = descMatch ? descMatch[0].trim() : '';
  }

  const targetDescription = getThinFrameDescription(thinFrame);
  const targetPersonality = getThinFramePersonality(thinFrame);

  // Build dual-speaker system prompt
  const dualSpeakerPrompt = `You are roleplaying a scene with two characters present. The player is speaking with ${targetName}.

PRIMARY SPEAKER - ${targetName}:
${targetDescription || `A character in ${roomName}.`}

COMPANION PRESENT - ${allyName}:
${allyDescSnippet ? allyDescSnippet + ' ' : ''}${allyPersonalitySummary || 'A companion traveling with the player.'}

DUAL-SPEAKER INSTRUCTIONS:
- Respond primarily as ${targetName} - they are the main conversation partner
- ${allyName} may occasionally interject (roughly 1 in 3-4 responses) when:
  * The topic relates to them personally
  * They have valuable input or a strong opinion
  * It would be natural for a companion to speak up
  * The situation calls for their expertise or reaction
- When ${allyName} speaks, format their dialogue as:
  [${allyName}]: "Their dialogue here" or *their action here*
- Keep ${allyName}'s interjections brief (1-2 sentences typically)
- ${allyName} should NOT dominate the conversation - ${targetName} is the focus
- Both characters should feel distinct in voice and personality

LOCATION: ${roomName} in ${worldName}`;

  return createMinimalCharacterCard({
    name: targetName,
    description: targetDescription,
    personality: targetPersonality,
    system_prompt: dualSpeakerPrompt,
  });
}
