/**
 * @file worldCardAdapter.ts
 * @description Utilities for adapting world card data for chat generation
 * Dynamically updates character card scenario to reflect current room location
 * and optionally injects NPC character context
 */

import { CharacterCard } from '../types/schema';
import { GridRoom } from './worldStateApi';

/**
 * Minimal NPC data for room awareness context.
 * Used to give bonded allies awareness of other entities in the room.
 */
export interface RoomAwarenessNPC {
    id: string;
    name: string;
    personality?: string;
    hostile?: boolean;
    role?: string;
    isIncapacitated?: boolean;
    isDead?: boolean;
}

/**
 * Creates a modified CharacterCard with current room information injected into the scenario.
 *
 * This is used during World Play to provide location context to the LLM.
 * The room description and introduction text are prepended to the world's scenario.
 *
 * @param worldCard - The world's character card (loaded as base character)
 * @param currentRoom - The player's current room (from GridWorldState)
 * @returns A cloned CharacterCard with modified scenario field
 *
 * @example
 * const modifiedCard = injectRoomContext(worldCard, currentRoom);
 * setCharacterDataOverride(modifiedCard);
 * // LLM now receives: "You are at the Tavern. [room description] [original scenario]"
 *
 * @see injectNPCContext - Use this instead when an NPC is the active responder
 */
export function injectRoomContext(
    worldCard: CharacterCard,
    currentRoom: GridRoom | null
): CharacterCard {
    if (!currentRoom) {
        return worldCard;
    }

    // Defensive check: ensure worldCard.data exists
    if (!worldCard.data) {
        console.error('injectRoomContext: worldCard.data is undefined');
        return worldCard;
    }

    // Clone the character card to avoid mutating the original
    const modifiedCard: CharacterCard = JSON.parse(JSON.stringify(worldCard));

    // Build the current location context
    const locationContext = `
You are at the ${currentRoom.name} associated with ${worldCard.data.name || 'this world'}. ${currentRoom.description || ''}

${currentRoom.introduction_text || ''}
`.trim();

    // Inject the current location into the scenario
    // This will be included in the memory context sent to the LLM
    const originalScenario = worldCard.data.scenario || '';

    // Replace or prepend the location context
    modifiedCard.data.scenario = `${locationContext}\n\n${originalScenario}`;

    return modifiedCard;
}

/**
 * Builds a "room awareness" section describing other NPCs/entities present in the area.
 *
 * This is used to give bonded allies awareness of merchants, guards, enemies, etc.
 * in the current room so they can reference them in conversation.
 *
 * @param roomNpcs - Array of NPCs in the room (from WorldPlayView's roomNpcs state)
 * @param excludeNpcId - NPC ID to exclude from the list (typically the bonded ally itself)
 * @returns A formatted string section, or empty string if no NPCs to list
 *
 * @example
 * const awareness = buildRoomAwarenessSection(roomNpcs, bondedAllyId);
 * // Returns:
 * // "OTHERS PRESENT IN THIS AREA:
 * // - Marcus the Merchant - A gruff shopkeeper (neutral, shopkeeper)
 * // - Goblin Scout - A small sneaky creature (hostile)
 * // - Town Guard - An armored soldier (friendly, guard)"
 */
export function buildRoomAwarenessSection(
    roomNpcs: RoomAwarenessNPC[],
    excludeNpcId?: string
): string {
    // Filter out the excluded NPC (bonded ally) and dead NPCs
    const visibleNpcs = roomNpcs.filter(npc =>
        npc.id !== excludeNpcId && !npc.isDead
    );

    if (visibleNpcs.length === 0) {
        return '';
    }

    const npcDescriptions = visibleNpcs.map(npc => {
        // Build brief personality snippet (first sentence, max 80 chars)
        let briefDesc = '';
        if (npc.personality) {
            const firstSentence = npc.personality.match(/^[^.!?]+[.!?]/);
            if (firstSentence && firstSentence[0].length <= 80) {
                briefDesc = firstSentence[0].trim();
            } else {
                briefDesc = npc.personality.length > 80
                    ? npc.personality.substring(0, 77).trim() + '...'
                    : npc.personality.trim();
            }
        }

        // Determine status label
        let status: string;
        if (npc.isIncapacitated) {
            status = 'incapacitated';
        } else if (npc.hostile) {
            status = 'hostile';
        } else {
            status = 'friendly';
        }

        // Build the description line
        const parts: string[] = [`- ${npc.name}`];
        if (briefDesc) {
            parts.push(`- ${briefDesc}`);
        }

        // Build status/role suffix
        const suffixParts: string[] = [status];
        if (npc.role) {
            suffixParts.push(npc.role);
        }
        parts.push(`(${suffixParts.join(', ')})`);

        return parts.join(' ');
    });

    return `\n[OTHERS PRESENT IN THIS AREA]
${npcDescriptions.join('\n')}`;
}

/**
 * Creates a modified CharacterCard for NPC conversation mode.
 *
 * Injects room, world, and NPC context for proper conversation.
 * Use this when an NPC is summoned and should respond instead of the world narrator.
 *
 * Context assembly stack:
 * 1. world.system_prompt (in scenario)
 * 2. room.system_prompt (in scenario)
 * 3. character.system_prompt (preserved)
 * 4. room.description (in scenario)
 * 5. character.description (preserved)
 * 6. room awareness - other NPCs/enemies present (optional)
 * 7. conversation history (handled by chat system)
 *
 * @param npcCard - The NPC's full character card data
 * @param worldCard - The world's character card for world-level context (optional)
 * @param currentRoom - The room where the conversation takes place (optional)
 * @param roomNpcs - Optional array of NPCs in the room for awareness context
 * @returns A cloned CharacterCard with combined context in scenario field
 *
 * @example
 * const modifiedNpcCard = injectNPCContext(npcCard, worldCard, currentRoom, roomNpcs);
 * setCharacterDataOverride(modifiedNpcCard);
 * // LLM responds as the NPC with full world/room awareness
 * // NPC is aware of "Marcus the Merchant (neutral)" and "Goblin Scout (hostile)"
 *
 * @see injectRoomContext - Use this when in room/narrator mode (no specific NPC)
 * @see buildRoomAwarenessSection - Helper that builds the room awareness text
 */
export function injectNPCContext(
    npcCard: CharacterCard,
    worldCard: CharacterCard | null,
    currentRoom: GridRoom | null,
    roomNpcs?: RoomAwarenessNPC[]
): CharacterCard {
    // Defensive check: ensure npcCard.data exists
    if (!npcCard.data) {
        console.error('injectNPCContext: npcCard.data is undefined');
        return npcCard;
    }

    // Clone the NPC card to avoid mutating the original
    const modifiedCard: CharacterCard = JSON.parse(JSON.stringify(npcCard));

    // Strip fields that conflict with World Play context
    // In World Play mode, the world/room provide scenario and system prompt
    // NPCs only contribute: personality, description, dialogue examples
    modifiedCard.data.first_mes = '';              // Pre-written greeting (location-specific)
    modifiedCard.data.alternate_greetings = [];    // Alternative greetings (location-specific)
    modifiedCard.data.scenario = '';               // Original situation context (conflicts with room)
    modifiedCard.data.system_prompt = '';          // System-level instructions (world provides this)

    // Build comprehensive context from world and room only
    const contextParts: string[] = [];

    // World context (system prompt and scenario)
    if (worldCard && worldCard.data) {
        if (worldCard.data.system_prompt) {
            contextParts.push(`[World Context: ${worldCard.data.name || 'Unknown World'}]`);
            contextParts.push(worldCard.data.system_prompt);
        }
    }

    // Room context (location, description, introduction)
    if (currentRoom) {
        contextParts.push(`\n[Current Location: ${currentRoom.name}]`);
        if (currentRoom.description) {
            contextParts.push(currentRoom.description);
        }
        if (currentRoom.introduction_text) {
            contextParts.push(currentRoom.introduction_text);
        }
    }

    // Room awareness - other NPCs/enemies present (for bonded ally awareness)
    // This allows the ally to reference merchants, guards, enemies, etc. in conversation
    if (roomNpcs && roomNpcs.length > 0) {
        const npcId = npcCard.data.character_uuid || npcCard.data.name;
        const awarenessSection = buildRoomAwarenessSection(roomNpcs, npcId);
        if (awarenessSection) {
            contextParts.push(awarenessSection);
        }
    }

    // Set the combined world + room context as the scenario
    // NPC's personality and description are preserved automatically
    const combinedContext = contextParts.join('\n');
    modifiedCard.data.scenario = combinedContext;

    return modifiedCard;
}

/**
 * Creates a minimal CharacterCard for "thin context" NPC conversations.
 *
 * Use this for talking to NPCs WITHOUT bonding them. This provides just enough
 * context for a meaningful conversation without the full character card injection
 * that bonding provides.
 *
 * Thin context includes:
 * - NPC name
 * - Brief personality snippet (first sentence or first 100 chars of personality)
 * - Current room location
 * - World name for setting context
 *
 * This is much lighter than injectNPCContext() and is appropriate for:
 * - Merchant NPCs (talk to buy/sell, no need to bond)
 * - Brief interactions with background NPCs
 * - Any conversation where you don't want to "summon" the NPC as an ally
 *
 * @param npcCard - The NPC's character card (used for name and personality snippet)
 * @param worldCard - The world's character card (for world name/context)
 * @param currentRoom - The current room (for location context)
 * @returns A minimal CharacterCard suitable for thin context conversation
 *
 * @example
 * const thinCard = buildThinNPCContext(npcCard, worldCard, currentRoom);
 * setCharacterDataOverride(thinCard);
 * // LLM receives: "You are speaking with Grok, a gruff tavern keeper.
 * //               You are in the Rusty Anchor Tavern in the world of Eldoria."
 *
 * @see injectNPCContext - Use for full bonded ally context (heavy)
 * @see injectRoomContext - Use for room narrator mode (no specific NPC)
 */
export function buildThinNPCContext(
    npcCard: CharacterCard,
    worldCard: CharacterCard | null,
    currentRoom: GridRoom | null
): CharacterCard {
    // Defensive check: ensure npcCard.data exists
    if (!npcCard.data) {
        console.error('buildThinNPCContext: npcCard.data is undefined');
        return npcCard;
    }

    // Clone the NPC card to avoid mutating the original
    const modifiedCard: CharacterCard = JSON.parse(JSON.stringify(npcCard));

    // Extract a brief personality snippet (first sentence or first 100 chars)
    const fullPersonality = npcCard.data.personality || '';
    let personalitySnippet = '';

    if (fullPersonality) {
        // Try to get first sentence
        const firstSentenceMatch = fullPersonality.match(/^[^.!?]+[.!?]/);
        if (firstSentenceMatch && firstSentenceMatch[0].length <= 150) {
            personalitySnippet = firstSentenceMatch[0].trim();
        } else {
            // Fall back to first 100 chars with ellipsis
            personalitySnippet = fullPersonality.length > 100
                ? fullPersonality.substring(0, 100).trim() + '...'
                : fullPersonality.trim();
        }
    }

    // Build thin context scenario
    const npcName = npcCard.data.name || 'an unknown person';
    const worldName = worldCard?.data?.name || 'this world';
    const roomName = currentRoom?.name || 'an unknown location';

    // Build the thin context string
    const contextParts: string[] = [];

    // Core identity line
    if (personalitySnippet) {
        contextParts.push(`You are speaking with ${npcName}, ${personalitySnippet.toLowerCase().startsWith(npcName.toLowerCase()) ? personalitySnippet : personalitySnippet}`);
    } else {
        contextParts.push(`You are speaking with ${npcName}.`);
    }

    // Location context
    contextParts.push(`You are in ${roomName} in the world of ${worldName}.`);

    // Optional: Add brief room description if available (just the first sentence)
    if (currentRoom?.description) {
        const roomDescSnippet = currentRoom.description.match(/^[^.!?]+[.!?]/);
        if (roomDescSnippet) {
            contextParts.push(roomDescSnippet[0].trim());
        }
    }

    // Strip heavy fields for thin context
    // We keep: name, basic personality snippet in scenario
    // We strip: full personality, description, system_prompt, first_mes, etc.
    modifiedCard.data.first_mes = '';
    modifiedCard.data.alternate_greetings = [];
    modifiedCard.data.scenario = contextParts.join(' ');
    modifiedCard.data.system_prompt = '';
    modifiedCard.data.mes_example = '';
    modifiedCard.data.post_history_instructions = '';

    // Keep personality but make it brief
    modifiedCard.data.personality = personalitySnippet;

    // Keep description but make it brief (first sentence only)
    if (npcCard.data.description) {
        const descSnippet = npcCard.data.description.match(/^[^.!?]+[.!?]/);
        modifiedCard.data.description = descSnippet ? descSnippet[0].trim() : '';
    }

    // Clear character book for thin context (no lore injection)
    modifiedCard.data.character_book = null as unknown as typeof modifiedCard.data.character_book;

    return modifiedCard;
}

/**
 * Creates a CharacterCard for dual-speaker conversations where a bonded ally
 * can occasionally interject while the player talks to another NPC.
 *
 * This is used when:
 * 1. Player is talking to a conversation target (non-bonded NPC)
 * 2. Player has a bonded ally who follows them
 *
 * The LLM is instructed to:
 * - Respond primarily as the target NPC
 * - Occasionally have the ally interject (~20-30% of responses)
 * - Format ally speech with [AllyName]: prefix
 *
 * @param targetNpcCard - The NPC being talked to (primary speaker, thin context)
 * @param allyNpcCard - The bonded ally (can interject, personality context)
 * @param worldCard - The world's character card (for world-level context)
 * @param currentRoom - The current room (for location context)
 * @returns A CharacterCard with dual-speaker system prompt
 *
 * @example
 * // Player is talking to Marcus (merchant) while Aria (bonded ally) is present
 * const dualCard = buildDualSpeakerContext(marcusCard, ariaCard, worldCard, currentRoom);
 * setCharacterDataOverride(dualCard);
 * // LLM might respond:
 * // "These potions are 50 gold each," Marcus says, gesturing to the shelf.
 * //
 * // [Aria]: *whispers to you* "That's overpriced. Try haggling."
 *
 * @see buildThinNPCContext - Use when no bonded ally is present
 * @see injectNPCContext - Use for full bonded ally context (when ally IS the conversation target)
 */
export function buildDualSpeakerContext(
    targetNpcCard: CharacterCard,
    allyNpcCard: CharacterCard,
    worldCard: CharacterCard | null,
    currentRoom: GridRoom | null
): CharacterCard {
    // Defensive checks
    if (!targetNpcCard.data) {
        console.error('buildDualSpeakerContext: targetNpcCard.data is undefined');
        return targetNpcCard;
    }
    if (!allyNpcCard.data) {
        console.error('buildDualSpeakerContext: allyNpcCard.data is undefined');
        return buildThinNPCContext(targetNpcCard, worldCard, currentRoom);
    }

    // Start with thin context for the target NPC
    const modifiedCard = buildThinNPCContext(targetNpcCard, worldCard, currentRoom);

    // Extract ally personality summary (first 2 sentences or 200 chars)
    const allyName = allyNpcCard.data.name || 'Companion';
    const allyPersonality = allyNpcCard.data.personality || '';
    let allyPersonalitySummary = '';

    if (allyPersonality) {
        // Try to get first two sentences
        const sentences = allyPersonality.match(/[^.!?]+[.!?]/g);
        if (sentences && sentences.length > 0) {
            allyPersonalitySummary = sentences.slice(0, 2).join(' ').trim();
            if (allyPersonalitySummary.length > 200) {
                allyPersonalitySummary = allyPersonalitySummary.substring(0, 200).trim() + '...';
            }
        } else {
            allyPersonalitySummary = allyPersonality.length > 200
                ? allyPersonality.substring(0, 200).trim() + '...'
                : allyPersonality.trim();
        }
    }

    // Extract ally description snippet
    const allyDescription = allyNpcCard.data.description || '';
    let allyDescSnippet = '';
    if (allyDescription) {
        const descMatch = allyDescription.match(/^[^.!?]+[.!?]/);
        allyDescSnippet = descMatch ? descMatch[0].trim() : '';
    }

    // Build the dual-speaker system prompt
    const targetName = targetNpcCard.data.name || 'the NPC';
    const worldName = worldCard?.data?.name || 'this world';
    const roomName = currentRoom?.name || 'this location';

    const dualSpeakerPrompt = `You are roleplaying a scene with two characters present. The player is speaking with ${targetName}.

PRIMARY SPEAKER - ${targetName}:
${modifiedCard.data.scenario || `A character in ${roomName}.`}

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

    // Set the dual-speaker prompt as the system prompt
    modifiedCard.data.system_prompt = dualSpeakerPrompt;

    // Clear the scenario since we've incorporated everything into system_prompt
    modifiedCard.data.scenario = '';

    return modifiedCard;
}
