import { BackyardData } from '../types/backyard';
import { CharacterCard, createEmptyCharacterCard } from '../types/schema';

export class BackyardHandler {
  public convertToV2(backyardData: BackyardData): CharacterCard {
    const { character } = backyardData;
    const card = createEmptyCharacterCard();  // This gives us proper V2 structure

    // Simple field-to-field mapping
    card.data.name = character.aiName || character.aiDisplayName || '';
    card.data.description = character.aiPersona || '';
    card.data.scenario = character.scenario || '';
    card.data.first_mes = character.firstMessage || '';
    card.data.mes_example = character.customDialogue || '';
    card.data.system_prompt = character.basePrompt || '';

    return card;
  }
}