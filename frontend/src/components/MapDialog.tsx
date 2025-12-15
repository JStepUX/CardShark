import React, { useState, useEffect, useMemo } from 'react';
import { Dialog } from './common/Dialog';
import GridRoomMap from './GridRoomMap'; // Keep only the GridRoomMap import
import { Room } from '../types/room';
import { FullWorldState } from '../types/worldState';
import worldStateApi from '../utils/worldStateApi';

interface MapDialogProps {
  isOpen: boolean;
  onClose: () => void;
  worldId: string | undefined;
  onRoomSelect?: (roomId: string, position: string) => void;
  playMode?: boolean; // Add playMode prop
}

const MapDialog: React.FC<MapDialogProps> = ({
  isOpen,
  onClose,
  worldId,
  onRoomSelect,
  playMode = false // Default to false for backward compatibility
}) => {
  // State for world data
  const [worldData, setWorldData] = useState<FullWorldState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Room state for the map
  const [roomsById, setRoomsById] = useState<Record<string, Room>>({});
  const [posToId, setPosToId] = useState<Record<string, string>>({});
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  
  // Process the world data with useMemo to prevent recalculations on every render
  const processedData = useMemo(() => {
    // Create empty collections
    const processedRoomsById: Record<string, Room> = {};
    const processedPosToId: Record<string, string> = {};
    
    // Process locations if we have world data
    if (worldData?.locations) {
      Object.entries(worldData.locations).forEach(([position, location]) => {
        // Skip unconnected locations or locations without IDs
        if (!location || !location.location_id || location.connected === false) {
          console.warn(`Skipping location at ${position} due to missing location_id or not connected`);
          return;
        }

        // Handle both 2D (x,y) and 3D (x,y,z) coordinates
        const coords = position.split(',').map(Number);
        const x = coords[0] || 0;
        const y = coords[1] || 0;
        
        // The issue was in the lookup mechanism - we need to create various position keys
        const posKey = `${x},${y}`; // This is the key format used in the RoomMap component
        const pos3DKey = position; // Original 3D position from world state
        
        // Create a Room object from the WorldLocation
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

        // Add the room to our collections
        processedRoomsById[location.location_id] = room;
        processedPosToId[posKey] = location.location_id;
        processedPosToId[pos3DKey] = location.location_id;
      });
    }
    
    // Get the currently selected room ID from the current position
    const currentPosition = worldData?.current_position || '';
    // First try the full position format
    let selectedId = currentPosition ? processedPosToId[currentPosition] : null;
    
    // If that doesn't work, try extracting the x,y coords only
    if (!selectedId && currentPosition) {
      const coords = currentPosition.split(',').map(Number);
      const x = coords[0] || 0;
      const y = coords[1] || 0;
      const simplifiedPos = `${x},${y}`;
      selectedId = processedPosToId[simplifiedPos];
    }
    
    // Check if we have rooms to display
    const hasRooms = Object.keys(processedRoomsById).length > 0;
    
    return { 
      processedRoomsById, 
      processedPosToId, 
      selectedId, 
      hasRooms
    };
  }, [worldData]); // Only recalculate when worldData changes

  // Update state based on processed data - correctly moved out of useMemo
  useEffect(() => {
    if (worldData) {
      setRoomsById(processedData.processedRoomsById);
      setPosToId(processedData.processedPosToId);
      setSelectedRoomId(processedData.selectedId);
    }
  }, [processedData, worldData]);
  
  // Load world data when the dialog opens
  useEffect(() => {
    if (isOpen && worldId) {
      setIsLoading(true);
      setError(null);
      
      worldStateApi.getWorldState(worldId)
        .then(data => {
          console.log("World data loaded:", data);
          setWorldData(data);
          
          // Create debug info about locations
          if (data?.locations) {
            const locationCount = Object.keys(data.locations).length;
            
            if (locationCount === 0) {
              setError("No locations found in this world");
            }
          } else {
            setError("World has no locations defined");
          }
          
          setIsLoading(false);
        })
        .catch(err => {
          console.error("Failed to load world map:", err);
          setError(`Failed to load world map: ${err.message || 'Unknown error'}`);
          setIsLoading(false);
        });
    }
  }, [isOpen, worldId]);

  // Handler for selecting a room from the map
  const handleSelectRoom = (roomId: string) => {
    // Find the position for this room id
    const position = Object.entries(posToId).find(([_, id]) => id === roomId)?.[0];
    
    if (position && onRoomSelect) {
      // Call the parent handler with the room ID and position
      onRoomSelect(roomId, position);
      // Close the dialog
      onClose();
    }
  };
  
  // Prevent updates during loading
  const handleCreateRoom = () => {
    // No-op in play mode - we don't allow room creation
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="World Map"
      className="max-w-5xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      ) : error ? (
        <div className="text-red-500 p-4 text-center">
          {error}
          <div className="mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-stone-600 hover:bg-stone-500 text-white rounded"
            >
              Close
            </button>
          </div>
        </div>
      ) : !processedData.hasRooms ? (
        <div className="p-4 text-center">
          <p className="text-amber-400">No rooms found in this world.</p>
          <p className="text-sm text-stone-400 mt-2">
            Try creating rooms in the World Builder first.
          </p>
          <div className="mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-stone-600 hover:bg-stone-500 text-white rounded"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-sm text-stone-400 mb-4">
            {playMode 
              ? "Select a room to travel there. Your current location is highlighted."
              : "Navigate and manage rooms in your world."}
          </div>
          <div className="max-h-[70vh] overflow-auto relative z-10">
            <GridRoomMap
              roomsById={roomsById}
              posToId={posToId}
              selectedRoomId={selectedRoomId}
              onSelectRoom={handleSelectRoom}
              onCreateRoom={handleCreateRoom}
              playMode={playMode}
              debugMode={false} // Never show coordinate debug info
              gridSize={5}
            />
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-stone-600 hover:bg-stone-500 text-white rounded text-sm"
            >
              Close
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
};

export default MapDialog;