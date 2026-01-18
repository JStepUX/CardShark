import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { getApiBaseUrl } from '../../utils/apiConfig';

interface ChatHistoryItem {
    chat_session_uuid: string;
    title: string | null;
    message_count: number;
    last_message_time: string | null;
    start_time: string;
    character_uuid: string;
    character_name: string | null;
    character_thumbnail: string | null;
}

interface CharacterInfo {
    name: string;
    character_uuid: string;
    png_file_path: string;
    card_type?: string;
    extensions?: {
        card_type?: string;
    };
}

interface CharacterAssignDialogProps {
    isOpen: boolean;
    onClose: () => void;
    chatItem: ChatHistoryItem;
    onAssignComplete: (updatedItem: ChatHistoryItem) => void;
}

/**
 * CharacterAssignDialog - Modal for reassigning a chat to a different character
 * Shows a simple grid of characters to select from
 */
const CharacterAssignDialog: React.FC<CharacterAssignDialogProps> = ({
    isOpen,
    onClose,
    chatItem,
    onAssignComplete
}) => {
    const [characters, setCharacters] = useState<CharacterInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [assigning, setAssigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Load characters list (excluding World/Room cards)
    const loadCharacters = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/characters`);
            if (!response.ok) throw new Error('Failed to load characters');
            const data = await response.json();
            const charList = data.characters || data.data || [];
            // Filter out World and Room cards - only show regular characters
            const filteredList = charList.filter((char: CharacterInfo) => {
                const cardType = char.card_type || char.extensions?.card_type || 'character';
                return cardType === 'character';
            });
            // Sort alphabetically by name
            filteredList.sort((a: CharacterInfo, b: CharacterInfo) =>
                a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            );
            setCharacters(filteredList);
        } catch (err) {
            console.error('Failed to load characters:', err);
            setError('Failed to load characters');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadCharacters();
        }
    }, [isOpen, loadCharacters]);

    // Get character thumbnail URL - prefer UUID-based endpoint for reliability
    const getThumbnailUrl = (character: CharacterInfo): string => {
        const baseUrl = getApiBaseUrl();
        // Prefer UUID-based image loading (more reliable)
        if (character.character_uuid) {
            return `${baseUrl}/api/character-image/${character.character_uuid}`;
        }
        // Fallback to path-based if no UUID
        if (character.png_file_path) {
            const encodedPath = encodeURIComponent(character.png_file_path.replace(/\\/g, '/'));
            return `${baseUrl}/api/character-image/${encodedPath}`;
        }
        return '';
    };

    // Handle character selection
    const handleCharacterSelect = async (character: CharacterInfo) => {
        // Don't allow assigning to the same character
        if (character.character_uuid === chatItem.character_uuid) {
            return;
        }

        setAssigning(true);
        try {
            const response = await apiService.reassignChat(
                chatItem.chat_session_uuid,
                character.character_uuid
            );

            if (response?.data) {
                onAssignComplete(response.data);
            }
        } catch (err) {
            console.error('Failed to reassign chat:', err);
            setError('Failed to reassign chat');
        } finally {
            setAssigning(false);
        }
    };

    // Filter characters by search query
    const filteredCharacters = useMemo(() => {
        if (!searchQuery.trim()) return characters;
        const query = searchQuery.toLowerCase();
        return characters.filter(char =>
            char.name.toLowerCase().includes(query)
        );
    }, [characters, searchQuery]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="relative bg-stone-900 rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-stone-800">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Assign Chat to Character</h2>
                        <p className="text-sm text-stone-400 mt-1">
                            Select a character to transfer "{chatItem.title || 'this chat'}" to
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={assigning}
                        className="p-2 text-stone-400 hover:text-white hover:bg-stone-700 rounded-full transition-colors disabled:opacity-50"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="text-center text-red-400 py-8">
                            <p>{error}</p>
                            <button
                                onClick={loadCharacters}
                                className="mt-4 px-4 py-2 bg-stone-700 hover:bg-stone-600 rounded-lg text-white"
                            >
                                Retry
                            </button>
                        </div>
                    ) : characters.length === 0 ? (
                        <div className="text-center text-stone-400 py-8">
                            <p>No characters found</p>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Search Input */}
                            <div className="mb-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search characters..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-stone-600 transition-colors"
                                    />
                                </div>
                            </div>
                            {assigning && (
                                <div className="absolute inset-0 bg-stone-900/80 flex items-center justify-center z-10 rounded-lg">
                                    <div className="flex items-center gap-3 text-white">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        <span>Reassigning chat...</span>
                                    </div>
                                </div>
                            )}
                            {filteredCharacters.length === 0 ? (
                                <div className="text-center text-stone-400 py-8">
                                    <p>No characters match "{searchQuery}"</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {filteredCharacters.map((character) => {
                                        const isCurrentOwner = character.character_uuid === chatItem.character_uuid;
                                        return (
                                            <button
                                                key={character.character_uuid}
                                                onClick={() => handleCharacterSelect(character)}
                                                disabled={isCurrentOwner || assigning}
                                                className={`
                        flex flex-col items-center p-3 rounded-lg transition-all
                        ${isCurrentOwner
                                                        ? 'bg-stone-700/50 opacity-50 cursor-not-allowed'
                                                        : 'bg-stone-800 hover:bg-stone-700 hover:scale-105 cursor-pointer'
                                                    }
                      `}
                                                title={isCurrentOwner ? 'Current owner' : `Assign to ${character.name}`}
                                            >
                                                <div className="w-16 h-16 rounded-lg overflow-hidden bg-stone-600 mb-2">
                                                    {character.character_uuid && (
                                                        <img
                                                            src={getThumbnailUrl(character)}
                                                            alt={character.name}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = 'none';
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                                <span className="text-sm text-white text-center truncate w-full">
                                                    {character.name}
                                                </span>
                                                {isCurrentOwner && (
                                                    <span className="text-xs text-orange-500 mt-1">Current</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-stone-800">
                    <button
                        onClick={onClose}
                        disabled={assigning}
                        className="px-4 py-2 bg-stone-700 hover:bg-stone-600 rounded-lg text-white transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CharacterAssignDialog;
