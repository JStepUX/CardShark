import React, { useMemo, useState } from 'react';
import GalleryGrid from '../GalleryGrid';
import { CharacterFile } from '../../types/schema';
import { Folder, Search, X, Users } from 'lucide-react';
import { Dialog } from '../common/Dialog';

interface CharacterFolderViewProps {
    characters: CharacterFile[];
    renderCharacterCard: (character: CharacterFile) => React.ReactNode;
    emptyMessage?: string;
    isSearching?: boolean;
}

interface FolderData {
    name: string;
    items: CharacterFile[];
}

/**
 * CharacterFolderView
 * Groups characters by their tags and displays them in a "Folder Grid".
 * Clicking a folder opens a modal showing the characters within that tag.
 */
const CharacterFolderView: React.FC<CharacterFolderViewProps> = ({
    characters,
    renderCharacterCard,
    emptyMessage = "No characters found.",
    isSearching = false
}) => {
    const [selectedFolder, setSelectedFolder] = useState<FolderData | null>(null);
    const [modalSearchTerm, setModalSearchTerm] = useState('');

    const folders = useMemo(() => {
        const groups: Record<string, CharacterFile[]> = {};
        const displayNames: Record<string, string> = {};

        characters.forEach(char => {
            const tags = char.tags && char.tags.length > 0 ? char.tags : ['Untagged'];
            const seenTagsInChar = new Set<string>();

            tags.forEach(tag => {
                const trimmed = tag.trim();
                const normalizedKey = (trimmed || 'Untagged').toLowerCase();

                // Prevent duplicate entries if a character has multiple variations of the same tag
                if (seenTagsInChar.has(normalizedKey)) return;
                seenTagsInChar.add(normalizedKey);

                if (!groups[normalizedKey]) {
                    groups[normalizedKey] = [];
                    // Keep the first casing we encounter for the display name
                    displayNames[normalizedKey] = trimmed || 'Untagged';
                }
                groups[normalizedKey].push(char);
            });
        });

        return Object.keys(groups).sort((a: string, b: string) => {
            const nameA = displayNames[a];
            const nameB = displayNames[b];
            if (nameA === 'Untagged') return 1;
            if (nameB === 'Untagged') return -1;
            return nameA.localeCompare(nameB);
        }).map(key => ({
            name: displayNames[key],
            items: groups[key]
        }));
    }, [characters]);

    const filteredModalItems = useMemo(() => {
        if (!selectedFolder) return [];
        const term = modalSearchTerm.toLowerCase().trim();
        if (!term) return selectedFolder.items;

        return selectedFolder.items.filter(char =>
            char.name.toLowerCase().includes(term) ||
            (char.description && char.description.toLowerCase().includes(term))
        );
    }, [selectedFolder, modalSearchTerm]);

    if (characters.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 dark:text-slate-400">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="px-8 pb-12 flex flex-col gap-12">
            {/* Folder Section */}
            <div className="flex flex-col gap-6">
                {isSearching && (
                    <div className="flex items-center gap-3 px-2">
                        <Folder size={18} className="text-blue-400" />
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Matching Folders</h3>
                        <div className="flex-1 h-[1px] bg-stone-800" />
                    </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {folders.map(folder => (
                        <button
                            key={folder.name}
                            onClick={() => setSelectedFolder(folder)}
                            className="group flex flex-col items-center gap-3 p-4 rounded-xl bg-stone-900/50 hover:bg-stone-800 border border-stone-800 hover:border-blue-500/50 transition-all duration-300 hover:scale-[1.05] hover:shadow-xl hover:shadow-blue-500/10"
                        >
                            <div className="relative">
                                <Folder
                                    size={64}
                                    className="text-blue-500/80 group-hover:text-blue-400 group-hover:fill-blue-400/10 transition-colors duration-300"
                                />
                                <div className="absolute inset-0 flex items-center justify-center pt-2">
                                    <span className="text-[10px] font-bold text-white bg-blue-600/80 px-1.5 py-0.5 rounded shadow-sm">
                                        {folder.items.length}
                                    </span>
                                </div>
                            </div>
                            <span className="text-sm font-semibold text-slate-200 group-hover:text-white truncate w-full text-center">
                                {folder.name}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Split View Divider and Character Grid */}
            {isSearching && (
                <div className="flex flex-col gap-8">
                    {/* Bisecting Line */}
                    <div className="relative py-4">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-stone-700"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="px-4 bg-stone-900 text-sm font-bold text-slate-300 uppercase tracking-[0.2em] flex items-center gap-3">
                                <Search size={16} className="text-blue-500" />
                                Search Results
                                <span className="text-[10px] text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                                    {characters.length}
                                </span>
                            </span>
                        </div>
                    </div>

                    {/* Matching Characters Grid */}
                    <div className="min-h-[300px]">
                        <GalleryGrid
                            items={characters}
                            renderItem={renderCharacterCard}
                            className="!gap-6"
                        />
                    </div>
                </div>
            )}

            {/* Folder Contents Modal */}
            {selectedFolder && (
                <Dialog
                    isOpen={!!selectedFolder}
                    onClose={() => {
                        setSelectedFolder(null);
                        setModalSearchTerm('');
                    }}
                    className="max-w-6xl w-[90vw] h-[85vh]"
                >
                    <div className="flex flex-col h-full bg-stone-900">
                        {/* Custom Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-stone-800">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-500/10 rounded-xl">
                                    <Folder className="text-blue-400" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">
                                        {selectedFolder.name}
                                    </h2>
                                    <p className="text-sm text-slate-400 flex items-center gap-1.5">
                                        <Users size={14} />
                                        {selectedFolder.items.length} {selectedFolder.items.length === 1 ? 'Character' : 'Characters'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 flex-1 max-w-md mx-8">
                                <div className="relative w-full">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search within folder..."
                                        value={modalSearchTerm}
                                        onChange={(e) => setModalSearchTerm(e.target.value)}
                                        className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-600 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={() => setSelectedFolder(null)}
                                className="p-2 hover:bg-stone-800 rounded-full text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Modal Content - Scrollable Grid */}
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent">
                            {filteredModalItems.length > 0 ? (
                                <GalleryGrid
                                    items={filteredModalItems}
                                    renderItem={renderCharacterCard}
                                    className="!gap-6"
                                />
                            ) : (
                                <div className="h-64 flex flex-col items-center justify-center text-slate-500">
                                    <Search size={48} className="mb-4 opacity-20" />
                                    <p>No matches found in this folder</p>
                                </div>
                            )}
                        </div>
                    </div>
                </Dialog>
            )}
        </div>
    );
};

export default CharacterFolderView;
