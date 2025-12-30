/**
 * @file worldCardAdapter.ts
 * @description Utilities for adapting world card data for chat generation
 * Dynamically updates character card scenario to reflect current room location
 * and optionally injects NPC character context
 */

import { CharacterCard } from '../types/schema';
import { GridRoom } from './worldStateApi';

/**
 * Creates a modified character card with current room information injected
 * This ensures the LLM knows the player's current location in the world
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
 * Creates a modified character card for NPC conversation mode
 * Injects room, world, and NPC context for proper conversation
 *
 * Context assembly stack:
 * 1. world.system_prompt (in scenario)
 * 2. room.system_prompt (in scenario)
 * 3. character.system_prompt (preserved)
 * 4. room.description (in scenario)
 * 5. character.description (preserved)
 * 6. conversation history (handled by chat system)
 */
export function injectNPCContext(
    npcCard: CharacterCard,
    worldCard: CharacterCard | null,
    currentRoom: GridRoom | null
): CharacterCard {
    // Clone the NPC card to avoid mutating the original
    const modifiedCard: CharacterCard = JSON.parse(JSON.stringify(npcCard));

    // Build comprehensive context from world, room, and NPC
    const contextParts: string[] = [];

    // World context
    if (worldCard) {
        if (worldCard.data.system_prompt) {
            contextParts.push(`[World Context: ${worldCard.data.name}]`);
            contextParts.push(worldCard.data.system_prompt);
        }
    }

    // Room context
    if (currentRoom) {
        contextParts.push(`\n[Current Location: ${currentRoom.name}]`);
        if (currentRoom.description) {
            contextParts.push(currentRoom.description);
        }
        if (currentRoom.introduction_text) {
            contextParts.push(currentRoom.introduction_text);
        }
    }

    // Combine with NPC's original scenario
    const originalScenario = npcCard.data.scenario || '';
    const combinedContext = contextParts.join('\n');

    modifiedCard.data.scenario = `${combinedContext}\n\n${originalScenario}`;

    return modifiedCard;
}
