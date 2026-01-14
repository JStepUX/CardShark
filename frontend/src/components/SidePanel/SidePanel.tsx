import { useState, useEffect } from 'react';
import { Map, ChevronLeft, ChevronRight, Package, BookOpen, Scroll, Save, Check } from 'lucide-react';
import { NPCShowcase } from '../world/NPCShowcase';
import { SidePanelProps } from './types';
import { ContextManagementDropdown } from './ContextManagementDropdown';
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
    const { compressionLevel, setCompressionLevel, sessionName, setSessionName, saveSessionNameNow } = useChat();
    const [animationClass, setAnimationClass] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);
    const [showExpanded, setShowExpanded] = useState(!isCollapsed);
    const [localSessionName, setLocalSessionName] = useState(sessionName);
    const [justSaved, setJustSaved] = useState(false);

    // Simple change detection
    const hasChanges = localSessionName !== sessionName;

    // Sync local state when sessionName changes from context (e.g., loading a new chat)
    useEffect(() => {
        setLocalSessionName(sessionName);
    }, [sessionName]);

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

    // Handle save - update context and save to database
    const handleSave = async () => {
        if (!hasChanges) return;

        // Update context state
        setSessionName(localSessionName);

        // Save to database - pass the value directly to avoid stale state closure
        try {
            await saveSessionNameNow(localSessionName);
            console.log('Session name saved:', localSessionName);

            // Show checkmark feedback
            setJustSaved(true);
            setTimeout(() => setJustSaved(false), 2000);

            // Dispatch event to notify ChatSelector to refresh
            window.dispatchEvent(new Event('sessionNameUpdated'));
        } catch (error) {
            console.error('Failed to save session name:', error);
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
                    {/* Editable Session Name with Save Button */}
                    <div className="relative flex items-center gap-2">
                        <input
                            type="text"
                            value={localSessionName || ''}
                            onChange={(e) => setLocalSessionName(e.target.value)}
                            placeholder={
                                mode === 'world' && currentRoom ? currentRoom.name :
                                    mode === 'character' && characterName ? `Chat with ${characterName}` :
                                        mode === 'assistant' ? 'Session' :
                                            'Untitled Chat'
                            }
                            className="flex-1 bg-transparent text-white border border-gray-700 outline-none focus:ring-1 focus:ring-gray-600 rounded px-2 py-1 truncate"
                            title="Click to edit session name"
                        />
                        {(hasChanges || justSaved) && (
                            <button
                                onClick={handleSave}
                                className={`flex-shrink-0 transition-colors ${justSaved
                                    ? 'text-green-400'
                                    : 'text-blue-400 hover:text-blue-300'
                                    }`}
                                title={justSaved ? "Saved!" : "Save session name"}
                                disabled={justSaved}
                            >
                                {justSaved ? (
                                    <Check className="w-4 h-4" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Mode-specific content */}
            <div className="flex-1 overflow-y-auto">
                {mode === 'world' && <WorldModeContent
                    currentRoom={currentRoom}
                    npcs={npcs}
                    activeNpcId={activeNpcId}
                    onSelectNpc={onSelectNpc}
                    onDismissNpc={onDismissNpc}
                    onOpenMap={onOpenMap}
                    worldId={worldId}
                />}

                {mode === 'character' && <CharacterModeContent
                    onImageChange={onImageChange}
                    onUnloadCharacter={onUnloadCharacter}
                />}

                {mode === 'assistant' && <AssistantModeContent />}
            </div>

            {/* Bottom Section - Journal & Context Management (aligned with chat input) */}
            <div className="border-t border-gray-800">
                {/* Journal Button */}
                {onOpenJournal && (
                    <div className="px-4 pt-4 pb-6">
                        <button
                            onClick={onOpenJournal}
                            className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 transition-colors"
                            title="Journal - Session notes and memories"
                        >
                            <BookOpen className="w-5 h-5 text-blue-400" />
                            <div className="text-left flex-1">
                                <div className="text-sm text-white">Journal</div>
                                <div className="text-xs text-gray-500">Session notes and memories</div>
                            </div>
                        </button>
                    </div>
                )}

                {/* Context Management */}
                <div className="px-4 pb-5 pt-0">
                    <ContextManagementDropdown
                        compressionLevel={compressionLevel}
                        onLevelChange={setCompressionLevel}
                    />
                </div>
            </div>
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
    worldId
}: {
    currentRoom?: any;
    npcs: any[];
    activeNpcId?: string;
    onSelectNpc?: (id: string) => void;
    onDismissNpc?: (id: string) => void;
    onOpenMap?: () => void;
    worldId?: string;
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

            {/* Map Button */}
            <div className="px-4 py-4 border-b border-gray-800">
                <button
                    onClick={onOpenMap}
                    className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 transition-colors"
                    title="World Map - Navigate between rooms"
                >
                    <Map className="w-5 h-5 text-blue-400" />
                    <div className="text-left flex-1">
                        <div className="text-sm text-white">Map</div>
                        <div className="text-xs text-gray-500">Navigate between rooms</div>
                    </div>
                </button>
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
    onImageChange,
    onUnloadCharacter
}: {
    onImageChange?: (newImageData: string | File) => void;
    onUnloadCharacter?: () => void;
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


        </>
    );
}

// Assistant Mode Content
function AssistantModeContent() {
    return (
        <>

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
