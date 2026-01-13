import React, { useMemo, useState, useRef } from 'react';
import { X, Upload } from 'lucide-react';
import { CharacterData } from '../contexts/CharacterContext';
import ImageCropperModal from './ImageCropperModal';

interface SelectedCharacterChipProps {
    imageUrl?: string;
    characterName?: string;
    characterData?: CharacterData | null;
    onDismiss?: () => void;
    onImageChange?: (newImageData: string | File) => void;
    placeholderUrl?: string;
}

// Simple GPT-3 style token counting (approximate)
// Uses word-splitting with a 1.3x multiplier to approximate real tokenization
const countTokens = (text: any): number => {
    // Handle null, undefined, or empty values
    if (!text) return 0;

    // If it's not a string, try to convert it
    if (typeof text !== 'string') {
        // For arrays, join them with spaces
        if (Array.isArray(text)) {
            text = text.join(' ');
        }
        // For objects, stringify them
        else if (typeof text === 'object') {
            text = JSON.stringify(text);
        }
        // For other types, convert to string
        else {
            text = String(text);
        }
    }

    const tokens = text.toLowerCase()
        .replace(/[^\w\s']|'(?!\w)|'(?=$)/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    // Apply 1.3x multiplier to approximate real GPT tokenization
    // (Real tokenizers produce more tokens due to subword tokenization and punctuation)
    return Math.round(tokens.length * 1.3);
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
    onImageChange,
    placeholderUrl = '/pngPlaceholder.png'
}) => {
    const displayImage = imageUrl || placeholderUrl;
    const hasCharacter = !!imageUrl || !!characterName;

    // State for image replacement
    const [isHovering, setIsHovering] = useState(false);
    const [showCropper, setShowCropper] = useState(false);
    const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle file selection
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file is an image
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Store the selected file
        setSelectedFile(file);

        // Create a URL for the selected file
        if (tempImageUrl) {
            URL.revokeObjectURL(tempImageUrl);
        }
        const objectUrl = URL.createObjectURL(file);
        setTempImageUrl(objectUrl);
        setShowCropper(true);

        // Reset the input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Handle crop save
    const handleCropSave = async (croppedImageData: string) => {
        if (selectedFile && onImageChange) {
            // Convert base64 to blob then to File
            try {
                const blob = await fetch(croppedImageData).then(r => r.blob());
                const newFile = new File([blob], selectedFile.name, {
                    type: selectedFile.type,
                    lastModified: new Date().getTime()
                });
                onImageChange(newFile);
            } catch (error) {
                console.error('Error processing cropped image:', error);
            }
        }

        // Clean up
        if (tempImageUrl) {
            URL.revokeObjectURL(tempImageUrl);
            setTempImageUrl(null);
        }
        setSelectedFile(null);
    };

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
        <>
            <div className="group relative flex items-center gap-3 p-3 bg-gradient-to-r from-stone-900 to-stone-900/80 rounded-xl border border-stone-700/50 hover:border-stone-600/50 transition-all duration-200 shadow-lg shadow-black/20">
                {/* Character Thumbnail */}
                <div
                    className="relative w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-stone-700/30"
                    onMouseEnter={() => onImageChange && setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                >
                    <img
                        src={displayImage}
                        alt={characterName || 'Character'}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = placeholderUrl;
                        }}
                    />

                    {/* Hover overlay for image replacement */}
                    {isHovering && onImageChange && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    fileInputRef.current?.click();
                                }}
                                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                                title="Replace Image"
                            >
                                <Upload size={16} className="text-white" />
                            </button>
                        </div>
                    )}

                    {/* Subtle gradient overlay */}
                    {!isHovering && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                    )}
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

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Image Cropper Modal */}
            {showCropper && tempImageUrl && (
                <ImageCropperModal
                    isOpen={showCropper}
                    onClose={() => {
                        setShowCropper(false);
                        if (tempImageUrl) {
                            URL.revokeObjectURL(tempImageUrl);
                            setTempImageUrl(null);
                        }
                    }}
                    imageUrl={tempImageUrl}
                    onSaveCropped={handleCropSave}
                    aspectRatio={2 / 3}
                />
            )}
        </>
    );
};

export default SelectedCharacterChip;
