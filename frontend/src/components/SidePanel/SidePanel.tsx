import { Map, ChevronLeft, ChevronRight, Swords, Package, BookOpen, Scroll } from 'lucide-react';
import { NPCShowcase } from '../world/NPCShowcase';
import { SidePanelProps } from './types';
import { SessionNotes } from './SessionNotes';
import { CompressionToggle } from './CompressionToggle';
import { useChat } from '../../contexts/ChatContext';
import { useCharacter } from '../../contexts/CharacterContext';
import ImagePreview from '../ImagePreview';

export function SidePanel({
    mode,
    isCollapsed,
    onToggleCollapse,
    currentRoom,
    npcs = [],
    activeNpcId,
    onSelectNpc,
    onOpenMap,
    worldId,
    characterName,
    onImageChange,
    onUnloadCharacter,
}: SidePanelProps) {
    const { sessionNotes, setSessionNotes, compressionEnabled, setCompressionEnabled } = useChat();
    if (isCollapsed) {
        return (
            <div className="w-12 bg-[#1a1a1a] border-l border-gray-800 flex flex-col items-center py-4">
                <button
                    onClick={onToggleCollapse}
                    className="text-gray-500 hover:text-white transition-colors"
                    title="Expand panel"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
            </div>
        );
    }

    return (
        <div className="w-80 bg-[#1a1a1a] border-l border-gray-800 flex flex-col">
            {/* Header */}
            <div className="border-b border-gray-800 px-4 py-4 flex items-start justify-between">
                <button
                    onClick={onToggleCollapse}
                    className="text-gray-500 hover:text-white transition-colors mr-2 flex-shrink-0"
                    title="Collapse panel"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <h2 className="text-white truncate">
                        {mode === 'world' && currentRoom ? currentRoom.name : ''}
                        {mode === 'character' && characterName ? characterName : ''}
                        {mode === 'assistant' ? 'Session' : ''}
                        {mode === 'world' && !currentRoom ? 'No Room Selected' : ''}
                        {mode === 'character' && !characterName ? 'Character' : ''}
                    </h2>
                </div>
            </div>

            {/* Mode-specific content */}
            {mode === 'world' && <WorldModeContent
                currentRoom={currentRoom}
                npcs={npcs}
                activeNpcId={activeNpcId}
                onSelectNpc={onSelectNpc}
                onOpenMap={onOpenMap}
                worldId={worldId}
                sessionNotes={sessionNotes}
                setSessionNotes={setSessionNotes}
                compressionEnabled={compressionEnabled}
                setCompressionEnabled={setCompressionEnabled}
            />}

            {mode === 'character' && <CharacterModeContent
                sessionNotes={sessionNotes}
                setSessionNotes={setSessionNotes}
                compressionEnabled={compressionEnabled}
                setCompressionEnabled={setCompressionEnabled}
                onImageChange={onImageChange}
                onUnloadCharacter={onUnloadCharacter}
            />}

            {mode === 'assistant' && <AssistantModeContent
                sessionNotes={sessionNotes}
                setSessionNotes={setSessionNotes}
                compressionEnabled={compressionEnabled}
                setCompressionEnabled={setCompressionEnabled}
            />}
        </div>
    );
}

// World Mode Content - preserves all existing WorldSidePanel functionality
function WorldModeContent({
    currentRoom,
    npcs,
    activeNpcId,
    onSelectNpc,
    onOpenMap,
    worldId,
    sessionNotes,
    setSessionNotes,
    compressionEnabled,
    setCompressionEnabled
}: {
    currentRoom?: any;
    npcs: any[];
    activeNpcId?: string;
    onSelectNpc?: (id: string) => void;
    onOpenMap?: () => void;
    worldId?: string;
    sessionNotes: string;
    setSessionNotes: (notes: string) => void;
    compressionEnabled: boolean;
    setCompressionEnabled: (enabled: boolean) => void;
}) {
    return (
        <>
            {/* Room Image */}
            {currentRoom && (
                <div className="border-b border-gray-800 overflow-hidden">
                    <div className="relative w-full aspect-video bg-[#0a0a0a]">
                        {currentRoom.image_path ? (
                            <img
                                src={`/api/world-assets/${worldId}/${currentRoom.image_path.split('/').pop()}`}
                                alt={currentRoom.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) {
                                        parent.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-600 text-sm">No image available</div>';
                                    }
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                                No image available
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* NPC Showcase */}
            <NPCShowcase
                npcs={npcs}
                activeNpcId={activeNpcId}
                onSelectNpc={onSelectNpc || (() => { })}
            />

            {/* Map Button */}
            <div className="px-4 py-4 border-b border-gray-800">
                <button
                    onClick={onOpenMap}
                    className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 transition-colors"
                >
                    <Map className="w-5 h-5 text-blue-400" />
                    <div className="text-left flex-1">
                        <div className="text-sm text-white">World Map</div>
                        <div className="text-xs text-gray-500">Navigate between rooms</div>
                    </div>
                </button>
            </div>

            {/* Session Notes */}
            <div className="px-4 py-4 border-b border-gray-800">
                <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">Session Notes</h3>
                <SessionNotes
                    value={sessionNotes}
                    onChange={setSessionNotes}
                />
            </div>

            {/* Compression Toggle */}
            <div className="px-4 py-4 border-b border-gray-800">
                <CompressionToggle
                    enabled={compressionEnabled}
                    onToggle={setCompressionEnabled}
                />
            </div>

            {/* Future Features - Placeholder */}
            <div className="px-4 py-4 flex-1">
                <h3 className="text-xs text-gray-600 uppercase tracking-wide mb-3">Coming Soon</h3>
                <div className="grid grid-cols-2 gap-2">
                    <PlaceholderButton icon={Swords} label="Combat" />
                    <PlaceholderButton icon={Package} label="Inventory" />
                    <PlaceholderButton icon={BookOpen} label="Journal" />
                    <PlaceholderButton icon={Scroll} label="Quests" />
                </div>
            </div>
        </>
    );
}

// Character Mode Content
function CharacterModeContent({
    sessionNotes,
    setSessionNotes,
    compressionEnabled,
    setCompressionEnabled,
    onImageChange,
    onUnloadCharacter
}: {
    sessionNotes: string;
    setSessionNotes: (notes: string) => void;
    compressionEnabled: boolean;
    setCompressionEnabled: (enabled: boolean) => void;
    onImageChange?: (newImageData: string | File) => void;
    onUnloadCharacter?: () => void;
}) {
    // Get the actual image URL from CharacterContext (same as gallery uses)
    const { imageUrl } = useCharacter();

    return (
        <>
            {/* Character Portrait */}
            <div className="border-b border-gray-800 overflow-hidden">
                <div className="relative w-full aspect-[4/5] bg-[#0a0a0a] overflow-hidden">
                    <ImagePreview
                        imageUrl={imageUrl}
                        placeholderUrl="/pngPlaceholder.png"
                        onImageChange={onImageChange}
                        hasCharacterLoaded={!!imageUrl}
                        onUnloadCharacter={onUnloadCharacter}
                    />
                </div>
            </div>

            {/* Session Notes */}
            <div className="px-4 py-4 border-b border-gray-800">
                <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">Session Notes</h3>
                <SessionNotes
                    value={sessionNotes}
                    onChange={setSessionNotes}
                />
            </div>

            {/* Compression Toggle */}
            <div className="px-4 py-4">
                <CompressionToggle
                    enabled={compressionEnabled}
                    onToggle={setCompressionEnabled}
                />
            </div>
        </>
    );
}

// Assistant Mode Content
function AssistantModeContent({
    sessionNotes,
    setSessionNotes,
    compressionEnabled,
    setCompressionEnabled
}: {
    sessionNotes: string;
    setSessionNotes: (notes: string) => void;
    compressionEnabled: boolean;
    setCompressionEnabled: (enabled: boolean) => void;
}) {
    return (
        <>
            {/* Session Notes */}
            <div className="px-4 py-4 border-b border-gray-800">
                <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">Session Notes</h3>
                <SessionNotes
                    value={sessionNotes}
                    onChange={setSessionNotes}
                />
            </div>

            {/* Compression Toggle */}
            <div className="px-4 py-4">
                <CompressionToggle
                    enabled={compressionEnabled}
                    onToggle={setCompressionEnabled}
                />
            </div>
        </>
    );
}

// Placeholder Button Component
function PlaceholderButton({ icon: Icon, label }: { icon: any; label: string }) {
    return (
        <button
            disabled
            className="bg-[#0a0a0a] border border-gray-800 rounded-lg px-3 py-3 flex flex-col items-center gap-2 opacity-50 cursor-not-allowed group"
            title="Coming Soon"
        >
            <Icon className="w-5 h-5 text-gray-600" />
            <span className="text-xs text-gray-600">{label}</span>
        </button>
    );
}
