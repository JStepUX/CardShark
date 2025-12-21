// frontend/src/components/character/CharacterSelect.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, User } from 'lucide-react';
import { NpcGridItem } from '../../types/world';

interface CharacterProfile {
    character_uuid: string;
    name: string;
    png_file_path: string;
    description?: string;
}

interface CharacterSelectProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (character: NpcGridItem) => void;
}

const CharacterSelect: React.FC<CharacterSelectProps> = ({
    isOpen,
    onClose,
    onSelect
}) => {
    const [characters, setCharacters] = useState<CharacterProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Memoized filtering
    const filteredCharacters = useMemo(() => {
        const searchLower = searchTerm.toLowerCase().trim();
        if (!searchLower) return characters;
        return characters.filter(char =>
            char.name.toLowerCase().includes(searchLower)
        );
    }, [characters, searchTerm]);

    const loadCharacters = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('/api/characters');
            if (!response.ok) throw new Error('Failed to load characters');
            const data = await response.json();

            if (data.success && Array.isArray(data.characters)) {
                setCharacters(data.characters.sort((a: CharacterProfile, b: CharacterProfile) =>
                    a.name.localeCompare(b.name)
                ));
            } else {
                setError(data.message || 'Failed to load characters');
                setCharacters([]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load characters');
            setCharacters([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadCharacters();
        } else {
            setSearchTerm('');
            setError(null);
        }
    }, [isOpen, loadCharacters]);

    const handleSelectCharacter = (char: CharacterProfile) => {
        // Convert to NpcGridItem format required by WorldBuilder
        const npcItem: NpcGridItem = {
            character_id: char.character_uuid,
            name: char.name,
            path: char.png_file_path
        };
        onSelect(npcItem);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-4xl max-h-[90vh] bg-stone-900 rounded-lg shadow-xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-stone-800 flex-none">
                    <h2 className="text-lg font-semibold text-white">Select Character</h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-200 transition-colors rounded-full hover:bg-stone-700"
                        aria-label="Close character selection"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-stone-800 flex-none">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search characters..."
                        className="w-full px-4 py-2 bg-stone-950 border border-stone-700 rounded-lg text-white placeholder-slate-400
                     focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>

                {/* Error Display */}
                {error && (
                    <div className="flex-none p-3 mx-4 mt-4 bg-orange-900 border border-orange-700 text-orange-100 rounded-md text-sm flex justify-between items-center shadow-lg">
                        <span className="break-words mr-2"><strong>Notice:</strong> {error}</span>
                        <button onClick={() => setError(null)} className="ml-auto flex-shrink-0 px-2 py-0.5 bg-orange-700 hover:bg-orange-600 rounded text-xs focus:outline-none focus:ring-1 focus:ring-white" aria-label="Dismiss notice">Dismiss</button>
                    </div>
                )}

                {/* Character Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="text-center text-gray-400 p-4">Loading characters...</div>
                    ) : (
                        <>
                            {characters.length === 0 && !error && (
                                <div className="text-center text-gray-400 p-4 mb-4">
                                    No characters found.
                                </div>
                            )}

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {filteredCharacters.map((char) => (
                                    <div
                                        key={char.character_uuid}
                                        className="relative group aspect-[3/5] cursor-pointer rounded-lg overflow-hidden shadow-md bg-stone-800
                      transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02]
                      focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 focus-within:ring-offset-stone-900"
                                        onClick={() => handleSelectCharacter(char)}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Select character ${char.name}`}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                handleSelectCharacter(char);
                                            }
                                        }}
                                    >
                                        {/* Character Image */}
                                        <div className="absolute inset-0 bg-stone-950">
                                            <img
                                                src={`/api/character-image/${char.character_uuid}`}
                                                alt={char.name}
                                                className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                                                loading="lazy"
                                                onError={(e) => {
                                                    // Fallback to placeholder or hidden if image fails
                                                    (e.target as HTMLImageElement).style.visibility = 'hidden';
                                                    // Could also set a state to show a placeholder icon
                                                }}
                                            />
                                            {/* Placeholder behind the image in case it fails or loads slowly */}
                                            <div className="absolute inset-0 -z-10 flex items-center justify-center text-stone-700">
                                                <User size={48} />
                                            </div>
                                        </div>

                                        {/* Name Overlay */}
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6 text-white text-sm font-medium text-center truncate rounded-b-lg pointer-events-none">
                                            {char.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CharacterSelect;
