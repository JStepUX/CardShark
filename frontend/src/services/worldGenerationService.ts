/**
 * @file worldGenerationService.ts
 * @description Routes world-play LLM generations (NPC greetings, post-combat narrative)
 * through the main /api/generate pipeline so they benefit from:
 * - LogitShaper word-ban tracking (via chat_session_uuid + generation_type)
 * - Journal / session notes injection
 * - Generation settings defaults (sampler settings)
 * - KoboldCPP story-mode prompt building
 * - AbortController support
 *
 * Replaces raw fetch('/api/generate-greeting') calls in useNPCInteraction and useCombatManager.
 */

import type { CharacterCard } from '../types/schema';
import type { GenerationSettings } from '../types/api';
import { DEFAULT_GENERATION_SETTINGS } from '../types/api';
import { PromptHandler } from '../handlers/promptHandler';
import { dispatchScrollToBottom } from '../hooks/useScrollToBottom';
import { removeIncompleteSentences } from '../utils/contentProcessing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorldGenerationParams {
  /** The NPC/narrator character card (thin context or full card) */
  characterData: CharacterCard;

  /** API configuration (deep-cloned internally) */
  apiConfig: Record<string, unknown>;

  /** System instruction for the LLM (greeting instruction or combat prompt) */
  systemInstruction: string;

  /** Character name for ghost suffix / stop sequences */
  characterName: string;

  /** User display name — used for stop sequences */
  userName: string;

  /** Chat session UUID — enables LogitShaper tracking */
  chatSessionUuid?: string;

  /** Session notes (Journal) — injected in strongest prompt position */
  sessionNotes?: string;

  /** LogitShaper generation type label */
  generationType: 'greeting' | 'combat_narrative';
}

export interface StreamToMessageOptions {
  /** The fetch Response to stream from */
  response: Response;

  /** Message ID to update in place */
  messageId: string;

  /** Character name for ghost-suffix stripping */
  characterName?: string;

  /** Updater for the messages array */
  setMessages: (updater: (prev: any[]) => any[]) => void;

  /** Fallback text if generation produces nothing */
  fallbackText: string;

  /** AbortSignal to stop streaming */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// NPC Greeting Instruction (relocated from backend generation_endpoints.py:130)
// ---------------------------------------------------------------------------

/**
 * Build the system instruction for an NPC greeting.
 * Equivalent to the backend's default greeting instruction, but resolved on
 * the frontend so we can route through /api/generate instead.
 */
export function buildNPCGreetingInstruction(characterName: string): string {
  return (
    `#Generate an alternate first message for ${characterName}. ` +
    `##Only requirements: ` +
    `- Establish the world: Where are we? What does it feel like here? ` +
    `- Establish ${characterName}'s presence (not bio): How do they occupy this space? ` +
    `Everything else (tone, structure, acknowledging/ignoring {{user}}, dialogue/action/interiority, length) is your choice. ` +
    `##Choose what best serves this character in this moment. ` +
    `##Goal: Create a scene unique to ${characterName} speaking only for ${characterName}`
  );
}

// ---------------------------------------------------------------------------
// executeWorldGeneration
// ---------------------------------------------------------------------------

/**
 * Construct a proper payload and POST to /api/generate.
 *
 * The backend's stream_generate() then handles:
 * - Memory building from character_data via lore_handler.build_memory()
 * - system_instruction prepended to memory (or folded for KoboldCPP)
 * - LogitShaper activated by chat_session_uuid
 * - KoboldCPP story-mode: fold_system_instruction + build_story_stop_sequences
 *
 * @returns The fetch Response + AbortController for cancellation.
 */
export async function executeWorldGeneration(
  params: WorldGenerationParams
): Promise<{ response: Response; abortController: AbortController }> {
  const {
    characterData,
    apiConfig,
    systemInstruction,
    characterName,
    userName,
    chatSessionUuid,
    sessionNotes,
    generationType,
  } = params;

  const abortController = new AbortController();

  // Deep-clone apiConfig so we don't mutate the caller's object
  const clonedConfig = JSON.parse(JSON.stringify(apiConfig));

  // Ensure generation_settings has defaults
  const genSettings: GenerationSettings = {
    ...DEFAULT_GENERATION_SETTINGS,
    ...(clonedConfig.generation_settings || {}),
  };
  clonedConfig.generation_settings = genSettings;

  // Thread generation type for LogitShaper
  clonedConfig._generation_type = generationType;

  // Build the prompt: [Session Notes] + ghost suffix
  let prompt = '';
  if (sessionNotes?.trim()) {
    const resolvedNotes = sessionNotes
      .replace(/\{\{char\}\}/gi, characterName)
      .replace(/\{\{user\}\}/gi, userName);
    prompt += `[Session Notes]\n${resolvedNotes}\n[End Session Notes]\n`;
  }
  // Ghost suffix — nudges the model to respond as the character
  prompt += `\n${characterName}:`;

  // Build essential character data (same structure as generateChatResponse)
  const essentialCharacterData = {
    spec: characterData.spec,
    spec_version: characterData.spec_version,
    data: {
      name: characterData.data.name,
      description: characterData.data.description,
      personality: characterData.data.personality,
      scenario: characterData.data.scenario,
      first_mes: characterData.data.first_mes,
      mes_example: characterData.data.mes_example,
      system_prompt: characterData.data.system_prompt,
      post_history_instructions: characterData.data.post_history_instructions,
      character_uuid: characterData.data.character_uuid,
      tags: characterData.data.tags,
      creator: characterData.data.creator,
      character_version: characterData.data.character_version,
    },
  };

  // Standard stop sequences
  const stopSequences = [
    `\n${userName}:`,
    '\nUser:',
    '\nAssistant:',
  ];

  const payload = {
    api_config: clonedConfig,
    generation_params: {
      ...genSettings,
      system_instruction: systemInstruction,
      prompt,
      character_data: essentialCharacterData,
      chat_session_uuid: chatSessionUuid || '',
      generation_type: generationType,
      user_name: userName,
      stop_sequence: stopSequences,
      chat_history: [],
      quiet: true,
    },
  };

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: abortController.signal,
  });

  return { response, abortController };
}

// ---------------------------------------------------------------------------
// streamToMessage — shared buffered streaming (deduplicates inline code)
// ---------------------------------------------------------------------------

/**
 * Stream an LLM response into an existing message by ID, using 50ms buffered updates.
 * Deduplicates the identical streaming buffer code from useNPCInteraction and useCombatManager.
 *
 * @returns The final generated text (after removeIncompleteSentences)
 */
export async function streamToMessage(options: StreamToMessageOptions): Promise<string> {
  const {
    response,
    messageId,
    characterName,
    setMessages,
    fallbackText,
    signal,
  } = options;

  const BUFFER_INTERVAL = 50;
  let generatedText = '';
  let buffer = '';
  let bufTimer: ReturnType<typeof setTimeout> | null = null;

  const flushBuffer = () => {
    const curBuf = buffer;
    buffer = '';
    generatedText += curBuf;

    setMessages((prev: any[]) =>
      prev.map((msg: any) =>
        msg.id === messageId ? { ...msg, content: generatedText } : msg
      )
    );
    dispatchScrollToBottom();
  };

  const scheduleFlush = (chunk: string, isFinal = false) => {
    buffer += chunk;
    if (bufTimer) clearTimeout(bufTimer);
    bufTimer = setTimeout(flushBuffer, isFinal ? 0 : BUFFER_INTERVAL);
  };

  try {
    for await (const chunk of PromptHandler.streamResponse(response, characterName)) {
      if (signal?.aborted) break;
      scheduleFlush(chunk);
    }

    // Flush remaining buffer
    if (buffer.length > 0) {
      scheduleFlush('', true);
      // Wait for the final setTimeout(0) to execute
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Final cleanup: remove incomplete sentences, apply fallback
    const finalText = removeIncompleteSentences(generatedText.trim()) || fallbackText;

    setMessages((prev: any[]) =>
      prev.map((msg: any) =>
        msg.id === messageId ? { ...msg, content: finalText } : msg
      )
    );

    return finalText;
  } catch (err) {
    // On abort, don't treat as error — just finalize what we have
    if (signal?.aborted) {
      const finalText = generatedText.trim() || fallbackText;
      setMessages((prev: any[]) =>
        prev.map((msg: any) =>
          msg.id === messageId ? { ...msg, content: finalText } : msg
        )
      );
      return finalText;
    }
    throw err;
  }
}
