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
    onOpenMap?: () => void;
    worldId?: string;

    // Character mode props (optional)
    characterName?: string;
}
