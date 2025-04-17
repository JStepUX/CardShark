# World Card System Implementation Plan

## Vision & Philosophy

Build an interactive, coordinate-based adventure system ("World Cards") leveraging CardShark's existing architecture. Players navigate dynamic maps, interact with AI-driven characters, and experience events that shape the world.

**Core Philosophy:** 
1. **Organic World Growth** - Worlds start at coordinate `[0,0,0]` and expand naturally as locations are added
2. **Character Integration** - Allow existing character cards to serve as the foundation for worlds, leveraging their lore entries to suggest potential locations
3. **Flexible Navigation** - Support both connected coordinate-based navigation and "disconnected" locations that can be linked later

## Implementation Approach

### Phase 0: Setup & Foundation

**Purpose:** Prepare project environment, using existing patterns where possible.

1. **Backend Configuration**
   - Leverage existing `settings_manager.py` to add world card settings
   - Add world cards path to settings (`worldcards_directory`) with default path
   - Reuse project's file path resolution logic from `get_users_dir()`

2. **Directory Structure**
   - Create base directory structure for world cards
   - Follow existing storage patterns from chat storage

3. **Error Handling**
   - Extend `CardSharkError` in `errors.py` with new error types:
   ```python
   # Add to ErrorType enum
   WORLD_NOT_FOUND = "WORLD_NOT_FOUND"
   WORLD_STATE_INVALID = "WORLD_STATE_INVALID"
   LOCATION_EXTRACTION_FAILED = "LOCATION_EXTRACTION_FAILED"
   
   # Add to ErrorMessages
   WORLD_NOT_FOUND = "World not found: {world_name}"
   WORLD_STATE_INVALID = "World state validation failed: {error}"
   LOCATION_EXTRACTION_FAILED = "Failed to extract locations from character lore: {error}"
   ```

4. **Character Integration Utilities**
   - Create utilities to extract potential locations from character card lore entries
   - Implement pattern matching for location identification in text
   - Reuse character reading code from existing PNG metadata handler

### Phase 1: Core Structure & Coordinate Navigation

**Purpose:** Establish data structures, coordinate navigation, and state management.

1. **Data Models (Backend)**
   - Create Pydantic models in `backend/models/world_state.py`:
   ```python
   class ExitDefinition(BaseModel):
       target_coordinates: Optional[str] = None
       target_location_id: Optional[str] = None
       name: str
       description: Optional[str] = None
       locked: bool = False
       key_item_id: Optional[str] = None
   
   class Location(BaseModel):
       name: str
       coordinates: Optional[List[int]] = None  # [x,y,z] - Optional for unconnected locations
       location_id: str  # Unique identifier for the location
       description: str
       zone_id: Optional[str] = None
       room_type: Optional[str] = None
       notes: Optional[str] = None
       background: Optional[str] = None
       events: List["EventDefinition"] = []
       npcs: List[str] = []  # List of character UUIDs
       explicit_exits: Optional[Dict[str, ExitDefinition]] = None
       lore_source: Optional[str] = None  # Reference to lore entry if extracted from character
       connected: bool = True  # Whether this location is connected to the navigable map
       
   class EventDefinition(BaseModel):
       id: str
       trigger: str  # 'enter', 'look', 'timer', etc.
       description: str
       conditions: Optional[List[str]] = None
       cooldown: Optional[int] = None
       
   class PlayerState(BaseModel):
       health: int = 100
       stamina: int = 100
       level: int = 1
       experience: int = 0
       
   class UnconnectedLocation(BaseModel):
       location_id: str
       name: str
       description: str
       lore_source: str  # Lore entry that referenced this location
       
   class WorldState(BaseModel):
       name: str
       version: str  # For schema migration support
       current_position: str  # Coordinate string "0,0,0"
       visited_positions: List[str] = []
       locations: Dict[str, Location] = {}  # Key is coordinate string for connected locations
       unconnected_locations: Dict[str, UnconnectedLocation] = {}  # Key is location_id
       player: PlayerState = PlayerState()
       base_character_id: Optional[str] = None  # ID of character card this world is based on
   ```

2. **World State Handler (Backend)**
   - Create `backend/handlers/world_state_handler.py` using patterns from `chat_handler.py`:
   ```python
   class WorldStateHandler:
       def __init__(self, logger):
           self.logger = logger
           self.png_handler = PngMetadataHandler(logger)  # Reuse PNG metadata handler
           self._get_worldcards_dir()
           
       def _get_worldcards_dir(self) -> Path:
           # Reuse directory resolution pattern from settings_manager
           
       def load_world_state(self, world_name: str) -> WorldState:
           # Validate world exists
           # Load and parse JSON
           # Validate with Pydantic model
           # Return WorldState object
           
       def save_world_state(self, world_name: str, state: WorldState) -> bool:
           # Validate state with Pydantic
           # Write to world_state.json
           # Return success status
           
       def initialize_empty_world_state(self, world_name: str, creator_name: str = "User") -> WorldState:
           # Create initial world_state.json with [0,0,0] location
           # No character card basis
           # Return new WorldState
           
       def initialize_from_character(self, world_name: str, character_file_path: str) -> WorldState:
           # Read character data from PNG
           # Extract character details (name, description)
           # Create starter location at [0,0,0]
           # Extract potential locations from character lore
           # Add them as unconnected_locations
           # Create world_state.json
           # Return new WorldState
           
       def extract_locations_from_lore(self, character_data: Dict) -> List[UnconnectedLocation]:
           # Extract lore entries from character_book
           # Use pattern matching to identify potential location names
           # Create UnconnectedLocation objects
           # Return list of locations
           
       def connect_location(self, world_name: str, location_id: str, coordinates: List[int]) -> bool:
           # Move location from unconnected_locations to locations
           # Assign coordinates
           # Set connected=True
           # Save state
           # Return success status
   ```

3. **API Routes (Backend)**
   - Add to `backend/main.py` following existing route patterns:
   ```python
   @app.get("/api/world-cards/{world_name}/state")
   async def get_world_state(world_name: str):
       # Use world_state_handler to load state
       # Return JSONResponse with success/error status
   
   @app.post("/api/world-cards/{world_name}/state")
   async def save_world_state(world_name: str, request: Request):
       # Parse request JSON
       # Validate with Pydantic model
       # Use world_state_handler to save
       # Return success/error
       
   @app.post("/api/world-cards/{world_name}/move")
   async def move_player(world_name: str, request: Request):
       # Get direction from request
       # Calculate target coordinates
       # Update current_position
       # Check for events
       # Save state
       # Return updated WorldState
       
   @app.post("/api/world-cards/{world_name}/location/create")
   async def create_location(world_name: str, request: Request):
       # Get origin coords and direction
       # Calculate target coordinates
       # Create new Location
       # Add to WorldState
       # Save and return updated state
       
   @app.post("/api/world-cards/create")
   async def create_world(request: Request):
       # Parse request with world_name and optional character_file_path
       # If character_file_path provided, initialize from character
       # Otherwise initialize empty world
       # Return success/error and world_name
       
   @app.post("/api/world-cards/{world_name}/connect-location")
   async def connect_location(world_name: str, request: Request):
       # Get location_id and coordinates from request
       # Move location from unconnected to connected
       # Return updated WorldState
       
   @app.get("/api/world-cards")
   async def list_worlds():
       # List all available world cards
       # Return list with metadata
   ```

4. **TypeScript Types (Frontend)**
   - Create `frontend/src/types/world.ts` mirroring Pydantic models:
   ```typescript
   export interface ExitDefinition {
     target_coordinates?: string;
     target_location_id?: string;
     name: string;
     description?: string;
     locked: boolean;
     key_item_id?: string;
   }
   
   export interface Location {
     name: string;
     coordinates?: number[];  // Optional for unconnected locations
     location_id: string;
     description: string;
     zone_id?: string;
     room_type?: string;
     notes?: string;
     background?: string;
     events: EventDefinition[];
     npcs: string[];
     explicit_exits?: Record<string, ExitDefinition>;
     lore_source?: string;  // Reference to lore entry if extracted from character
     connected: boolean;
   }
   
   export interface EventDefinition {
     id: string;
     trigger: string;
     description: string;
     conditions?: string[];
     cooldown?: number;
   }
   
   export interface PlayerState {
     health: number;
     stamina: number;
     level: number;
     experience: number;
   }
   
   export interface UnconnectedLocation {
     location_id: string;
     name: string;
     description: string;
     lore_source: string;  // Lore entry that referenced this location
   }
   
   export interface WorldState {
     name: string;
     version: string;
     current_position: string;
     visited_positions: string[];
     locations: Record<string, Location>;
     unconnected_locations: Record<string, UnconnectedLocation>;
     player: PlayerState;
     base_character_id?: string;
     pending_event?: EventInfo; // Runtime-only field
   }
   
   export interface EventInfo {
     id: string;
     description: string;
   }
   
   export interface WorldMetadata {
     name: string;
     created_date: string;
     last_modified_date: string;
     base_character_name?: string;
     location_count: number;
     unconnected_location_count: number;
   }
   ```

5. **API Client (Frontend)**
   - Add to existing API client pattern:
   ```typescript
   // In src/api/worldApi.ts
   export const worldApi = {
     // World state management
     getWorldState: async (worldName: string): Promise<WorldState> => {
       // Implement using patterns from existing API functions
     },
     
     saveWorldState: async (worldName: string, state: WorldState): Promise<boolean> => {
       // Implement using patterns from existing API functions
     },
     
     // World creation
     createWorld: async (worldName: string, characterFilePath?: string): Promise<{success: boolean, world_name: string}> => {
       // Create new world, optionally based on character
     },
     
     listWorlds: async (): Promise<WorldMetadata[]> => {
       // Get list of available worlds
     },
     
     // Navigation and location management
     movePlayer: async (worldName: string, direction: string): Promise<WorldState> => {
       // Implement using patterns from existing API functions
     },
     
     createLocation: async (worldName: string, originCoordinates: string, direction: string): Promise<WorldState> => {
       // Implement using patterns from existing API functions
     },
     
     connectLocation: async (worldName: string, locationId: string, coordinates: number[]): Promise<WorldState> => {
       // Connect an unconnected location to the map
     },
     
     // Events
     resolveEvent: async (worldName: string, eventId: string, choiceId: string = "acknowledge"): Promise<WorldState> => {
       // Resolve an event
     }
   }
   ```

6. **World State Context (Frontend)**
   - Create React context following patterns from `APIConfigContext`:
   ```tsx
   // In src/contexts/WorldStateContext.tsx
   export const WorldStateContext = createContext<WorldStateContextType | undefined>(undefined);
   
   export const WorldStateProvider: React.FC<WorldStateProviderProps> = ({ worldName, children }) => {
     const [worldState, setWorldState] = useState<WorldState | null>(null);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState<string | null>(null);
     const [currentEvent, setCurrentEvent] = useState<EventInfo | null>(null);
     
     // Load initial state
     useEffect(() => {
       const loadState = async () => {
         try {
           const state = await worldApi.getWorldState(worldName);
           setWorldState(state);
           setLoading(false);
         } catch (err) {
           setError(err instanceof Error ? err.message : "Failed to load world");
           setLoading(false);
         }
       };
       
       loadState();
     }, [worldName]);
     
     // Implement move function
     const move = async (direction: string) => {
       // Set loading state
       // Call API
       // Update state
       // Check for pending_event
       // Handle errors
     };
     
     // Implement createAdjacentLocation
     const createAdjacentLocation = async (direction: string) => {
       // Similar pattern to move function
     };
     
     // Implement connectLocation
     const connectLocation = async (locationId: string, coordinates: number[]) => {
       // Call API
       // Update state
       // Handle errors
     };
     
     // Implement resolveCurrentEvent
     const resolveCurrentEvent = async (choiceId: string = "acknowledge") => {
       // Call API
       // Clear currentEvent state
     };
     
     // Return provider with value
     return (
       <WorldStateContext.Provider 
         value={{ 
           worldState, 
           loading, 
           error, 
           currentEvent,
           move, 
           createAdjacentLocation,
           connectLocation,
           resolveCurrentEvent
         }}
       >
         {children}
       </WorldStateContext.Provider>
     );
   };
   
   // Custom hook
   export const useWorldState = () => {
     const context = useContext(WorldStateContext);
     if (context === undefined) {
       throw new Error("useWorldState must be used within a WorldStateProvider");
     }
     return context;
   };
   ```

7. **Basic Components (Frontend)**
   - Build UI components following existing CardShark patterns:
   ```tsx
   // In src/views/WorldView.tsx
   export const WorldView: React.FC<WorldViewProps> = ({ worldName }) => {
     return (
       <ErrorBoundary fallback={<div>Something went wrong loading the world</div>}>
         <WorldStateProvider worldName={worldName}>
           <div className="grid grid-cols-12 gap-4">
             <div className="col-span-8">
               <LocationDetail />
               <WorldMap />
             </div>
             <div className="col-span-4">
               <PlayerStatus />
               <UnconnectedLocations />
               <EventDisplay />
             </div>
           </div>
         </WorldStateProvider>
       </ErrorBoundary>
     );
   };
   
   // New component to display unconnected locations extracted from character lore
   // In src/components/UnconnectedLocations.tsx
   export const UnconnectedLocations: React.FC = () => {
     const { worldState, connectLocation } = useWorldState();
     const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
     const [targetCoordinates, setTargetCoordinates] = useState<number[]>([0,0,0]);
     
     if (!worldState || !worldState.unconnected_locations || Object.keys(worldState.unconnected_locations).length === 0) {
       return null;
     }
     
     const handleConnect = async () => {
       if (!selectedLocation) return;
       await connectLocation(selectedLocation, targetCoordinates);
       setSelectedLocation(null);
     };
     
     return (
       <div className="bg-stone-800 rounded-lg p-4 mt-4">
         <h2 className="text-xl mb-2">Unconnected Locations</h2>
         <p className="text-sm text-stone-400 mb-2">
           These locations were found in the character lore but need to be placed on the map.
         </p>
         
         <div className="max-h-40 overflow-y-auto mb-4">
           {Object.entries(worldState.unconnected_locations).map(([id, location]) => (
             <div 
               key={id}
               className={`p-2 mb-2 rounded cursor-pointer ${selectedLocation === id ? 'bg-blue-900' : 'bg-stone-700 hover:bg-stone-600'}`}
               onClick={() => setSelectedLocation(id)}
             >
               <div className="font-medium">{location.name}</div>
               <div className="text-sm text-stone-300">{location.description.substring(0, 60)}...</div>
               <div className="text-xs text-stone-400">From lore: {location.lore_source}</div>
             </div>
           ))}
         </div>
         
         {selectedLocation && (
           <div className="border border-stone-600 rounded p-2 mb-2">
             <h3 className="text-md font-medium mb-1">Connect to Map</h3>
             <div className="flex items-center space-x-2 mb-2">
               <span>Coordinates:</span>
               <input 
                 type="number" 
                 className="w-16 bg-stone-700 px-2 py-1 rounded"
                 value={targetCoordinates[0]}
                 onChange={e => setTargetCoordinates([parseInt(e.target.value), targetCoordinates[1], targetCoordinates[2]])}
               />
               <input 
                 type="number" 
                 className="w-16 bg-stone-700 px-2 py-1 rounded"
                 value={targetCoordinates[1]}
                 onChange={e => setTargetCoordinates([targetCoordinates[0], parseInt(e.target.value), targetCoordinates[2]])}
               />
               <input 
                 type="number" 
                 className="w-16 bg-stone-700 px-2 py-1 rounded"
                 value={targetCoordinates[2]}
                 onChange={e => setTargetCoordinates([targetCoordinates[0], targetCoordinates[1], parseInt(e.target.value)])}
               />
             </div>
             <button 
               className="w-full bg-blue-600 rounded py-1"
               onClick={handleConnect}
             >
               Connect Location
             </button>
           </div>
         )}
       </div>
     );
   };
   ```

### Phase 1.5: Character-Based World Creation

**Purpose:** Add ability to create worlds based on existing character cards.

1. **Location Extraction Utility (Backend)**
   - Create `backend/utils/location_extractor.py`:
   ```python
   from typing import List, Dict
   import re
   from models.world_state import UnconnectedLocation
   
   class LocationExtractor:
       def __init__(self, logger):
           self.logger = logger
           # Common location indicators (landmarks, buildings, geographical features)
           self.location_indicators = [
               "castle", "tower", "temple", "shrine", "village", "city", "town", "forest",
               "mountain", "lake", "river", "cave", "mansion", "house", "tavern", "inn",
               "academy", "school", "library", "dungeon", "palace", "fort", "fortress",
               "island", "valley", "bridge", "gate", "port", "harbor", "market", "shop",
               "arena", "garden", "park", "tomb", "crypt", "cemetery", "laboratory"
           ]
           
       def extract_from_lore(self, character_data: Dict) -> List[UnconnectedLocation]:
           """Extract potential locations from character lore entries."""
           locations = []
           try:
               # Get character book entries
               lore_entries = character_data.get("data", {}).get("character_book", {}).get("entries", [])
               
               for entry in lore_entries:
                   content = entry.get("content", "")
                   keys = entry.get("keys", [])
                   key_str = ", ".join(keys)
                   
                   # Skip if content is too short
                   if len(content) < 20:
                       continue
                       
                   # Extract potential locations from content
                   found_locations = self._extract_locations_from_text(content)
                   
                   # Create UnconnectedLocation objects
                   for loc_name, loc_desc in found_locations:
                       location_id = f"lore_{len(locations)}"
                       locations.append(UnconnectedLocation(
                           location_id=location_id,
                           name=loc_name,
                           description=loc_desc if loc_desc else f"A location mentioned in relation to {key_str}.",
                           lore_source=key_str
                       ))
               
               self.logger.log_step(f"Extracted {len(locations)} potential locations from lore")
               return locations
               
           except Exception as e:
               self.logger.log_error(f"Error extracting locations from lore: {str(e)}")
               return []
               
       def _extract_locations_from_text(self, text: str) -> List[tuple]:
           """Extract location names and descriptions from text content."""
           locations = []
           
           # Regex patterns to find capitalized phrases followed by location indicators
           for indicator in self.location_indicators:
               # Look for "The X", "X of Y", etc. patterns with our indicator
               patterns = [
                   fr"(The\s+\w+(?:\s+\w+)?\s+{indicator})",  # The Grand Castle, The Dark Forest
                   fr"(\w+(?:'s)?\s+{indicator})",  # Dragon's Cave, Ancient Temple
                   fr"({indicator}\s+of\s+\w+(?:\s+\w+)?)"  # Temple of Light, City of Gold
               ]
               
               for pattern in patterns:
                   matches = re.finditer(pattern, text, re.IGNORECASE)
                   for match in matches:
                       loc_name = match.group(1)
                       # Try to extract a description (sentence containing the location)
                       sentences = re.split(r'(?<=[.!?])\s+', text)
                       for sentence in sentences:
                           if loc_name.lower() in sentence.lower():
                               locations.append((loc_name, sentence))
                               break
                       else:
                           # If no description found, add without one
                           locations.append((loc_name, ""))
           
           return locations
   ```

2. **World Creation UI (Frontend)**
   - Create `src/components/WorldCreationModal.tsx`:
   ```tsx
   export const WorldCreationModal: React.FC<{
     onClose: () => void;
     onSuccess: (worldName: string) => void;
   }> = ({ onClose, onSuccess }) => {
     const [worldName, setWorldName] = useState("");
     const [createType, setCreateType] = useState<"empty" | "character">("empty");
     const [selectedCharacter, setSelectedCharacter] = useState<string>("");
     const [characters, setCharacters] = useState<any[]>([]);
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState<string | null>(null);
     
     // Fetch available characters on mount
     useEffect(() => {
       const fetchCharacters = async () => {
         try {
           // Use existing character API to get available character cards
           const response = await fetch("/api/characters");
           const data = await response.json();
           if (data.exists && data.files) {
             setCharacters(data.files);
           }
         } catch (err) {
           setError("Failed to load characters");
         }
       };
       
       fetchCharacters();
     }, []);
     
     const handleSubmit = async (e: React.FormEvent) => {
       e.preventDefault();
       if (!worldName.trim()) {
         setError("World name is required");
         return;
       }
       
       setLoading(true);
       setError(null);
       
       try {
         const response = await worldApi.createWorld(
           worldName, 
           createType === "character" ? selectedCharacter : undefined
         );
         
         if (response.success) {
           onSuccess(response.world_name);
         } else {
           setError("Failed to create world");
         }
       } catch (err) {
         setError(err instanceof Error ? err.message : "Failed to create world");
       } finally {
         setLoading(false);
       }
     };
     
     return (
       <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
         <div className="bg-stone-800 rounded-lg p-6 max-w-md w-full">
           <h2 className="text-2xl mb-4">Create New World</h2>
           
           <form onSubmit={handleSubmit}>
             <div className="mb-4">
               <label className="block text-sm font-medium mb-1">World Name</label>
               <input
                 type="text"
                 className="w-full bg-stone-700 rounded px-3 py-2"
                 value={worldName}
                 onChange={(e) => setWorldName(e.target.value)}
                 placeholder="Enter world name"
               />
             </div>
             
             <div className="mb-4">
               <label className="block text-sm font-medium mb-1">World Type</label>
               <div className="flex space-x-4">
                 <label className="flex items-center">
                   <input
                     type="radio"
                     className="mr-2"
                     checked={createType === "empty"}
                     onChange={() => setCreateType("empty")}
                   />
                   Empty World
                 </label>
                 <label className="flex items-center">
                   <input
                     type="radio"
                     className="mr-2"
                     checked={createType === "character"}
                     onChange={() => setCreateType("character")}
                   />
                   Based on Character
                 </label>
               </div>
             </div>
             
             {createType === "character" && (
               <div className="mb-4">
                 <label className="block text-sm font-medium mb-1">Select Character</label>
                 <select
                   className="w-full bg-stone-700 rounded px-3 py-2"
                   value={selectedCharacter}
                   onChange={(e) => setSelectedCharacter(e.target.value)}
                 >
                   <option value="">Select a character...</option>
                   {characters.map((char) => (
                     <option key={char.path} value={char.path}>
                       {char.name}
                     </option>
                   ))}
                 </select>
               </div>
             )}
             
             {error && (
               <div className="mb-4 text-red-500">{error}</div>
             )}
             
             <div className="flex justify-end space-x-3">
               <button
                 type="button"
                 className="px-4 py-2 border border-stone-600 rounded"
                 onClick={onClose}
                 disabled={loading}
               >
                 Cancel
               </button>
               <button
                 type="submit"
                 className="px-4 py-2 bg-blue-600 rounded"
                 disabled={loading || (createType === "character" && !selectedCharacter)}
               >
                 {loading ? "Creating..." : "Create World"}
               </button>
             </div>
           </form>
         </div>
       </div>
     );
   };
   ```

3. **World Listing Component (Frontend)**
   - Create `src/components/WorldsList.tsx`:
   ```tsx
   export const WorldsList: React.FC<{
     onSelectWorld: (worldName: string) => void;
     onCreateWorld: () => void;
   }> = ({ onSelectWorld, onCreateWorld }) => {
     const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState<string | null>(null);
     
     useEffect(() => {
       const fetchWorlds = async () => {
         try {
           const worlds = await worldApi.listWorlds();
           setWorlds(worlds);
           setLoading(false);
         } catch (err) {
           setError("Failed to load worlds");
           setLoading(false);
         }
       };
       
       fetchWorlds();
     }, []);
     
     if (loading) return <div className="p-4">Loading worlds...</div>;
     if (error) return <div className="p-4 text-red-500">{error}</div>;
     
     return (
       <div className="p-4">
         <div className="flex justify-between items-center mb-4">
           <h2 className="text-2xl">Your Worlds</h2>
           <button 
             className="px-4 py-2 bg-blue-600 rounded"
             onClick={onCreateWorld}
           >
             Create New World
           </button>
         </div>
         
         {worlds.length === 0 ? (
           <div className="text-center py-8">
             <p className="mb-4">You don't have any worlds yet.</p>
             <button 
               className="px-4 py-2 bg-blue-600 rounded"
               onClick={onCreateWorld}
             >
               Create Your First World
             </button>
           </div>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {worlds.map((world) => (
               <div 
                 key={world.name}
                 className="bg-stone-800 rounded-lg p-4 cursor-pointer hover:bg-stone-700"
                 onClick={() => onSelectWorld(world.name)}
               >
                 <h3 className="text-xl mb-1">{world.name}</h3>
                 {world.base_character_name && (
                   <p className="text-sm text-stone-400">Based on: {world.base_character_name}</p>
                 )}
                 <div className="text-sm mt-2">
                   <span className="text-stone-400">Locations: </span>
                   <span>{world.location_count}</span>
                   {world.unconnected_location_count > 0 && (
                     <>
                       <span className="mx-1">•</span>
                       <span className="text-stone-400">Unconnected: </span>
                       <span>{world.unconnected_location_count}</span>
                     </>
                   )}
                 </div>
                 <div className="text-xs text-stone-500 mt-1">
                   Last modified: {new Date(world.last_modified_date).toLocaleDateString()}
                 </div>
               </div>
             ))}
           </div>
         )}
       </div>
     );
   };
   ```

### Phase 2: Visual Elements & Character Integration

**Purpose:** Add visual representation of locations and characters.

1. **Static Asset Serving (Backend)**
   - Leverage existing static file serving in main.py:
     const { worldState, move, createAdjacentLocation } = useWorldState();
     
     if (!worldState) return <div>No world state available</div>;
     
     const currentPosition = worldState.current_position;
     const location = worldState.locations[currentPosition];
     
     // Check if adjacent locations exist
     const getAdjacentCoordinate = (direction: string): string => {
       const [x, y, z] = location.coordinates || [0, 0, 0];
       switch (direction) {
         case "north": return `${x},${y+1},${z}`;
         case "south": return `${x},${y-1},${z}`;
         case "east": return `${x+1},${y},${z}`;
         case "west": return `${x-1},${y},${z}`;
         case "up": return `${x},${y},${z+1}`;
         case "down": return `${x},${y},${z-1}`;
         default: return `${x},${y},${z}`;
       }
     };
     
     const renderDirectionButton = (direction: string, label: string) => {
       const targetCoord = getAdjacentCoordinate(direction);
       const exists = worldState.locations[targetCoord] !== undefined;
       
       return exists ? (
         <button 
           onClick={() => move(direction)}
           className="bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded"
         >
           Move {label}
         </button>
       ) : (
         <button 
           onClick={() => createAdjacentLocation(direction)}
           className="bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded"
         >
           Create {label} Room
         </button>
       );
     };
     
     return (
       <div className="relative bg-stone-800 rounded-lg overflow-hidden">
         {/* Background image if available */}
         {location.background && (
           <div className="absolute inset-0 z-0 opacity-30">
             <img 
               src={`/static/worldcards/${worldState.name}/images/backgrounds/${location.background}`} 
               alt="Room background"
               className="w-full h-full object-cover"
             />
           </div>
         )}
         
         {/* Location information */}
         <div className="relative z-10 p-4">
           <h2 className="text-2xl">{location.name}</h2>
           <p className="text-sm text-stone-400">Coordinates: {location.coordinates?.join(',')}</p>
           
           {location.lore_source && (
             <p className="text-xs text-stone-500 mt-1">From lore: {location.lore_source}</p>
           )}
           
           <p className="my-4">{location.description}</p>
           
           {/* Direction buttons */}
           <div className="grid grid-cols-3 gap-2 my-4">
             <div className="col-start-2">{renderDirectionButton("north", "North")}</div>
             <div>{renderDirectionButton("west", "West")}</div>
             <div>{renderDirectionButton("east", "East")}</div>
             <div className="col-start-2">{renderDirectionButton("south", "South")}</div>
             <div className="col-start-1">{renderDirectionButton("up", "Up")}</div>
             <div className="col-start-3">{renderDirectionButton("down", "Down")}</div>
           </div>
           
           {/* NPCs in location */}
           {location.npcs && location.npcs.length > 0 && (
             <div className="mt-4">
               <h3 className="text-xl mb-2">Characters Present:</h3>
               <div className="flex flex-wrap gap-2">
                 {location.npcs.map(npcId => (
                   <CharacterPortrait key={npcId} npcId={npcId} />
                 ))}
               </div>
             </div>
           )}
         </div>
       </div>
     );
   };
   ```

3. **Character Portrait Component (Frontend)**
   - Leverage existing character card functionality:
   ```tsx
   // In src/components/CharacterPortrait.tsx
   export const CharacterPortrait: React.FC<{ npcId: string }> = ({ npcId }) => {
     const [character, setCharacter] = useState<any>(null);
     const [loading, setLoading] = useState(true);
     
     // Fetch character data from existing API
     useEffect(() => {
       const fetchCharacter = async () => {
         try {
           // Use existing PNG metadata handler API to get character details
           const response = await fetch(`/api/upload-png?file=${encodeURIComponent(npcId)}`);
           const data = await response.json();
           
           if (data.success && data.metadata) {
             // Get minimal info needed for display
             const characterData = {
               name: data.metadata.data?.name || "Unknown",
               avatarUrl: `/api/character-image/${encodeURIComponent(npcId)}`,
               id: npcId
             };
             
             setCharacter(characterData);
           }
           setLoading(false);
         } catch (err) {
           console.error("Error fetching character:", err);
           setLoading(false);
         }
       };
       
       fetchCharacter();
     }, [npcId]);
     
     if (loading) return <div className="w-16 h-16 bg-stone-700 rounded-full animate-pulse"></div>;
     
     if (!character) return null;
     
     return (
       <div className="flex flex-col items-center">
         <img 
           src={character.avatarUrl} 
           alt={character.name}
           className="w-16 h-16 rounded-full object-cover cursor-pointer"
           onClick={() => {/* Future interaction */}}
         />
         <span className="text-sm mt-1">{character.name}</span>
       </div>
     );
   };
   ```

4. **Enhanced World Map (Frontend)**
   - Implement a better coordinate-based map visualization:
   ```tsx
   // In src/components/WorldMap.tsx
   export const WorldMap: React.FC = () => {
     const { worldState, move } = useWorldState();
     const [zoomLevel, setZoomLevel] = useState(1);
     const [centerCoords, setCenterCoords] = useState<[number, number]>([0, 0]);
     
     if (!worldState) return <div>No world state available</div>;
     
     // Process locations into a 2D grid for simplified visualization
     const processLocations = () => {
       const grid: Record<string, any> = {};
       const currentCoords = worldState.current_position.split(',').map(Number);
       
       // Process all locations
       Object.entries(worldState.locations).forEach(([coordStr, location]) => {
         if (!location.coordinates || location.coordinates.length < 2) return;
         
         const [x, y, z] = location.coordinates;
         // For now, we'll visualize only the current Z level
         if (z !== currentCoords[2]) return;
         
         const key = `${x},${y}`;
         grid[key] = {
           ...location,
           isCurrentLocation: x === currentCoords[0] && y === currentCoords[1] && z === currentCoords[2]
         };
       });
       
       return grid;
     };
     
     const grid = processLocations();
     
     // Find min/max coordinates to determine viewport
     const locations = Object.entries(grid).map(([coordStr, location]) => {
       const [x, y] = coordStr.split(',').map(Number);
       return { x, y, location };
     });
     
     const minX = Math.min(...locations.map(l => l.x), 0) - 1;
     const maxX = Math.max(...locations.map(l => l.x), 0) + 1;
     const minY = Math.min(...locations.map(l => l.y), 0) - 1;
     const maxY = Math.max(...locations.map(l => l.y), 0) + 1;
     
     const renderLocation = (x: number, y: number) => {
       const key = `${x},${y}`;
       const location = grid[key];
       
       if (!location) {
         return (
           <div 
             key={key}
             className="w-12 h-12 bg-stone-900 opacity-25 rounded"
           />
         );
       }
       
       return (
         <div
           key={key}
           className={`w-12 h-12 rounded cursor-pointer flex items-center justify-center
             ${location.isCurrentLocation ? 'bg-blue-800 ring-2 ring-white' : 'bg-stone-700 hover:bg-stone-600'}`}
           onClick={() => {
             if (!location.isCurrentLocation) {
               // Calculate direction to move
               const currentCoords = worldState.current_position.split(',').map(Number);
               const dx = x - currentCoords[0];
               const dy = y - currentCoords[1];
               
               if (dx === 1 && dy === 0) move('east');
               else if (dx === -1 && dy === 0) move('west');
               else if (dx === 0 && dy === 1) move('north');
               else if (dx === 0 && dy === -1) move('south');
             }
           }}
           title={location.name}
         >
           <div className="text-xs overflow-hidden max-w-full truncate px-1">
             {location.name.charAt(0)}
           </div>
         </div>
       );
     };
     
     return (
       <div className="mt-4 bg-stone-800 rounded-lg p-4">
         <div className="flex justify-between items-center mb-2">
           <h3 className="text-xl">Map View (Z-Level: {worldState.current_position.split(',')[2]})</h3>
           <div className="flex items-center space-x-2">
             <button 
               className="bg-stone-700 w-8 h-8 rounded flex items-center justify-center"
               onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}
             >
               -
             </button>
             <span className="text-sm">{Math.round(zoomLevel * 100)}%</span>
             <button 
               className="bg-stone-700 w-8 h-8 rounded flex items-center justify-center"
               onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))}
             >
               +
             </button>
           </div>
         </div>
         
         <div className="overflow-auto p-2 bg-stone-900 rounded" style={{ maxHeight: '300px' }}>
           <div 
             className="grid gap-1 transition-transform duration-200"
             style={{ 
               transform: `scale(${zoomLevel})`,
               transformOrigin: 'top left',
               gridTemplateColumns: `repeat(${maxX - minX + 1}, 1fr)`,
               gridTemplateRows: `repeat(${maxY - minY + 1}, 1fr)`
             }}
           >
             {Array.from({ length: (maxY - minY + 1) * (maxX - minX + 1) }).map((_, index) => {
               const y = maxY - Math.floor(index / (maxX - minX + 1));
               const x = minX + (index % (maxX - minX + 1));
               return renderLocation(x, y);
             })}
           </div>
         </div>
       </div>
     );
   };
   ```

### Phase 3: Interactivity & Events

**Purpose:** Add player state and interactive events.

1. **Player Status Component (Frontend)**
   - Display player state:
   ```tsx
   // src/components/PlayerStatus.tsx
   export const PlayerStatus: React.FC = () => {
     const { worldState } = useWorldState();
     
     if (!worldState?.player) return null;
     
     const { health, stamina, level, experience } = worldState.player;
     
     return (
       <div className="bg-stone-800 rounded-lg p-4">
         <h2 className="text-xl mb-2">Player Status</h2>
         <div className="space-y-2">
           <div>
             <label className="text-stone-400">Health</label>
             <div className="h-2 bg-stone-700 rounded-full">
               <div 
                 className="h-full bg-red-600 rounded-full" 
                 style={{ width: `${health}%` }}
               ></div>
             </div>
           </div>
           <div>
             <label className="text-stone-400">Stamina</label>
             <div className="h-2 bg-stone-700 rounded-full">
               <div 
                 className="h-full bg-green-600 rounded-full" 
                 style={{ width: `${stamina}%` }}
               ></div>
             </div>
           </div>
           <div className="flex justify-between">
             <span>Level: {level}</span>
             <span>XP: {experience}</span>
           </div>
         </div>
       </div>
     );
   };
   ```

2. **Event Display Component (Frontend)**
   - Create event display and response UI:
   ```tsx
   // src/components/EventDisplay.tsx
   export const EventDisplay: React.FC = () => {
     const { currentEvent, resolveCurrentEvent } = useWorldState();
     
     if (!currentEvent) return null;
     
     return (
       <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
         <div className="bg-stone-800 rounded-lg p-6 max-w-md w-full">
           <h2 className="text-2xl mb-4">Event</h2>
           <p className="my-4">{currentEvent.description}</p>
           <div className="flex justify-end">
             <button 
               className="px-4 py-2 bg-blue-600 rounded-lg"
               onClick={() => resolveCurrentEvent()}
             >
               Continue
             </button>
           </div>
         </div>
       </div>
     );
   };
   ```

3. **Event Resolution Endpoint (Backend)**
   - Add event resolution API:
   ```python
   @app.post("/api/world-cards/{world_name}/event/resolve")
   async def resolve_event(world_name: str, request: Request):
       try:
           data = await request.json()
           event_id = data.get("event_id")
           choice_id = data.get("choice_id", "acknowledge")
           
           # Load state
           world_state = world_state_handler.load_world_state(world_name)
           
           # For now, just log the event resolution
           logger.log_step(f"Event {event_id} resolved with choice {choice_id}")
           
           # In future phases, this will modify player state based on event outcome
           
           # Save and return state
           world_state_handler.save_world_state(world_name, world_state)
           return JSONResponse({"success": True, "state": world_state.dict()})
       except Exception as e:
           logger.log_error(f"Error resolving event: {str(e)}")
           return JSONResponse({"success": False, "message": str(e)}, status_code=500)
   ```

### Future Phases

1. **Combat System**
   - Implement turn-based combat mechanics
   - Add combat-specific UI components
   - Integrate with character stats and abilities

2. **Inventory System**
   - Add item data models and management
   - Create inventory UI components
   - Implement item use and effects

3. **Quest System**
   - Design quest data models and state tracking
   - Create quest log UI
   - Implement quest triggers and completion conditions

4. **Advanced Map Visualization**
   - Enhance the map with better zooming and panning
   - Add minimap functionality
   - Support different visualization styles for different location types

5. **World Builder UI**
   - Create dedicated world building interface
   - Implement visual location editing
   - Add character placement tools

6. **AI Integration**
   - Implement deep character dialogue using LLM
   - Add dynamic event generation
   - Create adaptive storytelling systems

## Implementation Guidelines

1. **Code Reuse**
   - Leverage existing file handling patterns from chat storage
   - Reuse error handling and logging mechanisms
   - Follow existing API response formats for consistency
   - Adapt UI component patterns from your current components

2. **Project Structure**
   - Keep new components organized in logical directories
   - Follow existing naming conventions
   - Add new handlers following the pattern of existing handlers

3. **Development Approach**
   - Implement phases sequentially, testing thoroughly before proceeding
   - Create a test world for validation at each phase
   - Document API endpoints and data structures as you build

This plan provides a clear roadmap for implementing the World Card System while leveraging existing character cards for richer world-building. The character integration adds depth by automatically extracting potential locations from lore entries, giving users a head start in creating their worlds.
# World Card System Implementation Plan

## Vision & Philosophy

Build an interactive, coordinate-based adventure system ("World Cards") leveraging CardShark's existing architecture. Players navigate dynamic maps, interact with AI-driven characters, and experience events that shape the world.

**Core Philosophy:** 
1. **Organic World Growth** - Worlds start at coordinate `[0,0,0]` and expand naturally as locations are added
2. **Character Integration** - Allow existing character cards to serve as the foundation for worlds, leveraging their lore entries to suggest potential locations
3. **Flexible Navigation** - Support both connected coordinate-based navigation and "disconnected" locations that can be linked later

## Implementation Approach

### Phase 0: Setup & Foundation

**Purpose:** Prepare project environment, using existing patterns where possible.

1. **Backend Configuration**
   - Leverage existing `settings_manager.py` to add world card settings
   - Add world cards path to settings (`worldcards_directory`) with default path
   - Reuse project's file path resolution logic from `get_users_dir()`

2. **Directory Structure**
   - Create base directory structure for world cards
   - Follow existing storage patterns from chat storage

3. **Error Handling**
   - Extend `CardSharkError` in `errors.py` with new error types:
   ```python
   # Add to ErrorType enum
   WORLD_NOT_FOUND = "WORLD_NOT_FOUND"
   WORLD_STATE_INVALID = "WORLD_STATE_INVALID"
   LOCATION_EXTRACTION_FAILED = "LOCATION_EXTRACTION_FAILED"
   
   # Add to ErrorMessages
   WORLD_NOT_FOUND = "World not found: {world_name}"
   WORLD_STATE_INVALID = "World state validation failed: {error}"
   LOCATION_EXTRACTION_FAILED = "Failed to extract locations from character lore: {error}"
   ```

4. **Character Integration Utilities**
   - Create utilities to extract potential locations from character card lore entries
   - Implement pattern matching for location identification in text
   - Reuse character reading code from existing PNG metadata handler

### Phase 1: Core Structure & Coordinate Navigation

**Purpose:** Establish data structures, coordinate navigation, and state management.

1. **Data Models (Backend)**
   - Create Pydantic models in `backend/models/world_state.py`:
   ```python
   class ExitDefinition(BaseModel):
       target_coordinates: Optional[str] = None
       target_location_id: Optional[str] = None
       name: str
       description: Optional[str] = None
       locked: bool = False
       key_item_id: Optional[str] = None
   
   class Location(BaseModel):
       name: str
       coordinates: Optional[List[int]] = None  # [x,y,z] - Optional for unconnected locations
       location_id: str  # Unique identifier for the location
       description: str
       zone_id: Optional[str] = None
       room_type: Optional[str] = None
       notes: Optional[str] = None
       background: Optional[str] = None
       events: List["EventDefinition"] = []
       npcs: List[str] = []  # List of character UUIDs
       explicit_exits: Optional[Dict[str, ExitDefinition]] = None
       lore_source: Optional[str] = None  # Reference to lore entry if extracted from character
       connected: bool = True  # Whether this location is connected to the navigable map
       
   class EventDefinition(BaseModel):
       id: str
       trigger: str  # 'enter', 'look', 'timer', etc.
       description: str
       conditions: Optional[List[str]] = None
       cooldown: Optional[int] = None
       
   class PlayerState(BaseModel):
       health: int = 100
       stamina: int = 100
       level: int = 1
       experience: int = 0
       
   class UnconnectedLocation(BaseModel):
       location_id: str
       name: str
       description: str
       lore_source: str  # Lore entry that referenced this location
       
   class WorldState(BaseModel):
       name: str
       version: str  # For schema migration support
       current_position: str  # Coordinate string "0,0,0"
       visited_positions: List[str] = []
       locations: Dict[str, Location] = {}  # Key is coordinate string for connected locations
       unconnected_locations: Dict[str, UnconnectedLocation] = {}  # Key is location_id
       player: PlayerState = PlayerState()
       base_character_id: Optional[str] = None  # ID of character card this world is based on
   ```

2. **World State Handler (Backend)**
   - Create `backend/handlers/world_state_handler.py` using patterns from `chat_handler.py`:
   ```python
   class WorldStateHandler:
       def __init__(self, logger):
           self.logger = logger
           self.png_handler = PngMetadataHandler(logger)  # Reuse PNG metadata handler
           self._get_worldcards_dir()
           
       def _get_worldcards_dir(self) -> Path:
           # Reuse directory resolution pattern from settings_manager
           
       def load_world_state(self, world_name: str) -> WorldState:
           # Validate world exists
           # Load and parse JSON
           # Validate with Pydantic model
           # Return WorldState object
           
       def save_world_state(self, world_name: str, state: WorldState) -> bool:
           # Validate state with Pydantic
           # Write to world_state.json
           # Return success status
           
       def initialize_empty_world_state(self, world_name: str, creator_name: str = "User") -> WorldState:
           # Create initial world_state.json with [0,0,0] location
           # No character card basis
           # Return new WorldState
           
       def initialize_from_character(self, world_name: str, character_file_path: str) -> WorldState:
           # Read character data from PNG
           # Extract character details (name, description)
           # Create starter location at [0,0,0]
           # Extract potential locations from character lore
           # Add them as unconnected_locations
           # Create world_state.json
           # Return new WorldState
           
       def extract_locations_from_lore(self, character_data: Dict) -> List[UnconnectedLocation]:
           # Extract lore entries from character_book
           # Use pattern matching to identify potential location names
           # Create UnconnectedLocation objects
           # Return list of locations
           
       def connect_location(self, world_name: str, location_id: str, coordinates: List[int]) -> bool:
           # Move location from unconnected_locations to locations
           # Assign coordinates
           # Set connected=True
           # Save state
           # Return success status
   ```

3. **API Routes (Backend)**
   - Add to `backend/main.py` following existing route patterns:
   ```python
   @app.get("/api/world-cards/{world_name}/state")
   async def get_world_state(world_name: str):
       # Use world_state_handler to load state
       # Return JSONResponse with success/error status
   
   @app.post("/api/world-cards/{world_name}/state")
   async def save_world_state(world_name: str, request: Request):
       # Parse request JSON
       # Validate with Pydantic model
       # Use world_state_handler to save
       # Return success/error
       
   @app.post("/api/world-cards/{world_name}/move")
   async def move_player(world_name: str, request: Request):
       # Get direction from request
       # Calculate target coordinates
       # Update current_position
       # Check for events
       # Save state
       # Return updated WorldState
       
   @app.post("/api/world-cards/{world_name}/location/create")
   async def create_location(world_name: str, request: Request):
       # Get origin coords and direction
       # Calculate target coordinates
       # Create new Location
       # Add to WorldState
       # Save and return updated state
       
   @app.post("/api/world-cards/create")
   async def create_world(request: Request):
       # Parse request with world_name and optional character_file_path
       # If character_file_path provided, initialize from character
       # Otherwise initialize empty world
       # Return success/error and world_name
       
   @app.post("/api/world-cards/{world_name}/connect-location")
   async def connect_location(world_name: str, request: Request):
       # Get location_id and coordinates from request
       # Move location from unconnected to connected
       # Return updated WorldState
       
   @app.get("/api/world-cards")
   async def list_worlds():
       # List all available world cards
       # Return list with metadata
   ```

4. **TypeScript Types (Frontend)**
   - Create `frontend/src/types/world.ts` mirroring Pydantic models:
   ```typescript
   export interface ExitDefinition {
     target_coordinates?: string;
     target_location_id?: string;
     name: string;
     description?: string;
     locked: boolean;
     key_item_id?: string;
   }
   
   export interface Location {
     name: string;
     coordinates?: number[];  // Optional for unconnected locations
     location_id: string;
     description: string;
     zone_id?: string;
     room_type?: string;
     notes?: string;
     background?: string;
     events: EventDefinition[];
     npcs: string[];
     explicit_exits?: Record<string, ExitDefinition>;
     lore_source?: string;  // Reference to lore entry if extracted from character
     connected: boolean;
   }
   
   export interface EventDefinition {
     id: string;
     trigger: string;
     description: string;
     conditions?: string[];
     cooldown?: number;
   }
   
   export interface PlayerState {
     health: number;
     stamina: number;
     level: number;
     experience: number;
   }
   
   export interface UnconnectedLocation {
     location_id: string;
     name: string;
     description: string;
     lore_source: string;  // Lore entry that referenced this location
   }
   
   export interface WorldState {
     name: string;
     version: string;
     current_position: string;
     visited_positions: string[];
     locations: Record<string, Location>;
     unconnected_locations: Record<string, UnconnectedLocation>;
     player: PlayerState;
     base_character_id?: string;
     pending_event?: EventInfo; // Runtime-only field
   }
   
   export interface EventInfo {
     id: string;
     description: string;
   }
   
   export interface WorldMetadata {
     name: string;
     created_date: string;
     last_modified_date: string;
     base_character_name?: string;
     location_count: number;
     unconnected_location_count: number;
   }
   ```

5. **API Client (Frontend)**
   - Add to existing API client pattern:
   ```typescript
   // In src/api/worldApi.ts
   export const worldApi = {
     // World state management
     getWorldState: async (worldName: string): Promise<WorldState> => {
       // Implement using patterns from existing API functions
     },
     
     saveWorldState: async (worldName: string, state: WorldState): Promise<boolean> => {
       // Implement using patterns from existing API functions
     },
     
     // World creation
     createWorld: async (worldName: string, characterFilePath?: string): Promise<{success: boolean, world_name: string}> => {
       // Create new world, optionally based on character
     },
     
     listWorlds: async (): Promise<WorldMetadata[]> => {
       // Get list of available worlds
     },
     
     // Navigation and location management
     movePlayer: async (worldName: string, direction: string): Promise<WorldState> => {
       // Implement using patterns from existing API functions
     },
     
     createLocation: async (worldName: string, originCoordinates: string, direction: string): Promise<WorldState> => {
       // Implement using patterns from existing API functions
     },
     
     connectLocation: async (worldName: string, locationId: string, coordinates: number[]): Promise<WorldState> => {
       // Connect an unconnected location to the map
     },
     
     // Events
     resolveEvent: async (worldName: string, eventId: string, choiceId: string = "acknowledge"): Promise<WorldState> => {
       // Resolve an event
     }
   }
   ```

6. **World State Context (Frontend)**
   - Create React context following patterns from `APIConfigContext`:
   ```tsx
   // In src/contexts/WorldStateContext.tsx
   export const WorldStateContext = createContext<WorldStateContextType | undefined>(undefined);
   
   export const WorldStateProvider: React.FC<WorldStateProviderProps> = ({ worldName, children }) => {
     const [worldState, setWorldState] = useState<WorldState | null>(null);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState<string | null>(null);
     const [currentEvent, setCurrentEvent] = useState<EventInfo | null>(null);
     
     // Load initial state
     useEffect(() => {
       const loadState = async () => {
         try {
           const state = await worldApi.getWorldState(worldName);
           setWorldState(state);
           setLoading(false);
         } catch (err) {
           setError(err instanceof Error ? err.message : "Failed to load world");
           setLoading(false);
         }
       };
       
       loadState();
     }, [worldName]);
     
     // Implement move function
     const move = async (direction: string) => {
       // Set loading state
       // Call API
       // Update state
       // Check for pending_event
       // Handle errors
     };
     
     // Implement createAdjacentLocation
     const createAdjacentLocation = async (direction: string) => {
       // Similar pattern to move function
     };
     
     // Implement connectLocation
     const connectLocation = async (locationId: string, coordinates: number[]) => {
       // Call API
       // Update state
       // Handle errors
     };
     
     // Implement resolveCurrentEvent
     const resolveCurrentEvent = async (choiceId: string = "acknowledge") => {
       // Call API
       // Clear currentEvent state
     };
     
     // Return provider with value
     return (
       <WorldStateContext.Provider 
         value={{ 
           worldState, 
           loading, 
           error, 
           currentEvent,
           move, 
           createAdjacentLocation,
           connectLocation,
           resolveCurrentEvent
         }}
       >
         {children}
       </WorldStateContext.Provider>
     );
   };
   
   // Custom hook
   export const useWorldState = () => {
     const context = useContext(WorldStateContext);
     if (context === undefined) {
       throw new Error("useWorldState must be used within a WorldStateProvider");
     }
     return context;
   };
   ```

7. **Basic Components (Frontend)**
   - Build UI components following existing CardShark patterns:
   ```tsx
   // In src/views/WorldView.tsx
   export const WorldView: React.FC<WorldViewProps> = ({ worldName }) => {
     return (
       <ErrorBoundary fallback={<div>Something went wrong loading the world</div>}>
         <WorldStateProvider worldName={worldName}>
           <div className="grid grid-cols-12 gap-4">
             <div className="col-span-8">
               <LocationDetail />
               <WorldMap />
             </div>
             <div className="col-span-4">
               <PlayerStatus />
               <UnconnectedLocations />
               <EventDisplay />
             </div>
           </div>
         </WorldStateProvider>
       </ErrorBoundary>
     );
   };
   
   // New component to display unconnected locations extracted from character lore
   // In src/components/UnconnectedLocations.tsx
   export const UnconnectedLocations: React.FC = () => {
     const { worldState, connectLocation } = useWorldState();
     const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
     const [targetCoordinates, setTargetCoordinates] = useState<number[]>([0,0,0]);
     
     if (!worldState || !worldState.unconnected_locations || Object.keys(worldState.unconnected_locations).length === 0) {
       return null;
     }
     
     const handleConnect = async () => {
       if (!selectedLocation) return;
       await connectLocation(selectedLocation, targetCoordinates);
       setSelectedLocation(null);
     };
     
     return (
       <div className="bg-stone-800 rounded-lg p-4 mt-4">
         <h2 className="text-xl mb-2">Unconnected Locations</h2>
         <p className="text-sm text-stone-400 mb-2">
           These locations were found in the character lore but need to be placed on the map.
         </p>
         
         <div className="max-h-40 overflow-y-auto mb-4">
           {Object.entries(worldState.unconnected_locations).map(([id, location]) => (
             <div 
               key={id}
               className={`p-2 mb-2 rounded cursor-pointer ${selectedLocation === id ? 'bg-blue-900' : 'bg-stone-700 hover:bg-stone-600'}`}
               onClick={() => setSelectedLocation(id)}
             >
               <div className="font-medium">{location.name}</div>
               <div className="text-sm text-stone-300">{location.description.substring(0, 60)}...</div>
               <div className="text-xs text-stone-400">From lore: {location.lore_source}</div>
             </div>
           ))}
         </div>
         
         {selectedLocation && (
           <div className="border border-stone-600 rounded p-2 mb-2">
             <h3 className="text-md font-medium mb-1">Connect to Map</h3>
             <div className="flex items-center space-x-2 mb-2">
               <span>Coordinates:</span>
               <input 
                 type="number" 
                 className="w-16 bg-stone-700 px-2 py-1 rounded"
                 value={targetCoordinates[0]}
                 onChange={e => setTargetCoordinates([parseInt(e.target.value), targetCoordinates[1], targetCoordinates[2]])}
               />
               <input 
                 type="number" 
                 className="w-16 bg-stone-700 px-2 py-1 rounded"
                 value={targetCoordinates[1]}
                 onChange={e => setTargetCoordinates([targetCoordinates[0], parseInt(e.target.value), targetCoordinates[2]])}
               />
               <input 
                 type="number" 
                 className="w-16 bg-stone-700 px-2 py-1 rounded"
                 value={targetCoordinates[2]}
                 onChange={e => setTargetCoordinates([targetCoordinates[0], targetCoordinates[1], parseInt(e.target.value)])}
               />
             </div>
             <button 
               className="w-full bg-blue-600 rounded py-1"
               onClick={handleConnect}
             >
               Connect Location
             </button>
           </div>
         )}
       </div>
     );
   };
   ```

### Phase 1.5: Character-Based World Creation

**Purpose:** Add ability to create worlds based on existing character cards.

1. **Location Extraction Utility (Backend)**
   - Create `backend/utils/location_extractor.py`:
   ```python
   from typing import List, Dict
   import re
   from models.world_state import UnconnectedLocation
   
   class LocationExtractor:
       def __init__(self, logger):
           self.logger = logger
           # Common location indicators (landmarks, buildings, geographical features)
           self.location_indicators = [
               "castle", "tower", "temple", "shrine", "village", "city", "town", "forest",
               "mountain", "lake", "river", "cave", "mansion", "house", "tavern", "inn",
               "academy", "school", "library", "dungeon", "palace", "fort", "fortress",
               "island", "valley", "bridge", "gate", "port", "harbor", "market", "shop",
               "arena", "garden", "park", "tomb", "crypt", "cemetery", "laboratory"
           ]
           
       def extract_from_lore(self, character_data: Dict) -> List[UnconnectedLocation]:
           """Extract potential locations from character lore entries."""
           locations = []
           try:
               # Get character book entries
               lore_entries = character_data.get("data", {}).get("character_book", {}).get("entries", [])
               
               for entry in lore_entries:
                   content = entry.get("content", "")
                   keys = entry.get("keys", [])
                   key_str = ", ".join(keys)
                   
                   # Skip if content is too short
                   if len(content) < 20:
                       continue
                       
                   # Extract potential locations from content
                   found_locations = self._extract_locations_from_text(content)
                   
                   # Create UnconnectedLocation objects
                   for loc_name, loc_desc in found_locations:
                       location_id = f"lore_{len(locations)}"
                       locations.append(UnconnectedLocation(
                           location_id=location_id,
                           name=loc_name,
                           description=loc_desc if loc_desc else f"A location mentioned in relation to {key_str}.",
                           lore_source=key_str
                       ))
               
               self.logger.log_step(f"Extracted {len(locations)} potential locations from lore")
               return locations
               
           except Exception as e:
               self.logger.log_error(f"Error extracting locations from lore: {str(e)}")
               return []
               
       def _extract_locations_from_text(self, text: str) -> List[tuple]:
           """Extract location names and descriptions from text content."""
           locations = []
           
           # Regex patterns to find capitalized phrases followed by location indicators
           for indicator in self.location_indicators:
               # Look for "The X", "X of Y", etc. patterns with our indicator
               patterns = [
                   fr"(The\s+\w+(?:\s+\w+)?\s+{indicator})",  # The Grand Castle, The Dark Forest
                   fr"(\w+(?:'s)?\s+{indicator})",  # Dragon's Cave, Ancient Temple
                   fr"({indicator}\s+of\s+\w+(?:\s+\w+)?)"  # Temple of Light, City of Gold
               ]
               
               for pattern in patterns:
                   matches = re.finditer(pattern, text, re.IGNORECASE)
                   for match in matches:
                       loc_name = match.group(1)
                       # Try to extract a description (sentence containing the location)
                       sentences = re.split(r'(?<=[.!?])\s+', text)
                       for sentence in sentences:
                           if loc_name.lower() in sentence.lower():
                               locations.append((loc_name, sentence))
                               break
                       else:
                           # If no description found, add without one
                           locations.append((loc_name, ""))
           
           return locations
   ```

2. **World Creation UI (Frontend)**
   - Create `src/components/WorldCreationModal.tsx`:
   ```tsx
   export const WorldCreationModal: React.FC<{
     onClose: () => void;
     onSuccess: (worldName: string) => void;
   }> = ({ onClose, onSuccess }) => {
     const [worldName, setWorldName] = useState("");
     const [createType, setCreateType] = useState<"empty" | "character">("empty");
     const [selectedCharacter, setSelectedCharacter] = useState<string>("");
     const [characters, setCharacters] = useState<any[]>([]);
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState<string | null>(null);
     
     // Fetch available characters on mount
     useEffect(() => {
       const fetchCharacters = async () => {
         try {
           // Use existing character API to get available character cards
           const response = await fetch("/api/characters");
           const data = await response.json();
           if (data.exists && data.files) {
             setCharacters(data.files);
           }
         } catch (err) {
           setError("Failed to load characters");
         }
       };
       
       fetchCharacters();
     }, []);
     
     const handleSubmit = async (e: React.FormEvent) => {
       e.preventDefault();
       if (!worldName.trim()) {
         setError("World name is required");
         return;
       }
       
       setLoading(true);
       setError(null);
       
       try {
         const response = await worldApi.createWorld(
           worldName, 
           createType === "character" ? selectedCharacter : undefined
         );
         
         if (response.success) {
           onSuccess(response.world_name);
         } else {
           setError("Failed to create world");
         }
       } catch (err) {
         setError(err instanceof Error ? err.message : "Failed to create world");
       } finally {
         setLoading(false);
       }
     };
     
     return (
       <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
         <div className="bg-stone-800 rounded-lg p-6 max-w-md w-full">
           <h2 className="text-2xl mb-4">Create New World</h2>
           
           <form onSubmit={handleSubmit}>
             <div className="mb-4">
               <label className="block text-sm font-medium mb-1">World Name</label>
               <input
                 type="text"
                 className="w-full bg-stone-700 rounded px-3 py-2"
                 value={worldName}
                 onChange={(e) => setWorldName(e.target.value)}
                 placeholder="Enter world name"
               />
             </div>
             
             <div className="mb-4">
               <label className="block text-sm font-medium mb-1">World Type</label>
               <div className="flex space-x-4">
                 <label className="flex items-center">
                   <input
                     type="radio"
                     className="mr-2"
                     checked={createType === "empty"}
                     onChange={() => setCreateType("empty")}
                   />
                   Empty World
                 </label>
                 <label className="flex items-center">
                   <input
                     type="radio"
                     className="mr-2"
                     checked={createType === "character"}
                     onChange={() => setCreateType("character")}
                   />
                   Based on Character
                 </label>
               </div>
             </div>
             
             {createType === "character" && (
               <div className="mb-4">
                 <label className="block text-sm font-medium mb-1">Select Character</label>
                 <select
                   className="w-full bg-stone-700 rounded px-3 py-2"
                   value={selectedCharacter}
                   onChange={(e) => setSelectedCharacter(e.target.value)}
                 >
                   <option value="">Select a character...</option>
                   {characters.map((char) => (
                     <option key={char.path} value={char.path}>
                       {char.name}
                     </option>
                   ))}
                 </select>
               </div>
             )}
             
             {error && (
               <div className="mb-4 text-red-500">{error}</div>
             )}
             
             <div className="flex justify-end space-x-3">
               <button
                 type="button"
                 className="px-4 py-2 border border-stone-600 rounded"
                 onClick={onClose}
                 disabled={loading}
               >
                 Cancel
               </button>
               <button
                 type="submit"
                 className="px-4 py-2 bg-blue-600 rounded"
                 disabled={loading || (createType === "character" && !selectedCharacter)}
               >
                 {loading ? "Creating..." : "Create World"}
               </button>
             </div>
           </form>
         </div>
       </div>
     );
   };
   ```

3. **World Listing Component (Frontend)**
   - Create `src/components/WorldsList.tsx`:
   ```tsx
   export const WorldsList: React.FC<{
     onSelectWorld: (worldName: string) => void;
     onCreateWorld: () => void;
   }> = ({ onSelectWorld, onCreateWorld }) => {
     const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState<string | null>(null);
     
     useEffect(() => {
       const fetchWorlds = async () => {
         try {
           const worlds = await worldApi.listWorlds();
           setWorlds(worlds);
           setLoading(false);
         } catch (err) {
           setError("Failed to load worlds");
           setLoading(false);
         }
       };
       
       fetchWorlds();
     }, []);
     
     if (loading) return <div className="p-4">Loading worlds...</div>;
     if (error) return <div className="p-4 text-red-500">{error}</div>;
     
     return (
       <div className="p-4">
         <div className="flex justify-between items-center mb-4">
           <h2 className="text-2xl">Your Worlds</h2>
           <button 
             className="px-4 py-2 bg-blue-600 rounded"
             onClick={onCreateWorld}
           >
             Create New World
           </button>
         </div>
         
         {worlds.length === 0 ? (
           <div className="text-center py-8">
             <p className="mb-4">You don't have any worlds yet.</p>
             <button 
               className="px-4 py-2 bg-blue-600 rounded"
               onClick={onCreateWorld}
             >
               Create Your First World
             </button>
           </div>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {worlds.map((world) => (
               <div 
                 key={world.name}
                 className="bg-stone-800 rounded-lg p-4 cursor-pointer hover:bg-stone-700"
                 onClick={() => onSelectWorld(world.name)}
               >
                 <h3 className="text-xl mb-1">{world.name}</h3>
                 {world.base_character_name && (
                   <p className="text-sm text-stone-400">Based on: {world.base_character_name}</p>
                 )}
                 <div className="text-sm mt-2">
                   <span className="text-stone-400">Locations: </span>
                   <span>{world.location_count}</span>
                   {world.unconnected_location_count > 0 && (
                     <>
                       <span className="mx-1">•</span>
                       <span className="text-stone-400">Unconnected: </span>