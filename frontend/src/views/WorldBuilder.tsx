import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCharacter } from '../contexts/CharacterContext';
import { CharacterData } from '../types/character';
import { WorldData, Room, NarratorVoice, TimeSystem } from '../types/worldV2';
import { generateUUID } from '../utils/generateUUID';
import RoomEditor from '../components/WorldBuilderV2/RoomEditor';
import WorldMap from '../components/WorldBuilderV2/WorldMap';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { ArrowLeft, Save, Map as MapIcon } from 'lucide-react';

const WorldBuilder: React.FC = () => {
    const { uuid } = useParams<{ uuid: string }>();
    const navigate = useNavigate();
    const { setCharacterData } = useCharacter();
    const [worldCard, setWorldCard] = useState<CharacterData | null>(null);
    const [worldData, setWorldData] = useState<WorldData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeView, setActiveView] = useState<'map' | 'list' | 'settings'>('map');
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

    // Initial Load
    useEffect(() => {
        const loadWorldCard = async () => {
            if (!uuid) return;
            try {
                setLoading(true);
                const response = await fetch(`/api/character/${uuid}`);
                if (!response.ok) throw new Error('Failed to load world card');
                
                const data = await response.json();
                if (data.success && data.data) {
                    const charData = data.data;
                    const mappedData: CharacterData = {
                        spec: "chara_card_v2",
                        spec_version: charData.spec_version,
                        data: {
                            name: charData.name,
                            description: charData.description,
                            personality: charData.personality,
                            scenario: charData.scenario,
                            first_mes: charData.first_mes,
                            mes_example: charData.mes_example,
                            creator_notes: charData.creator_comment,
                            tags: charData.tags,
                            extensions: charData.extensions_json || {},
                        }
                    };
                    
                    setWorldCard(mappedData);
                    
                    // Convert to CharacterCard format for Context (Schema mismatch adapter)
                    const contextData = {
                        name: mappedData.data.name,
                        description: mappedData.data.description || '',
                        personality: mappedData.data.personality || '',
                        scenario: mappedData.data.scenario || '',
                        first_mes: mappedData.data.first_mes || '',
                        mes_example: mappedData.data.mes_example || '',
                        creatorcomment: mappedData.data.creator_notes || '',
                        avatar: 'none',
                        chat: '',
                        talkativeness: '0.5',
                        fav: false,
                        tags: mappedData.data.tags || [],
                        spec: mappedData.spec,
                        spec_version: mappedData.spec_version || '2.0',
                        data: mappedData.data,
                        create_date: new Date().toISOString()
                    };
                    setCharacterData(contextData as any);
                    
                    // Parse World Data
                    const wData = mappedData.data.extensions?.world_data || {
                        rooms: [],
                        settings: { narrator_voice: NarratorVoice.DEFAULT, time_system: TimeSystem.TURN_BASED, global_scripts: [] },
                        player_state: { inventory: [], health: 100, stats: {}, flags: {} }
                    };
                    setWorldData(wData);
                }
            } catch (err) {
                console.error(err);
                alert('Failed to load world');
            } finally {
                setLoading(false);
            }
        };
        loadWorldCard();
    }, [uuid, setCharacterData]);

    // Save Function
    const handleSave = async () => {
        if (!worldCard || !worldData || !uuid) return;
        
        try {
            setSaving(true);
            
            // Construct updated character data
            const updatedExtensions = {
                ...worldCard.data.extensions,
                card_type: 'world' as const,
                world_data: worldData
            };
            
            const payload = {
                ...worldCard.data,
                extensions: updatedExtensions
            };

            // We need to use the update endpoint. 
            // The Character API usually expects fields to update.
            // Let's assume we can PUT to /api/character/{uuid} with the full data structure or partial.
            // Based on backend implementation, it likely expects Pydantic model structure.
            
            const response = await fetch(`/api/character/${uuid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: payload // Wrap in 'data' field as per CharacterData model
                })
            });

            if (!response.ok) throw new Error('Failed to save world');
            
            // Update local state
            setWorldCard(prev => prev ? { ...prev, data: payload } : null);
            
        } catch (err) {
            console.error(err);
            alert('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const handleRoomSave = (updatedRoom: Room) => {
        if (!worldData) return;
        
        const roomIndex = worldData.rooms.findIndex(r => r.id === updatedRoom.id);
        const newRooms = [...worldData.rooms];
        
        if (roomIndex >= 0) {
            newRooms[roomIndex] = updatedRoom;
        } else {
            newRooms.push(updatedRoom);
        }
        
        setWorldData({ ...worldData, rooms: newRooms });
        setSelectedRoom(null); // Close editor
        // Auto-save the world structure? Or wait for explicit save?
        // Let's wait for explicit save to avoid too many writes, but update local state.
    };

    const handleRoomDelete = (roomId: string) => {
        if (!worldData) return;
        if (!confirm('Are you sure you want to delete this room?')) return;
        
        const newRooms = worldData.rooms.filter(r => r.id !== roomId);
        setWorldData({ ...worldData, rooms: newRooms });
        setSelectedRoom(null);
    };

    const handleAddRoom = () => {
        const newRoom: Room = {
            id: generateUUID(),
            name: 'New Room',
            description: '',
            connections: [],
            npcs: [],
            items: [],
            visited: false
        };
        setSelectedRoom(newRoom);
    };

    if (loading) return <div className="h-full flex items-center justify-center"><LoadingSpinner text="Loading World Builder..." /></div>;
    if (!worldCard || !worldData) return <div className="h-full flex items-center justify-center text-red-500">Failed to load world data</div>;

    return (
        <div className="flex flex-col h-full bg-stone-950 text-white">
            {/* Toolbar */}
            <div className="h-14 border-b border-stone-800 bg-stone-900 flex items-center px-4 justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate(`/world/${uuid}/launcher`)}
                        className="text-stone-400 hover:text-white transition-colors"
                        title="Back to Launcher"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="font-bold text-lg text-stone-200">
                        World Builder: <span className="text-emerald-400">{worldCard.data.name}</span>
                    </h1>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveView('map')}
                        className={`p-2 rounded transition-colors ${activeView === 'map' ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-white'}`}
                        title="Map View"
                    >
                        <MapIcon size={20} />
                    </button>
                    <div className="w-px h-6 bg-stone-800 mx-2"></div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex items-center px-4 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-500 transition-colors ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <Save size={16} className="mr-2" />
                        {saving ? 'Saving...' : 'Save World'}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden relative">
                {activeView === 'map' && (
                    <WorldMap 
                        rooms={worldData.rooms} 
                        onSelectRoom={setSelectedRoom} 
                        onAddRoom={handleAddRoom}
                        worldId={uuid!}
                    />
                )}
                
                {/* Room Editor Modal/Overlay */}
                {selectedRoom && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
                        <div className="w-full max-w-4xl max-h-full overflow-y-auto">
                            <RoomEditor 
                                room={selectedRoom}
                                worldId={uuid!}
                                onSave={handleRoomSave}
                                onCancel={() => setSelectedRoom(null)}
                                onDelete={worldData.rooms.find(r => r.id === selectedRoom.id) ? () => handleRoomDelete(selectedRoom.id) : undefined}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorldBuilder;
