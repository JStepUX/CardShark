
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import GridRoomMap from '../world/GridRoomMap';
import { Room } from '../../types/room';
import { FullWorldState } from '../../types/worldState';
import { worldDataService } from '../../services/WorldDataService';
import GameWorldIconBar from '../GameWorldIconBar';
import LoadingSpinner from '../common/LoadingSpinner';

interface WorldSidePanelProps {
    worldId: string;
    currentRoomId: string | null;
    onRoomChange: (room: Room, position: string, worldState: FullWorldState) => void;
    onNpcClick?: () => void;
    onInventoryClick?: () => void;
    onSpellsClick?: () => void;
    onMeleeClick?: () => void;
}

const WorldSidePanel: React.FC<WorldSidePanelProps> = ({
    worldId,
    currentRoomId,
    onRoomChange,
    onNpcClick,
    onInventoryClick,
    onSpellsClick,
    onMeleeClick
}) => {
    const [worldData, setWorldData] = useState<FullWorldState | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [roomsById, setRoomsById] = useState<Record<string, Room>>({});
    const [posToId, setPosToId] = useState<Record<string, string>>({});

    const loadWorldData = useCallback(async () => {
        if (!worldId) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await worldDataService.loadWorld(worldId);
            // Ensure connections (logic from WorldCardsPlayView)
            if (data && data.locations) {
                Object.entries(data.locations).forEach(([_, location]: [string, any]) => {
                    if (location && location.connected !== false) {
                        location.connected = true;
                    }
                });
            }
            setWorldData(data);

            // Determine current room on initial load
            if (data) {
                const { room: currentLoc, position: currentPos } = worldDataService.getCurrentRoom(data);
                if (currentLoc && currentPos) {
                    // Convert WorldLocation to Room structure if needed, or rely on processing below
                    // But we need to pass strict Room object to onRoomChange usually?
                    // Let's defer initial onRoomChange until we process rooms
                }
            }
        } catch (err: any) {
            console.error("Failed to load world map:", err);
            setError(`Failed to load world map: ${err.message || 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    }, [worldId]);

    useEffect(() => {
        loadWorldData();
    }, [loadWorldData]);

    // Process data for the map
    const processedData = useMemo(() => {
        const processedRoomsById: Record<string, Room> = {};
        const processedPosToId: Record<string, string> = {};

        if (worldData?.locations) {
            Object.entries(worldData.locations).forEach(([position, location]) => {
                if (!location || !location.location_id || location.connected === false) {
                    return;
                }

                const coords = position.split(',').map(Number);
                const x = coords[0] || 0;
                const y = coords[1] || 0;

                const posKey = `${x},${y}`;
                const pos3DKey = position;

                const room: Room = {
                    id: location.location_id,
                    name: location.name || 'Unnamed Room',
                    description: location.description || '',
                    introduction: location.introduction || location.description || '',
                    x,
                    y,
                    npcs: (location.npcs || []).map((path: string) => {
                        const name = path.split(/[/\\]/).pop()?.replace('.png', '') || 'Unknown NPC';
                        return { path, name };
                    }),
                    neighbors: {}
                };

                processedRoomsById[location.location_id] = room;
                processedPosToId[posKey] = location.location_id;
                processedPosToId[pos3DKey] = location.location_id;
            });
        }

        return { processedRoomsById, processedPosToId };
    }, [worldData]);

    useEffect(() => {
        setRoomsById(processedData.processedRoomsById);
        setPosToId(processedData.processedPosToId);

        // Initial sync with parent if needed
        if (worldData && processedData.processedRoomsById && !currentRoomId) {
            const { room: currentLoc, position: currentPos } = worldDataService.getCurrentRoom(worldData);
            if (currentLoc && currentPos && processedData.processedRoomsById[currentLoc.location_id]) {
                onRoomChange(processedData.processedRoomsById[currentLoc.location_id], currentPos, worldData);
            }
        }
    }, [processedData, worldData, currentRoomId, onRoomChange]);


    const handleSelectRoom = async (roomId: string) => {
        if (!worldData || !worldId) return;

        // Find position
        const position = Object.entries(posToId).find(([_, id]) => id === roomId)?.[0];
        if (position && roomsById[roomId]) {
            // Optimistically update
            const updatedState = {
                ...worldData,
                current_position: position,
                visited_positions: worldData.visited_positions.includes(position)
                    ? worldData.visited_positions
                    : [...worldData.visited_positions, position]
            };
            setWorldData(updatedState);

            // Notify parent
            onRoomChange(roomsById[roomId], position, updatedState);

            // Persist
            try {
                await worldDataService.saveWorldState(worldId, updatedState);
            } catch (e) {
                console.error("Failed to save world state", e);
                // Revert? For now just log
            }
        }
    };

    const currentRoom = currentRoomId ? roomsById[currentRoomId] : null;

    return (
        <div className="flex flex-col h-full bg-stone-900 border-l border-stone-800 w-[400px]">
            <div className="p-4 border-b border-stone-800">
                <h2 className="text-lg font-semibold text-stone-200">{worldData?.name || 'World'}</h2>
                <p className="text-xs text-stone-500">
                    {currentRoom ? currentRoom.name : 'Unknown Location'}
                </p>
            </div>

            <div className="flex-1 overflow-hidden p-4 relative">
                {isLoading && !worldData ? (
                    <div className="flex justify-center p-8"><LoadingSpinner /></div>
                ) : error ? (
                    <div className="text-red-400 p-4 text-center">{error}</div>
                ) : (
                    <div className="h-full overflow-auto">
                        <GridRoomMap
                            roomsById={roomsById}
                            posToId={posToId}
                            selectedRoomId={currentRoomId}
                            onSelectRoom={handleSelectRoom}
                            onCreateRoom={() => { }} // No-op for play mode
                            playMode={true}
                            gridSize={5}
                        />
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-stone-800 bg-stone-900/95 sticky bottom-0">
                <GameWorldIconBar
                    onMap={() => { }} // Map is always visible
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
