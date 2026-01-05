import { GridRoom, DisplayNPC } from '../../utils/worldStateApi';

export type SidePanelMode = 'world' | 'character' | 'assistant';

export interface SidePanelProps {
    mode: SidePanelMode;
    isCollapsed: boolean;
    onToggleCollapse: () => void;

    // World mode props (optional, only used in world mode)
    currentRoom?: GridRoom | null;
    npcs?: DisplayNPC[];
    activeNpcId?: string;
    onSelectNpc?: (id: string) => void;
    onDismissNpc?: (id: string) => void;
    onOpenMap?: () => void;
    worldId?: string;

    // Character mode props (optional)
    characterName?: string;
    onImageChange?: (newImageData: string | File) => void;
    onUnloadCharacter?: () => void;

    // Journal modal callback (used in all modes)
    onOpenJournal?: () => void;
}
