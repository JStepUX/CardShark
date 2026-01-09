import { useState } from 'react';
import { Map, ChevronLeft, ChevronRight, Package, BookOpen, Scroll } from 'lucide-react';
import { NPCShowcase } from '../world/NPCShowcase';
import { SidePanelProps } from './types';
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
    onDismissNpc,
    onOpenMap,
    worldId,
    characterName,
    onImageChange,
    onUnloadCharacter,
    onOpenJournal,
}: SidePanelProps) {
    const { compressionEnabled, setCompressionEnabled, sessionName, setSessionName } = useChat();
    const [animationClass, setAnimationClass] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);
    const [showExpanded, setShowExpanded] = useState(!isCollapsed);

    // Sync showExpanded with isCollapsed prop when it changes externally
    // But only when not animating (to avoid interrupting our animation)
    if (!isAnimating && showExpanded === isCollapsed) {
        setShowExpanded(!isCollapsed);
    }

    // Handle collapse/expand with animation
    const handleToggle = () => {
        if (isAnimating) return; // Prevent double-clicks during animation

        setIsAnimating(true);

        if (isCollapsed) {
            // Expanding: first change state to show the panel, then animate it in
            onToggleCollapse(); // This makes isCollapsed = false
            setShowExpanded(true);
            setAnimationClass('panel-venetian-expand');
            setTimeout(() => {
                setAnimationClass('');
                setIsAnimating(false);
            }, 350);
        } else {
            // Collapsing: first animate out, then change state
            setAnimationClass('panel-venetian-collapse');
            setTimeout(() => {
                setAnimationClass('');
                setShowExpanded(false);
                onToggleCollapse(); // This makes isCollapsed = true
                setIsAnimating(false);
            }, 350);
        }
    };

    if (!showExpanded) {
        return (
            <div className="w-12 bg-[#1a1a1a] border-l border-gray-800 flex flex-col items-center py-4">
                <button
                    onClick={handleToggle}
                    className="text-gray-500 hover:text-white transition-colors"
                    title="Expand panel"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
            </div>
        );
    }

    return (
        <div className={`w-80 bg-[#1a1a1a] border-l border-gray-800 flex flex-col ${animationClass}`}>
            {/* Header */}
            <div className="border-b border-gray-800 px-4 py-4 flex items-start justify-between">
                <button
                    onClick={handleToggle}
                    className="text-gray-500 hover:text-white transition-colors mr-2 flex-shrink-0"
                    title="Collapse panel"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                    {/* Editable Session Name */}
                    <input
                        type="text"
                        value={sessionName || ''}
                        onChange={(e) => setSessionName(e.target.value)}
                        placeholder={
                            mode === 'world' && currentRoom ? currentRoom.name :
                                mode === 'character' && characterName ? `Chat with ${characterName}` :
                                    mode === 'assistant' ? 'Session' :
                                        'Untitled Chat'
                        }
                        className="w-full bg-transparent text-white border-none outline-none focus:ring-1 focus:ring-gray-600 rounded px-2 py-1 -mx-2 -my-1 truncate"
                        title="Click to edit session name"
                    />
                </div>
            </div>

            {/* Mode-specific content */}
            {mode === 'world' && <WorldModeContent
                currentRoom={currentRoom}
                npcs={npcs}
                activeNpcId={activeNpcId}
                onSelectNpc={onSelectNpc}
                onDismissNpc={onDismissNpc}
                onOpenMap={onOpenMap}
                worldId={worldId}
                compressionEnabled={compressionEnabled}
                setCompressionEnabled={setCompressionEnabled}
                onOpenJournal={onOpenJournal}
            />}

            {mode === 'character' && <CharacterModeContent
                compressionEnabled={compressionEnabled}
                setCompressionEnabled={setCompressionEnabled}
                onImageChange={onImageChange}
                onUnloadCharacter={onUnloadCharacter}
                onOpenJournal={onOpenJournal}
            />}

            {mode === 'assistant' && <AssistantModeContent
                compressionEnabled={compressionEnabled}
                setCompressionEnabled={setCompressionEnabled}
                onOpenJournal={onOpenJournal}
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
    onDismissNpc,
    onOpenMap,
    worldId,
    compressionEnabled,
    setCompressionEnabled,
    onOpenJournal
}: {
    currentRoom?: any;
    npcs: any[];
    activeNpcId?: string;
    onSelectNpc?: (id: string) => void;
    onDismissNpc?: (id: string) => void;
    onOpenMap?: () => void;
    worldId?: string;
    compressionEnabled: boolean;
    setCompressionEnabled: (enabled: boolean) => void;
    onOpenJournal?: () => void;
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
                onDismissNpc={onDismissNpc}
            />

            {/* Map & Journal Buttons */}
            <div className="px-4 py-4 border-b border-gray-800">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={onOpenMap}
                        className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 rounded-lg px-3 py-3 flex flex-col items-center gap-2 transition-colors"
                        title="World Map - Navigate between rooms"
                    >
                        <Map className="w-5 h-5 text-blue-400" />
                        <span className="text-xs text-white">Map</span>
                    </button>
                    {onOpenJournal && (
                        <button
                            onClick={onOpenJournal}
                            className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 rounded-lg px-3 py-3 flex flex-col items-center gap-2 transition-colors"
                            title="Journal - Session notes and memories"
                        >
                            <BookOpen className="w-5 h-5 text-blue-400" />
                            <span className="text-xs text-white">Journal</span>
                        </button>
                    )}
                </div>
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
                    <PlaceholderButton icon={Package} label="Inventory" />
                    <PlaceholderButton icon={Scroll} label="Quests" />
                </div>
            </div>
        </>
    );
}

// Character Mode Content
function CharacterModeContent({
    compressionEnabled,
    setCompressionEnabled,
    onImageChange,
    onUnloadCharacter,
    onOpenJournal
}: {
    compressionEnabled: boolean;
    setCompressionEnabled: (enabled: boolean) => void;
    onImageChange?: (newImageData: string | File) => void;
    onUnloadCharacter?: () => void;
    onOpenJournal?: () => void;
}) {
    // Get the actual image URL from CharacterContext (same as gallery uses)
    const { imageUrl } = useCharacter();

    return (
        <>
            {/* Character Portrait */}
            <div className="p-4">
                <div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden border-2 border-white/20 shadow-lg shadow-black/50">
                    <ImagePreview
                        imageUrl={imageUrl}
                        placeholderUrl="/pngPlaceholder.png"
                        onImageChange={onImageChange}
                        hasCharacterLoaded={!!imageUrl}
                        onUnloadCharacter={onUnloadCharacter}
                    />
                </div>
            </div>

            {/* Journal Button */}
            {onOpenJournal && (
                <div className="px-4 py-4 border-b border-gray-800">
                    <button
                        onClick={onOpenJournal}
                        className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 transition-colors"
                    >
                        <BookOpen className="w-5 h-5 text-blue-400" />
                        <div className="text-left flex-1">
                            <div className="text-sm text-white">Journal</div>
                            <div className="text-xs text-gray-500">Session notes and memories</div>
                        </div>
                    </button>
                </div>
            )}

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
    compressionEnabled,
    setCompressionEnabled,
    onOpenJournal
}: {
    compressionEnabled: boolean;
    setCompressionEnabled: (enabled: boolean) => void;
    onOpenJournal?: () => void;
}) {
    return (
        <>
            {/* Journal Button */}
            {onOpenJournal && (
                <div className="px-4 py-4 border-b border-gray-800">
                    <button
                        onClick={onOpenJournal}
                        className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 transition-colors"
                    >
                        <BookOpen className="w-5 h-5 text-blue-400" />
                        <div className="text-left flex-1">
                            <div className="text-sm text-white">Journal</div>
                            <div className="text-xs text-gray-500">Session notes and memories</div>
                        </div>
                    </button>
                </div>
            )}

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
