import React from 'react';
import { Plus, Trash2, Check, ImageOff } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

export interface MediaItem {
    id: string;
    url: string;
    name: string;
    thumbnail?: string;
    isDefault?: boolean; // If true, cannot delete
    isAnimated?: boolean;
    [key: string]: any;
}

interface MediaLibraryProps {
    items: MediaItem[];
    selectedId: string | null;
    onSelect: (item: MediaItem | null) => void;
    onDelete?: (item: MediaItem) => void;
    onAdd?: () => void;
    isLoading?: boolean;
    aspectRatio?: number; // Preference for grid item display
    allowNone?: boolean; // Show "None" option
    className?: string;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
    items,
    selectedId,
    onSelect,
    onDelete,
    onAdd,
    isLoading = false,
    aspectRatio = 16 / 9, // Default to landscape
    allowNone = true,
    className = ''
}) => {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12 h-64">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 ${className}`}>
            {/* "Add New" Button */}
            {onAdd && (
                <button
                    onClick={onAdd}
                    className="
            flex flex-col items-center justify-center gap-2
            border-2 border-dashed border-stone-700 rounded-xl
            bg-stone-800/30 hover:bg-stone-800 hover:border-blue-500/50 hover:text-blue-400
            transition-all group
          "
                    style={{ aspectRatio: `${aspectRatio}` }}
                >
                    <div className="p-3 rounded-full bg-stone-800 group-hover:bg-blue-500/10 transition-colors">
                        <Plus size={24} />
                    </div>
                    <span className="text-sm font-medium">Add New</span>
                </button>
            )}

            {/* "None" Option */}
            {allowNone && (
                <button
                    onClick={() => onSelect(null)}
                    className={`
            relative flex flex-col items-center justify-center gap-2
            border-2 rounded-xl overflow-hidden
            bg-stone-800/50 hover:bg-stone-800
            transition-all group
            ${selectedId === null
                            ? 'border-blue-500 ring-2 ring-blue-500/20'
                            : 'border-stone-800 hover:border-stone-600'
                        }
          `}
                    style={{ aspectRatio: `${aspectRatio}` }}
                >
                    <ImageOff size={24} className={selectedId === null ? 'text-blue-400' : 'text-stone-500'} />
                    <span className={`text-sm ${selectedId === null ? 'text-blue-400' : 'text-stone-500'}`}>None</span>

                    {selectedId === null && (
                        <div className="absolute top-2 right-2 p-1 bg-blue-500 rounded-full text-white shadow-sm">
                            <Check size={12} strokeWidth={3} />
                        </div>
                    )}
                </button>
            )}

            {/* Items */}
            {items.map((item) => {
                const isSelected = selectedId === item.id;

                return (
                    <div
                        key={item.id}
                        className={`
              group relative cursor-pointer
              rounded-xl overflow-hidden bg-stone-900 border-2
              transition-all duration-200
              ${isSelected
                                ? 'border-blue-500 ring-2 ring-blue-500/20'
                                : 'border-transparent hover:border-stone-600'
                            }
            `}
                        style={{ aspectRatio: `${aspectRatio}` }}
                        onClick={() => onSelect(item)}
                    >
                        {/* Image */}
                        <div
                            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                            style={{ backgroundImage: `url(${item.thumbnail || item.url})` }}
                        />

                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                        {/* Selection Indicator */}
                        {isSelected && (
                            <div className="absolute top-2 right-2 p-1 bg-blue-500 rounded-full text-white shadow-sm">
                                <Check size={12} strokeWidth={3} />
                            </div>
                        )}

                        {/* Badges (Animation) */}
                        {item.isAnimated && (
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white border border-white/10">
                                GIF
                            </div>
                        )}

                        {/* Footer info & Actions */}
                        <div className="absolute bottom-0 inset-x-0 p-3 flex justify-between items-end">
                            <span className="text-sm font-medium text-white truncate text-shadow-sm flex-1 mr-2 px-1">
                                {item.name}
                            </span>

                            {/* Delete Action */}
                            {onDelete && !item.isDefault && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(item);
                                    }}
                                    className="
                    p-2 rounded-lg bg-red-500/10 text-red-400 
                    opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white
                    transition-all transform translate-y-2 group-hover:translate-y-0
                    focus:opacity-100
                  "
                                    title="Delete"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
