# World Card System Implementation Plan (Enhanced)
## Vision & Philosophy
Build an interactive, coordinate-based adventure system ("World Cards") leveraging CardShark's existing architecture. Players navigate dynamic maps, interact with AI-driven characters, and experience events that shape the world.

**Core Philosophy:** Organic World Growth - worlds start at coordinate `[0,0,0]` and expand naturally as locations are added. This approach allows for intuitive, creator-driven world design.

## Implementation Approach
### Phase 0: Setup & Foundation
**Purpose:** Prepare project environment, using existing patterns where possible.

1. **Backend Configuration**
   - ✅ Leverage existing `settings_manager.py` to add world card settings
   - ✅ Add world cards path to settings (`worldcards_directory`) with default path
   - ✅ Reuse project's file path resolution logic from `get_users_dir()`

2. **Directory Structure**
   - ✅ Create base directory structure for world cards
   - ✅ Follow existing storage patterns from chat storage

3. **Error Handling**
   - ✅ Extend `CardSharkError` in `errors.py` with new error types:
     ```python
     # Add to ErrorType enum
     WORLD_NOT_FOUND = "WORLD_NOT_FOUND"
     WORLD_STATE_INVALID = "WORLD_STATE_INVALID"
     
     # Add to ErrorMessages
     WORLD_NOT_FOUND = "World not found: {world_name}"
     WORLD_STATE_INVALID = "World state validation failed: {error}"
     ```

### Phase 1: Core Structure & Coordinate Navigation
**Purpose:** Establish data structures, coordinate navigation, and state management.
1. **Data Models (Backend)**
   - Create Pydantic models in `backend/models/world_state.py`:
   ```python
   class Location(BaseModel):
       name: str
       coordinates: List[int]  # [x,y,z]
       description: str
       zone_id: Optional[str] = None
       room_type: Optional[str] = None
       notes: Optional[str] = None
       background: Optional[str] = None
       events: List["EventDefinition"] = []
       npcs: List[str] = []  # List of character UUIDs
       explicit_exits: Optional[Dict[str, "ExitDefinition"]] = None
       
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
       
   class WorldState(BaseModel):
       name: str
       version: str  # For schema migration support
       current_position: str  # Coordinate string "0,0,0"
       visited_positions: List[str] = []
       locations: Dict[str, Location] = {}  # Key is coordinate string
       player: PlayerState = PlayerState()
   ```

2. **World State Handler (Backend)**
   - Create `backend/handlers/world_state_handler.py` using patterns from `chat_handler.py`:
   ```python
   class WorldStateHandler:
       def __init__(self, logger):
           self.logger = logger
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
           
       def initialize_world_state(self, world_name: str) -> WorldState:
           # Create initial world_state.json with [0,0,0] location
           # Return new WorldState
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
   ```

4. **TypeScript Types (Frontend)**
   - Create `frontend/src/types/world.ts` mirroring Pydantic models:
   ```typescript
   export interface Location {
     name: string;
     coordinates: number[];
     description: string;
     zone_id?: string;
     room_type?: string;
     notes?: string;
     background?: string;
     events: EventDefinition[];
     npcs: string[];
     explicit_exits?: Record<string, ExitDefinition>;
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
   
   export interface WorldState {
     name: string;
     version: string;
     current_position: string;
     visited_positions: string[];
     locations: Record<string, Location>;
     player: PlayerState;
     pending_event?: EventInfo; // Runtime-only field
   }
   
   export interface EventInfo {
     id: string;
     description: string;
   }
   ```

5. **API Client (Frontend)**
   - Add to existing API client pattern:
   ```typescript
   // In src/api/worldApi.ts
   export const worldApi = {
     getWorldState: async (worldName: string): Promise<WorldState> => {
       // Implement using patterns from existing API functions
     },
     
     saveWorldState: async (worldName: string, state: WorldState): Promise<boolean> => {
       // Implement using patterns from existing API functions
     },
     
     movePlayer: async (worldName: string, direction: string): Promise<WorldState> => {
       // Implement using patterns from existing API functions
     },
     
     createLocation: async (worldName: string, originCoordinates: string, direction: string): Promise<WorldState> => {
       // Implement using patterns from existing API functions
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
               <EventDisplay />
             </div>
           </div>
         </WorldStateProvider>
       </ErrorBoundary>
     );
   };
   ```

### Phase 2: Visual Elements & Character Integration
**Purpose:** Add visual representation of locations and characters.
1. **Static Asset Serving (Backend)**
   - Leverage existing static file serving in main.py:
   ```python
   app.mount("/static/worldcards", StaticFiles(directory=str(worldcards_dir / "static")), name="worldcards_static")
   ```

2. **Location Visual Components (Frontend)**
   - Enhance `LocationDetail` to display background images and NPCs:
   ```tsx
   // In src/components/LocationDetail.tsx
   export const LocationDetail: React.FC = () => {
     const { worldState, move, createAdjacentLocation } = useWorldState();
     
     if (!worldState) return <div>No world state available</div>;
     
     const currentPosition = worldState.current_position;
     const location = worldState.locations[currentPosition];
     
     // Check if adjacent locations exist
     const getAdjacentCoordinate = (direction: string): string => {
       // Calculate coordinate based on direction
     };
     
     const renderDirectionButton = (direction: string, label: string) => {
       const targetCoord = getAdjacentCoordinate(direction);
       const exists = worldState.locations[targetCoord] !== undefined;
       
       return exists ? (
         <button onClick={() => move(direction)}>
           Move {label}
         </button>
       ) : (
         <button onClick={() => createAdjacentLocation(direction)}>
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
           <p className="text-sm text-stone-400">Coordinates: {location.coordinates.join(',')}</p>
           <p className="my-4">{location.description}</p>
           
           {/* Direction buttons */}
           <div className="grid grid-cols-3 gap-2 my-4">
             {renderDirectionButton("north", "North")}
             {renderDirectionButton("east", "East")}
             {renderDirectionButton("west", "West")}
             {renderDirectionButton("south", "South")}
             {renderDirectionButton("up", "Up")}
             {renderDirectionButton("down", "Down")}
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
       // Use existing character API to fetch minimal details
       // This leverages your existing character card system
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

### Phase 3: Interactivity & Events
**Purpose:** Add player state and interactive events.
1. **Player Status Component (Frontend)**
   - Display player state:
   ```tsx
   // src/components/PlayerStatus.tsx
   export const PlayerStatus: React.FC = () => {
     const { worldState } = useWorldState();
     
     if (!worldState || !worldState.player) return null;
     
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

1. **Combat System** - Implement turn-based combat with NPC interactions
2. **Inventory System** - Add items, collection, and usage mechanics
3. **Quest System** - Implement quest tracking and progression
4. **Advanced Map Visualization** - Create zoomable, pannable map interface
5. **World Builder UI** - Implement visual world creation tools
6. **AI Integration** - Deep character dialogue using existing CardShark LLM capabilities

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