import {
    LoreEntry,
    CharacterBook,
    CharacterCard,
    createEmptyCharacterCard
} from '../types/schema';

// Create character book structure
function createCharacterBook(entries: LoreEntry[]): CharacterBook {
    return {
        entries: entries, // Now directly use array
        name: 'Fresh',
    };
}

// Export lore entries to JSON file
export function exportLoreToJson(entries: LoreEntry[], filename?: string): void {
    try {
        if (!entries.length) {
            console.warn('No entries to export');
            return;
        }

        const characterBook = createCharacterBook(entries);
        const data = JSON.stringify(characterBook, null, 2);

        // Create and trigger download
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = filename || 'lore-export.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export failed:', error);
        throw new Error(`Failed to export JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Export entries as character card
export async function exportToCharacterCard(
    entries: LoreEntry[],
    characterData?: Partial<CharacterCard>
): Promise<CharacterCard> {
    try {
        // Start with empty card and merge provided data
        const card: CharacterCard = createEmptyCharacterCard();

        // Merge characterData into the empty card
        Object.assign(card, characterData);

        // Update the character book with the provided entries
        card.data.character_book = createCharacterBook(entries);

        return card;
    } catch (error) {
        console.error('Character card export failed:', error);
        throw new Error(`Failed to create character card: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Save character card to PNG
export async function saveCharacterCardToPng(
    card: CharacterCard,
    imageBlob: Blob,
    directory?: string
): Promise<Blob> {
    try {
        const formData = new FormData();
        formData.append('file', imageBlob);
        formData.append('metadata', JSON.stringify(card));

        if (directory) {
            formData.append('save_directory', directory);
        }

        const response = await fetch('/api/save-png', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to save PNG');
        }

        return await response.blob();
    } catch (error) {
        console.error('PNG save failed:', error);
        throw new Error(`Failed to save PNG: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}