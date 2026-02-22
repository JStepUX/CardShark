/**
 * @file GameWorldIconBar.tsx
 * @deprecated This component is being replaced by the new world components in components/world/
 */
import React from 'react';
import { Map, Package, BookOpen, Swords, Users } from 'lucide-react';
import Button from './common/Button';

interface GameWorldIconBarProps {
    onMap?: () => void;
    onInventory?: () => void;
    onSpells?: () => void;
    onMelee?: () => void;
    onNpcs?: () => void;
    npcCount?: number;
}

const GameWorldIconBar: React.FC<GameWorldIconBarProps> = ({
    onMap,
    onInventory,
    onSpells,
    onMelee,
    onNpcs,
    npcCount = 0,
}) => {
    const buttons = [
        { icon: Map, label: 'Map', onClick: onMap },
        { icon: Package, label: 'Inventory', onClick: onInventory },
        { icon: BookOpen, label: 'Spells', onClick: onSpells },
        { icon: Swords, label: 'Combat', onClick: onMelee },
        { icon: Users, label: `NPCs${npcCount > 0 ? ` (${npcCount})` : ''}`, onClick: onNpcs },
    ];

    return (
        <div className="flex items-center justify-around gap-2">
            {buttons.map(({ icon: Icon, label, onClick }) => (
                <Button
                    key={label}
                    variant="ghost"
                    size="sm"
                    onClick={onClick}
                    title={label}
                    className="flex flex-col items-center gap-1 text-stone-400 hover:!text-stone-200"
                >
                    <Icon size={20} />
                    <span className="text-xs">{label}</span>
                </Button>
            ))}
        </div>
    );
};

export default GameWorldIconBar;
