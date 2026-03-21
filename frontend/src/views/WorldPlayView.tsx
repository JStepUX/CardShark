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
import { roomApi } from '../api/roomApi';
import type { WorldCard } from '../types/worldCard';
import type { GridWorldState, GridRoom, CombatDisplayNPC } from '../types/worldGrid';
import type { CombatInitData } from '../types/combat';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { WorldLoadError } from '../components/world/WorldLoadError';
import type { TimeConfig } from '../types/worldRuntime';
import { useEmotionDetection } from '../hooks/useEmotionDetection';
import { createDefaultTimeState, getTimeOfDayDescription } from '../utils/timeUtils';
import {
  buildLocalMapCompanion,
  buildLocalMapPlayer,
  buildWorldPlayHudProgress,
  createWorldPlayPlayerTile,
  createWorldPlayTimeConfig,
} from '../worldplay/runtime';
// Local Map imports for unified Play View
import { LocalMapView, LocalMapViewHandle } from '../components/world/pixi/local';
import { PlayViewLayout } from '../components/world/PlayViewLayout';
import { CombatLogPanel } from '../components/combat/CombatLogPanel';
import { GridCombatHUD } from '../components/combat/GridCombatHUD';
import { CombatEndScreen } from '../components/combat/CombatEndScreen';
import { useGridCombat } from '../hooks/useGridCombat';
import type { TilePosition, LocalMapState } from '../types/localMap';
import {
  createDefaultPlayerProgression,
} from '../utils/progressionUtils';
// Inventory system
import { InventoryModal } from '../components/inventory';
import { createDefaultInventory } from '../types/inventory';
// Extracted hooks
import { useWorldPersistence } from '../hooks/useWorldPersistence';
import { useWorldLoader } from '../hooks/useWorldLoader';
import { useAdventureLog } from '../hooks/useAdventureLog';
import { useNPCInteraction } from '../hooks/useNPCInteraction';
import { useRoomTransition } from '../hooks/useRoomTransition';
import { useCombatManager } from '../hooks/useCombatManager';
import { useWorldPlayDevTools } from '../hooks/useWorldPlayDevTools';
import { useWorldPlayHydration } from '../hooks/useWorldPlayHydration';
import { useWorldPlayInventory } from '../hooks/useWorldPlayInventory';
import { useWorldPlayLocalMap } from '../hooks/useWorldPlayLocalMap';
import { useWorldPlayMessaging } from '../hooks/useWorldPlayMessaging';
import { useWorldPlaySession } from '../hooks/useWorldPlaySession';
import { LoadingScreen } from '../components/transition';
import { soundManager } from '../components/combat/pixi/SoundManager';
import Button from '../components/common/Button';
import type { AdventureContext } from '../types/adventureLog';
import type { UserProfile } from '../types/messages';



interface WorldPlayViewProps {
  worldId?: string;
}

// Route state type for user profile passed from WorldLauncher
interface WorldPlayRouteState {
  userProfile?: UserProfile;
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
    setCurrentUser,
    sessionNotes,
    setSessionNotes,
    currentChatId
  } = useChat();
  const { characterData } = useCharacter();
  const { apiConfig } = useAPIConfig();
  const worldId = propWorldId || uuid || '';

  // Get user profile from route state (passed from WorldLauncher)
  const routeState = location.state as WorldPlayRouteState | null;
  const selectedUserUuid = routeState?.userProfile?.user_uuid;

  // Sync selected user into ChatContext on world entry so that currentUser
  // matches the player the user chose in WorldLauncher (not the last-used user from localStorage)
  useEffect(() => {
    if (routeState?.userProfile && routeState.userProfile.user_uuid !== currentUser?.user_uuid) {
      setCurrentUser(routeState.userProfile);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount only

  // State
  const [worldCard, setWorldCard] = useState<WorldCard | null>(null);
  const [worldState, setWorldState] = useState<GridWorldState | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GridRoom | null>(null);
  const [roomNpcs, setRoomNpcs] = useState<CombatDisplayNPC[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [showJournal, setShowJournal] = useState(false);

  const [timeConfig] = useState<TimeConfig>(createWorldPlayTimeConfig);

  // Combat state (legacy - kept for compatibility)
  const [_combatInitData, setCombatInitData] = useState<CombatInitData | null>(null);
  const [isInCombat, setIsInCombat] = useState(false);

  // Local map state (unified Play View)
  const [playerTilePosition, setPlayerTilePosition] = useState<TilePosition>(createWorldPlayPlayerTile);
  const [localMapStateCache, setLocalMapStateCache] = useState<LocalMapState | null>(null);

  // Adventure context for narrative continuity (Phase 3)
  const [adventureContext, setAdventureContext] = useState<AdventureContext | null>(null);

  // Ref for LocalMapView to trigger combat animations
  const localMapRef = useRef<LocalMapViewHandle | null>(null);

  // Ref for defeat respawn — set after useRoomTransition provides handleNavigate
  const handleNavigateRef = useRef<((roomId: string) => Promise<void>) | null>(null);

  // Ref for emotion detection NPC name (updated after NPC hook, read before it for stable hook order)
  const npcSpeakingNameRef = useRef<string>('');

  const session = useWorldPlaySession({
    initialPlayerProgression: createDefaultPlayerProgression(),
    initialTimeState: createDefaultTimeState(),
    initialPlayerInventory: createDefaultInventory(),
  });
  const {
    playerProgression,
    timeState,
    npcRelationships,
    playerInventory,
    allyInventory,
    roomStatesRef,
    hydrateFromWorldLoadResult,
    setPlayerProgression,
    setTimeState,
    setNpcRelationships,
    setPlayerInventory,
    setAllyInventory,
    activeNpcId,
    activeNpcName,
    activeNpcCard,
    setActiveNpcId,
    setActiveNpcName,
    setActiveNpcCard,
    setBondedAlly,
    clearBondedAlly,
    resetRuntimeState,
  } = session;

  // Stop combat music when leaving world play (e.g. clicking Gallery icon mid-combat)
  useEffect(() => {
    return () => { soundManager.stopMusic(); };
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
  const {
    setWorldPlayMessages,
    appendWorldPlayMessage,
  } = useWorldPlayMessaging({
    messages,
    setMessages,
    addMessage,
  });

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
    setMessages: setWorldPlayMessages,
    addMessage: appendWorldPlayMessage,
    setCharacterDataOverride,
    apiConfig,
    currentUser,
    timeState,
    setTimeState,
    timeConfig,
    npcRelationships,
    setNpcRelationships,
    activeNpcId,
    activeNpcName,
    activeNpcCard,
    setActiveNpcId,
    setActiveNpcName,
    setActiveNpcCard,
    setBondedAlly,
    clearBondedAlly,
    currentEmotion,
    onHostileNpcClicked: useCallback((initData: CombatInitData) => {
      setCombatInitData(initData);
      setIsInCombat(true);
    }, []),
    chatSessionUuid: currentChatId || undefined,
    sessionNotes,
  });

  // Destructure for easier access throughout the view
  const {
    conversationTargetName,
    handleSelectNpc, handleBondNpc, clearConversationTarget,
  } = npcInteraction;

  const {
    showInventoryModal,
    inventoryTarget,
    handleOpenInventory,
    handleCloseInventory,
    handleInventoryChange,
    handleDismissAllyFromInventory,
  } = useWorldPlayInventory({
    isInCombat,
    activeNpcId,
    activeNpcName,
    playerInventory,
    allyInventory,
    setPlayerInventory,
    setAllyInventory,
    clearBondedAlly,
    addMessage: appendWorldPlayMessage,
  });

  const {
    missingRoomCount,
    showMissingRoomWarning,
    dismissMissingRoomWarning,
  } = useWorldPlayHydration({
    result: worldLoader.result,
    setWorldCard,
    setWorldState,
    setCurrentRoom,
    setRoomNpcs,
    setAdventureContext,
    hydrateRuntimeState: hydrateFromWorldLoadResult,
    setMessages,
  });

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
    characterData, apiConfig, addMessage: appendWorldPlayMessage, setMessages: setWorldPlayMessages,
    currentUser,
    chatSessionUuid: currentChatId || undefined,
    sessionNotes,
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

  const { showDevTools, handleDevResetEnemies } = useWorldPlayDevTools({
    currentRoom,
    worldState,
    worldId,
    roomStatesRef,
    setRoomNpcs,
    setLocalMapStateCache,
    resetRuntimeState,
    addMessage: appendWorldPlayMessage,
  });

  // Room transition (extracted hook)
  const {
    transitionState, isTransitioning, entryDirection,
    handleNavigate, handleLocalMapExitClick,
  } = useRoomTransition({
    worldCard, worldState, worldId: worldId || undefined,
    currentRoom, setCurrentRoom, roomNpcs, setRoomNpcs, roomStatesRef,
    messages, setMessages: setWorldPlayMessages, addMessage: appendWorldPlayMessage,
    activeNpcId, activeNpcName, clearConversationTarget, clearBondedAlly,
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

  const {
    handleLocalMapTileClick,
    handleLocalMapEntityClick,
    handleLocalMapStateChange,
  } = useWorldPlayLocalMap({
    currentUserId: currentUser?.id,
    activeNpcId,
    isInCombat,
    roomNpcs,
    onSelectNpc: handleSelectNpc,
    onOpenInventory: handleOpenInventory,
    setPlayerTilePosition,
    setLocalMapStateCache,
  });

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

  const playerForLocalMap = useMemo(() => (
    buildLocalMapPlayer(currentUser, playerImagePath, playerProgression.level)
  ), [currentUser, playerImagePath, playerProgression.level]);

  // Build companion data if active NPC is present
  // Find companion image from roomNpcs (resolved data with imageUrl)
  // Fallback to generating URL from activeNpcId for room transitions where companion isn't in roomNpcs
  const companionNpc = activeNpcId ? roomNpcs.find(n => n.id === activeNpcId) : null;
  const companionImagePath = companionNpc?.imageUrl
    || (activeNpcId ? `/api/character-image/${activeNpcId}.png` : null);

  const companionForLocalMap = useMemo(() => (
    buildLocalMapCompanion(activeNpcId, activeNpcName, activeNpcCard, roomNpcs, companionImagePath, playerProgression.level)
  ), [activeNpcId, activeNpcName, activeNpcCard, roomNpcs, companionImagePath, playerProgression.level]);

  // Get room background image
  // Priority: 1) Instance override (image_path), 2) Room card's embedded image
  // Note: image_path already includes the worldId prefix, so don't duplicate it
  const roomBackgroundImage = currentRoom?.image_path
    ? `/api/world-assets/${currentRoom.image_path}`
    : currentRoom?.id
      ? roomApi.getRoomImageUrl(currentRoom.id)
      : null;

  // Build player progress for HUD display
  const playerProgressForHUD = useMemo(() => (
    buildWorldPlayHudProgress(playerProgression)
  ), [playerProgression]);

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
          <Button
            onClick={handleBack}
            variant="ghost"
            size="lg"
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Go Back
          </Button>
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
          <Button
            onClick={handleBack}
            variant="ghost"
            size="lg"
            className="mt-4 bg-purple-600 hover:bg-purple-700 text-white"
          >
            Go Back
          </Button>
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
          <Button
            onClick={dismissMissingRoomWarning}
            variant="ghost"
            size="sm"
            className="text-amber-200 hover:text-white"
          >
            Dismiss
          </Button>
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
              showDebugOverlay={showDevTools}
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
              <Button
                onClick={handleDevResetEnemies}
                variant="destructive"
                size="sm"
                title="DEV: Reset all enemies in this room (restore dead, heal incapacitated) — Ctrl+Shift+D to hide"
                className="absolute top-4 left-4 z-40 font-mono bg-red-900/80 border border-red-600 text-red-300 hover:bg-red-800 hover:text-red-200 backdrop-blur-xs"
              >
                DEV: Reset Enemies
              </Button>
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
            <ChatView disableSidePanel={true} hideHeader={true} disableUserSelect={true} />
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
          currentHp={playerForLocalMap.maxHp} // TODO: Track actual current HP
          maxHp={playerForLocalMap.maxHp}
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
