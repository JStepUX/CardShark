import React, { useState, useEffect, useCallback } from 'react'; // Added useEffect, useCallback
import { useNavigate, useParams } from 'react-router-dom'; // Added useParams
import GalleryGrid from '../components/GalleryGrid';
import RoomMap from "../components/RoomMap";
import NpcSelectorModal from "../components/NpcSelectorModal";
import WorldSaveButton from "../components/WorldSaveButton";
import { useCharacter } from '../contexts/CharacterContext'; // Import character context hook
import { CharacterCard } from '../types/schema'; // Import CharacterCard type from its source

type Direction = 'N' | 'S' | 'E' | 'W';
const DIRS: Record<Direction, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

import { Room, FullWorldState, NpcGridItem } from '../types/worldState'; // Import types

// Direction type and DIRS constant are already defined above, remove duplicates

// Remove local interface definitions for Room, FullWorldState, NpcGridItem
// interface WorldCardData { ... }
// interface Room { ... }
// interface FullWorldState { ... }

// Remove WorldStub and WorldBuilderViewProps
// interface WorldStub { ... }
// interface WorldBuilderViewProps { ... }

// Keep local types specific to this component's rendering logic
interface AddButtonItem { isAddButton: true; }
type NpcOrAdd = NpcGridItem | AddButtonItem;

function posKey(x: number, y: number) {
  return `${x},${y}`;
}

const WorldBuilderView: React.FC = () => { // Remove props
  // Initial room at (0,0)
  const { worldId } = useParams<{ worldId: string }>(); // Get worldId from URL
  const navigate = useNavigate();
  const { setCharacterData: setContextCharacterData } = useCharacter(); // Get context setter

  // State for fetched world data
  const [worldData, setWorldData] = useState<FullWorldState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // State for builder specific data (rooms, selection etc.)
  // Initialize rooms based on fetched data later in useEffect
  const [roomsById, setRoomsById] = useState<{ [id: string]: Room }>({});
  const [posToId, setPosToId] = useState<{ [key: string]: string }>({});
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Remove initial room setup here, will be done in useEffect
  // const [roomsById, setRoomsById] = useState<{ [id: string]: Room }>({ [initialRoom.id]: initialRoom });
  // const [posToId, setPosToId] = useState<{ [key: string]: string }>({ [posKey(0, 0)]: initialRoom.id });
  // const [selectedRoomId, setSelectedRoomId] = useState<string>(initialRoom.id);
  // Remove global NPCs state; NPCs are now per-room
// const [npcs, setNpcs] = useState<NpcGridItem[]>([]);
  const [npcModalOpen, setNpcModalOpen] = useState(false);

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
        // TODO: Replace with actual API endpoint if different
        const response = await fetch(`/api/world-state/load/${encodeURIComponent(worldId)}`); // Use path parameter
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: FullWorldState = await response.json(); // Adjust type based on actual API response
        setWorldData(data);

        // Initialize rooms from fetched data
        const initialRooms: { [id: string]: Room } = {};
        const initialPosToId: { [key: string]: string } = {};
        let firstRoomId: string | null = null;

        if (data.rooms && data.rooms.length > 0) {
           data.rooms.forEach(room => {
             initialRooms[room.id] = room;
             initialPosToId[posKey(room.x, room.y)] = room.id;
             if (!firstRoomId) firstRoomId = room.id; // Select the first room initially
           });
        } else {
          // Handle case with no rooms - create a default starting room?
          const defaultRoom: Room = {
             id: 'room-default-1', name: 'Starting Room', description: 'Configure this room.',
             x: 0, y: 0, neighbors: {}, npcs: []
          };
          initialRooms[defaultRoom.id] = defaultRoom;
          initialPosToId[posKey(0,0)] = defaultRoom.id;
          firstRoomId = defaultRoom.id;
          // Consider saving this default room back immediately or on first edit
        }

        setRoomsById(initialRooms);
        setPosToId(initialPosToId);
        setSelectedRoomId(firstRoomId); // Select the first room found or the default

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
  }, [worldId]); // Re-fetch if worldId changes


  const handlePlayHere = (roomId: string | null) => {
    if (!worldId || !roomId || !worldData) return;

    // Create a CharacterCard structure for the context
    // Use fetched worldData where possible, defaults otherwise
    const characterCardForContext: CharacterCard = {
      // Top-level fields (use defaults or map from worldData if available)
      name: worldData.name || "", // Use world name
      description: worldData.description || "", // Use world description
      personality: "", // Default
      scenario: "", // Default
      first_mes: "", // Default
      mes_example: "", // Default
      creatorcomment: "", // Default
      avatar: "none", // Default
      chat: "", // Default - chat history likely separate
      talkativeness: "0.5", // Default
      fav: false, // Default
      tags: [], // Default
      spec: "chara_card_v2", // Default
      spec_version: "2.0", // Default
      create_date: "", // Default or map if available

      // Nested data object
      data: {
        name: worldData.name || "",
        description: worldData.description || "",
        personality: "", // Default
        scenario: "", // Default
        first_mes: "", // Default
        mes_example: "", // Default
        creator_notes: "", // Default
        system_prompt: "", // Default
        post_history_instructions: "", // Default
        tags: [], // Default
        creator: "", // Default
        character_version: "", // Default
        alternate_greetings: [], // Default
        // Map extensions if worldData has relevant info
        extensions: {
          talkativeness: "0.5",
          fav: false,
          world: worldData.name || "Unknown World", // Use world name here too
          depth_prompt: { prompt: "", depth: 4, role: "system" }
        },
        group_only_greetings: [], // Default
        character_book: { entries: [], name: "" }, // Default
        spec: '' // Default
      }
    };

    setContextCharacterData(characterCardForContext);
    navigate(`/worldcards/${worldId}/play`); // Navigate to the nested play route
  };

  // Add a new room in the given direction
  const handleCreateRoom = (x: number, y: number) => {
  const newPosKey = posKey(x, y);
  if (posToId[newPosKey]) {
    setSelectedRoomId(posToId[newPosKey]);
    return;
  }
  const newId = `room-${Object.keys(roomsById).length + 1}`;
  const newRoom: Room = {
    id: newId,
    name: `Room ${Object.keys(roomsById).length + 1}`,
    description: "New room. Configure its properties here.",
    x,
    y,
    neighbors: {},
    npcs: [],
  };
  setRoomsById(prev => ({ ...prev, [newId]: newRoom }));
  setPosToId(prev => ({ ...prev, [newPosKey]: newId }));
  setSelectedRoomId(newId);
};

  // Get available directions for expansion from the selected room
  function getAvailableDirections(room: Room): Direction[] {
    return (['N', 'S', 'E', 'W'] as Direction[]).filter(dir => {
      const { dx, dy } = DIRS[dir];
      const key = posKey(room.x + dx, room.y + dy);
      return !posToId[key];
    });
  }

  function oppositeDir(dir: Direction): Direction {
    switch (dir) {
      case 'N': return 'S';
      case 'S': return 'N';
      case 'E': return 'W';
      case 'W': return 'E';
    }
  }

  // Add NPC to grid
  const handleNpcSelect = (character: { name: string; path: string }) => {
    setRoomsById(prev => ({
      ...prev,
      [selectedRoomId!]: { // Add non-null assertion if selectedRoomId is guaranteed here
        ...prev[selectedRoomId!],
        npcs: [...(prev[selectedRoomId!].npcs || []), character],
      },
    }));
    setNpcModalOpen(false);
  };

  // Remove NPC by index
  const handleRemoveNpc = (idx: number) => {
    setRoomsById(prev => ({
      ...prev,
      [selectedRoomId!]: { // Add non-null assertion
        ...prev[selectedRoomId!],
        npcs: (prev[selectedRoomId!].npcs || []).filter((_, i) => i !== idx),
      },
    }));
  };

  // Compose the world state for saving
  // Compose the world state for saving - use fetched worldData
  const worldStateForSave = {
    ...(worldData || {}), // Spread existing data
    name: worldData?.name || 'Unnamed World', // Use fetched name
    description: worldData?.description || '', // Use fetched description
    rooms: Object.values(roomsById), // Use current room state
    current_position: selectedRoomId, // Add the currently selected room ID
    // Ensure other necessary fields from worldData are preserved if not spread
    id: worldData?.id,
    cardImageUrl: worldData?.cardImageUrl,
  };

  // Handle loading and error states
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
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <button
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          onClick={() => navigate('/worldcards')} // Navigate back to gallery
        >
          Worlds
        </button>
        <span className="text-gray-400">/</span>
        <span className="font-semibold text-stone-900 dark:text-stone-100">{worldData.name}</span>
        <div className="ml-auto">
          <WorldSaveButton
            worldName={worldData.name} // Pass worldName as expected by the component
            worldState={worldStateForSave}
            // Assuming pngFile handling needs review based on how images are managed now
            // Pass null for now if image isn't readily available as a File object here
            pngFile={null}
          />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Room Map */}
        <div className="flex flex-col items-center justify-center flex-1 p-6 overflow-auto">
          {selectedRoomId ? ( // Conditionally render RoomMap
             <RoomMap
               roomsById={roomsById}
               posToId={posToId}
               selectedRoomId={selectedRoomId}
               onCreateRoom={handleCreateRoom}
               onRoomClick={setSelectedRoomId}
             />
           ) : (
             <div>No room selected or map data unavailable.</div> // Placeholder
           )}
        </div>
        {/* Room Detail/Config Panel */}
        <div className="w-[430px] max-w-full border-l border-stone-200 dark:border-stone-800 bg-stone-950 p-6 overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">{selectedRoom.name || "Room Name"}</h2>
            <label className="block text-sm text-gray-400 mb-1" htmlFor="room-position">Grid Position Name</label>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-yellow-400"><svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1h2a1 1 0 110 2h-2v2h2a1 1 0 110 2h-2v2h2a1 1 0 110 2h-2v1a1 1 0 11-2 0v-1H7a1 1 0 110-2h2v-2H7a1 1 0 110-2h2V6H7a1 1 0 110-2h2V3a1 1 0 011-1z"/></svg></span>
              <input
                id="room-position"
                className="w-full px-3 py-2 rounded border border-stone-700 bg-stone-900 text-white focus:outline-none focus:border-yellow-400"
                value={selectedRoom.name}
                onChange={e => setRoomsById(prev => {
                  if (!selectedRoomId) return prev; // Guard clause
                  return {
                    ...prev,
                    [selectedRoomId]: {
                      ...prev[selectedRoomId],
                      name: e.target.value
                    }
                  };
                })}
              />
            </div>
            <label className="block text-sm text-gray-400 mb-1" htmlFor="room-description">Description <span className="text-xs text-gray-500">(will be included in context on arriving on this grid position)</span></label>
            <textarea
              id="room-description"
              className="w-full px-3 py-2 rounded border border-stone-700 bg-stone-900 text-white focus:outline-none focus:border-yellow-400 min-h-[80px] mb-4"
              value={selectedRoom.description || ""}
              onChange={e => setRoomsById(prev => {
                 if (!selectedRoomId) return prev; // Guard clause
                 return {
                   ...prev,
                   [selectedRoomId]: {
                     ...prev[selectedRoomId],
                     description: e.target.value
                   }
                 };
              })}
            />
            <button
              className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition mt-2"
              onClick={() => handlePlayHere(selectedRoomId)}
            >
              Play Here
            </button>
          </div>
          {/* NPCs Section */}
          <div className="mb-6">
            <div className="font-semibold text-white text-lg mb-2">NPCs ({(selectedRoom.npcs?.length || 0)})</div>
            <GalleryGrid<NpcOrAdd> // Explicitly type GalleryGrid if needed
              items={[...(selectedRoom?.npcs || []), { isAddButton: true }]}
              columns={3}
              className="gap-3"
              renderItem={(npcOrAdd: NpcOrAdd, idx: number) => {
                if ('isAddButton' in npcOrAdd) {
                  return (
                    <button
                      key="add-npc"
                      onClick={() => setNpcModalOpen(true)}
                      className="relative aspect-[3/4] bg-stone-900 border-2 border-dashed border-stone-700 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-yellow-400 hover:text-yellow-400 transition-all duration-200"
                      tabIndex={0}
                      aria-label="Add Character"
                    >
                      <span className="text-3xl leading-none mb-1">+</span>
                      <span className="text-sm">Add Character</span>
                    </button>
                  );
                }
                const npc = npcOrAdd as NpcGridItem;
                return (
                  <div
                    key={npc.name + idx}
                    className="relative group aspect-[3/4] cursor-pointer rounded-lg overflow-hidden shadow-md bg-stone-800 flex items-end justify-center"
                  >
                    <div className="absolute inset-0 bg-stone-950">
                      <img
                        src={`/api/character-image/${encodeURIComponent(npc.path)}`}
                        alt={npc.name}
                        className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6 text-white text-xs font-medium text-center truncate rounded-b-lg pointer-events-none">
                      {npc.name}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleRemoveNpc(idx); }}
                      className="absolute top-2 right-2 bg-stone-800 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition z-20"
                      title="Remove NPC"
                      tabIndex={-1}
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                );
              }}
            />

            <NpcSelectorModal
              isOpen={npcModalOpen}
              onClose={() => setNpcModalOpen(false)}
              onSelect={handleNpcSelect}
            />
          </div>
          {/* Custom Events Section */}
          <div>
            <div className="font-semibold text-white text-lg mb-2 mt-6">Custom Events</div>
            <div className="bg-stone-900 border border-stone-700 rounded p-4 text-gray-400 min-h-[60px]">(No events yet)</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldBuilderView;
