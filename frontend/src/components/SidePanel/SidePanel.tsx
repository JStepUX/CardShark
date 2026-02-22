import { useState, useEffect } from 'react';
import { Map, ChevronLeft, ChevronRight, Package, BookOpen, Scroll, Save, Check, Loader2 } from 'lucide-react';
import Button from '../common/Button';
import { NPCShowcase } from '../world/NPCShowcase';
import { DayNightSphere } from '../world/DayNightSphere';
import { SidePanelProps } from './types';
import { ContextManagementDropdown } from './ContextManagementDropdown';
import { SamplerSettingsPanel } from './SamplerSettingsPanel';
import { usePanelResize } from '../../hooks/usePanelResize';
import { useChat } from '../../contexts/ChatContext';
import { useCharacter } from '../../contexts/CharacterContext';
import ImagePreview from '../ImagePreview';
import { CharacterImageService, CharacterImage } from '../../services/characterImageService';


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
    relationships,
    timeState,
    timeConfig,
    showSamplerOverlay,
    onCloseSamplerOverlay,
}: SidePanelProps) {
    const { compressionLevel, setCompressionLevel, sessionName, setSessionName, saveSessionNameNow } = useChat();
    const { panelWidth, resizeHandleProps } = usePanelResize();
    const [animationClass, setAnimationClass] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);
    const [showExpanded, setShowExpanded] = useState(!isCollapsed);
    const [localSessionName, setLocalSessionName] = useState(sessionName);
    const [justSaved, setJustSaved] = useState(false);

    // Auto-expand when sampler overlay opens while collapsed
    useEffect(() => {
        if (showSamplerOverlay && isCollapsed) {
            onToggleCollapse();
        }
    }, [showSamplerOverlay]);

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
                <Button
                    variant="ghost"
                    size="lg"
                    icon={<ChevronLeft size={20} />}
                    onClick={handleToggle}
                    title="Expand panel"
                />
            </div>
        );
    }

    return (
        <div className={`relative bg-[#1a1a1a] border-l border-gray-800 flex flex-col ${animationClass}`} style={{ width: panelWidth }}>
            {/* Resize Handle */}
            <div
                {...resizeHandleProps}
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-20 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
            />

            {/* Header */}
            <div className="border-b border-gray-800 px-4 py-4 flex items-start justify-between">
                <Button
                    variant="ghost"
                    size="lg"
                    icon={<ChevronRight size={20} />}
                    onClick={handleToggle}
                    title="Collapse panel"
                    className="mr-2 flex-shrink-0"
                />
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
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={justSaved ? <Check size={16} /> : <Save size={16} />}
                                onClick={handleSave}
                                title={justSaved ? "Saved!" : "Save session name"}
                                disabled={justSaved}
                                className={`flex-shrink-0 ${justSaved ? 'text-green-400' : 'text-blue-400 hover:text-blue-300'}`}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Mode-specific content OR sampler overlay */}
            <div className="flex-1 overflow-y-auto">
                {showSamplerOverlay ? (
                    <SamplerSettingsPanel onClose={onCloseSamplerOverlay || (() => {})} />
                ) : (
                    <>
                        {mode === 'world' && <WorldModeContent
                            currentRoom={currentRoom}
                            npcs={npcs}
                            activeNpcId={activeNpcId}
                            onSelectNpc={onSelectNpc}
                            onDismissNpc={onDismissNpc}
                            onOpenMap={onOpenMap}
                            worldId={worldId}
                            relationships={relationships}
                            timeState={timeState}
                            timeConfig={timeConfig}
                        />}

                        {mode === 'character' && <CharacterModeContent
                            onImageChange={onImageChange}
                            onUnloadCharacter={onUnloadCharacter}
                        />}

                        {mode === 'assistant' && <AssistantModeContent />}
                    </>
                )}
            </div>

            {/* Bottom Section - Journal & Context Management (aligned with chat input) */}
            <div className="border-t border-gray-800">
                {/* Journal Button */}
                {onOpenJournal && (
                    <div className="px-4 pt-4 pb-6">
                        <Button
                            variant="ghost"
                            size="lg"
                            fullWidth
                            icon={<BookOpen className="w-5 h-5 text-blue-400" />}
                            onClick={onOpenJournal}
                            title="Journal - Session notes and memories"
                            className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 px-4 py-3 gap-3 justify-start"
                        >
                            <div className="text-left flex-1">
                                <div className="text-sm text-white">Journal</div>
                                <div className="text-xs text-gray-500">Session notes and memories</div>
                            </div>
                        </Button>
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
    worldId,
    relationships,
    timeState,
    timeConfig
}: {
    currentRoom?: any;
    npcs: any[];
    activeNpcId?: string;
    onSelectNpc?: (id: string) => void;
    onDismissNpc?: (id: string) => void;
    onOpenMap?: () => void;
    worldId?: string;
    relationships?: Record<string, any>;
    timeState?: any;
    timeConfig?: any;
}) {
    return (
        <>
            {/* Room Image with Day/Night Sphere */}
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

                        {/* Day/Night Sphere Overlay */}
                        {timeState && timeConfig?.enableDayNightCycle && (
                            <DayNightSphere
                                timeOfDay={timeState.timeOfDay}
                                currentDay={timeState.currentDay}
                                messagesInDay={timeState.messagesInDay}
                                messagesPerDay={timeConfig.messagesPerDay}
                            />
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
                relationships={relationships}
            />

            {/* Map Button */}
            <div className="px-4 py-4 border-b border-gray-800">
                <Button
                    variant="ghost"
                    size="lg"
                    fullWidth
                    icon={<Map className="w-5 h-5 text-blue-400" />}
                    onClick={onOpenMap}
                    title="World Map - Navigate between rooms"
                    className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 px-4 py-3 gap-3 justify-start"
                >
                    <div className="text-left flex-1">
                        <div className="text-sm text-white">Map</div>
                        <div className="text-xs text-gray-500">Navigate between rooms</div>
                    </div>
                </Button>
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
    const { imageUrl, characterData } = useCharacter();
    const characterUuid = characterData?.data?.character_uuid;

    // Secondary images state
    const [secondaryImages, setSecondaryImages] = useState<CharacterImage[]>([]);
    const [selectedSecondaryImage, setSelectedSecondaryImage] = useState<CharacterImage | null>(null);
    const [isLoadingImages, setIsLoadingImages] = useState(false);

    // Load secondary images when character changes
    useEffect(() => {
        if (characterUuid) {
            loadSecondaryImages();
        } else {
            setSecondaryImages([]);
            setSelectedSecondaryImage(null);
        }
    }, [characterUuid]);

    const loadSecondaryImages = async () => {
        if (!characterUuid) return;

        setIsLoadingImages(true);
        try {
            const images = await CharacterImageService.listImages(characterUuid);
            setSecondaryImages(images);
        } catch (error) {
            console.error('Error loading secondary images:', error);
        } finally {
            setIsLoadingImages(false);
        }
    };

    const handleSecondaryImageClick = (image: CharacterImage) => {
        setSelectedSecondaryImage(image);
    };

    const handleBackToMain = () => {
        setSelectedSecondaryImage(null);
    };

    // Determine which image to show in the main preview
    const displayImageUrl = selectedSecondaryImage && characterUuid
        ? CharacterImageService.getImageUrl(characterUuid, selectedSecondaryImage.filename)
        : imageUrl;

    return (
        <>
            {/* Character Portrait */}
            <div className="p-4">
                <div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden border-2 border-white/20 shadow-lg shadow-black/50">
                    {selectedSecondaryImage ? (
                        // Show selected secondary image
                        <div className="relative w-full h-full">
                            <img
                                src={displayImageUrl}
                                alt={selectedSecondaryImage.filename}
                                className="w-full h-full object-cover"
                            />
                            {/* Back to main button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleBackToMain}
                                className="absolute top-2 left-2 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 !rounded"
                            >
                                ← Main
                            </Button>
                        </div>
                    ) : (
                        <ImagePreview
                            imageUrl={imageUrl}
                            placeholderUrl="/pngPlaceholder.png"
                            onImageChange={onImageChange}
                            hasCharacterLoaded={!!imageUrl}
                            onUnloadCharacter={onUnloadCharacter}
                        />
                    )}
                </div>
            </div>

            {/* Secondary Images Gallery */}
            {characterUuid && (secondaryImages.length > 0 || isLoadingImages) && (
                <div className="px-4 pb-4">
                    <div className="text-xs text-gray-500 mb-2">Gallery</div>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-stone-600 scrollbar-track-stone-800">
                        {isLoadingImages ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-2">
                                {secondaryImages.map((image) => (
                                    <Button
                                        key={image.id}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSecondaryImageClick(image)}
                                        className={`
                                            aspect-[3/4] overflow-hidden border-2 p-0
                                            ${selectedSecondaryImage?.id === image.id
                                                ? 'border-blue-500 ring-2 ring-blue-500/50'
                                                : 'border-stone-700 hover:border-stone-500'
                                            }
                                        `}
                                    >
                                        <img
                                            src={CharacterImageService.getImageUrl(characterUuid, image.filename)}
                                            alt={image.filename}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
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
        <Button
            variant="ghost"
            size="lg"
            disabled
            title="Coming Soon"
            className="bg-[#0a0a0a] border border-gray-800 px-3 py-3 !flex-col gap-2"
        >
            <Icon className="w-5 h-5 text-gray-600" />
            <span className="text-xs text-gray-600">{label}</span>
        </Button>
    );
}
