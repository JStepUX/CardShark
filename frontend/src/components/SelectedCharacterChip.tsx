import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { CharacterData } from '../contexts/CharacterContext';

interface SelectedCharacterChipProps {
    imageUrl?: string;
    characterName?: string;
    characterData?: CharacterData | null;
    onDismiss?: () => void;
    placeholderUrl?: string;
}

// Simple GPT-3 style token counting (approximate)
const countTokens = (text: string | undefined): number => {
    if (!text) return 0;
    const tokens = text.toLowerCase()
        .replace(/[^\w\s']|'(?!\w)|'(?=$)/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    return tokens.length;
};

/**
 * A compact "chip" component that displays the currently selected character
 * with a small thumbnail, name, token count, and dismiss button.
 * Designed to be no more than 128px tall.
 */
const SelectedCharacterChip: React.FC<SelectedCharacterChipProps> = ({
    imageUrl,
    characterName,
    characterData,
    onDismiss,
    placeholderUrl = '/pngPlaceholder.png'
}) => {
    const displayImage = imageUrl || placeholderUrl;
    const hasCharacter = !!imageUrl || !!characterName;

    // Calculate total tokens from character data
    const totalTokens = useMemo(() => {
        if (!characterData?.data) return 0;

        const fields = [
            'name',
            'description',
            'scenario',
            'personality',
            'mes_example',
            'system_prompt',
            'first_mes'
        ] as const;

        return fields.reduce((total, field) => {
            return total + countTokens(characterData.data[field]);
        }, 0);
    }, [characterData]);

    if (!hasCharacter) {
        // No character selected - show a subtle placeholder state
        return (
            <div className="flex items-center gap-3 p-3 bg-stone-900/50 rounded-xl border border-stone-800/50">
                <div className="w-16 h-20 rounded-lg bg-stone-800/50 flex items-center justify-center flex-shrink-0">
                    <img
                        src={placeholderUrl}
                        alt="No character"
                        className="w-full h-full object-cover rounded-lg opacity-40"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-500 italic">No character selected</p>
                    <p className="text-xs text-gray-600 mt-1">Import or select a card</p>
                </div>
            </div>
        );
    }

    return (
        <div className="group relative flex items-center gap-3 p-3 bg-gradient-to-r from-stone-900 to-stone-900/80 rounded-xl border border-stone-700/50 hover:border-stone-600/50 transition-all duration-200 shadow-lg shadow-black/20">
            {/* Character Thumbnail */}
            <div className="relative w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-stone-700/30">
                <img
                    src={displayImage}
                    alt={characterName || 'Character'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = placeholderUrl;
                    }}
                />
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
            </div>

            {/* Character Info */}
            <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate text-sm">
                    {characterName || 'Character'}
                </p>
                {/* Token count badge */}
                {totalTokens > 0 ? (
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-orange-400/90 font-mono">
                            {totalTokens.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-500">tokens</span>
                    </div>
                ) : (
                    <p className="text-xs text-emerald-400/80 mt-0.5">Selected</p>
                )}
            </div>

            {/* Dismiss Button */}
            {onDismiss && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDismiss();
                    }}
                    className="flex-shrink-0 w-7 h-7 rounded-full bg-stone-800/80 hover:bg-red-600/80 
                     flex items-center justify-center transition-all duration-200
                     opacity-60 group-hover:opacity-100"
                    title="Dismiss character"
                    aria-label="Dismiss character"
                >
                    <X size={14} className="text-gray-300" />
                </button>
            )}
        </div>
    );
};

export default SelectedCharacterChip;
