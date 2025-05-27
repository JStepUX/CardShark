import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { worldStateApi } from '../utils/worldStateApi';
import { useCharacter } from '../contexts/CharacterContext';
// Import WorldLocation directly
import { FullWorldState, WorldLocation, NpcGridItem } from '../types/worldState';
import { CharacterCard } from '../types/schema';
import { Room } from '../types/room';
import GridRoomMap from '../components/GridRoomMap'; // Only keep the GridRoomMap component we're using
import RoomEditor from '../components/RoomEditor';
import { Dialog } from '../components/Dialog';
import GalleryGrid from '../components/GalleryGrid';
import NpcCard from '../components/NpcCard';

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

// Helper function to normalize NPC data format
const normalizeNpc = (npc: any): NpcGridItem => {
  // If npc is already a valid object with name and path, return it
  if (typeof npc === 'object' && npc !== null && typeof npc.name === 'string' && typeof npc.path === 'string') {
    return npc as NpcGridItem;
  }
  
  // If npc is a string (path), create an object with path and derived name
  if (typeof npc === 'string') { // Corrected 'is' to '==='
    const pathParts = npc.split(/[\/\\]/);
    const fileName = pathParts[pathParts.length - 1];
    const name = fileName.replace(/\.\w+$/, ''); // Remove file extension
    
    return {
      character_id: npc, // Use the path as character_id
      name: name || 'Unknown Character',
      path: npc
    };
  }
  
  // Default fallback for unknown formats
  return {
    character_id: typeof npc === 'string' ? npc : 'unknown',
    name: 'Unknown Character',
    path: typeof npc === 'string' ? npc : ''
  };
};

const WorldBuilderView: React.FC = () => {
  // URL parameters
  const { worldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();
  const { setCharacterData: setContextCharacterData } = useCharacter();

  // State for fetched world data
  const [worldData, setWorldData] = useState<FullWorldState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // State for builder specific data
  const [roomsById, setRoomsById] = useState<Record<string, Room>>({});
  const [posToId, setPosToId] = useState<Record<string, string>>({});
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [availableNpcs, setAvailableNpcs] = useState<NpcGridItem[]>([]);
  // const [characterDirectory, setCharacterDirectory] = useState<string | null>(null); // Remove unused state

  const selectedRoom = selectedRoomId ? roomsById[selectedRoomId] : null;

  // Fetch world data when component mounts or worldId changes
  useEffect(() => {
    const fetchWorldDetails = async () => {
      if (!worldId) {
        setError("World ID is missing.");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const data: FullWorldState = await worldStateApi.getWorldState(worldId);
        
        // Log the original data for debugging
        console.log(`Loaded world data with ${Object.keys(data.locations || {}).length} locations`);
        
        // Add explicit connected=true to each location if not explicitly set to false
        // This ensures all locations can be displayed on the map
        const processedData = { ...data };
        if (processedData.locations) {
          Object.keys(processedData.locations).forEach(locationKey => {
            const location = processedData.locations[locationKey];
            if (location && location.connected !== false) {
              location.connected = true;
            }
          });
        }
        
        setWorldData(processedData);

        const initialRooms: Record<string, Room> = {};
        const initialPosToId: Record<string, string> = {};
        let initialSelectedRoomId: string | null = null;
        let defaultRoomCreated = false;

        const locationsSource = processedData.locations || {};
        const locationKeys = Object.keys(locationsSource);

        if (locationKeys.length > 0) {
          // Log number of locations for debugging
          console.log(`Processing ${locationKeys.length} locations from world data`);
          
          // Track locations with invalid coordinates for debugging
          const invalidLocations: string[] = [];
          
          locationKeys.forEach((coordKey) => {
            const loc: WorldLocation = locationsSource[coordKey];
            
            // Skip locations that are explicitly marked as not connected
            // (but process all others, including those with no connected property)
            if (loc.connected === false) {
              console.log(`Skipping location ${loc.name} as it's marked as not connected`);
              return;
            }
            
            if (!loc || !loc.location_id) {
              console.warn("Skipping location due to missing location_id:", loc);
              return;
            }
            
            // Handle potentially missing coordinates by parsing from the coordinate key
            let x = 0, y = 0;
            
            if (loc.coordinates && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
              // Use coordinates from location object if available
              x = loc.coordinates[0];
              y = loc.coordinates[1];
            } else {
              // Parse coordinates from the key (format: "x,y,z" or "x,y")
              try {
                const coords = coordKey.split(',').map(Number);
                if (coords.length >= 2) {
                  x = coords[0];
                  y = coords[1];
                } else {
                  invalidLocations.push(coordKey);
                  console.warn(`Invalid coordinate key format: ${coordKey} for location: ${loc.name}`);
                  return; // Skip this location
                }
              } catch (err) {
                invalidLocations.push(coordKey);
                console.warn(`Failed to parse coordinates from key: ${coordKey}`);
                return; // Skip this location
              }
            }

            // Create Room object from WorldLocation
            const room: Room = {
              id: loc.location_id,
              name: loc.name || `Room at (${x},${y})`,
              description: loc.description || '',
              x: x,
              y: y,
              neighbors: (loc as any).neighbors || {},
              npcs: (loc.npcs || []).map(normalizeNpc).map((npc: NpcGridItem) => ({ path: npc.path, name: npc.name }))
            };
            
            const roomPosKey = posKey(x, y);
            initialRooms[room.id] = room;
            initialPosToId[roomPosKey] = room.id;
            
            // Log for debugging
            console.log(`Processed location: ${room.name} at (${x},${y}) with ID ${room.id}`);
          });
          
          // Log any locations with invalid coordinates
          if (invalidLocations.length > 0) {
            console.warn(`${invalidLocations.length} locations had invalid coordinates and were skipped:`, invalidLocations);
          }

          // Check if we successfully created any rooms from locations
          if (Object.keys(initialRooms).length === 0) {
            console.warn("No valid rooms could be created from locations, creating a default room");
            defaultRoomCreated = true;
          } else {
            // Set the selected room ID based on current position
            const currentCoords = processedData.current_position?.split(',').map(Number);
            if (currentCoords && currentCoords.length >= 2) {
              const currentPosKey = posKey(currentCoords[0], currentCoords[1]);
              initialSelectedRoomId = initialPosToId[currentPosKey] || null;
            }

            if (!initialSelectedRoomId) {
              initialSelectedRoomId = Object.keys(initialRooms)[0] || null;
            }
          }

        } else {
          console.log("No locations found in world data, creating default starting room");
          defaultRoomCreated = true;
        }
        
        // Create a default room if needed (no valid locations or empty world)
        if (defaultRoomCreated) {
          const defaultRoom: Room = {
            id: `room-${worldId}-start`,
            name: 'Starting Room',
            description: 'Configure this room.',
            x: 0,
            y: 0,
            neighbors: {},
            npcs: []
          };
          initialRooms[defaultRoom.id] = defaultRoom;
          initialPosToId[posKey(0,0)] = defaultRoom.id;
          initialSelectedRoomId = defaultRoom.id;
        }
        
        // Log summary of processed data
        console.log(`Processed world data: ${Object.keys(initialRooms).length} rooms created`);

        setRoomsById(initialRooms);
        setPosToId(initialPosToId);
        setSelectedRoomId(initialSelectedRoomId);

      } catch (err: any) {
        console.error("Failed to fetch world details:", err);
        setError(`Failed to load world: ${err.message || 'Unknown error'}`);
        setWorldData(null);
        setRoomsById({});
        setPosToId({});
        setSelectedRoomId(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorldDetails();
  }, [worldId]);

  useEffect(() => {
    // Fetch settings first to get the character directory
    const fetchSettingsAndNpcs = async () => {
      let dirPath: string | null = null;
      try {
        const settingsResponse = await fetch('/api/settings');
        if (!settingsResponse.ok) throw new Error('Failed to load settings');
        const settingsData = await settingsResponse.json();
        if (settingsData.success && settingsData.settings.character_directory) {
          dirPath = settingsData.settings.character_directory;
          // setCharacterDirectory(dirPath); // Remove unused state update
        } else {
          console.error("Character directory not set in settings.");
          // Optionally set an error state here to inform the user
          return; // Stop if directory is not set
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
        // Optionally set an error state here
        return; // Stop if settings fetch fails
      }

      // Now fetch NPCs using the obtained directory path
      if (dirPath) {
        try {
          const response = await fetch(`/api/characters?directory=${encodeURIComponent(dirPath)}`); // Add directory param
          if (!response.ok) { // Check for non-2xx responses
            const errorData = await response.json().catch(() => ({ message: `Server error (${response.status})` }));
            throw new Error(errorData.message || `Failed to load characters. Status: ${response.status}`);
          }
          const data = await response.json();
          if (data && Array.isArray(data.files)) {
            const npcs = data.files.map((file: any) => normalizeNpc(file.path || file.name));
            setAvailableNpcs(npcs);
          } else if (data.success === false) {
             throw new Error(data.message || 'Backend indicated failure to list characters.');
          }
        } catch (error) {
          console.error("Failed to fetch available NPCs:", error);
          // Optionally set an error state here
          setAvailableNpcs([]); // Clear NPCs on error
        }
      }
    };

    fetchSettingsAndNpcs();
  }, []); // Dependency array remains empty as we only want this on mount


  const handlePlayHere = (roomId: string | null) => {
    if (!worldId || !roomId || !worldData || !roomsById[roomId]) return;

    const targetRoom = roomsById[roomId];
    const targetPosition = `${targetRoom.x},${targetRoom.y},0`;

    // --- START CHANGE ---
    // Use the target room's description or name for context
    const roomDescription = targetRoom.description || `You are in ${targetRoom.name}.`;
    // Use introduction if available, otherwise description
    const roomIntroduction = (targetRoom as any).introduction || targetRoom.description || `Welcome to ${targetRoom.name}.`;
    // --- END CHANGE ---

    const characterCardForContext: CharacterCard = {
      name: worldData.name || "World Narrator", // Use world name or a default
      description: roomDescription, // Use the room's description
      personality: "",
      scenario: `Exploring the world of ${worldData.name || 'Unknown'} at ${targetRoom.name}`, // More specific scenario
      first_mes: roomIntroduction, // Use the room's introduction/description
      mes_example: "",
      // --- START CHANGE ---
      // creatorcomment: "", // Removed access to worldData.creatorcomment
      creatorcomment: "World Narrator context card", // Provide a default comment
      // --- END CHANGE ---
      avatar: "none",
      chat: "",
      talkativeness: "0.5",
      fav: false,
      tags: ["world", worldData.name || "unknown", targetRoom.name], // Add room name tag
      spec: "chara_card_v2",
      spec_version: "2.0",
      // --- START CHANGE ---
      // create_date: worldData.create_date || "", // Removed access to worldData.create_date
      create_date: new Date().toISOString(), // Use current date as creation date for this context card
      // --- END CHANGE ---

      data: {
        name: worldData.name || "World Narrator",
        description: roomDescription, // Use the room's description
        personality: "",
        scenario: `Exploring the world of ${worldData.name || 'Unknown'} at ${targetRoom.name}`, // More specific scenario
        first_mes: roomIntroduction, // Use the room's introduction/description
        mes_example: "",
        // --- START CHANGE ---
        // creator_notes: worldData.creatorcomment || "", // Removed access to worldData.creatorcomment
        creator_notes: "Context card for world narration.", // Provide default notes
        // --- END CHANGE ---
        system_prompt: `You are the narrator describing the world of ${worldData.name || 'Unknown'}. The user is currently in ${targetRoom.name}. ${roomDescription}`, // Enhance system prompt
        post_history_instructions: "Describe the surroundings, events, and potential actions based on the current location.", // Enhance post history instructions
        tags: ["world", worldData.name || "unknown", targetRoom.name], // Add room name tag
        // --- START CHANGE ---
        // creator: worldData.creator || "", // Removed access to worldData.creator
        creator: "System", // Set creator to System
        // character_version: worldData.character_version || "1.0", // Removed access to worldData.character_version
        character_version: "1.0", // Set default version
        // --- END CHANGE ---
        alternate_greetings: [], // Could potentially add room-specific greetings later
        extensions: {
          talkativeness: "0.5",
          fav: false,
          world: worldData.name || "Unknown World",
          depth_prompt: { prompt: "", depth: 4, role: "system" }
        },
        group_only_greetings: [],
        character_book: {
          entries: (worldData as any).worldItems?.map((item: any) => ({
            keys: [item.name || "Unknown Item"],
            content: item.description || ""
          })) || [],
          name: "World Items"
        },
        spec: ''
      }
    };

    setContextCharacterData(characterCardForContext);

    navigate(`/worldcards/${encodeURIComponent(worldId)}/play?startPos=${targetPosition}`);
  };

  // Add an effect to auto-save when rooms change or on component unmount
  useEffect(() => {
    // Skip the initial render
    if (Object.keys(roomsById).length === 0) return;
    
    // Create a debounced save function to prevent saving too frequently
    const saveTimeout = setTimeout(() => {
      console.log("Auto-saving world state...");
      handleSaveWorld();
    }, 1000); // 1-second debounce
    
    // Clean up timeout on unmount or when dependencies change
    return () => clearTimeout(saveTimeout);
  }, [roomsById]); // Depend on roomsById to trigger save when rooms change

  // Add an effect to handle saving on navigation away
  useEffect(() => {
    // Define the beforeunload handler
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Save world state when user tries to leave
      handleSaveWorld();
      // Modern browsers require returnValue to be set
      e.returnValue = '';
    };
    
    // Add the event listener
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Clean up the event listener on unmount
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);  // Empty dependency array means this runs once on mount

  // Modify handleCreateRoom to save automatically
  const handleCreateRoom = (x: number, y: number) => {
    if (!worldId) return;

    const newRoomId = `room-${worldId}-${Date.now()}`;
    const newRoom: Room = {
      id: newRoomId,
      name: `New Room (${x},${y})`,
      description: '',
      x: x,
      y: y,
      neighbors: {},
      npcs: []
    };

    const newPosKey = posKey(x, y);

    setRoomsById(prev => ({ ...prev, [newRoomId]: newRoom }));
    setPosToId(prev => ({ ...prev, [newPosKey]: newRoomId }));
    setSelectedRoomId(newRoomId);
    
    // Schedule an immediate save after creating a room
    setTimeout(() => handleSaveWorld(), 100);
  };

  // Modify handleUpdateRoom to save after updates
  const handleUpdateRoom = (roomId: string, updates: Partial<Room>) => {
    setRoomsById(prev => {
      const roomToUpdate = prev[roomId];
      if (!roomToUpdate) return prev;
      // Ensure NPCs are preserved if not part of the update
      const updatedRoom = { ...roomToUpdate, ...updates };
      if (!updates.npcs) {
         updatedRoom.npcs = roomToUpdate.npcs;
      }
      return {
        ...prev,
        [roomId]: updatedRoom
      };
    });
    
    // Schedule a save after room update
    setTimeout(() => handleSaveWorld(), 100);
  };

  const handleDeleteRoom = (roomId: string) => {
    if (!roomId || Object.keys(roomsById).length <= 1) {
      console.warn("Cannot delete the last room.");
      return;
    }

    const roomToDelete = roomsById[roomId];
    if (!roomToDelete) return;

    const { x, y } = roomToDelete;
    const currentPosKey = posKey(x, y);

    setRoomsById(prev => {
      const newState = { ...prev };
      delete newState[roomId];
      return newState;
    });
    setPosToId(prev => {
      const newState = { ...prev };
      delete newState[currentPosKey];
      return newState;
    });

    if (selectedRoomId === roomId) {
      const remainingRoomIds = Object.keys(roomsById).filter(id => id !== roomId);
      setSelectedRoomId(remainingRoomIds[0] || null);
    }
  };

  const handleOpenNpcModal = () => {
    if (!selectedRoomId) return;
    setNpcModalOpen(true);
  };

  // Update handleAddNpcToRoom to handle path resolution more robustly
  const handleAddNpcToRoom = useCallback((npc: NpcGridItem) => {
    if (!selectedRoomId) return;

    // Ensure we have a proper path before adding
    if (!npc.path) {
      console.error("Cannot add NPC without a valid path");
      return;
    }

    setRoomsById(prev => {
      const room = prev[selectedRoomId];
      if (!room) return prev;
      
      // Check if this NPC is already in the room to avoid duplicates
      if (room.npcs.some(n => n.path === npc.path)) {
        console.log(`NPC ${npc.name} is already in this room`);
        return prev;
      }
      
      return {
        ...prev,
        [selectedRoomId]: {
          ...room,
          npcs: [...room.npcs, { path: npc.path, name: npc.name }]
        }
      };
    });
    
    // Provide visual feedback that NPC was added
    // You could display a toast or other notification here
    console.log(`Added ${npc.name} to room ${selectedRoomId}`);
  }, [selectedRoomId]);

  const handleRemoveNpcFromRoom = (npcPath: string) => {
    if (!selectedRoomId) return;

    setRoomsById(prev => {
      const room = prev[selectedRoomId];
      if (!room) return prev;
      return {
        ...prev,
        [selectedRoomId]: {
          ...room,
          npcs: room.npcs.filter(n => n.path !== npcPath)
        }
      };
    });
  };

  const prepareWorldStateForSave = (): FullWorldState | null => {
    if (!worldData || !selectedRoomId) return null;

    const currentRoom = roomsById[selectedRoomId];
    const currentPositionString = currentRoom ? `${currentRoom.x},${currentRoom.y},0` : worldData.current_position || "0,0,0";

    const locations: Record<string, WorldLocation> = {};
    Object.values(roomsById).forEach(room => {
      const coordKey = `${room.x},${room.y},0`;
      
      // Preserve any existing location data
      const existingLocation = worldData.locations?.[coordKey];
      
      locations[coordKey] = {
        location_id: room.id,
        name: room.name,
        description: room.description || '',
        coordinates: [room.x, room.y, 0],
        npcs: room.npcs.map(npc => npc.path),
        zone_id: existingLocation?.zone_id,
        room_type: existingLocation?.room_type,
        notes: existingLocation?.notes,
        background: existingLocation?.background,
        events: existingLocation?.events || [],
        explicit_exits: existingLocation?.explicit_exits || {},
        lore_source: existingLocation?.lore_source || '',
        connected: true,
        introduction: existingLocation?.introduction || room.description || '',
      };
    });

    // Create a deep copy to avoid modifying the original state
    const worldStateForSave: FullWorldState = {
      ...JSON.parse(JSON.stringify(worldData)),
      current_position: currentPositionString,
      locations: locations,
      unconnected_locations: worldData.unconnected_locations || {},
      player: worldData.player || { health: 100, stamina: 100, level: 1, experience: 0 },
      visited_positions: worldData.visited_positions || [],
      // Remove any properties that shouldn't be in the final state
      rooms: undefined,
    };

    console.log('Prepared world state for save:', worldStateForSave);
    return worldStateForSave;
  };

  // Add a new function to handle explicit saves
  const handleSaveWorld = async () => {
    const worldStateToSave = prepareWorldStateForSave();
    if (!worldStateToSave || !worldId) {
      console.error("Cannot save world: Invalid world state or missing world ID");
      return;
    }
    
    try {
      const success = await worldStateApi.saveWorldState(worldId, worldStateToSave);
      if (success) {
        console.log("World saved successfully");
        // Update local state to match saved state
        setWorldData(worldStateToSave);
      } else {
        console.error("Failed to save world");
      }
    } catch (error) {
      console.error("Error saving world:", error);
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading world builder...</div>;
  }
  if (error) {
    return <div className="p-6 text-red-500">Error: {error}</div>;
  }
  if (!worldData || !selectedRoom) {
     return <div className="p-6">World data could not be loaded or no room selected.</div>;
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <button
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          onClick={() => navigate('/worldcards')}
        >
          Worlds
        </button>
        <span className="text-gray-400">/</span>
        <span className="font-semibold text-stone-900 dark:text-stone-100">{worldData.name}</span>
        <div className="ml-auto">
          <button
            className="px-6 py-2 rounded-lg shadow bg-green-700 text-white hover:bg-green-800 transition-colors font-medium"
            onClick={handleSaveWorld}
          >
            Save World
          </button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col items-center justify-center flex-1 p-6 overflow-auto bg-stone-100 dark:bg-stone-900">
          <GridRoomMap
            roomsById={roomsById}
            posToId={posToId}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
            onCreateRoom={(x, y) => handleCreateRoom(x, y)}
            debugMode={true}
            gridSize={5} // Changed from 6 to 5 for a proper central room
          />
        </div>

        <div className="w-1/3 max-w-md border-l border-stone-200 dark:border-stone-800 flex flex-col bg-white dark:bg-stone-950">
          {selectedRoom ? (
            <RoomEditor
              key={selectedRoom.id}
              room={selectedRoom}
              // Create a new function that captures the selectedRoomId
              onUpdate={(updates) => handleUpdateRoom(selectedRoom.id, updates)}
              onDelete={() => handleDeleteRoom(selectedRoom.id)}
              onPlayHere={() => handlePlayHere(selectedRoom.id)}
              onAddNpc={handleOpenNpcModal}
              onRemoveNpc={handleRemoveNpcFromRoom}
            />
          ) : (
            <div className="p-6 text-center text-stone-500 dark:text-stone-400">
              Select a room on the map to edit it, or click an empty space to create one.
            </div>
          )}
        </div>
      </div>

      <Dialog
        isOpen={npcModalOpen}
        onClose={() => setNpcModalOpen(false)}
        title={`Add NPC to ${selectedRoom?.name || 'Room'}`}
        className="max-w-3xl"
      >
        <p className="text-sm text-stone-400 mb-4">
          Select an NPC character card to add to this location.
        </p>
        <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2 mb-4">
          <GalleryGrid
            items={availableNpcs}
            emptyMessage="No character cards found."
            renderItem={(npc, idx) => (
              <NpcCard
                key={npc.path || idx}
                npc={npc}
                onClick={() => handleAddNpcToRoom(npc)}
              />
            )}
          />
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={() => setNpcModalOpen(false)}
            className="px-4 py-2 bg-stone-600 hover:bg-stone-500 text-white rounded text-sm"
          >
            Done
          </button>
        </div>
      </Dialog>
    </div>
  );
};

export default WorldBuilderView;
