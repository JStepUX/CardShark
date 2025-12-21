
import React, { useState, useEffect, useCallback } from 'react';
import { Room, WorldData } from '../../types/world';
import { worldDataService } from '../../services/WorldDataService';
import GameWorldIconBar from '../GameWorldIconBar';
import LoadingSpinner from '../common/LoadingSpinner';
import { MapPin, ArrowRight, Users } from 'lucide-react';
import { useCharacter } from '../../contexts/CharacterContext';

interface WorldSidePanelProps {
    worldId: string;
    currentRoomId: string | null;
    onRoomChange: (room: Room, worldState: WorldData) => void;
    onNpcClick?: () => void;
    onInventoryClick?: () => void;
    onSpellsClick?: () => void;
    onMeleeClick?: () => void;
}

const WorldSidePanel: React.FC<WorldSidePanelProps> = ({
    worldId,
    currentRoomId: propRoomId,
    onRoomChange,
    onNpcClick,
    onInventoryClick,
    onSpellsClick,
    onMeleeClick
}) => {
    const { characterData } = useCharacter();
    const [worldData, setWorldData] = useState<WorldData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadWorldData = useCallback(async () => {
        if (!worldId) return;
        setIsLoading(true);
        setError(null);
        try {
            // Priority: Use data from context if it's the right world
            const ctxExt = characterData?.data?.extensions as any;
            const uuid = (characterData as any)?.character_uuid;
            if (ctxExt?.world_data && uuid === worldId) {
                setWorldData(ctxExt.world_data);
                return;
            }

            // Fallback: load from API
            const data = await worldDataService.loadWorld(worldId);
            setWorldData(data);
        } catch (err: any) {
            console.error("Failed to load world data:", err);
            setError(`Failed to load world data: ${err.message || 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    }, [worldId, characterData]);

    useEffect(() => {
        loadWorldData();
    }, [loadWorldData]);

    const activeRoomId = propRoomId || worldData?.player_state?.current_room_id;
    const currentRoom = worldData?.rooms?.find(r => r.id === activeRoomId) || null;

    const handleNavigate = async (targetId: string) => {
        if (!worldData) return;

        const targetRoom = worldData.rooms.find(r => r.id === targetId);
        if (!targetRoom) return;

        const updatedState: WorldData = {
            ...worldData,
            player_state: {
                ...worldData.player_state,
                current_room_id: targetId
            }
        };

        setWorldData(updatedState);
        onRoomChange(targetRoom, updatedState);

        try {
            await worldDataService.saveWorldState(worldId, updatedState);
        } catch (e) {
            console.error("Failed to save navigation state", e);
        }
    };

    return (
        <div className="flex flex-col h-full bg-stone-900 border-l border-stone-800 w-[400px] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-stone-800 bg-stone-950/50">
                <div className="flex items-center gap-2 mb-1">
                    <MapPin size={18} className="text-emerald-500" />
                    <h2 className="text-lg font-bold text-stone-100 truncate">
                        {worldData?.name || 'World Exploration'}
                    </h2>
                </div>
                <p className="text-sm text-stone-400 font-medium">
                    {currentRoom?.name || 'Unknown Location'}
                </p>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {isLoading && !worldData ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <LoadingSpinner />
                        <p className="text-stone-500 animate-pulse text-sm">Loading world map...</p>
                    </div>
                ) : error ? (
                    <div className="m-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-sm text-center">
                        {error}
                        <button
                            onClick={() => loadWorldData()}
                            className="block mx-auto mt-2 text-red-300 hover:underline"
                        >
                            Retry
                        </button>
                    </div>
                ) : currentRoom ? (
                    <div className="p-4 space-y-6">
                        {/* Room Description */}
                        <div className="bg-stone-800/30 p-4 rounded-xl border border-stone-700/50">
                            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">Description</h3>
                            <p className="text-stone-300 text-sm leading-relaxed italic">
                                "{currentRoom.description}"
                            </p>
                        </div>

                        {/* Navigation / Exits */}
                        <div>
                            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ArrowRight size={14} /> Available Exits
                            </h3>
                            <div className="grid grid-cols-1 gap-2">
                                {currentRoom.connections?.length > 0 ? (
                                    currentRoom.connections.map((conn, idx) => {
                                        const target = worldData?.rooms?.find(r => r.id === conn.target_room_id);
                                        return (
                                            <button
                                                key={`${conn.target_room_id}-${idx}`}
                                                onClick={() => handleNavigate(conn.target_room_id)}
                                                className="group flex items-center justify-between p-3 bg-stone-800 hover:bg-emerald-900/30 border border-stone-700 hover:border-emerald-500/50 rounded-lg transition-all text-left"
                                            >
                                                <div>
                                                    <span className="block text-stone-200 font-bold text-sm group-hover:text-emerald-400 transition-colors">
                                                        {conn.direction}
                                                    </span>
                                                    <span className="text-xs text-stone-500 block truncate w-64">
                                                        {target?.name || 'Unknown Room'}
                                                    </span>
                                                </div>
                                                <ArrowRight size={16} className="text-stone-600 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                                            </button>
                                        );
                                    })
                                ) : (
                                    <p className="text-stone-600 text-sm italic py-2">No obvious exits... you are trapped.</p>
                                )}
                            </div>
                        </div>

                        {/* NPCs Present */}
                        {currentRoom.npcs?.length > 0 && (
                            <div>
                                <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Users size={14} /> Inhabitants
                                </h3>
                                <div className="space-y-2">
                                    {currentRoom.npcs.map((npc, idx) => {
                                        const npcName = npc.character_id.split(/[/\\]/).pop()?.replace('.png', '') || 'Unknown';
                                        return (
                                            <div key={idx} className="flex items-center gap-3 p-2 bg-stone-800/50 rounded-lg border border-stone-700/30">
                                                <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center overflow-hidden">
                                                    <img
                                                        src={`/api/character-image/${encodeURIComponent(npc.character_id)}`}
                                                        alt={npcName}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150')}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium text-stone-300">{npcName}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-stone-600 italic">
                        Select a location to explore
                    </div>
                )}
            </div>

            {/* Footer / Icon Bar */}
            <div className="p-4 border-t border-stone-800 bg-stone-950/80 backdrop-blur-md">
                <GameWorldIconBar
                    onMap={() => { }}
                    onInventory={onInventoryClick}
                    onSpells={onSpellsClick}
                    onMelee={onMeleeClick}
                    onNpcs={onNpcClick}
                    npcCount={currentRoom?.npcs?.length || 0}
                />
            </div>
        </div>
    );
};

export default WorldSidePanel;
