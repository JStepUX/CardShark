/**
 * @file RoomAsCharacterContext.tsx
 * @description Adapter that wraps room data in CharacterContext interface.
 * This allows MessagesView and LoreView to work with room cards
 * without modification by providing the CharacterContext API.
 * @dependencies RoomContext, CharacterContext
 * @consumers RoomEditor (for Messages/Lore tabs)
 */
import React from 'react';
import CharacterContext from './CharacterContext';
import { useRoom } from './RoomContext';
import { CharacterCard, CharacterFile } from '../types/schema';
import { RoomCard } from '../types/room';

/**
 * Converts RoomCard to CharacterCard shape for MessagesView/LoreView compatibility.
 * Room cards already follow the character card V2 spec, so mapping is straightforward.
 */
function roomToCharacterCard(roomCard: RoomCard): CharacterCard {
    return {
        name: roomCard.data.name,
        description: roomCard.data.description,
        personality: roomCard.data.personality || '',
        scenario: roomCard.data.scenario || '',
        first_mes: roomCard.data.first_mes || '',
        mes_example: roomCard.data.mes_example || '',
        creatorcomment: '',
        avatar: 'none',
        chat: '',
        talkativeness: '0.5',
        fav: false,
        tags: roomCard.data.tags || [],
        spec: roomCard.spec,
        spec_version: roomCard.spec_version,
        data: {
            name: roomCard.data.name,
            description: roomCard.data.description,
            personality: roomCard.data.personality || '',
            scenario: roomCard.data.scenario || '',
            first_mes: roomCard.data.first_mes || '',
            mes_example: roomCard.data.mes_example || '',
            creator_notes: roomCard.data.creator_notes || '',
            system_prompt: roomCard.data.system_prompt || '',
            post_history_instructions: roomCard.data.post_history_instructions || '',
            tags: roomCard.data.tags || [],
            creator: roomCard.data.creator || '',
            character_version: roomCard.data.character_version || '',
            alternate_greetings: roomCard.data.alternate_greetings || [],
            character_uuid: roomCard.data.character_uuid || '',
            extensions: {
                talkativeness: '0.5',
                fav: false,
                world: 'Fresh',
                card_type: roomCard.data.extensions.card_type,
                depth_prompt: {
                    prompt: '',
                    depth: 4,
                    role: 'system',
                },
            },
            group_only_greetings: [],
            character_book: {
                entries: roomCard.data.character_book?.entries || [],
                name: roomCard.data.character_book?.name || '',
            },
            spec: roomCard.spec,
        },
        create_date: '',
    };
}

/**
 * Applies CharacterCard updates back to RoomCard structure.
 * Only updates the fields that MessagesView/LoreView can modify.
 */
function applyCharacterUpdatesToRoom(
    roomCard: RoomCard,
    charUpdates: Partial<CharacterCard['data']>
): RoomCard {
    return {
        ...roomCard,
        data: {
            ...roomCard.data,
            // Apply message-related updates
            first_mes: charUpdates.first_mes ?? roomCard.data.first_mes,
            alternate_greetings: charUpdates.alternate_greetings ?? roomCard.data.alternate_greetings,
            // Apply lore updates
            character_book: charUpdates.character_book ?? roomCard.data.character_book,
            // Apply any other updatable fields
            name: charUpdates.name ?? roomCard.data.name,
            description: charUpdates.description ?? roomCard.data.description,
            system_prompt: charUpdates.system_prompt ?? roomCard.data.system_prompt,
            tags: charUpdates.tags ?? roomCard.data.tags,
        },
    };
}

interface RoomAsCharacterProviderProps {
    children: React.ReactNode;
}

// Define the character gallery cache interface to match CharacterContext
interface CharacterGalleryCache {
    characters: CharacterFile[];
    directory: string;
    timestamp: number;
    isValid: boolean;
}

/**
 * Provider that wraps RoomContext data in CharacterContext interface.
 * This allows existing components like MessagesView and LoreView to work
 * with room data without modification.
 */
export function RoomAsCharacterProvider({ children }: RoomAsCharacterProviderProps) {
    const { roomData, setRoomData } = useRoom();

    // Convert room data to character card format
    const characterData = roomData ? roomToCharacterCard(roomData) : null;

    // Create a setter that converts character updates back to room format
    const setCharacterData: React.Dispatch<React.SetStateAction<CharacterCard | null>> = (action) => {
        setRoomData((prevRoom) => {
            if (!prevRoom) return prevRoom;

            // Handle both function and direct value updates
            const newCharData = typeof action === 'function'
                ? action(roomToCharacterCard(prevRoom))
                : action;

            if (!newCharData) return prevRoom;

            // Apply the character updates to the room
            return applyCharacterUpdatesToRoom(prevRoom, newCharData.data);
        });
    };

    // Stub values for unused CharacterContext fields
    const [imageUrl, setImageUrl] = React.useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [isNewlyCreated, setIsNewlyCreated] = React.useState(false);
    const [characterCache, setCharacterCache] = React.useState<CharacterGalleryCache | null>(null);

    // No-op for room context - rooms don't use this
    const createNewCharacter = (_name: string) => {
        console.warn('createNewCharacter called in RoomAsCharacterContext - this is a no-op');
    };

    const invalidateCharacterCache = () => {
        setCharacterCache(null);
    };

    // No-op stubs for room context - rooms don't use these CharacterContext features
    const saveCharacter = async () => {
        console.warn('saveCharacter called in RoomAsCharacterContext - this is a no-op');
        return;
    };

    const handleImageChange = async (_newImageData: string | File): Promise<void> => {
        console.warn('handleImageChange called in RoomAsCharacterContext - this is a no-op');
    };

    const contextValue = {
        characterData,
        setCharacterData,
        imageUrl,
        setImageUrl,
        isLoading,
        setIsLoading,
        error,
        setError,
        createNewCharacter,
        isNewlyCreated,
        setIsNewlyCreated,
        characterCache,
        setCharacterCache,
        invalidateCharacterCache,
        saveCharacter,
        handleImageChange,
    };

    return (
        <CharacterContext.Provider value={contextValue}>
            {children}
        </CharacterContext.Provider>
    );
}

export default RoomAsCharacterProvider;
