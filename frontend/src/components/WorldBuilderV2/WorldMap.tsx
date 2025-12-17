import React from 'react';
import { Room } from '../../types/worldV2';
import { Plus, MapPin } from 'lucide-react';

interface WorldMapProps {
    rooms: Room[];
    onSelectRoom: (room: Room) => void;
    onAddRoom: () => void;
    worldId: string;
}

const WorldMap: React.FC<WorldMapProps> = ({ rooms, onSelectRoom, onAddRoom, worldId }) => {
    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* Add New Room Card */}
                <button
                    onClick={onAddRoom}
                    className="aspect-video bg-stone-900/50 border-2 border-dashed border-stone-800 rounded-lg hover:border-emerald-500/50 hover:bg-stone-900 transition-all flex flex-col items-center justify-center group"
                >
                    <div className="bg-stone-800 p-3 rounded-full mb-2 group-hover:scale-110 transition-transform">
                        <Plus className="text-stone-400 group-hover:text-emerald-400" size={24} />
                    </div>
                    <span className="text-stone-500 font-medium group-hover:text-emerald-400">Add Room</span>
                </button>

                {/* Existing Rooms */}
                {rooms.map((room) => (
                    <div 
                        key={room.id}
                        onClick={() => onSelectRoom(room)}
                        className="aspect-video bg-stone-900 border border-stone-800 rounded-lg overflow-hidden cursor-pointer hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-900/10 transition-all group relative"
                    >
                        {/* Background Image Preview */}
                        {room.image_path ? (
                            <img 
                                src={`/api/world-assets/${worldId}/${room.image_path.split('/').pop()}`}
                                alt={room.name}
                                className="w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-stone-950">
                                <MapPin className="text-stone-800 group-hover:text-stone-700" size={48} />
                            </div>
                        )}

                        {/* Overlay Info */}
                        <div className="absolute inset-0 flex flex-col justify-end p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                            <h4 className="font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                                {room.name}
                            </h4>
                            <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-stone-400 font-mono">{room.id}</span>
                                <span className="text-xs bg-stone-800 text-stone-300 px-1.5 py-0.5 rounded">
                                    {room.connections.length} Exits
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WorldMap;






