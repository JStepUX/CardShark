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
import ChatView from '../components/chat/ChatView';
import { JournalModal } from '../components/SidePanel/JournalModal';
import { PixiMapModal } from '../components/world/pixi/PixiMapModal';
import { worldApi } from '../api/worldApi';
import { roomApi } from '../api/roomApi';
import type { WorldCard, RoomInstanceState } from '../types/worldCard';
import type { GridWorldState, GridRoom, CombatDisplayNPC } from '../types/worldGrid';
import type { CombatInitData } from '../types/combat';
import { resolveNpcDisplayData } from '../utils/worldStateApi';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { WorldLoadError } from '../components/world/WorldLoadError';
import type { NPCRelationship, TimeState, TimeConfig } from '../types/worldRuntime';
import { useEmotionDetection } from '../hooks/useEmotionDetection';
import { createDefaultTimeState, getTimeOfDayDescription } from '../utils/timeUtils';
// Local Map imports for unified Play View
import { LocalMapView, LocalMapViewHandle } from '../components/world/pixi/local';
import { PlayViewLayout } from '../components/world/PlayViewLayout';
import { CombatLogPanel } from '../components/combat/CombatLogPanel';
import { GridCombatHUD } from '../components/combat/GridCombatHUD';
import { CombatEndScreen } from '../components/combat/CombatEndScreen';
import { useGridCombat } from '../hooks/useGridCombat';
import type { TilePosition, LocalMapState } from '../types/localMap';
import {
  getXPProgress,
  createDefaultPlayerProgression,
  type PlayerProgression
} from '../utils/progressionUtils';
import { deriveGridCombatStats } from '../types/combat';
// Inventory system
import { InventoryModal } from '../components/inventory';
import type { CharacterInventory } from '../types/inventory';
import { createDefaultInventory } from '../types/inventory';
// Extracted hooks
import { useWorldPersistence } from '../hooks/useWorldPersistence';
import { useWorldLoader } from '../hooks/useWorldLoader';
import { useAdventureLog } from '../hooks/useAdventureLog';
import { useNPCInteraction } from '../hooks/useNPCInteraction';
import { useRoomTransition } from '../hooks/useRoomTransition';
import { useCombatManager } from '../hooks/useCombatManager';
import { LoadingScreen } from '../components/transition';
import type { AdventureContext } from '../types/adventureLog';



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
  const worldId = propWorldId || uuid || '';

  // Get user profile from route state (passed from WorldLauncher)
  const routeState = location.state as WorldPlayRouteState | null;
  const selectedUserUuid = routeState?.userProfile?.user_uuid;

  // State
  const [worldCard, setWorldCard] = useState<WorldCard | null>(null);
  const [worldState, setWorldState] = useState<GridWorldState | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GridRoom | null>(null);
  const [roomNpcs, setRoomNpcs] = useState<CombatDisplayNPC[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
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

  // Dev tools visibility (toggle with Ctrl+Shift+D)
  const [showDevTools, setShowDevTools] = useState(false);

  // Player progression state (per-world)
  const [playerProgression, setPlayerProgression] = useState<PlayerProgression>(createDefaultPlayerProgression());

  // Local map state (unified Play View)
  const [playerTilePosition, setPlayerTilePosition] = useState<TilePosition>({ x: 2, y: 2 });
  const [localMapStateCache, setLocalMapStateCache] = useState<LocalMapState | null>(null);

  // Inventory state
  const [playerInventory, setPlayerInventory] = useState<CharacterInventory>(() => createDefaultInventory());
  const [allyInventory, setAllyInventory] = useState<CharacterInventory | null>(null);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryTarget, setInventoryTarget] = useState<'player' | 'ally'>('player');

  // Adventure context for narrative continuity (Phase 3)
  const [adventureContext, setAdventureContext] = useState<AdventureContext | null>(null);

  // Ref for LocalMapView to trigger combat animations
  const localMapRef = useRef<LocalMapViewHandle | null>(null);

  // Ref for defeat respawn — set after useRoomTransition provides handleNavigate
  const handleNavigateRef = useRef<((roomId: string) => Promise<void>) | null>(null);

  // Ref for emotion detection NPC name (updated after NPC hook, read before it for stable hook order)
  const npcSpeakingNameRef = useRef<string>('');

  // Accumulated per-room runtime state (NPC alive/dead/incapacitated).
  // Uses a ref to avoid re-renders on every combat result; only read at save time.
  const roomStatesRef = useRef<Record<string, RoomInstanceState>>({});

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

  // Adventure log context injection (extracted hook)
  useAdventureLog({
    adventureContext,
    currentRoomId: currentRoom?.id,
    sessionNotes,
    setSessionNotes,
  });

  // Load world data via extracted hook
  const worldLoader = useWorldLoader({
    worldId,
    userUuid: selectedUserUuid,
    onNoUser: useCallback(() => navigate(`/world/${worldId}`, { replace: true }), [navigate, worldId]),
  });

  // Hydrate local state from loader result
  useEffect(() => {
    if (!worldLoader.result) return;
    const r = worldLoader.result;

    setWorldCard(r.worldCard);
    setWorldState(r.worldState);
    setCurrentRoom(r.currentRoom);
    setRoomNpcs(r.roomNpcs);
    setPlayerProgression(r.playerProgression);
    if (r.timeState) setTimeState(r.timeState);
    if (Object.keys(r.npcRelationships).length > 0) setNpcRelationships(r.npcRelationships);
    if (r.playerInventory) setPlayerInventory(r.playerInventory);
    if (Object.keys(r.roomStates).length > 0) roomStatesRef.current = r.roomStates;
    if (r.adventureContext) setAdventureContext(r.adventureContext);

    if (r.bondedAlly) {
      setActiveNpcId(r.bondedAlly.id);
      setActiveNpcName(r.bondedAlly.name);
      setActiveNpcCard(r.bondedAlly.card);
      if (r.bondedAlly.inventory) setAllyInventory(r.bondedAlly.inventory);
    }

    if (r.missingRoomCount > 0) {
      setMissingRoomCount(r.missingRoomCount);
      setShowMissingRoomWarning(true);
    }

    if (r.introductionText) {
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: r.introductionText,
        timestamp: Date.now(),
        metadata: { type: 'room_introduction', roomId: r.introductionRoomId },
      }]);
    }
  }, [worldLoader.result, setMessages]);

  // Emotion detection needs to be called before NPC hook (stable hook order).
  // On first render, names are empty; after NPC hook sets them, subsequent renders get the right values.
  const currentSpeakingNpcName = npcSpeakingNameRef.current;
  const { currentEmotion } = useEmotionDetection(messages, currentSpeakingNpcName);

  // NPC interaction (extracted hook)
  const npcInteraction = useNPCInteraction({
    currentRoom,
    roomNpcs,
    worldCard,
    worldId,
    characterData,
    messages,
    setMessages: setMessages as any,
    addMessage: addMessage as any,
    setCharacterDataOverride,
    apiConfig,
    currentUser,
    timeState,
    setTimeState,
    timeConfig,
    npcRelationships,
    setNpcRelationships,
    currentEmotion,
    onHostileNpcClicked: useCallback((initData: CombatInitData) => {
      setCombatInitData(initData);
      setIsInCombat(true);
    }, []),
  });

  // Destructure for easier access throughout the view
  const {
    conversationTargetName,
    activeNpcId, activeNpcName, activeNpcCard,
    setActiveNpcId, setActiveNpcName, setActiveNpcCard,
    handleSelectNpc, handleBondNpc, clearConversationTarget,
  } = npcInteraction;

  // Update ref for next render's emotion detection
  npcSpeakingNameRef.current = conversationTargetName || activeNpcName;

  // Combat manager (extracted hook) — must be after NPC hook since it needs activeNpcId/Name/Card
  const {
    combatEndState, levelUpInfo, onCombatEnd,
    gridCombatRef, handleCombatContinue, handleEnterThreatZone,
  } = useCombatManager({
    currentRoom, roomNpcs, setRoomNpcs, roomStatesRef,
    playerProgression, setPlayerProgression,
    playerInventory, setPlayerInventory,
    allyInventory, setIsInCombat,
    setLocalMapStateCache,
    activeNpcId, activeNpcName, activeNpcCard,
    characterData, apiConfig, addMessage, setMessages,
    currentUser,
    onDefeatRespawn: useCallback(async () => {
      // Fast travel to starting room after defeat
      const startPos = worldState?.starting_position;
      if (!startPos || !worldState) return;
      // Find the room at the starting position
      const startRoom = worldState.grid[startPos.y]?.[startPos.x];
      if (!startRoom) return;
      await handleNavigateRef.current?.(startRoom.id);
    }, [worldState]),
  });

  // Grid combat hook (must be after combat manager since it uses onCombatEnd)
  const gridCombat = useGridCombat(localMapStateCache, {
    onCombatEnd: onCombatEnd,
    onMapStateUpdate: (updatedMap) => {
      setLocalMapStateCache(updatedMap);
      // Sync player position
      setPlayerTilePosition(updatedMap.playerPosition);
    },
    mapRef: localMapRef,
  });

  // Set gridCombat ref for combat manager (breaks circular dependency)
  gridCombatRef.current = gridCombat;

  // World runtime state persistence (must be after NPC hook since it needs activeNpcId)
  useWorldPersistence({
    worldId,
    userUuid: selectedUserUuid,
    currentRoom,
    roomNpcs,
    roomStatesRef,
    playerProgression,
    activeNpcId,
    timeState,
    npcRelationships,
    playerInventory,
    allyInventory,
  });

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
        speakerName: 'System',
      }
    });
  }, [currentRoom, worldState, worldId, addMessage]);

  // Room transition (extracted hook)
  const {
    transitionState, isTransitioning, entryDirection,
    handleNavigate, handleLocalMapExitClick,
  } = useRoomTransition({
    worldCard, worldState, worldId: worldId || undefined,
    currentRoom, setCurrentRoom, roomNpcs, setRoomNpcs, roomStatesRef,
    messages, setMessages, addMessage,
    activeNpcId, activeNpcName, activeNpcCard, clearConversationTarget,
    setActiveNpcId, setActiveNpcName, setActiveNpcCard,
    isInCombat, setIsInCombat, gridCombat,
    setLocalMapStateCache, setPlayerTilePosition, setWorldState, setAdventureContext,
    playerProgression, timeState, npcRelationships,
    playerInventory, allyInventory,
    currentUser, apiConfig, setShowMap,
  });

  // Keep navigate ref current for defeat respawn callback
  handleNavigateRef.current = handleNavigate;


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
        speakerName: activeNpcName,
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

  // Callback to capture LocalMapState from LocalMapView
  const handleLocalMapStateChange = useCallback((mapState: LocalMapState) => {
    setLocalMapStateCache(mapState);
  }, []);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Suppress unused variable warnings for reserved handlers
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
  if (worldLoader.isLoading) {
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
  if (worldLoader.error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div className="text-center">
          <p className="text-red-500 mb-4">{worldLoader.error}</p>
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
              aoeBlastPattern={
                isInCombat && gridCombat.targetingMode === 'aoe'
                  ? (gridCombat.selectedItem?.weaponProperties?.blastPattern
                    ?? (gridCombat.combatState
                      ? Object.values(gridCombat.combatState.combatants).find(c => c.isPlayer)?.equippedWeapon?.weaponProperties?.blastPattern
                      : undefined)
                    ?? 'radius_3x3')
                  : undefined
              }
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
                onUseItem={(itemId) => {
                  gridCombat.executeUseItem(itemId, gridCombat.combatState?.initiativeOrder[gridCombat.combatState.currentTurnIndex]);
                }}
                onStartAoETargeting={(item) => {
                  gridCombat.setSelectedItem(item);
                  gridCombat.setTargetingMode('aoe');
                }}
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