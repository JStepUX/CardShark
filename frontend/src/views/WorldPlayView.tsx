/**
 * @file WorldPlayView.tsx
 * @description Main orchestrator for World Card gameplay. Integrates the existing ChatView
 *              with SidePanel (in world mode) and MapModal for navigation.
 * @dependencies worldApi (V2), roomApi, ChatView, SidePanel, MapModal, GridCombatHUD, LocalMapView
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useChat } from '../contexts/ChatContext';
import { useCharacter } from '../contexts/CharacterContext';
import { useAPIConfig } from '../contexts/APIConfigContext';
import { useOptionalSideNav } from '../contexts/SideNavContext';
import ChatView from '../components/chat/ChatView';
import { JournalModal } from '../components/SidePanel/JournalModal';
import { PartyGatherModal } from '../components/world/PartyGatherModal';
import { PixiMapModal } from '../components/world/pixi/PixiMapModal';
import { worldApi } from '../api/worldApi';
import { roomApi } from '../api/roomApi';
import type { WorldCard, RoomInstanceState, WorldUserProgress, WorldUserProgressUpdate } from '../types/worldCard';
import type { CharacterCard } from '../types/schema';
import type { GridWorldState, GridRoom, DisplayNPC } from '../types/worldGrid';
import type { CombatInitData } from '../types/combat';
import { resolveNpcDisplayData } from '../utils/worldStateApi';
import { roomCardToGridRoom, placementToGridRoomStub } from '../utils/roomCardAdapter';
import { injectRoomContext, injectNPCContext, buildThinNPCContext, buildDualSpeakerContext } from '../utils/worldCardAdapter';
import {
  parseMultiSpeakerResponse,
  splitIntoMessages,
  hasAllyInterjection,
  type MultiSpeakerConfig
} from '../utils/multiSpeakerParser';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { WorldLoadError } from '../components/world/WorldLoadError';
import type { NPCRelationship, TimeState, TimeConfig } from '../types/worldRuntime';
import { createDefaultRelationship, updateRelationshipAffinity, resetDailyAffinity } from '../utils/affinityUtils';
import { useEmotionDetection } from '../hooks/useEmotionDetection';
import { dispatchScrollToBottom } from '../hooks/useScrollToBottom';
import { calculateSentimentAffinity, updateSentimentHistory, resetSentimentAfterGain } from '../utils/sentimentAffinityCalculator';
import { createDefaultTimeState, advanceTime, getTimeOfDayDescription } from '../utils/timeUtils';
// Local Map imports for unified Play View
import { LocalMapView, LocalMapViewHandle, soundManager } from '../components/world/pixi/local';
import { PlayViewLayout } from '../components/world/PlayViewLayout';
import { CombatLogPanel } from '../components/combat/CombatLogPanel';
import { GridCombatHUD } from '../components/combat/GridCombatHUD';
import { CombatEndScreen } from '../components/combat/CombatEndScreen';
import { useGridCombat } from '../hooks/useGridCombat';
import { buildCombatNarrativeSummary, buildPostCombatPrompt, buildDefeatPrompt } from '../services/combat/postCombatNarrative';
import type { TilePosition, ExitDirection, LocalMapState, LocalMapConfig } from '../types/localMap';
import { getSpawnPosition } from '../utils/localMapUtils';
import type { GridCombatState } from '../types/combat';
import {
  checkLevelUp,
  calculateLevelFromXP,
  getXPProgress,
  createDefaultPlayerProgression,
  type LevelUpInfo,
  type PlayerProgression
} from '../utils/progressionUtils';
import { deriveGridCombatStats } from '../types/combat';
// Inventory system
import { InventoryModal } from '../components/inventory';
import type { CharacterInventory } from '../types/inventory';
import { createDefaultInventory } from '../types/inventory';
// Room transition state
import type { TransitionState, ProgressStatus } from '../types/transition';
import { createIdleTransitionState, TRANSITION_TIMEOUT_MS, THIN_FRAME_TIMEOUT_MS, SUMMARIZATION_TIMEOUT_MS } from '../types/transition';
import { preloadRoomTextures } from '../utils/texturePreloader';
import { LoadingScreen } from '../components/transition';
// Thin frame service for NPC identity preservation
import { generateThinFrame, mergeThinFrameIntoCard } from '../services/thinFrameService';
// Adventure log for room summarization
import { adventureLogApi } from '../api/adventureLogApi';
import type { SummarizeMessage, SummarizeNPC, AdventureContext } from '../types/adventureLog';
import { mergeAdventureLogWithNotes } from '../utils/adventureLogContext';
import { isValidThinFrame } from '../types/schema';

// Local map config (must match LocalMapView defaults) - 9x9 square grid
const LOCAL_MAP_CONFIG: LocalMapConfig = {
  gridWidth: 9,
  gridHeight: 9,
  tileSize: 100,
};

// Extended DisplayNPC with combat info from RoomNPC
interface CombatDisplayNPC extends DisplayNPC {
  hostile?: boolean;
  monster_level?: number;
  isIncapacitated?: boolean;
  isDead?: boolean;
}

interface WorldPlayViewProps {
  worldId?: string;
}

// Route state type for user profile passed from WorldLauncher
interface WorldPlayRouteState {
  userProfile?: {
    user_uuid?: string;
    name?: string;
    filename?: string;
  };
}

export function WorldPlayView({ worldId: propWorldId }: WorldPlayViewProps) {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    messages,
    setMessages,
    addMessage,
    setCharacterDataOverride,
    currentUser,
    sessionNotes,
    setSessionNotes
  } = useChat();
  const { characterData } = useCharacter();
  const { apiConfig } = useAPIConfig();
  const sideNav = useOptionalSideNav();

  // Collapse side navigation when entering world play for more map space
  useEffect(() => {
    sideNav?.collapse();
  }, [sideNav]);

  const worldId = propWorldId || uuid || '';

  // Get user profile from route state (passed from WorldLauncher)
  const routeState = location.state as WorldPlayRouteState | null;
  const selectedUserUuid = routeState?.userProfile?.user_uuid;

  // State
  const [worldCard, setWorldCard] = useState<WorldCard | null>(null);
  const [worldState, setWorldState] = useState<GridWorldState | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GridRoom | null>(null);
  const [roomNpcs, setRoomNpcs] = useState<CombatDisplayNPC[]>([]);
  const [activeNpcId, setActiveNpcId] = useState<string | undefined>(); // BONDED ally ID (follows player, full context)
  const [activeNpcName, setActiveNpcName] = useState<string>(''); // Bonded ally name for PartyGatherModal display
  const [activeNpcCard, setActiveNpcCard] = useState<CharacterCard | null>(null); // Bonded ally's full character card

  // Conversation target state (separate from bonded ally)
  // This is for talking to NPCs WITHOUT bonding them (e.g., merchants, brief interactions)
  const [conversationTargetId, setConversationTargetId] = useState<string | undefined>(); // NPC being talked to (non-bonded)
  const [conversationTargetName, setConversationTargetName] = useState<string>(''); // For message attribution
  const [conversationTargetCard, setConversationTargetCard] = useState<CharacterCard | null>(null); // Thin context card

  const [showMap, setShowMap] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showPartyGatherModal, setShowPartyGatherModal] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<GridRoom | null>(null);
  const [pendingEntryDirection, setPendingEntryDirection] = useState<ExitDirection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingRoomCount, setMissingRoomCount] = useState(0);
  const [showMissingRoomWarning, setShowMissingRoomWarning] = useState(false);

  // Affinity/relationship tracking
  const [npcRelationships, setNpcRelationships] = useState<Record<string, NPCRelationship>>({});

  // Time system state
  const [timeState, setTimeState] = useState<TimeState>(createDefaultTimeState());
  const [timeConfig] = useState<TimeConfig>({
    messagesPerDay: 50,
    enableDayNightCycle: true
  });

  // Combat state (legacy - kept for compatibility)
  const [_combatInitData, setCombatInitData] = useState<CombatInitData | null>(null);
  const [isInCombat, setIsInCombat] = useState(false);

  // Combat end screen state (tracks result until player clicks Continue)
  const [combatEndState, setCombatEndState] = useState<{
    phase: 'victory' | 'defeat';
    result: GridCombatState['result'];
    combatants: GridCombatState['combatants'];
  } | null>(null);

  // Dev tools visibility (toggle with Ctrl+Shift+D)
  const [showDevTools, setShowDevTools] = useState(false);

  // Player progression state (per-world)
  const [playerProgression, setPlayerProgression] = useState<PlayerProgression>(createDefaultPlayerProgression());
  const [levelUpInfo, setLevelUpInfo] = useState<LevelUpInfo | null>(null);

  // Local map state (unified Play View)
  const [playerTilePosition, setPlayerTilePosition] = useState<TilePosition>({ x: 2, y: 2 });
  const [entryDirection, setEntryDirection] = useState<ExitDirection | null>(null);
  const [localMapStateCache, setLocalMapStateCache] = useState<LocalMapState | null>(null);

  // Inventory state
  const [playerInventory, setPlayerInventory] = useState<CharacterInventory>(() => createDefaultInventory());
  const [allyInventory, setAllyInventory] = useState<CharacterInventory | null>(null);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryTarget, setInventoryTarget] = useState<'player' | 'ally'>('player');

  // Room transition state (Phase 1: loading screen + atomic state updates)
  const [transitionState, setTransitionState] = useState<TransitionState>(createIdleTransitionState);

  // Adventure context for narrative continuity (Phase 3)
  const [adventureContext, setAdventureContext] = useState<AdventureContext | null>(null);

  // Ref for LocalMapView to trigger combat animations
  const localMapRef = useRef<LocalMapViewHandle | null>(null);

  // Accumulated per-room runtime state (NPC alive/dead/incapacitated).
  // Uses a ref to avoid re-renders on every combat result; only read at save time.
  const roomStatesRef = useRef<Record<string, RoomInstanceState>>({});

  // Debounce timer ref for runtime state saves
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grid combat hook
  const gridCombat = useGridCombat(localMapStateCache, {
    onCombatEnd: (phase, finalState) => {
      console.log('Grid combat ended:', phase, 'rewards:', finalState.result?.rewards);
      // Use finalState directly (passed from reducer) to avoid stale closure issues
      setCombatEndState({
        phase,
        result: finalState.result,
        combatants: finalState.combatants,
      });
      // Don't set isInCombat false yet - wait for player to click Continue
    },
    onMapStateUpdate: (updatedMap) => {
      setLocalMapStateCache(updatedMap);
      // Sync player position
      setPlayerTilePosition(updatedMap.playerPosition);
    },
    mapRef: localMapRef,
  });

  // Emotion detection for sentiment-based affinity
  // Track emotion for whoever is currently being spoken to (conversation target or bonded ally)
  const currentSpeakingNpcName = conversationTargetName || activeNpcName;
  const { currentEmotion } = useEmotionDetection(messages, currentSpeakingNpcName);

  // Calculate level-up info when combat ends with victory
  useEffect(() => {
    if (!combatEndState || combatEndState.phase !== 'victory' || !combatEndState.result?.rewards) {
      return;
    }

    const rewards = combatEndState.result.rewards;
    const xpGained = rewards.xp || 0;

    // Check for level-up
    const levelUpResult = checkLevelUp(
      playerProgression.xp,
      xpGained,
      (level) => deriveGridCombatStats(level, 'melee')
    );

    if (levelUpResult) {
      setLevelUpInfo(levelUpResult);
      // Play level-up sound
      soundManager.play('level_up');
      console.log('[Progression] Level-up detected:', levelUpResult);
    }
  }, [combatEndState, playerProgression.xp]);

  // Dev tools keyboard shortcut (Ctrl+Shift+D to toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDevTools(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ============================================
  // ADVENTURE LOG CONTEXT INJECTION (Phase 3)
  // ============================================
  // Ref to track the base (user-entered) session notes separate from adventure log additions
  const baseSessionNotesRef = useRef<string>('');

  // When adventure context or current room changes, merge adventure log into session notes
  useEffect(() => {
    if (!adventureContext || adventureContext.entries.length === 0) {
      return;
    }

    // Merge adventure log with base session notes (excluding current room from history)
    const mergedNotes = mergeAdventureLogWithNotes(
      baseSessionNotesRef.current,
      adventureContext,
      currentRoom?.id
    );

    // Only update if different (prevent infinite loops)
    if (mergedNotes !== sessionNotes) {
      setSessionNotes(mergedNotes);
      console.log('[AdventureLog] Injected adventure log into session context');
    }
  }, [adventureContext, currentRoom?.id, sessionNotes, setSessionNotes]);

  // When user manually edits session notes (via Journal), update the base ref
  // This is handled by JournalModal - we capture the initial state here
  useEffect(() => {
    // Only capture as "base" if it doesn't look like it has adventure log merged in
    if (sessionNotes && !sessionNotes.startsWith('[Your Recent Journey]')) {
      baseSessionNotesRef.current = sessionNotes;
    }
  }, [sessionNotes]);

  // ============================================
  // ROOM TRANSITION HELPERS
  // ============================================

  /**
   * Update transition progress for a specific operation.
   * Note: Used for Phase 2/3 when progress callbacks are enabled.
   */
  const _updateTransitionProgress = useCallback((
    key: keyof TransitionState['progress'],
    status: ProgressStatus
  ) => {
    setTransitionState(prev => ({
      ...prev,
      progress: {
        ...prev.progress,
        [key]: status,
      },
    }));
  }, []);

  /**
   * Check if transition has timed out.
   * Note: Used for Phase 2/3 timeout handling.
   */
  const _isTransitionTimedOut = useCallback((startedAt: number | null): boolean => {
    if (!startedAt) return false;
    return Date.now() - startedAt > TRANSITION_TIMEOUT_MS;
  }, []);

  // Suppress unused variable warnings for future-use helpers
  void _updateTransitionProgress;
  void _isTransitionTimedOut;

  /**
   * Helper to check if currently transitioning (for gating UI).
   */
  const isTransitioning = transitionState.phase !== 'idle';

  // Load world data from API (V2) - LAZY LOADING
  // Only fetches world card + starting room (2 API calls instead of N+1)
  // Now also loads per-user progress from SQLite via new progress API
  useEffect(() => {
    async function loadWorld() {
      if (!worldId) {
        setError('No world ID provided');
        setIsLoading(false);
        return;
      }

      // Check if user was selected - if not, navigate back to launcher
      if (!selectedUserUuid) {
        console.warn('[WorldPlayView] No user selected, navigating back to launcher');
        navigate(`/world/${worldId}`, { replace: true });
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Load world card (V2) - single API call
        const world = await worldApi.getWorld(worldId);
        setWorldCard(world);

        const worldData = world.data.extensions.world_data;

        // =========================================
        // LOAD PER-USER PROGRESS FROM NEW API
        // =========================================
        let progress: WorldUserProgress | null = null;
        let migratedFromWorldData = false;

        try {
          progress = await worldApi.getProgress(worldId, selectedUserUuid);
          console.log('[Progress] Loaded from database:', progress ? 'found' : 'not found');
        } catch (err) {
          console.warn('[Progress] Failed to load progress:', err);
        }

        // Load adventure context for narrative continuity (Phase 3)
        try {
          const loadedAdventureContext = await adventureLogApi.getAdventureContext(worldId, selectedUserUuid);
          setAdventureContext(loadedAdventureContext);
          console.log(`[AdventureLog] Loaded ${loadedAdventureContext.entries.length} room summaries`);
        } catch (err) {
          console.warn('[AdventureLog] Failed to load adventure context:', err);
          // Non-fatal - continue without adventure log
        }

        // If no progress exists, check for embedded world_data progress to migrate
        if (!progress) {
          const hasEmbeddedProgress = (
            (worldData.player_xp && worldData.player_xp > 0) ||
            (worldData.player_level && worldData.player_level > 1) ||
            (worldData.player_gold && worldData.player_gold > 0) ||
            (worldData.npc_relationships && Object.keys(worldData.npc_relationships).length > 0) ||
            worldData.time_state ||
            worldData.player_inventory
          );

          if (hasEmbeddedProgress) {
            console.log('[Progress] Migrating embedded world_data progress to database');
            migratedFromWorldData = true;

            // Build progress from world_data
            progress = {
              world_uuid: worldId,
              user_uuid: selectedUserUuid,
              player_xp: worldData.player_xp ?? 0,
              player_level: worldData.player_level ?? 1,
              player_gold: worldData.player_gold ?? 0,
              current_room_uuid: undefined, // Will be set from player_position
              bonded_ally_uuid: worldData.bonded_ally_uuid,
              time_state: worldData.time_state,
              npc_relationships: worldData.npc_relationships,
              player_inventory: worldData.player_inventory,
              ally_inventory: worldData.ally_inventory,
              room_states: worldData.room_states,
            };

            // Save migrated progress to database
            try {
              await worldApi.saveProgress(worldId, selectedUserUuid, progress);
              console.log('[Progress] Migration saved to database');
            } catch (saveErr) {
              console.error('[Progress] Failed to save migrated progress:', saveErr);
            }
          }
        }

        // Initialize state from progress (or defaults)
        const savedProgression: PlayerProgression = {
          xp: progress?.player_xp ?? 0,
          level: progress?.player_level ?? calculateLevelFromXP(progress?.player_xp ?? 0),
          gold: progress?.player_gold ?? 0,
        };
        // Ensure level is consistent with XP
        savedProgression.level = calculateLevelFromXP(savedProgression.xp);
        setPlayerProgression(savedProgression);
        console.log('[Progression] Loaded player progression:', savedProgression, migratedFromWorldData ? '(migrated)' : '');

        // Restore runtime state from progress
        if (progress?.time_state) {
          setTimeState(progress.time_state as TimeState);
          console.log('[RuntimeState] Restored time state');
        }
        if (progress?.npc_relationships && Object.keys(progress.npc_relationships).length > 0) {
          setNpcRelationships(progress.npc_relationships as Record<string, NPCRelationship>);
          console.log('[RuntimeState] Restored NPC relationships:', Object.keys(progress.npc_relationships).length, 'NPCs');
        }
        if (progress?.player_inventory) {
          setPlayerInventory(progress.player_inventory as CharacterInventory);
          console.log('[RuntimeState] Restored player inventory');
        }
        if (progress?.room_states) {
          roomStatesRef.current = progress.room_states as Record<string, RoomInstanceState>;
          console.log('[RuntimeState] Restored room states for', Object.keys(progress.room_states).length, 'rooms');
        }
        // Store bonded ally UUID for restoration after room loads
        const savedBondedAllyUuid = progress?.bonded_ally_uuid;
        // Bonded ally is restored below after room loads (needs async fetch)

        const gridSize = worldData.grid_size;

        // LAZY LOADING: Build grid from placements WITHOUT fetching each room
        // This uses cached instance_name and instance_npcs from the world card
        const grid: (GridRoom | null)[][] = Array(gridSize.height)
          .fill(null)
          .map(() => Array(gridSize.width).fill(null));

        // Track placements for quick lookup and count legacy rooms (missing names)
        let legacyRoomCount = 0;
        for (const placement of worldData.rooms) {
          const { x, y } = placement.grid_position;

          // Create GridRoom stub from placement data (no API call!)
          const gridRoom = placementToGridRoomStub(placement);

          if (y >= 0 && y < gridSize.height && x >= 0 && x < gridSize.width) {
            grid[y][x] = gridRoom;
          }

          // Count rooms without cached names (will show "Unknown Room")
          if (!placement.instance_name) {
            legacyRoomCount++;
          }
        }

        // Show warning if legacy rooms detected (suggest re-saving in editor)
        if (legacyRoomCount > 0) {
          console.warn(`${legacyRoomCount} rooms have no cached name. Open in World Editor and save to update.`);
          // Optional: Could show UI warning for legacy worlds
        }

        // Create GridWorldState for MapModal
        const gridWorldState: GridWorldState = {
          uuid: world.data.character_uuid || worldId,
          metadata: {
            name: world.data.name,
            description: world.data.description,
          },
          grid,
          player_position: worldData.player_position,
          starting_position: worldData.starting_position,
        };
        setWorldState(gridWorldState);

        // LAZY LOADING: Only fetch the CURRENT room's full data
        const playerPos = worldData.player_position;
        console.log(`[WorldPlayView] Player position: (${playerPos.x}, ${playerPos.y})`);

        const currentPlacement = worldData.rooms.find(
          r => r.grid_position.x === playerPos.x && r.grid_position.y === playerPos.y
        );

        console.log('[WorldPlayView] Current placement found:', currentPlacement);

        if (currentPlacement) {
          try {
            console.log(`[WorldPlayView] Fetching full room card for UUID: ${currentPlacement.room_uuid}`);
            // Fetch full room card for current room only
            const roomCard = await roomApi.getRoom(currentPlacement.room_uuid);
            const fullCurrentRoom = roomCardToGridRoom(roomCard, playerPos, currentPlacement);

            // Update grid with full room data
            if (playerPos.y >= 0 && playerPos.y < gridSize.height &&
              playerPos.x >= 0 && playerPos.x < gridSize.width) {
              grid[playerPos.y][playerPos.x] = fullCurrentRoom;
            }

            setCurrentRoom(fullCurrentRoom);

            // Resolve NPCs in the room and merge with combat data
            const npcUuids = fullCurrentRoom.npcs.map(npc => npc.character_uuid);
            const resolvedNpcs = await resolveNpcDisplayData(npcUuids);

            // Merge hostile/monster_level from room NPCs
            let npcsWithCombatData: CombatDisplayNPC[] = resolvedNpcs.map(npc => {
              const roomNpc = fullCurrentRoom.npcs.find(rn => rn.character_uuid === npc.id);
              return {
                ...npc,
                hostile: roomNpc?.hostile,
                monster_level: roomNpc?.monster_level,
              };
            });

            // Apply persisted room state: filter dead NPCs, mark incapacitated
            const savedRoomState = roomStatesRef.current[fullCurrentRoom.id];
            if (savedRoomState?.npc_states) {
              npcsWithCombatData = npcsWithCombatData
                .filter(npc => savedRoomState.npc_states[npc.id]?.status !== 'dead')
                .map(npc => {
                  const npcState = savedRoomState.npc_states[npc.id];
                  if (npcState?.status === 'incapacitated') {
                    return { ...npc, isIncapacitated: true };
                  }
                  return npc;
                });
              console.log('[RuntimeState] Applied saved room state: filtered dead, marked incapacitated');
            }
            setRoomNpcs(npcsWithCombatData);

            // Debug logging for NPC data
            console.log('Initial room NPCs loaded:', npcsWithCombatData);
            console.log('Placement instance_npcs:', currentPlacement.instance_npcs);
            console.log('Room card NPCs:', fullCurrentRoom.npcs);

            // Update worldState with the full room
            setWorldState(prev => prev ? { ...prev, grid } : null);

            // Restore bonded ally if one was saved (from progress, not world_data)
            if (savedBondedAllyUuid) {
              try {
                const allyResponse = await fetch(`/api/character/${savedBondedAllyUuid}`);
                if (allyResponse.ok) {
                  const allyCharData = await allyResponse.json();
                  const allyDisplayName = allyCharData.data?.name || allyCharData.name || 'Ally';
                  setActiveNpcId(savedBondedAllyUuid);
                  setActiveNpcName(allyDisplayName);
                  setActiveNpcCard(allyCharData);
                  if (progress?.ally_inventory) {
                    setAllyInventory(progress.ally_inventory as CharacterInventory);
                  }
                  console.log('[RuntimeState] Restored bonded ally:', allyDisplayName);
                }
              } catch (allyErr) {
                console.warn('[RuntimeState] Failed to restore bonded ally:', allyErr);
              }
            }

            // Add room introduction as first message (prevents world's first_mes from showing)
            if (fullCurrentRoom.introduction_text) {
              const roomIntroMessage = {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: fullCurrentRoom.introduction_text,
                timestamp: Date.now(),
                metadata: {
                  type: 'room_introduction',
                  roomId: fullCurrentRoom.id
                }
              };

              // Set as the first message (clears any auto-loaded messages)
              setMessages([roomIntroMessage]);
            }

            console.log(`World loaded: ${worldData.rooms.length} rooms on map, 1 room fetched (lazy loading)`);
          } catch (err) {
            console.warn(`Failed to load starting room ${currentPlacement.room_uuid}:`, err);
            setMissingRoomCount(1);
            setShowMissingRoomWarning(true);
            // Still set the stub as current room so UI doesn't break
            const stubRoom = placementToGridRoomStub(currentPlacement);
            setCurrentRoom(stubRoom);
          }
        }
      } catch (err) {
        console.error('Error loading world:', err);
        setError(err instanceof Error ? err.message : 'Failed to load world');
      } finally {
        setIsLoading(false);
      }
    }

    loadWorld();
  }, [worldId, selectedUserUuid, navigate]);

  // ============================================
  // WORLD RUNTIME STATE PERSISTENCE
  // ============================================

  /**
   * Build RoomInstanceState from the current room's NPC list.
   * Only records non-alive NPCs to keep data compact.
   */
  const buildCurrentRoomState = useCallback((): RoomInstanceState => {
    const npcStates: Record<string, { status: 'alive' | 'incapacitated' | 'dead' }> = {};
    for (const npc of roomNpcs) {
      if (npc.isDead) {
        npcStates[npc.id] = { status: 'dead' };
      } else if (npc.isIncapacitated) {
        npcStates[npc.id] = { status: 'incapacitated' };
      }
      // Alive NPCs omitted (default state)
    }
    return { npc_states: npcStates };
  }, [roomNpcs]);

  /**
   * Save all world runtime state to the backend via the per-user progress API.
   * Merges current room's NPC states into the accumulated room_states ref
   * before saving.
   */
  const saveWorldRuntimeState = useCallback(async (opts?: { skipRoomState?: boolean }) => {
    if (!worldId || !selectedUserUuid) {
      console.warn('[RuntimeState] Cannot save - missing worldId or userUuid');
      return;
    }

    // Snapshot current room state into the ref (unless told to skip)
    if (!opts?.skipRoomState && currentRoom) {
      roomStatesRef.current[currentRoom.id] = buildCurrentRoomState();
    }

    try {
      // Save to per-user progress API instead of world card
      const progressUpdate: WorldUserProgressUpdate = {
        player_xp: playerProgression.xp,
        player_level: playerProgression.level,
        player_gold: playerProgression.gold,
        current_room_uuid: currentRoom?.id,
        bonded_ally_uuid: activeNpcId ?? '',  // Empty string = clear on backend
        time_state: timeState,
        npc_relationships: npcRelationships,
        player_inventory: playerInventory,
        ally_inventory: allyInventory ?? undefined,
        room_states: roomStatesRef.current,
      };

      await worldApi.saveProgress(worldId, selectedUserUuid, progressUpdate);
      console.log('[RuntimeState] Saved to backend (per-user progress)');
    } catch (err) {
      console.error('[RuntimeState] Failed to save:', err);
    }
  }, [worldId, selectedUserUuid, currentRoom, buildCurrentRoomState, playerProgression, activeNpcId, timeState, npcRelationships, playerInventory, allyInventory]);

  /**
   * Debounced save - batches frequent state changes (affinity, time, inventory)
   * into a single API call after 2 seconds of inactivity.
   */
  const debouncedSaveRuntimeState = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveWorldRuntimeState();
    }, 2000);
  }, [saveWorldRuntimeState]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);


  // Auto-save on relationship changes (debounced)
  const prevRelationshipsRef = useRef(npcRelationships);
  useEffect(() => {
    if (prevRelationshipsRef.current !== npcRelationships && Object.keys(npcRelationships).length > 0) {
      prevRelationshipsRef.current = npcRelationships;
      debouncedSaveRuntimeState();
    }
  }, [npcRelationships, debouncedSaveRuntimeState]);

  // Auto-save on time state changes (debounced)
  const prevTimeRef = useRef(timeState);
  useEffect(() => {
    if (prevTimeRef.current !== timeState && timeState.totalMessages > 0) {
      prevTimeRef.current = timeState;
      debouncedSaveRuntimeState();
    }
  }, [timeState, debouncedSaveRuntimeState]);

  // Auto-save on inventory changes (debounced)
  const prevPlayerInvRef = useRef(playerInventory);
  const prevAllyInvRef = useRef(allyInventory);
  useEffect(() => {
    const playerChanged = prevPlayerInvRef.current !== playerInventory;
    const allyChanged = prevAllyInvRef.current !== allyInventory;
    if (playerChanged || allyChanged) {
      prevPlayerInvRef.current = playerInventory;
      prevAllyInvRef.current = allyInventory;
      debouncedSaveRuntimeState();
    }
  }, [playerInventory, allyInventory, debouncedSaveRuntimeState]);

  // Auto-save on bonded ally changes (debounced)
  const prevAllyIdRef = useRef(activeNpcId);
  useEffect(() => {
    if (prevAllyIdRef.current !== activeNpcId) {
      prevAllyIdRef.current = activeNpcId;
      debouncedSaveRuntimeState();
    }
  }, [activeNpcId, debouncedSaveRuntimeState]);

  // Auto-save on progression changes (debounced) - catches combat rewards
  const prevProgressionRef = useRef(playerProgression);
  useEffect(() => {
    if (prevProgressionRef.current !== playerProgression && playerProgression.xp > 0) {
      prevProgressionRef.current = playerProgression;
      debouncedSaveRuntimeState();
    }
  }, [playerProgression, debouncedSaveRuntimeState]);

  // Inject context into character data for LLM generation
  // Four modes:
  // 1. Dual-speaker mode - talking to unbonded NPC while bonded ally is present (ally can interject)
  // 2. Conversation target mode (thin context) - talking to unbonded NPC, no ally present
  // 3. Bonded ally mode (full context) - NPC is bonded and follows player
  // 4. Room narrator mode - no specific NPC, world narrates
  useEffect(() => {
    if (conversationTargetCard && activeNpcCard && currentRoom) {
      // DUAL-SPEAKER MODE: Talking to unbonded NPC while bonded ally is present
      // Ally can occasionally interject with their own responses
      const dualCard = buildDualSpeakerContext(
        conversationTargetCard,
        activeNpcCard,
        worldCard as any,
        currentRoom
      );
      setCharacterDataOverride(dualCard);
      console.log(`[WorldPlayView] Dual-speaker mode: ${conversationTargetName} (target) + ${activeNpcName} (ally)`);
    } else if (conversationTargetCard && currentRoom) {
      // Thin context mode - talking to NPC without bonding, no ally present
      // conversationTargetCard is already built with thin context
      setCharacterDataOverride(conversationTargetCard);
    } else if (activeNpcCard && currentRoom) {
      // Bonded ally mode - use NPC's full character card with world+room context
      // Pass roomNpcs so the bonded ally has awareness of other NPCs/enemies in the area
      const worldCharCard = characterData; // World card loaded as base character
      const modifiedNpcCard = injectNPCContext(activeNpcCard, worldCharCard, currentRoom, roomNpcs);
      setCharacterDataOverride(modifiedNpcCard);
    } else if (worldCard && currentRoom) {
      // Room narrator mode - use world card with room context
      // We use the explicitly loaded worldCard instead of characterData from context
      // because context might hold a generic assistant card initially
      const modifiedCharacterData = injectRoomContext(worldCard as any, currentRoom);
      setCharacterDataOverride(modifiedCharacterData);
    } else {
      // Clear override if no room is set
      setCharacterDataOverride(null);
    }
  }, [characterData, currentRoom, activeNpcCard, activeNpcName, conversationTargetCard, conversationTargetName, setCharacterDataOverride, worldCard, roomNpcs]);

  // Track processed message IDs to avoid re-processing
  const processedMultiSpeakerIds = useRef<Set<string>>(new Set());

  // Parse completed assistant messages for ally interjections (dual-speaker mode)
  // This effect watches for new completed messages and splits them if ally spoke
  useEffect(() => {
    // Only process if we're in dual-speaker mode (both target and ally present)
    if (!conversationTargetId || !activeNpcId || !activeNpcName || !conversationTargetName) {
      return;
    }

    // Find the most recent assistant message that's complete and hasn't been processed
    const recentMessages = [...messages].reverse();
    const targetMessage = recentMessages.find(msg =>
      msg.role === 'assistant' &&
      msg.status === 'complete' &&
      !processedMultiSpeakerIds.current.has(msg.id) &&
      !msg.metadata?.multiSpeaker // Not already a split message
    );

    if (!targetMessage) {
      return;
    }

    // Mark as processed immediately to prevent re-processing
    processedMultiSpeakerIds.current.add(targetMessage.id);

    // Check if response contains ally interjections
    if (!hasAllyInterjection(targetMessage.content, activeNpcName)) {
      return; // No ally speech detected, keep message as-is
    }

    // Parse the multi-speaker response
    const config: MultiSpeakerConfig = {
      targetName: conversationTargetName,
      targetId: conversationTargetId,
      allyName: activeNpcName,
      allyId: activeNpcId
    };

    const segments = parseMultiSpeakerResponse(targetMessage.content, config);

    // Only split if we found multiple segments (ally actually spoke)
    if (segments.length <= 1) {
      return;
    }

    console.log(`[WorldPlayView] Splitting multi-speaker response into ${segments.length} messages`);

    // Create new messages from segments
    const newMessages = splitIntoMessages(segments, targetMessage, config);

    // Replace the original message with the split messages
    const messageIndex = messages.findIndex(m => m.id === targetMessage.id);
    if (messageIndex === -1) return;

    const before = messages.slice(0, messageIndex);
    const after = messages.slice(messageIndex + 1);

    setMessages([...before, ...newMessages, ...after]);

  }, [messages, conversationTargetId, conversationTargetName, activeNpcId, activeNpcName, setMessages]);

  // Track sentiment and grant affinity for positive conversations
  // Works for both bonded allies (activeNpcId) and conversation targets (conversationTargetId)
  useEffect(() => {
    // Determine which NPC we're talking to (conversation target takes priority)
    const currentNpcId = conversationTargetId || activeNpcId;
    const currentNpcName = conversationTargetName || activeNpcName;

    // Only track sentiment when actively talking to an NPC
    if (!currentNpcId || !currentNpcName || !currentEmotion) return;

    // Get or create relationship
    const relationship = npcRelationships[currentNpcId] || createDefaultRelationship(currentNpcId);

    // Update sentiment history with current valence
    const updatedRelationship = updateSentimentHistory(
      relationship,
      currentEmotion.valence,
      messages.length
    );

    // Calculate potential affinity change with daily cap
    const sentimentResult = calculateSentimentAffinity(
      updatedRelationship,
      currentEmotion.valence,
      messages.length,
      timeState.currentDay,
      60 // daily cap
    );

    // Update relationship in state (even if no affinity gain, to track sentiment history)
    setNpcRelationships(prev => ({
      ...prev,
      [currentNpcId]: updatedRelationship,
    }));

    // Grant affinity if conditions are met
    if (sentimentResult.shouldGainAffinity) {
      // Update affinity
      const finalRelationship = updateRelationshipAffinity(updatedRelationship, sentimentResult.affinityDelta);

      // Track daily gain
      finalRelationship.affinity_gained_today += sentimentResult.affinityDelta;
      finalRelationship.affinity_day_started = timeState.currentDay;

      // Reset sentiment tracking after gain
      const resetRelationship = resetSentimentAfterGain(finalRelationship, messages.length);

      setNpcRelationships(prev => ({
        ...prev,
        [currentNpcId]: resetRelationship,
      }));

      // Log the change
      console.log(`[Affinity] ${currentNpcName}: ${updatedRelationship.affinity} -> ${finalRelationship.affinity} (${sentimentResult.affinityDelta > 0 ? '+' : ''}${sentimentResult.affinityDelta}) - ${sentimentResult.reason} (avg valence: ${Math.round(sentimentResult.averageValence)})`);

      // Add notification to chat
      const emoji = sentimentResult.affinityDelta > 0 ? '❤️' : '💔';
      addMessage({
        id: crypto.randomUUID(),
        role: 'system' as const,
        content: `*${currentNpcName} ${sentimentResult.affinityDelta > 0 ? '+' : ''}${sentimentResult.affinityDelta} ${emoji} (${sentimentResult.reason})*`,
        timestamp: Date.now(),
        metadata: {
          type: 'affinity_change',
          source: 'sentiment',
          npcId: currentNpcId,
          delta: sentimentResult.affinityDelta,
          reason: sentimentResult.reason,
        }
      });
    }
  }, [messages.length, currentEmotion, activeNpcId, activeNpcName, conversationTargetId, conversationTargetName, addMessage, timeState.currentDay]);

  // Advance time on each new message
  useEffect(() => {
    if (!timeConfig.enableDayNightCycle) return;

    // Count only user and assistant messages (exclude system messages to prevent infinite loop)
    const gameplayMessages = messages.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    const gameplayMessageCount = gameplayMessages.length;

    // Only advance time if gameplay message count has increased
    if (gameplayMessageCount <= timeState.totalMessages) {
      return; // No new gameplay messages
    }

    const { newState, newDayStarted } = advanceTime(timeState, timeConfig);
    setTimeState(newState);

    if (newDayStarted) {
      // Reset daily affinity for all NPCs
      setNpcRelationships(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(npcId => {
          updated[npcId] = resetDailyAffinity(updated[npcId], newState.currentDay);
        });
        return updated;
      });

      // Add day transition message
      addMessage({
        id: crypto.randomUUID(),
        role: 'system' as const,
        content: `*A new day dawns... (Day ${newState.currentDay})*`,
        timestamp: Date.now(),
        metadata: {
          type: 'day_transition',
          day: newState.currentDay
        }
      });

      console.log(`[Time] Day ${newState.currentDay} started - Daily affinity caps reset`);
    }
  }, [messages, timeState, timeConfig, addMessage]);


  // Clear conversation target (when leaving room, clicking elsewhere, etc.)
  const clearConversationTarget = useCallback(() => {
    if (conversationTargetId) {
      console.log(`Ending conversation with ${conversationTargetName}`);
      setConversationTargetId(undefined);
      setConversationTargetName('');
      setConversationTargetCard(null);
    }
  }, [conversationTargetId, conversationTargetName]);

  // Handle NPC selection - either starts combat (hostile) or starts conversation (non-hostile)
  // This uses THIN CONTEXT for conversations - NPC is NOT bonded
  const handleSelectNpc = useCallback(async (npcId: string) => {
    if (!currentRoom) return;

    const npc = roomNpcs.find((n: CombatDisplayNPC) => n.id === npcId);
    if (!npc) {
      console.error(`NPC not found: ${npcId}`);
      return;
    }

    // If clicking on the already bonded ally, don't restart conversation
    if (activeNpcId === npcId) {
      console.log(`NPC ${npc.name} is already bonded as ally.`);
      return;
    }

    // If clicking on current conversation target, don't restart
    if (conversationTargetId === npcId) {
      console.log(`Already in conversation with ${npc.name}.`);
      return;
    }

    // Check if NPC is hostile - initiate combat instead of conversation
    if (npc.hostile) {
      // Clear any active conversation first
      clearConversationTarget();

      // Gather all hostile NPCs in the room for combat
      const hostileNpcs = roomNpcs.filter((n: CombatDisplayNPC) => n.hostile);

      // Include bonded NPC as ally if one is active
      const allies: Array<{
        id: string;
        name: string;
        level: number;
        imagePath: string | null;
      }> = [];

      if (activeNpcId && activeNpcName) {
        // Find the bonded NPC in roomNpcs
        const boundNpc = roomNpcs.find((n: CombatDisplayNPC) => n.id === activeNpcId);
        if (boundNpc && !boundNpc.hostile) {
          allies.push({
            id: boundNpc.id,
            name: boundNpc.name,
            level: 5, // Use same level as player for now (TODO: get from NPC data when implemented)
            imagePath: boundNpc.imageUrl || null,
          });
        }
      }

      // Build combat init data
      const initData: CombatInitData = {
        playerData: {
          id: 'player',
          name: currentUser?.name || 'Player',
          level: 5, // TODO: Get from player state when implemented
          imagePath: currentUser?.filename
            ? `/api/user-image/${encodeURIComponent(currentUser.filename)}`
            : null, // Generic user icon will be used as fallback in combat UI
        },
        enemies: hostileNpcs.map((enemy: CombatDisplayNPC) => ({
          id: enemy.id,
          name: enemy.name,
          level: enemy.monster_level || 1,
          imagePath: enemy.imageUrl || null,
        })),
        allies: allies.length > 0 ? allies : undefined, // Only include if there are allies
        roomImagePath: currentRoom.image_path
          ? `/api/world-assets/${worldId}/${currentRoom.image_path.split('/').pop()}`
          : null,
        roomName: currentRoom.name,
        playerAdvantage: true, // Player initiated combat
      };

      setCombatInitData(initData);
      setIsInCombat(true);

      // Add combat start message
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `*Combat begins against ${hostileNpcs.map((n: CombatDisplayNPC) => n.name).join(', ')}!*`,
        timestamp: Date.now(),
        metadata: {
          type: 'combat_start',
          roomId: currentRoom.id,
        }
      });

      return;
    }

    // Non-hostile NPC - start conversation with THIN CONTEXT (not bonded)
    // Clear any previous conversation target first
    clearConversationTarget();

    // Set as conversation target (NOT bonded ally)
    setConversationTargetId(npcId);
    setConversationTargetName(npc.name);

    try {
      // Fetch character card data for the NPC
      const response = await fetch(`/api/character/${npcId}`);
      if (!response.ok) {
        console.error('Failed to load NPC character data');
        return;
      }

      const npcCharacterData = await response.json();

      // Build THIN context card for conversation (not full bonding)
      const worldCharCard = characterData; // World card loaded as base character
      const thinContextCard = buildThinNPCContext(npcCharacterData, worldCharCard, currentRoom);

      // Store the thin context card (NOT the full card)
      setConversationTargetCard(thinContextCard);

      // Check if API is configured
      if (!apiConfig) {
        console.error('No API configuration available for greeting generation');
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: `*You approach ${npc.name}*`,
          timestamp: Date.now(),
          metadata: {
            type: 'conversation_start',
            npcId: npcId,
            roomId: currentRoom.id,
            characterId: npcCharacterData.data?.character_uuid,
            isBonded: false,
            generated: false
          }
        });
        return;
      }

      // Create a placeholder message immediately for visual feedback
      const introMessageId = crypto.randomUUID();
      const placeholderMessage = {
        id: introMessageId,
        role: 'assistant' as const,
        content: '...',
        timestamp: Date.now(),
        metadata: {
          type: 'conversation_start',
          npcId: npcId,
          roomId: currentRoom.id,
          characterId: npcCharacterData.data?.character_uuid,
          isBonded: false,
          generated: true
        }
      };

      addMessage(placeholderMessage);

      // Use the thin context card for greeting generation
      const greetingResponse = await fetch('/api/generate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: thinContextCard,
          api_config: apiConfig
        })
      });

      if (!greetingResponse.ok) {
        console.error('Failed to generate NPC greeting');
        // Update the placeholder with fallback message
        (setMessages as any)((prev: any) => prev.map((msg: any) =>
          msg.id === introMessageId
            ? { ...msg, content: `*${npc.name} looks up as you approach*` }
            : msg
        ));
        return;
      }

      // Stream the response using PromptHandler for consistent behavior
      const { PromptHandler } = await import('../handlers/promptHandler');

      let generatedIntro = '';
      const bufferInterval = 50; // Match ChatContext streaming interval
      let buffer = '';
      let bufTimer: NodeJS.Timeout | null = null;

      const updateIntroContent = (chunk: string, isFinal = false) => {
        buffer += chunk;

        if (bufTimer) clearTimeout(bufTimer);
        bufTimer = setTimeout(() => {
          const curBuf = buffer;
          buffer = '';
          generatedIntro += curBuf;

          // Update the message with streaming content
          (setMessages as any)((prev: any) => prev.map((msg: any) =>
            msg.id === introMessageId
              ? { ...msg, content: generatedIntro }
              : msg
          ));

          // Trigger scroll-to-bottom in ChatView during streaming
          dispatchScrollToBottom();
        }, isFinal ? 0 : bufferInterval);
      };

      try {
        // Pass NPC name for ghost suffix stripping
        for await (const chunk of PromptHandler.streamResponse(greetingResponse, npc.name)) {
          updateIntroContent(chunk);
        }

        // Flush any remaining buffer
        if (buffer.length > 0) {
          updateIntroContent('', true);
        }

        // Final update with complete content
        (setMessages as any)((prev: any) => prev.map((msg: any) =>
          msg.id === introMessageId
            ? {
              ...msg,
              content: generatedIntro.trim() || `*${npc.name} looks up as you approach*`
            }
            : msg
        ));

        console.log(`Started conversation with ${npc.name} (thin context, not bonded)`);
      } catch (streamErr) {
        console.error('Error streaming NPC greeting:', streamErr);
        // Update with fallback on error
        (setMessages as any)((prev: any) => prev.map((msg: any) =>
          msg.id === introMessageId
            ? { ...msg, content: `*${npc.name} looks up as you approach*` }
            : msg
        ));
      }
    } catch (err) {
      console.error('Error starting conversation with NPC:', err);
    }
  }, [roomNpcs, currentRoom, addMessage, characterData, worldId, apiConfig, currentUser, activeNpcId, activeNpcName, conversationTargetId, clearConversationTarget, setMessages]);

  /**
   * Bond with the current conversation target NPC.
   * This upgrades from thin context to full context - the NPC becomes a bonded ally
   * who follows the player and participates in combat.
   */
  const handleBondNpc = useCallback(async () => {
    if (!conversationTargetId || !currentRoom) {
      console.error('Cannot bond: no conversation target or no room');
      return;
    }

    const npc = roomNpcs.find((n: CombatDisplayNPC) => n.id === conversationTargetId);
    if (!npc) {
      console.error(`NPC not found for bonding: ${conversationTargetId}`);
      return;
    }

    // Check if we already have a bonded ally - only one allowed
    if (activeNpcId) {
      console.log(`Already have bonded ally: ${activeNpcName}. Unbond them first.`);
      addMessage({
        id: crypto.randomUUID(),
        role: 'system' as const,
        content: `*You already have ${activeNpcName} as your companion. Dismiss them first if you wish to bond with ${npc.name}.*`,
        timestamp: Date.now(),
        metadata: {
          type: 'bond_failed',
          reason: 'already_bonded',
          existingAllyId: activeNpcId,
          existingAllyName: activeNpcName,
        }
      });
      return;
    }

    try {
      // Fetch full character card data for bonding (not thin context)
      const response = await fetch(`/api/character/${conversationTargetId}`);
      if (!response.ok) {
        console.error('Failed to load NPC character data for bonding');
        return;
      }

      const npcCharacterData = await response.json();

      // Clear conversation target state
      setConversationTargetId(undefined);
      setConversationTargetName('');
      setConversationTargetCard(null);

      // Set as bonded ally (full context)
      setActiveNpcId(conversationTargetId);
      setActiveNpcName(npc.name);
      setActiveNpcCard(npcCharacterData);

      // Add bonding message
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `*${npc.name} agrees to join you on your journey*`,
        timestamp: Date.now(),
        metadata: {
          type: 'npc_bonded',
          npcId: conversationTargetId,
          roomId: currentRoom.id,
          characterId: npcCharacterData.data?.character_uuid,
        }
      });

      console.log(`Bonded with NPC: ${npc.name} (full context, ally)`);
    } catch (err) {
      console.error('Error bonding with NPC:', err);
    }
  }, [roomNpcs, currentRoom, addMessage, conversationTargetId, activeNpcId, activeNpcName]);

  // Handle player clicking Continue on combat end screen
  const handleCombatContinue = useCallback(async () => {
    if (!combatEndState || !currentRoom) {
      setCombatEndState(null);
      setIsInCombat(false);
      gridCombat.endCombat();
      return;
    }

    // Build full combat state for narrative generation (before we modify anything)
    const fullCombatState: GridCombatState = {
      phase: combatEndState.phase,
      turn: 1, // Will be overwritten if we have result
      combatants: combatEndState.combatants,
      initiativeOrder: [],
      currentTurnIndex: 0,
      markedTargets: [],
      log: gridCombat.combatState?.log || [],
      pendingEvents: [],
      mapRoomId: currentRoom.id,
      validMoveTargets: [],
      validAttackTargets: [],
      activeOverwatchZones: [],
      result: combatEndState.result,
    };

    // Process victory - remove dead enemies, mark incapacitated, handle revived allies
    if (combatEndState.phase === 'victory' && combatEndState.result) {
      const defeatedIds = new Set(combatEndState.result.defeatedEnemies || []);
      const revivedAllyIds = new Set(combatEndState.result.revivedAllies || []);

      // Categorize defeated enemies by outcome
      const deadIds: string[] = [];
      const incapacitatedIds: string[] = [];

      for (const id of defeatedIds) {
        const combatant = combatEndState.combatants[id];
        if (combatant?.isDead) {
          deadIds.push(id);
        } else if (combatant?.isIncapacitated) {
          incapacitatedIds.push(id);
        } else {
          // Fallback: treat as incapacitated
          incapacitatedIds.push(id);
        }
      }

      console.log('[CombatEnd] Dead enemies:', deadIds);
      console.log('[CombatEnd] Incapacitated enemies:', incapacitatedIds);
      console.log('[CombatEnd] Revived allies:', Array.from(revivedAllyIds));
      console.log('[CombatEnd] Player was revived:', combatEndState.result.revivedPlayer);
      console.log('[CombatEnd] Revived by ally:', combatEndState.result.revivedByAllyId);

      // Update room NPCs: remove dead enemies, mark incapacitated enemies
      // Note: Allies (bonded NPCs) are not in roomNpcs since they follow the player
      setRoomNpcs((prev: CombatDisplayNPC[]) => prev
        .filter((npc: CombatDisplayNPC) => !deadIds.includes(npc.id))
        .map((npc: CombatDisplayNPC) => {
          if (incapacitatedIds.includes(npc.id)) {
            return { ...npc, isIncapacitated: true };
          }
          return npc;
        })
      );

      // Process XP and gold rewards (level-up already calculated by useEffect)
      const rewards = combatEndState.result.rewards;
      if (rewards) {
        const xpGained = rewards.xp || 0;
        const goldGained = rewards.gold || 0;

        // Update player progression (use levelUpInfo if available, otherwise keep current level)
        const newProgression: PlayerProgression = {
          xp: playerProgression.xp + xpGained,
          level: levelUpInfo ? levelUpInfo.newLevel : playerProgression.level,
          gold: playerProgression.gold + goldGained,
        };

        setPlayerProgression(newProgression);

        console.log('[Progression] Combat rewards applied:', {
          xpGained,
          goldGained,
          newTotal: newProgression,
          levelUp: levelUpInfo,
        });
      }

      // Persist room NPC states (dead/incapacitated) to roomStatesRef immediately.
      // We build from the combat data directly since setRoomNpcs is async.
      const updatedRoomState: RoomInstanceState = { npc_states: {} };
      for (const npc of roomNpcs) {
        if (deadIds.includes(npc.id)) {
          updatedRoomState.npc_states[npc.id] = { status: 'dead' };
        } else if (incapacitatedIds.includes(npc.id)) {
          updatedRoomState.npc_states[npc.id] = { status: 'incapacitated' };
        }
      }
      roomStatesRef.current[currentRoom.id] = updatedRoomState;
    }

    // Clear combat state first
    setCombatEndState(null);
    setIsInCombat(false);
    gridCombat.endCombat();

    // Clear level-up info after a delay (so it can be shown in UI)
    // The CombatEndScreen will display it before we clear combat state
    if (levelUpInfo) {
      setTimeout(() => setLevelUpInfo(null), 5000);
    }

    // Now generate post-combat narrative (non-blocking)
    // This happens after combat UI is cleared so the chat panel is visible
    if (apiConfig) {
      generatePostCombatNarrative(fullCombatState);
    }
  }, [combatEndState, currentRoom, gridCombat, apiConfig, playerProgression, levelUpInfo, roomNpcs]);

  // Generate post-combat narrative using LLM
  const generatePostCombatNarrative = useCallback(async (combatState: GridCombatState) => {
    if (!apiConfig || !currentRoom) return;

    // Build narrative summary from combat state
    const summary = buildCombatNarrativeSummary(combatState);

    // Determine narrator: bonded ally (if present) or world narrator
    const hasAllyNarrator = activeNpcId && activeNpcCard && summary.ally;

    // Build the appropriate prompt
    const prompt = combatState.phase === 'defeat'
      ? buildDefeatPrompt(summary)
      : buildPostCombatPrompt(summary, !!hasAllyNarrator);

    console.log('[PostCombat] Generating narrative, ally narrator:', hasAllyNarrator);

    // Create placeholder message for streaming
    const narrativeMessageId = crypto.randomUUID();
    const placeholderMessage = {
      id: narrativeMessageId,
      role: 'assistant' as const,
      content: '...',
      timestamp: Date.now(),
      metadata: {
        type: 'post_combat_narrative',
        roomId: currentRoom.id,
        outcome: combatState.phase,
        isAllyNarrator: !!hasAllyNarrator,
      }
    };

    addMessage(placeholderMessage);

    try {
      // Use ally's character card if available, otherwise world character
      const narratorCard = hasAllyNarrator && activeNpcCard
        ? activeNpcCard
        : characterData;

      if (!narratorCard) {
        console.warn('[PostCombat] No narrator card available');
        return;
      }

      // Call generate-greeting with custom prompt
      const response = await fetch('/api/generate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: narratorCard,
          api_config: apiConfig,
          custom_prompt: prompt,
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate post-combat narrative');
      }

      // Stream the response
      const { PromptHandler } = await import('../handlers/promptHandler');

      let generatedNarrative = '';
      const bufferInterval = 50;
      let buffer = '';
      let bufTimer: NodeJS.Timeout | null = null;

      const updateNarrativeContent = (chunk: string, isFinal = false) => {
        buffer += chunk;

        if (bufTimer) clearTimeout(bufTimer);
        bufTimer = setTimeout(() => {
          const curBuf = buffer;
          buffer = '';
          generatedNarrative += curBuf;

          (setMessages as any)((prev: any) => prev.map((msg: any) =>
            msg.id === narrativeMessageId
              ? { ...msg, content: generatedNarrative }
              : msg
          ));

          dispatchScrollToBottom();
        }, isFinal ? 0 : bufferInterval);
      };

      // Stream with narrator name for ghost suffix stripping
      const narratorName = hasAllyNarrator ? activeNpcName : undefined;
      for await (const chunk of PromptHandler.streamResponse(response, narratorName)) {
        updateNarrativeContent(chunk);
      }

      // Flush remaining buffer
      if (buffer.length > 0) {
        updateNarrativeContent('', true);
      }

      // Final update
      (setMessages as any)((prev: any) => prev.map((msg: any) =>
        msg.id === narrativeMessageId
          ? { ...msg, content: generatedNarrative.trim() || '*The battle is over.*' }
          : msg
      ));

      console.log('[PostCombat] Narrative generated successfully');

    } catch (err) {
      console.error('[PostCombat] Error generating narrative:', err);
      // Fallback to simple message
      (setMessages as any)((prev: any) => prev.map((msg: any) =>
        msg.id === narrativeMessageId
          ? { ...msg, content: '*The dust settles as the battle ends.*' }
          : msg
      ));
    }
  }, [apiConfig, currentRoom, activeNpcId, activeNpcCard, activeNpcName, characterData, addMessage, setMessages]);

  // DEV ONLY: Full factory reset - restores all rooms to original state,
  // clears bonded ally, relationships, time, inventories. Keeps XP/level/gold.
  const handleDevResetEnemies = useCallback(async () => {
    if (!currentRoom || !worldState || !worldId) return;

    console.log('[DEV] Factory reset: restoring all rooms and clearing runtime state');

    // 1. Reload the current room's original NPCs from world state grid
    let originalRoom: GridRoom | null = null;
    for (const row of worldState.grid) {
      const room = row.find(r => r?.id === currentRoom.id);
      if (room) {
        originalRoom = room;
        break;
      }
    }

    if (!originalRoom) {
      console.warn('[DEV] Could not find original room data');
      return;
    }

    // Resolve NPC display data with correct argument type (string[])
    const originalNpcs = originalRoom.npcs || [];
    const npcUuids = originalNpcs.map(npc => npc.character_uuid);
    const resolvedNpcs = await resolveNpcDisplayData(npcUuids);

    // Merge with combat data from original room definition
    const freshNpcs: CombatDisplayNPC[] = resolvedNpcs.map(npc => {
      const roomNpc = originalNpcs.find(rn => rn.character_uuid === npc.id);
      return {
        ...npc,
        hostile: roomNpc?.hostile,
        monster_level: roomNpc?.monster_level,
        isIncapacitated: false,
        isDead: false,
      };
    });

    // 2. Reset all in-memory runtime state
    setRoomNpcs(freshNpcs);
    setLocalMapStateCache(null);
    roomStatesRef.current = {}; // Clear ALL room states (all rooms reset)
    setActiveNpcId(undefined); // Unbond ally
    setActiveNpcName('');
    setActiveNpcCard(null);
    setAllyInventory(null);
    setNpcRelationships({});
    setTimeState(createDefaultTimeState());
    setPlayerInventory(createDefaultInventory());

    // 3. Persist the reset to backend (keeps progression, clears everything else)
    try {
      await worldApi.updateWorld(worldId, {
        bonded_ally_uuid: '', // Clear
        time_state: createDefaultTimeState(),
        npc_relationships: {},
        player_inventory: createDefaultInventory(),
        ally_inventory: undefined,
        room_states: {},
      });
      console.log('[DEV] Factory reset persisted to backend');
    } catch (err) {
      console.error('[DEV] Failed to persist factory reset:', err);
    }

    console.log('[DEV] Factory reset complete. Restored', freshNpcs.length, 'NPCs in current room');

    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: '*[DEV] Factory reset complete. All rooms restored, allies dismissed, relationships cleared. Player progression preserved.*',
      timestamp: Date.now(),
      metadata: {
        type: 'system',
        isDevReset: true,
      }
    });
  }, [currentRoom, worldState, worldId, addMessage]);

  // Handle dismissing a bound NPC (reserved for future UI integration)
  const _handleDismissNpc = useCallback((npcId: string) => {
    if (!currentRoom) return;

    const npc = roomNpcs.find((n: CombatDisplayNPC) => n.id === npcId);
    if (!npc) return;

    // Clear the active NPC - this removes their full character card from context
    // Room context will still include basic NPC presence info
    setActiveNpcId(undefined);
    setActiveNpcName('');
    setActiveNpcCard(null);

    // Add dismissal message
    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: `${npc.name} has been dismissed, but will remain in the area.`,
      timestamp: Date.now(),
      metadata: {
        type: 'npc_dismissed',
        npcId: npcId,
        roomId: currentRoom.id,
      }
    });

    console.log(`Dismissed NPC: ${npc.name} - full character context cleared`);
  }, [roomNpcs, currentRoom, addMessage]);

  // Extracted room transition logic - shared by direct navigate and Party Gather modal
  // LAZY LOADING: Fetches full room data if needed during navigation
  // entryDir: The direction the player is entering FROM (e.g., 'west' = player is entering from the west edge)
  //
  // PHASE 1 REFACTOR: Now uses transition state to prevent UI flicker:
  // 1. Shows loading screen during async work
  // 2. Preloads textures before revealing new room
  // 3. Updates room + NPCs atomically at the end
  const performRoomTransition = useCallback(async (
    targetRoomStub: GridRoom,
    keepActiveNpc: boolean = false,
    entryDir: ExitDirection | null = null
  ) => {
    if (!worldState || !worldId || !worldCard) return;

    // ========================================
    // PHASE: INITIATING
    // ========================================
    const transitionStartTime = Date.now();
    setTransitionState({
      phase: 'initiating',
      sourceRoomName: currentRoom?.name || null,
      targetRoomName: targetRoomStub.name,
      targetRoomId: targetRoomStub.id,
      progress: {
        summarization: { status: 'pending' },
        assetPreload: { status: 'pending' },
        thinFrameGeneration: { status: 'pending' },
      },
      error: null,
      startedAt: transitionStartTime,
    });

    console.log(`[RoomTransition] Starting transition to: ${targetRoomStub.name}`);

    // Snapshot the CURRENT room's NPC states before we leave
    if (currentRoom) {
      const departingRoomState: RoomInstanceState = { npc_states: {} };
      for (const npc of roomNpcs) {
        if (npc.isDead) {
          departingRoomState.npc_states[npc.id] = { status: 'dead' };
        } else if (npc.isIncapacitated) {
          departingRoomState.npc_states[npc.id] = { status: 'incapacitated' };
        }
      }
      roomStatesRef.current[currentRoom.id] = departingRoomState;
    }

    // End any active combat (flee)
    if (isInCombat) {
      gridCombat.endCombat();
      setIsInCombat(false);
      setLocalMapStateCache(null);
    }

    // Always clear conversation target when leaving a room
    // (Conversations with non-bonded NPCs don't persist across rooms)
    setConversationTargetId(undefined);
    setConversationTargetName('');
    setConversationTargetCard(null);

    // ========================================
    // PHASE: SUMMARIZING (Phase 3)
    // ========================================
    // Summarize the current room visit before moving to the new room
    if (currentRoom && worldId && currentUser?.user_uuid && messages.length > 2) {
      setTransitionState(prev => ({
        ...prev,
        phase: 'summarizing',
        progress: {
          ...prev.progress,
          summarization: { status: 'in_progress', percent: 0 },
        },
      }));

      try {
        // Prepare messages for summarization (strip to role + content only)
        const summarizeMessages: SummarizeMessage[] = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

        // Prepare NPC list for matching
        const summarizeNpcs: SummarizeNPC[] = roomNpcs.map(npc => ({
          id: npc.id,
          name: npc.name,
        }));

        // Get visitedAt from room entry tracking (use transitionStartTime as approximation if not tracked)
        // In a full implementation, this would be tracked when entering the room
        const visitedAt = transitionStartTime - (messages.length * 30000); // Rough estimate: ~30s per message

        console.log(`[RoomTransition] Summarizing ${summarizeMessages.length} messages from ${currentRoom.name}`);

        // Call summarization API with timeout
        const summarizationPromise = adventureLogApi.summarizeRoom({
          worldUuid: worldId,
          userUuid: currentUser.user_uuid,
          roomUuid: currentRoom.id,
          roomName: currentRoom.name,
          visitedAt,
          messages: summarizeMessages,
          npcs: summarizeNpcs,
        });

        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Summarization timeout')), SUMMARIZATION_TIMEOUT_MS)
        );

        const result = await Promise.race([summarizationPromise, timeoutPromise]);

        if (result) {
          console.log(`[RoomTransition] Summarization completed (${result.method}): ${result.summary.keyEvents.length} events`);
          setTransitionState(prev => ({
            ...prev,
            progress: {
              ...prev.progress,
              summarization: { status: 'complete' },
            },
          }));
        }
      } catch (error) {
        console.warn('[RoomTransition] Summarization failed or timed out:', error);
        setTransitionState(prev => ({
          ...prev,
          progress: {
            ...prev.progress,
            summarization: { status: 'failed', error: 'Summarization failed' },
          },
        }));
        // Continue with transition - summarization failure is non-blocking
      }
    } else {
      // Skip summarization if no room, no user, or too few messages
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          summarization: { status: 'complete' },
        },
      }));
    }

    // PRUNE MESSAGES: Keep last 8 messages for continuity when traveling between rooms
    const MAX_MESSAGES_ON_TRAVEL = 8;
    if (messages.length > MAX_MESSAGES_ON_TRAVEL) {
      const recentMessages = messages.slice(-MAX_MESSAGES_ON_TRAVEL);
      setMessages(recentMessages);
      console.log(`[Travel] Pruned messages: kept last ${recentMessages.length} of ${messages.length}`);
    }

    // Find coordinates for the target room
    let foundY = 0;
    let foundX = 0;
    for (let y = 0; y < worldState.grid.length; y++) {
      for (let x = 0; x < worldState.grid[y].length; x++) {
        if (worldState.grid[y][x]?.id === targetRoomStub.id) {
          foundY = y;
          foundX = x;
          break;
        }
      }
    }

    // LAZY LOADING: Fetch full room data if this is just a stub
    let targetRoom = targetRoomStub;
    const worldData = worldCard.data.extensions.world_data;
    const placement = worldData.rooms.find(r => r.room_uuid === targetRoomStub.id);

    if (placement) {
      try {
        // Always fetch full room data for the destination
        const roomCard = await roomApi.getRoom(placement.room_uuid);
        targetRoom = roomCardToGridRoom(roomCard, { x: foundX, y: foundY }, placement);
        console.log(`[RoomTransition] Lazy loaded room data: ${targetRoom.name}`);
      } catch (err) {
        console.error(`[RoomTransition] Failed to fetch room ${targetRoomStub.id}:`, err);
        // Fall back to stub data
      }
    }

    // Resolve NPCs in the new room BEFORE updating state
    const npcUuids = targetRoom.npcs.map(npc => npc.character_uuid);
    const resolvedNpcs = await resolveNpcDisplayData(npcUuids);

    // Merge hostile/monster_level from room NPCs
    let npcsWithCombatData: CombatDisplayNPC[] = resolvedNpcs.map(npc => {
      const roomNpc = targetRoom.npcs.find(rn => rn.character_uuid === npc.id);
      return {
        ...npc,
        hostile: roomNpc?.hostile,
        monster_level: roomNpc?.monster_level,
      };
    });

    // Apply persisted room state: filter dead NPCs, mark incapacitated
    const targetRoomState = roomStatesRef.current[targetRoom.id];
    if (targetRoomState?.npc_states) {
      npcsWithCombatData = npcsWithCombatData
        .filter(npc => targetRoomState.npc_states[npc.id]?.status !== 'dead')
        .map(npc => {
          const npcState = targetRoomState.npc_states[npc.id];
          if (npcState?.status === 'incapacitated') {
            return { ...npc, isIncapacitated: true };
          }
          return npc;
        });
      console.log('[RuntimeState] Applied saved room state for:', targetRoom.name);
    }

    // ========================================
    // PHASE: LOADING_ASSETS
    // ========================================
    setTransitionState(prev => ({
      ...prev,
      phase: 'loading_assets',
      progress: {
        ...prev.progress,
        assetPreload: { status: 'in_progress', percent: 0 },
      },
    }));

    // Preload textures for player, companion, and NPCs
    // Use the same URL patterns as the LocalMapView rendering
    const playerImgPath = currentUser?.filename
      ? `/api/user-image/${encodeURIComponent(currentUser.filename)}`
      : null;
    const companionImgPath = keepActiveNpc && activeNpcId
      ? `/api/character-image/${activeNpcId}.png`
      : null;
    const npcImageUrls = npcsWithCombatData.map(n => n.imageUrl).filter(Boolean) as string[];

    console.log(`[RoomTransition] Preloading ${npcImageUrls.length + (playerImgPath ? 1 : 0) + (companionImgPath ? 1 : 0)} textures`);

    const preloadResult = await preloadRoomTextures(
      {
        playerImagePath: playerImgPath,
        companionImagePath: companionImgPath,
        npcImageUrls,
      },
      {
        timeout: TRANSITION_TIMEOUT_MS,
        onProgress: (percent) => {
          setTransitionState(prev => ({
            ...prev,
            progress: {
              ...prev.progress,
              assetPreload: { status: 'in_progress', percent },
            },
          }));
        },
      }
    );

    if (preloadResult.timedOut) {
      console.warn('[RoomTransition] Texture preload timed out, continuing with fallbacks');
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          assetPreload: { status: 'failed', error: 'Timed out' },
        },
      }));
    } else if (preloadResult.failedCount > 0) {
      console.warn(`[RoomTransition] ${preloadResult.failedCount} textures failed to load`);
    }

    // Mark asset preload complete
    setTransitionState(prev => ({
      ...prev,
      progress: {
        ...prev.progress,
        assetPreload: preloadResult.success
          ? { status: 'complete' }
          : { status: 'failed', error: preloadResult.error || 'Some textures failed' },
      },
    }));

    // ========================================
    // PHASE: GENERATING_FRAMES - Generate thin frames for NPCs missing them
    // ========================================
    // Only proceed if we have API config and there are NPCs to process
    if (apiConfig && npcsWithCombatData.length > 0) {
      setTransitionState(prev => ({
        ...prev,
        phase: 'generating_frames',
        progress: {
          ...prev.progress,
          thinFrameGeneration: { status: 'in_progress', percent: 0 },
        },
      }));

      // Check which NPCs need thin frames
      const npcsNeedingFrames: string[] = [];
      for (const npc of npcsWithCombatData) {
        try {
          const npcCardResponse = await fetch(`/api/character/${npc.id}/metadata`);
          if (npcCardResponse.ok) {
            const npcCardData = await npcCardResponse.json();
            const npcCard = npcCardData.data || npcCardData;
            if (!isValidThinFrame(npcCard?.data?.extensions?.cardshark_thin_frame)) {
              npcsNeedingFrames.push(npc.id);
            }
          }
        } catch (err) {
          console.warn(`[ThinFrame] Failed to check NPC ${npc.id} for thin frame:`, err);
        }
      }

      if (npcsNeedingFrames.length > 0) {
        console.log(`[ThinFrame] Generating thin frames for ${npcsNeedingFrames.length} NPCs`);

        let generatedCount = 0;
        for (const npcId of npcsNeedingFrames) {
          try {
            // Fetch full character data
            const npcCardResponse = await fetch(`/api/character/${npcId}/metadata`);
            if (!npcCardResponse.ok) continue;

            const npcCardData = await npcCardResponse.json();
            const npcCard = npcCardData.data || npcCardData as CharacterCard;

            // Generate thin frame with timeout
            const thinFrame = await generateThinFrame(npcCard, apiConfig, { timeout: THIN_FRAME_TIMEOUT_MS });

            // Update the NPC card with thin frame and save
            const updatedCard = mergeThinFrameIntoCard(npcCard, thinFrame);

            // Fetch the image to save with metadata
            const imageResponse = await fetch(`/api/character-image/${npcId}.png`);
            if (imageResponse.ok) {
              const imageBlob = await imageResponse.blob();
              const formData = new FormData();
              formData.append('file', new File([imageBlob], 'character.png', { type: 'image/png' }));
              formData.append('metadata_json', JSON.stringify(updatedCard));

              await fetch('/api/characters/save-card', {
                method: 'POST',
                body: formData,
              });

              console.log(`[ThinFrame] Generated and saved thin frame for NPC ${npcId}`);
            }

            generatedCount++;
            setTransitionState(prev => ({
              ...prev,
              progress: {
                ...prev.progress,
                thinFrameGeneration: {
                  status: 'in_progress',
                  percent: Math.round((generatedCount / npcsNeedingFrames.length) * 100),
                },
              },
            }));
          } catch (err) {
            console.warn(`[ThinFrame] Failed to generate thin frame for NPC ${npcId}:`, err);
          }
        }
      }

      // Mark thin frame generation complete
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          thinFrameGeneration: { status: 'complete' },
        },
      }));
    } else {
      // No NPCs or no API config - skip thin frame generation
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          thinFrameGeneration: { status: 'complete' },
        },
      }));
    }

    // ========================================
    // PHASE: READY - Update all state atomically
    // ========================================
    setTransitionState(prev => ({
      ...prev,
      phase: 'ready',
    }));

    // Calculate spawn position
    const spawnPos = entryDir
      ? getSpawnPosition(entryDir, LOCAL_MAP_CONFIG)
      : { x: 2, y: 2 };

    console.log(`[RoomTransition] Spawning at ${entryDir || 'center'}:`, spawnPos);

    // Update grid with full room data
    const newGrid = [...worldState.grid.map(row => [...row])];
    if (foundY >= 0 && foundY < newGrid.length && foundX >= 0 && foundX < newGrid[0].length) {
      newGrid[foundY][foundX] = targetRoom;
    }

    // ATOMIC STATE UPDATES - these should batch in React 18
    // All visible room state updates together
    setWorldState(prev => prev ? {
      ...prev,
      grid: newGrid,
      player_position: { x: foundX, y: foundY },
    } : null);
    setCurrentRoom(targetRoom);
    setRoomNpcs(npcsWithCombatData);
    setPlayerTilePosition(spawnPos);
    setEntryDirection(null);

    // Clear active NPC unless explicitly keeping them
    if (!keepActiveNpc) {
      setActiveNpcId(undefined);
      setActiveNpcName('');
      setActiveNpcCard(null);
    }

    // Persist position + full runtime state to backend (single API call)
    try {
      await worldApi.updateWorld(worldId, {
        player_position: { x: foundX, y: foundY },
        player_xp: playerProgression.xp,
        player_level: playerProgression.level,
        player_gold: playerProgression.gold,
        bonded_ally_uuid: (keepActiveNpc ? activeNpcId : undefined) ?? '',
        time_state: timeState,
        npc_relationships: npcRelationships,
        player_inventory: playerInventory,
        ally_inventory: (keepActiveNpc ? allyInventory : null) ?? undefined,
        room_states: roomStatesRef.current,
      });
      console.log('[RuntimeState] Saved on room transition');
    } catch (err) {
      console.error('[RuntimeState] Failed to save on room transition:', err);
    }

    // Add room introduction as assistant message
    if (targetRoom.introduction_text) {
      const roomIntroMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: targetRoom.introduction_text,
        timestamp: Date.now(),
        metadata: {
          type: 'room_introduction',
          roomId: targetRoom.id
        }
      };
      addMessage(roomIntroMessage);
    }

    // If keeping NPC, add a message about them following
    if (keepActiveNpc && activeNpcName) {
      const followMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `*${activeNpcName} follows you into ${targetRoom.name}*`,
        timestamp: Date.now(),
        metadata: {
          type: 'npc_travel',
          npcId: activeNpcId,
          roomId: targetRoom.id
        }
      };
      addMessage(followMessage);
    }

    // Close map modal after navigation
    setShowMap(false);

    // Refresh adventure context after summarization (for next transition)
    if (worldId && currentUser?.user_uuid) {
      try {
        const updatedContext = await adventureLogApi.getAdventureContext(worldId, currentUser.user_uuid);
        setAdventureContext(updatedContext);
        console.log(`[AdventureLog] Refreshed context: ${updatedContext.entries.length} entries`);
      } catch (err) {
        console.warn('[AdventureLog] Failed to refresh adventure context:', err);
      }
    }

    // ========================================
    // PHASE: IDLE - Transition complete
    // ========================================
    setTransitionState(createIdleTransitionState());

    const transitionDuration = Date.now() - transitionStartTime;
    console.log(`[RoomTransition] Completed in ${transitionDuration}ms`);
  }, [worldCard, worldState, worldId, messages, setMessages, addMessage, activeNpcName, activeNpcId, activeNpcCard, isInCombat, gridCombat, currentRoom, roomNpcs, playerProgression, timeState, npcRelationships, playerInventory, allyInventory, currentUser]);


  // Handle room navigation - persists position to backend
  // entryDir: The direction the player is entering FROM (passed from exit click)
  const handleNavigate = useCallback(async (roomId: string, entryDir: ExitDirection | null = null) => {
    if (!worldState || !worldId) return;

    // Find the target room in the grid
    let foundRoom: GridRoom | undefined;

    for (let y = 0; y < worldState.grid.length; y++) {
      for (let x = 0; x < worldState.grid[y].length; x++) {
        const room = worldState.grid[y][x];
        if (room?.id === roomId) {
          foundRoom = room;
          break;
        }
      }
      if (foundRoom) break;
    }

    if (!foundRoom) {
      console.error(`Room not found: ${roomId}`);
      return;
    }

    const targetRoom = foundRoom;

    // Check if we have an active NPC - if so, show Party Gather modal
    if (activeNpcId && activeNpcName) {
      setPendingDestination(targetRoom);
      setPendingEntryDirection(entryDir); // Store entry direction for modal flow
      setShowPartyGatherModal(true);
      return; // Don't navigate immediately, wait for user choice
    }

    // No active NPC - navigate immediately with entry direction
    await performRoomTransition(targetRoom, false, entryDir);
  }, [worldState, worldId, performRoomTransition, activeNpcId, activeNpcName]);

  // Navigate back to the World Launcher/Splash page
  const handleBackToWorld = useCallback(() => {
    if (worldId) {
      navigate(`/world/${worldId}/launcher`);
    }
  }, [worldId, navigate]);

  // NOTE: These handlers are kept for future use (e.g., travel depot, vehicle, etc.)
  // The PixiMapModal is disconnected from the main UI but still renders if showMap is true.
  const handleOpenMap = useCallback(() => {
    setShowMap(true);
  }, []);

  const handleCloseMap = useCallback(() => {
    setShowMap(false);
  }, []);

  // Suppress unused variable warning - these will be reconnected for fast-travel feature
  void handleOpenMap;

  // ============================================
  // INVENTORY HANDLERS
  // ============================================

  // Open inventory modal for player or ally (disabled during combat)
  const handleOpenInventory = useCallback((target: 'player' | 'ally') => {
    if (isInCombat) {
      console.log('Cannot open inventory during combat');
      return;
    }
    setInventoryTarget(target);
    setShowInventoryModal(true);
  }, [isInCombat]);

  // Close inventory modal
  const handleCloseInventory = useCallback(() => {
    setShowInventoryModal(false);
  }, []);

  // Handle inventory changes (equipment swaps, etc.)
  const handleInventoryChange = useCallback((newInventory: CharacterInventory) => {
    if (inventoryTarget === 'player') {
      setPlayerInventory(newInventory);
      console.log('[Inventory] Player inventory updated:', newInventory.equippedWeapon?.name || 'no weapon');
    } else {
      setAllyInventory(newInventory);
      console.log('[Inventory] Ally inventory updated:', newInventory.equippedWeapon?.name || 'no weapon');
    }
  }, [inventoryTarget]);

  // Dismiss ally from inventory modal
  const handleDismissAllyFromInventory = useCallback(() => {
    if (!activeNpcId || !activeNpcName) return;

    // Close inventory modal
    setShowInventoryModal(false);

    // Add farewell message
    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: `*${activeNpcName} stays behind as you part ways.*`,
      timestamp: Date.now(),
      metadata: {
        type: 'npc_dismissed',
        npcId: activeNpcId,
      }
    });

    // Clear active NPC (unbind ally)
    setActiveNpcId(undefined);
    setActiveNpcName('');
    setActiveNpcCard(null);
    setAllyInventory(null);

    console.log(`[Inventory] Dismissed ally: ${activeNpcName}`);
  }, [activeNpcId, activeNpcName, addMessage]);

  // Initialize ally inventory when bonding with an NPC
  useEffect(() => {
    if (activeNpcId && !allyInventory) {
      // Create default inventory for newly bonded ally
      setAllyInventory(createDefaultInventory());
      console.log('[Inventory] Created default inventory for bonded ally');
    } else if (!activeNpcId && allyInventory) {
      // Clear ally inventory when unbonded
      setAllyInventory(null);
    }
  }, [activeNpcId, allyInventory]);

  // ============================================
  // LOCAL MAP HANDLERS (Unified Play View)
  // ============================================

  // Handle tile click in local map
  const handleLocalMapTileClick = useCallback((position: TilePosition) => {
    console.log('Local map tile clicked:', position);
    setPlayerTilePosition(position);
  }, []);

  // Handle entity click in local map
  const handleLocalMapEntityClick = useCallback((entityId: string) => {
    console.log('Local map entity clicked:', entityId);

    // Check if this is the player character (outside combat = open inventory)
    const playerId = currentUser?.id || 'player';
    if (entityId === playerId && !isInCombat) {
      console.log('Clicked player character - opening inventory');
      handleOpenInventory('player');
      return;
    }

    // Check if this is the bonded ally (outside combat = open inventory)
    if (entityId === activeNpcId && !isInCombat) {
      console.log('Clicked bonded ally - opening inventory');
      handleOpenInventory('ally');
      return;
    }

    // Find the NPC and select them for conversation
    const npc = roomNpcs.find(n => n.id === entityId);
    if (npc) {
      // If hostile, could trigger combat; for now just log
      if (npc.hostile) {
        console.log('Clicked hostile NPC:', npc.name);
        // Combat trigger will be handled by threat zone entry
      } else {
        // Use full NPC selection flow (loads character card, injects context, etc.)
        handleSelectNpc(entityId);
      }
    }
  }, [roomNpcs, handleSelectNpc, currentUser, activeNpcId, isInCombat, handleOpenInventory]);

  // Handle exit click in local map
  const handleLocalMapExitClick = useCallback(async (exit: { direction: ExitDirection; targetRoomId: string }) => {
    console.log('Local map exit clicked:', exit);

    // Find the target room
    if (!worldState) return;

    let foundRoom: GridRoom | undefined;
    for (const row of worldState.grid) {
      for (const room of row) {
        if (room?.id === exit.targetRoomId) {
          foundRoom = room;
          break;
        }
      }
      if (foundRoom) break;
    }

    if (!foundRoom) {
      console.error('Target room not found:', exit.targetRoomId);
      return;
    }

    // Calculate entry direction (opposite of exit direction)
    // If you exit via east (>|), you enter the next room from the west (|<)
    const oppositeDirections: Record<ExitDirection, ExitDirection> = {
      north: 'south',
      south: 'north',
      east: 'west',
      west: 'east',
    };
    const entryDir = oppositeDirections[exit.direction];
    console.log(`[Exit] Exiting ${exit.direction}, will enter from ${entryDir}`);

    // Pass entry direction directly to avoid stale closure issues
    await handleNavigate(exit.targetRoomId, entryDir);
  }, [worldState, handleNavigate]);

  // Handle entering a threat zone (triggers grid combat)
  const handleEnterThreatZone = useCallback((hostileIds: string[], currentPosition: TilePosition, mapState: LocalMapState) => {
    console.log('Entered threat zone, hostile IDs:', hostileIds, 'at position:', currentPosition);

    // Find hostile NPCs
    const hostiles = roomNpcs.filter(npc => hostileIds.includes(npc.id) && npc.hostile);
    if (hostiles.length === 0) return;

    // Use the map state passed from LocalMapView (has correct player position)
    // This avoids the stale cache issue where localMapStateCache hasn't updated yet
    const playerId = currentUser?.id || 'player';

    // Update cache with the correct position before starting combat
    setLocalMapStateCache(mapState);

    // Start combat with player and ally inventories for weapon stats
    gridCombat.startCombat(mapState, playerId, {
      playerInventory,
      allyInventory: allyInventory || undefined,
    });
    setIsInCombat(true);
  }, [roomNpcs, currentUser, gridCombat, playerInventory, allyInventory]);

  // Callback to capture LocalMapState from LocalMapView
  const handleLocalMapStateChange = useCallback((mapState: LocalMapState) => {
    setLocalMapStateCache(mapState);
  }, []);

  // Party Gather Modal Handlers
  const handleBringNpcAlong = useCallback(async () => {
    if (!pendingDestination) return;

    setShowPartyGatherModal(false);
    // Pass the stored entry direction so player spawns at correct edge
    await performRoomTransition(pendingDestination, true, pendingEntryDirection); // keepActiveNpc = true
    setPendingDestination(null);
    setPendingEntryDirection(null);
  }, [pendingDestination, pendingEntryDirection, performRoomTransition]);

  const handleLeaveNpcHere = useCallback(async () => {
    if (!pendingDestination) return;

    setShowPartyGatherModal(false);
    // Add farewell message before transition
    // NOTE: Do NOT clear activeNpcId here - performRoomTransition will handle it
    // with keepActiveNpc=false. Clearing it prematurely causes the companion sprite
    // to vanish from the local map before the room transition happens.
    if (activeNpcName) {
      const farewellMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `*${activeNpcName} stays behind*`,
        timestamp: Date.now(),
        metadata: {
          type: 'npc_farewell',
          npcId: activeNpcId
        }
      };
      addMessage(farewellMessage);
    }

    // performRoomTransition with keepActiveNpc=false will clear the active NPC state
    // Pass the stored entry direction so player spawns at correct edge
    await performRoomTransition(pendingDestination, false, pendingEntryDirection);
    setPendingDestination(null);
    setPendingEntryDirection(null);
  }, [pendingDestination, pendingEntryDirection, activeNpcName, activeNpcId, addMessage, performRoomTransition]);

  const handleClosePartyGatherModal = useCallback(() => {
    setShowPartyGatherModal(false);
    setPendingDestination(null);
    setPendingEntryDirection(null);
  }, []);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Suppress unused variable warnings for reserved handlers
  void _handleDismissNpc;
  void _combatInitData;

  // Note: activeCharacter could be used here for displaying NPC-specific UI
  // const activeCharacter = activeNpcId ? roomNpcs.find(n => n.id === activeNpcId) : null;

  // ==================================================
  // MEMOIZED VALUES - Must be above early returns to avoid
  // "Rendered more hooks than during the previous render" error
  // ==================================================

  // Build time display with human-readable time of day
  const timeDisplay = timeConfig.enableDayNightCycle
    ? `Day ${timeState.currentDay} - ${getTimeOfDayDescription(timeState.timeOfDay)}`
    : undefined;

  // Build player data for LocalMapView
  const playerImagePath = currentUser?.filename
    ? `/api/user-image/${encodeURIComponent(currentUser.filename)}`
    : null;

  const playerForLocalMap = useMemo(() => {
    const stats = deriveGridCombatStats(playerProgression.level);
    return {
      id: currentUser?.id || 'player',
      name: currentUser?.name || 'Player',
      level: playerProgression.level,
      imagePath: playerImagePath,
      currentHp: stats.maxHp,
      maxHp: stats.maxHp,
    };
  }, [currentUser?.id, currentUser?.name, playerImagePath, playerProgression.level]);

  // Build companion data if active NPC is present
  // Find companion image from roomNpcs (resolved data with imageUrl)
  // Fallback to generating URL from activeNpcId for room transitions where companion isn't in roomNpcs
  const companionNpc = activeNpcId ? roomNpcs.find(n => n.id === activeNpcId) : null;
  const companionImagePath = companionNpc?.imageUrl
    || (activeNpcId ? `/api/character-image/${activeNpcId}.png` : null);

  const companionForLocalMap = useMemo(() => {
    if (!activeNpcId || !activeNpcCard) return null;
    return {
      id: activeNpcId,
      name: activeNpcName,
      level: 1,
      imagePath: companionImagePath,
      currentHp: 80,
      maxHp: 80,
    };
  }, [activeNpcId, activeNpcCard, activeNpcName, companionImagePath]);

  // Get room background image
  // Priority: 1) Instance override (image_path), 2) Room card's embedded image
  // Note: image_path already includes the worldId prefix, so don't duplicate it
  const roomBackgroundImage = currentRoom?.image_path
    ? `/api/world-assets/${currentRoom.image_path}`
    : currentRoom?.id
      ? roomApi.getRoomImageUrl(currentRoom.id)
      : null;

  // Build player progress for HUD display
  const playerProgressForHUD = useMemo(() => {
    const progress = getXPProgress(playerProgression.xp, playerProgression.level);
    return {
      level: playerProgression.level,
      xpCurrent: progress.current,
      xpNeeded: progress.needed,
      gold: playerProgression.gold,
    };
  }, [playerProgression.xp, playerProgression.level, playerProgression.gold]);

  // ==================================================
  // EARLY RETURNS - Conditional rendering for loading/error states
  // (All hooks must be called BEFORE these returns)
  // ==================================================

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading world...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // No world loaded
  if (!worldState || !currentRoom) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div className="text-center">
          <p className="text-gray-500">World not found</p>
          <button
            onClick={handleBack}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Room Transition Loading Screen */}
      <LoadingScreen
        visible={isTransitioning}
        sourceRoomName={transitionState.sourceRoomName}
        targetRoomName={transitionState.targetRoomName}
        phase={transitionState.phase}
        progress={transitionState.progress}
      />

      {/* Missing Rooms Warning Banner */}
      {showMissingRoomWarning && missingRoomCount > 0 && (
        <div className="absolute top-0 left-0 right-0 bg-amber-900/90 border-b border-amber-700 px-4 py-2 flex items-center justify-between z-50">
          <span className="text-amber-200 text-sm">
            ⚠️ {missingRoomCount} room{missingRoomCount !== 1 ? 's' : ''} could not be loaded (may have been deleted).
          </span>
          <button
            onClick={() => setShowMissingRoomWarning(false)}
            className="text-amber-200 hover:text-white px-2 py-1 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      <PlayViewLayout
        worldName={worldCard?.data.name || 'World'}
        roomName={currentRoom.name}
        timeDisplay={timeDisplay}
        timeOfDay={timeState.timeOfDay}
        playerProgress={playerProgressForHUD}
        showJournalButton={true}
        onJournalClick={() => setShowJournal(true)}
        onBackToWorld={handleBackToWorld}
        inCombat={isInCombat}
        conversationState={{
          conversationTargetName: conversationTargetName || undefined,
          hasBondedAlly: !!activeNpcId,
          bondedAllyName: activeNpcName || undefined,
        }}
        onBondNpc={handleBondNpc}
        onEndConversation={clearConversationTarget}
        localMapContent={
          <div className="relative w-full h-full">
            <LocalMapView
              key={currentRoom.id}  /* Force remount on room change to reset Pixi canvas */
              currentRoom={currentRoom}
              worldState={worldState}
              roomNpcs={roomNpcs}
              backgroundImage={roomBackgroundImage}
              player={playerForLocalMap}
              companion={companionForLocalMap}
              initialPlayerPosition={playerTilePosition}
              entryDirection={entryDirection}
              inCombat={isInCombat}
              onTileClick={isInCombat ? gridCombat.handleTileClick : handleLocalMapTileClick}
              onEntityClick={isInCombat ? gridCombat.handleEntityClick : handleLocalMapEntityClick}
              onExitClick={handleLocalMapExitClick}
              onEnterThreatZone={handleEnterThreatZone}
              onMapStateChange={handleLocalMapStateChange}
              targetingMode={isInCombat ? gridCombat.targetingMode : 'none'}
              validMoveTargets={isInCombat ? gridCombat.validMoveTargets : undefined}
              validAttackTargets={isInCombat ? gridCombat.validAttackTargets : undefined}
              combatMapState={isInCombat ? localMapStateCache : null}
              mapRef={localMapRef}
            />
            {/* Grid Combat HUD Overlay */}
            {isInCombat && gridCombat.combatState && !combatEndState && (
              <GridCombatHUD
                combatState={gridCombat.combatState}
                isPlayerTurn={gridCombat.isPlayerTurn}
                targetingMode={gridCombat.targetingMode}
                onActionClick={(action) => {
                  if (action === 'defend') gridCombat.executeDefend();
                  else if (action === 'end_turn') gridCombat.endTurn();
                  else if (action === 'flee') gridCombat.attemptFlee();
                }}
                onStartTargeting={gridCombat.setTargetingMode}
                onCancelTargeting={() => gridCombat.setTargetingMode('none')}
              />
            )}
            {/* Combat End Screen (Victory/Defeat) */}
            {combatEndState && (
              <CombatEndScreen
                phase={combatEndState.phase}
                result={combatEndState.result}
                combatants={combatEndState.combatants}
                levelUpInfo={levelUpInfo}
                genre="fantasy" // TODO: Extract from worldCard.extensions.genre when available
                onContinue={handleCombatContinue}
              />
            )}
            {/* DEV: Reset Enemies Button (toggle with Ctrl+Shift+D) */}
            {showDevTools && !isInCombat && (
              <button
                onClick={handleDevResetEnemies}
                className="absolute top-4 left-4 z-40 px-3 py-1.5 text-xs font-mono
                           bg-red-900/80 border border-red-600 text-red-300
                           hover:bg-red-800 hover:text-red-200
                           rounded transition-colors backdrop-blur-sm"
                title="DEV: Reset all enemies in this room (restore dead, heal incapacitated) — Ctrl+Shift+D to hide"
              >
                DEV: Reset Enemies
              </button>
            )}
          </div>
        }
        chatPanelContent={
          isInCombat && gridCombat.combatState ? (
            <CombatLogPanel
              roundNumber={gridCombat.combatState.turn}
              turnOrder={gridCombat.combatState.initiativeOrder.map(id => {
                const c = gridCombat.combatState!.combatants[id];
                const currentTurnId = gridCombat.combatState!.initiativeOrder[gridCombat.combatState!.currentTurnIndex];
                return c ? {
                  id: c.id,
                  name: c.name,
                  imagePath: c.imagePath || null,
                  isPlayerControlled: c.isPlayerControlled,
                  isCurrentTurn: c.id === currentTurnId
                } : {
                  id,
                  name: 'Unknown',
                  imagePath: null,
                  isPlayerControlled: false,
                  isCurrentTurn: id === currentTurnId
                };
              })}
              logEntries={gridCombat.combatState.log.map(entry => ({
                id: entry.id,
                type: entry.actionType === 'attack' ? 'attack' as const :
                      entry.actionType === 'defend' ? 'defend' as const :
                      entry.actionType === 'move' ? 'move' as const :
                      entry.actionType === 'flee' ? 'flee' as const :
                      'system' as const,
                message: `${entry.actorName} ${entry.actionType}${entry.targetName ? ` ${entry.targetName}` : ''}`,
                timestamp: Date.now(),
                actorName: entry.actorName,
                targetName: entry.targetName,
                damage: entry.result?.damage,
                isCritical: entry.result?.hitQuality === 'crushing'
              }))}
            />
          ) : (
            <ChatView disableSidePanel={true} hideHeader={true} />
          )
        }
      />

      {/* World Map Modal (overlay) - Currently disconnected from UI.
          Kept for future fast-travel feature (travel depot, vehicle, etc.)
          Navigation now happens via local map exits only. */}
      {showMap && worldState && currentRoom && (
        <PixiMapModal
          worldData={worldState}
          currentRoomId={currentRoom.id}
          onNavigate={handleNavigate}
          onClose={handleCloseMap}
        />
      )}

      {/* Party Gather Modal */}
      {showPartyGatherModal && pendingDestination && (
        <PartyGatherModal
          npcName={activeNpcName}
          destinationRoomName={pendingDestination.name}
          onBringAlong={handleBringNpcAlong}
          onLeaveHere={handleLeaveNpcHere}
          onClose={handleClosePartyGatherModal}
        />
      )}

      {/* Journal Modal */}
      {showJournal && (
        <JournalModal
          sessionNotes={sessionNotes}
          setSessionNotes={setSessionNotes}
          onClose={() => setShowJournal(false)}
        />
      )}

      {/* Inventory Modal */}
      {showInventoryModal && (
        <InventoryModal
          characterId={inventoryTarget === 'player' ? (currentUser?.id || 'player') : (activeNpcId || '')}
          characterName={inventoryTarget === 'player' ? (currentUser?.name || 'Player') : activeNpcName}
          characterImagePath={inventoryTarget === 'player' ? playerImagePath : companionImagePath}
          currentHp={deriveGridCombatStats(playerProgression.level).maxHp} // TODO: Track actual current HP
          maxHp={deriveGridCombatStats(playerProgression.level).maxHp}
          gold={playerProgression.gold}
          inventory={inventoryTarget === 'player' ? playerInventory : (allyInventory || createDefaultInventory())}
          isAlly={inventoryTarget === 'ally'}
          onClose={handleCloseInventory}
          onInventoryChange={handleInventoryChange}
          onDismissAlly={inventoryTarget === 'ally' ? handleDismissAllyFromInventory : undefined}
        />
      )}
    </>
  );
}

/**
 * WorldPlayView wrapped with ErrorBoundary to catch rendering errors.
 * Uses WorldLoadError as fallback for user-friendly error display.
 */
function WorldPlayViewWithErrorBoundary(props: WorldPlayViewProps) {
  return (
    <ErrorBoundary
      fallback={
        <WorldLoadError
          title="World Play Error"
          message="Something went wrong while playing this world. Please try again or go back to select a different world."
          onRetry={() => window.location.reload()}
          onBack={() => window.history.back()}
        />
      }
      onError={(error) => console.error('WorldPlayView error:', error)}
    >
      <WorldPlayView {...props} />
    </ErrorBoundary>
  );
}

export default WorldPlayViewWithErrorBoundary;