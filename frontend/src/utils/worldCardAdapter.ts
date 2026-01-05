/**
 * @file worldCardAdapter.ts
 * @description Utilities for adapting world card data for chat generation
 * Dynamically updates character card scenario to reflect current room location
 * and optionally injects NPC character context
 */

import { CharacterCard } from '../types/schema';
import { GridRoom } from './worldStateApi';

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

    // Clone the character card to avoid mutating the original
    const modifiedCard: CharacterCard = JSON.parse(JSON.stringify(worldCard));

    // Build the current location context
    const locationContext = `
You are at the ${currentRoom.name} associated with ${worldCard.data.name}. ${currentRoom.description || ''}

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
 * 6. conversation history (handled by chat system)
 *
 * @param npcCard - The NPC's full character card data
 * @param worldCard - The world's character card for world-level context (optional)
 * @param currentRoom - The room where the conversation takes place (optional)
 * @returns A cloned CharacterCard with combined context in scenario field
 *
 * @example
 * const modifiedNpcCard = injectNPCContext(npcCard, worldCard, currentRoom);
 * setCharacterDataOverride(modifiedNpcCard);
 * // LLM responds as the NPC with full world/room awareness
 *
 * @see injectRoomContext - Use this when in room/narrator mode (no specific NPC)
 */
export function injectNPCContext(
    npcCard: CharacterCard,
    worldCard: CharacterCard | null,
    currentRoom: GridRoom | null
): CharacterCard {
    // Clone the NPC card to avoid mutating the original
    const modifiedCard: CharacterCard = JSON.parse(JSON.stringify(npcCard));

    // Strip fields that conflict with World Play context
    // In World Play mode, the world/room provide scenario and system prompt
    // NPCs only contribute: personality, description, dialogue examples
    delete modifiedCard.data.first_mes;        // Pre-written greeting (location-specific)
    delete modifiedCard.data.alt_greetings;    // Alternative greetings (location-specific)
    delete modifiedCard.data.scenario;         // Original situation context (conflicts with room)
    delete modifiedCard.data.system_prompt;    // System-level instructions (world provides this)

    // Build comprehensive context from world and room only
    const contextParts: string[] = [];

    // World context (system prompt and scenario)
    if (worldCard) {
        if (worldCard.data.system_prompt) {
            contextParts.push(`[World Context: ${worldCard.data.name}]`);
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

    // Set the combined world + room context as the scenario
    // NPC's personality and description are preserved automatically
    const combinedContext = contextParts.join('\n');
    modifiedCard.data.scenario = combinedContext;

    return modifiedCard;
}
