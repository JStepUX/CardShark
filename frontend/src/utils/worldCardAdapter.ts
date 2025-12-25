/**
 * @file worldCardAdapter.ts
 * @description Utilities for adapting world card data for chat generation
 * Dynamically updates character card scenario to reflect current room location
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
