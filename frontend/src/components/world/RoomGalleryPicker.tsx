/**
 * Room Gallery Picker Component
 * Modal for selecting existing room cards from the gallery
 * @dependencies roomApi, CharacterFile types
 */
import React, { useState, useEffect } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { roomApi } from '../../api/roomApi';
import { RoomCardSummary } from '../../types/room';

interface RoomGalleryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (room: RoomCardSummary) => void;
  excludeRoomIds?: string[]; // Rooms already assigned to world
}

export const RoomGalleryPicker: React.FC<RoomGalleryPickerProps> = ({
  isOpen,
  onClose,
  onSelect,
  excludeRoomIds = [],
}) => {
  const [rooms, setRooms] = useState<RoomCardSummary[]>([]);
  const [filteredRooms, setFilteredRooms] = useState<RoomCardSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load rooms on mount
  useEffect(() => {
    if (isOpen) {
      loadRooms();
    }
  }, [isOpen]);

  // Filter rooms based on search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredRooms(rooms.filter(r => !excludeRoomIds.includes(r.uuid)));
    } else {
      const search = searchTerm.toLowerCase();
      setFilteredRooms(
        rooms.filter(
          (r) =>
            !excludeRoomIds.includes(r.uuid) &&
            (r.name.toLowerCase().includes(search) ||
              r.description.toLowerCase().includes(search))
        )
      );
    }
  }, [searchTerm, rooms, excludeRoomIds]);

  const loadRooms = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const roomList = await roomApi.listRooms();
      setRooms(roomList);
      setFilteredRooms(roomList.filter(r => !excludeRoomIds.includes(r.uuid)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (room: RoomCardSummary) => {
    onSelect(room);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-stone-900 rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col border border-stone-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-700">
          <h2 className="text-xl font-bold text-white">Select Room from Gallery</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-stone-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search rooms..."
              className="w-full pl-10 pr-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400">{error}</p>
              <button
                onClick={loadRooms}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-stone-400">
                {searchTerm ? 'No rooms match your search' : 'No rooms available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRooms.map((room) => (
                <button
                  key={room.uuid}
                  onClick={() => handleSelect(room)}
                  className="group text-left p-4 bg-stone-800 border border-stone-700 rounded-lg hover:border-purple-500 hover:bg-stone-750 transition-all"
                >
                  {/* Room Image */}
                  {room.image_path && (
                    <div className="w-full aspect-video bg-stone-950 rounded-lg overflow-hidden mb-3">
                      <img
                        src={`/api/room-cards/${room.uuid}/image`}
                        alt={room.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => {
                          e.currentTarget.src = '/pngPlaceholder.png';
                        }}
                      />
                    </div>
                  )}

                  {/* Room Info */}
                  <h3 className="text-white font-medium mb-1 group-hover:text-purple-400 transition-colors">
                    {room.name}
                  </h3>
                  <p className="text-sm text-stone-400 line-clamp-2">
                    {room.description || 'No description'}
                  </p>

                  {/* Room Stats */}
                  {room.npc_count && room.npc_count > 0 && (
                    <div className="mt-2 text-xs text-stone-500">
                      {room.npc_count} NPC{room.npc_count > 1 ? 's' : ''}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-700 bg-stone-850">
          <p className="text-sm text-stone-400">
            {filteredRooms.length} room{filteredRooms.length !== 1 ? 's' : ''} available
          </p>
        </div>
      </div>
    </div>
  );
};

export default RoomGalleryPicker;
