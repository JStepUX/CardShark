/**
 * NPC Settings Modal
 * Modal for configuring NPC instance settings within a room
 * @dependencies RoomNPC type
 */
import { useState, useEffect } from 'react';
import { X, Shield, Swords, AlertCircle } from 'lucide-react';
import { RoomNPC } from '../types/room';
import Button from './common/Button';

interface NPCSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    npc: RoomNPC;
    npcName: string;
    onSave: (updatedNpc: RoomNPC) => void;
}

export function NPCSettingsModal({ isOpen, onClose, npc, npcName, onSave }: NPCSettingsModalProps) {
    const [hostile, setHostile] = useState(npc.hostile || false);
    const [monsterLevel, setMonsterLevel] = useState(npc.monster_level || 1);

    // Reset form when NPC changes
    useEffect(() => {
        setHostile(npc.hostile || false);
        setMonsterLevel(npc.monster_level || 1);
    }, [npc]);

    if (!isOpen) return null;

    const handleSave = () => {
        const updatedNpc: RoomNPC = {
            ...npc,
            hostile,
            monster_level: hostile ? monsterLevel : undefined,
        };
        onSave(updatedNpc);
        onClose();
    };

    const handleCancel = () => {
        // Reset to original values
        setHostile(npc.hostile || false);
        setMonsterLevel(npc.monster_level || 1);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
            <div className="bg-stone-900 border border-stone-700 rounded-xl w-full max-w-2xl">
                {/* Header */}
                <div className="p-6 border-b border-stone-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1">NPC Settings</h2>
                        <p className="text-sm text-stone-400">{npcName}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<X size={20} />}
                        onClick={handleCancel}
                    />
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Hostile Toggle */}
                    <div className="bg-stone-800 border border-stone-700 rounded-lg p-4">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hostile}
                                onChange={(e) => setHostile(e.target.checked)}
                                className="w-5 h-5 mt-0.5 rounded border-stone-700 bg-stone-900 text-red-600 focus:ring-red-500 focus:ring-offset-0 cursor-pointer"
                            />
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <Shield size={16} className={hostile ? 'text-red-500' : 'text-stone-500'} />
                                    <span className="font-medium text-white">Hostile NPC</span>
                                </div>
                                <p className="text-xs text-stone-400">
                                    When enabled, clicking this NPC will initiate combat instead of conversation
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Monster Level - Only shown when hostile */}
                    {hostile && (
                        <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-4 space-y-3">
                            <div className="flex items-center gap-2 text-red-400 mb-2">
                                <Swords size={16} />
                                <span className="text-sm font-medium">Combat Settings</span>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-stone-300 mb-2">
                                    Monster Level
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="1"
                                        max="60"
                                        value={monsterLevel}
                                        onChange={(e) => setMonsterLevel(parseInt(e.target.value))}
                                        className="flex-1 h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        max="60"
                                        value={monsterLevel}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (val >= 1 && val <= 60) {
                                                setMonsterLevel(val);
                                            }
                                        }}
                                        className="w-20 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-red-500"
                                    />
                                </div>
                                <p className="text-xs text-stone-400 mt-2">
                                    Determines enemy stats, abilities, and difficulty (1-60)
                                </p>
                            </div>

                            {/* Level indicator */}
                            <div className="flex items-start gap-2 text-xs text-stone-400 bg-stone-900/50 rounded p-2">
                                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                <div>
                                    <span className="font-medium">
                                        {monsterLevel <= 10 && 'Beginner'}
                                        {monsterLevel > 10 && monsterLevel <= 25 && 'Intermediate'}
                                        {monsterLevel > 25 && monsterLevel <= 40 && 'Advanced'}
                                        {monsterLevel > 40 && monsterLevel <= 50 && 'Expert'}
                                        {monsterLevel > 50 && 'Legendary'}
                                    </span>
                                    {' - '}
                                    {monsterLevel <= 10 && 'Suitable for new players'}
                                    {monsterLevel > 10 && monsterLevel <= 25 && 'Moderate challenge'}
                                    {monsterLevel > 25 && monsterLevel <= 40 && 'Experienced players recommended'}
                                    {monsterLevel > 40 && monsterLevel <= 50 && 'Very challenging encounter'}
                                    {monsterLevel > 50 && 'Extreme difficulty - prepare well!'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Future settings placeholder */}
                    <div className="border-t border-stone-700 pt-4">
                        <p className="text-xs text-stone-500 italic">
                            Additional NPC settings (loot tables, dialogue overrides, spawn conditions) coming soon...
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-stone-700 flex items-center justify-end gap-3">
                    <Button
                        variant="secondary"
                        onClick={handleCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                    >
                        Save Settings
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default NPCSettingsModal;
