/**
 * @file WorldPlayViewRefactored.tsx
 * @description Refactored World Play View using extracted hooks.
 *
 * This is the slimmed-down version of WorldPlayView (~400 lines) that
 * delegates business logic to specialized hooks:
 * - useWorldSession: World loading, progress, runtime state
 * - useRoomTransition: Room navigation, asset loading, state updates
 * - useNPCInteraction: Conversation, bonding, multi-speaker
 * - useAdventureLog: Adventure context injection
 * - useGridCombat: Combat state and actions
 *
 * This component focuses ONLY on:
 * - Routing and navigation
 * - UI rendering and layout
 * - Event handling (delegating to hooks)
 * - Modal management
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getTimeOfDayDescription } from '../utils/timeUtils';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useChat } from '../contexts/ChatContext';
import { useCharacter } from '../contexts/CharacterContext';
import { useAPIConfig } from '../contexts/APIConfigContext';
import ChatView from '../components/chat/ChatView';
import { JournalModal } from '../components/SidePanel/JournalModal';
import { PartyGatherModal } from '../components/world/PartyGatherModal';
import { PixiMapModal } from '../components/world/pixi/PixiMapModal';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { WorldLoadError } from '../components/world/WorldLoadError';
import { LocalMapView, LocalMapViewHandle, soundManager } from '../components/world/pixi/local';
import { PlayViewLayout } from '../components/world/PlayViewLayout';
import { CombatLogPanel } from '../components/combat/CombatLogPanel';
import { GridCombatHUD } from '../components/combat/GridCombatHUD';
import { CombatEndScreen } from '../components/combat/CombatEndScreen';
import { InventoryModal } from '../components/inventory';
import { LoadingScreen } from '../components/transition';

// Hooks
import { useWorldSession } from '../hooks/useWorldSession';
import { useRoomTransition } from '../hooks/useRoomTransition';
import { useNPCInteraction } from '../hooks/useNPCInteraction';
import { useAdventureLog } from '../hooks/useAdventureLog';
import { useGridCombat } from '../hooks/useGridCombat';
import { useEmotionDetection } from '../hooks/useEmotionDetection';

// Types
import type { GridRoom } from '../types/worldGrid';
import type { ExitDirection, LocalMapState, LocalMapConfig } from '../types/localMap';
import type { GridCombatState } from '../types/combat';
import type { LevelUpInfo } from '../utils/progressionUtils';

// Utils
import { roomApi } from '../api/roomApi';
import { deriveGridCombatStats } from '../types/combat';
import { getXPProgress } from '../utils/progressionUtils';
import { checkLevelUp } from '../utils/progressionUtils';
import { createDefaultInventory } from '../types/inventory';

// =============================================================================
// Constants
// =============================================================================

const LOCAL_MAP_CONFIG: LocalMapConfig = {
  gridWidth: 9,
  gridHeight: 9,
  tileSize: 100,
};

// =============================================================================
// Types
// =============================================================================

interface WorldPlayViewProps {
  worldId?: string;
}

interface WorldPlayRouteState {
  userProfile?: {
    user_uuid?: string;
    name?: string;
    filename?: string;
  };
}

// =============================================================================
// Component
// =============================================================================

export function WorldPlayViewRefactored({ worldId: propWorldId }: WorldPlayViewProps) {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Context hooks
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

  // Derived values
  const worldId = propWorldId || uuid || '';
  const routeState = location.state as WorldPlayRouteState | null;
  const selectedUserUuid = routeState?.userProfile?.user_uuid;

  // ==========================================================================
  // World Session Hook
  // ==========================================================================

  const worldSession = useWorldSession({
    worldId,
    userUuid: selectedUserUuid,
    onNoUser: () => {
      console.warn('[WorldPlayView] No user selected, navigating back to launcher');
      navigate(`/world/${worldId}`, { replace: true });
    },
  });

  const {
    worldCard,
    worldState,
    playerProgression,
    timeState,
    timeConfig,
    npcRelationships,
    playerInventory,
    allyInventory,
    roomStatesRef,
    adventureContext,
    isLoading,
    error,
  } = worldSession.state;

  const {
    setPlayerProgression: _setPlayerProgression,
    setTimeState: _setTimeState,
    setNpcRelationships,
    setPlayerInventory,
    setAllyInventory,
    setWorldState,
    debouncedSaveRuntimeState,
  } = worldSession.actions;

  // ==========================================================================
  // Room Transition Hook
  // ==========================================================================

  const roomTransition = useRoomTransition({
    worldId,
    userUuid: selectedUserUuid,
    worldCard,
    worldState,
    setWorldState,
    roomStatesRef,
    playerProgression,
    timeState,
    npcRelationships,
    playerInventory,
    allyInventory,
    activeNpcId: undefined, // Will be set from NPC interaction hook
    activeNpcName: '',
    currentUser,
    apiConfig,
    messages,
    setMessages,
    addMessage,
    isInCombat: false, // Will be set from combat state
    endCombat: () => {}, // Will be set from combat hook
    setIsInCombat: () => {},
    clearConversationTarget: () => {}, // Will be set from NPC interaction hook
    localMapConfig: LOCAL_MAP_CONFIG,
  });

  const {
    transitionState,
    currentRoom,
    roomNpcs,
    playerTilePosition,
    entryDirection,
    isTransitioning,
    setRoomNpcs: _setRoomNpcs,
    setPlayerTilePosition,
    performRoomTransition,
  } = roomTransition;

  // ==========================================================================
  // NPC Interaction Hook
  // ==========================================================================

  const { currentEmotion } = useEmotionDetection(messages, '');

  const npcInteraction = useNPCInteraction({
    currentRoom,
    roomNpcs,
    worldId,
    characterData,
    apiConfig,
    currentUser,
    messages,
    setMessages,
    addMessage,
    setCharacterDataOverride,
    currentEmotion,
    timeState,
    npcRelationships,
    setNpcRelationships,
  });

  const {
    conversationTargetName,
    activeNpcId,
    activeNpcName,
    activeNpcCard,
    isInCombat,
    handleSelectNpc,
    handleBondNpc,
    clearConversationTarget,
    dismissBondedAlly,
    setIsInCombat,
  } = npcInteraction;

  // ==========================================================================
  // Adventure Log Hook
  // ==========================================================================

  useAdventureLog({
    adventureContext,
    currentRoomId: currentRoom?.id,
    sessionNotes,
    setSessionNotes,
  });

  // ==========================================================================
  // Local State (UI-only)
  // ==========================================================================

  const [showMap, setShowMap] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showPartyGatherModal, setShowPartyGatherModal] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<GridRoom | null>(null);
  const [pendingEntryDirection, setPendingEntryDirection] = useState<ExitDirection | null>(null);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryTarget, setInventoryTarget] = useState<'player' | 'ally'>('player');
  const [localMapStateCache, setLocalMapStateCache] = useState<LocalMapState | null>(null);
  const [combatEndState, setCombatEndState] = useState<{
    phase: 'victory' | 'defeat';
    result: GridCombatState['result'];
    combatants: GridCombatState['combatants'];
  } | null>(null);
  const [levelUpInfo, setLevelUpInfo] = useState<LevelUpInfo | null>(null);
  const [_showDevTools, _setShowDevTools] = useState(false);

  // Refs
  const localMapRef = useRef<LocalMapViewHandle | null>(null);

  // ==========================================================================
  // Grid Combat Hook
  // ==========================================================================

  const gridCombat = useGridCombat(localMapStateCache, {
    onCombatEnd: (phase, finalState) => {
      console.log('Grid combat ended:', phase, 'rewards:', finalState.result?.rewards);
      setCombatEndState({
        phase,
        result: finalState.result,
        combatants: finalState.combatants,
      });
    },
    onMapStateUpdate: (updatedMap) => {
      setLocalMapStateCache(updatedMap);
      setPlayerTilePosition(updatedMap.playerPosition);
    },
    mapRef: localMapRef,
  });

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Calculate level-up info when combat ends with victory
  useEffect(() => {
    if (!combatEndState || combatEndState.phase !== 'victory' || !combatEndState.result?.rewards) {
      return;
    }

    const rewards = combatEndState.result.rewards;
    const xpGained = rewards.xp || 0;

    const levelUpResult = checkLevelUp(
      playerProgression.xp,
      xpGained,
      (level) => deriveGridCombatStats(level, 'melee')
    );

    if (levelUpResult) {
      setLevelUpInfo(levelUpResult);
      soundManager.play('level_up');
    }
  }, [combatEndState, playerProgression.xp]);

  // Dev tools keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        _setShowDevTools((prev: boolean) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Navigate back to the World Launcher/Splash page
  const handleBackToWorld = useCallback(() => {
    if (worldId) {
      navigate(`/world/${worldId}/launcher`);
    }
  }, [worldId, navigate]);

  // NOTE: These handlers are kept for future use (e.g., travel depot, vehicle, etc.)
  // The PixiMapModal is disconnected from the main UI but still renders if showMap is true.
  const handleOpenMap = useCallback(() => {
    if (!isInCombat) setShowMap(true);
  }, [isInCombat]);

  const handleCloseMap = useCallback(() => {
    setShowMap(false);
  }, []);

  // Suppress unused variable warning - these will be reconnected for fast-travel feature
  void handleOpenMap;

  const handleNavigate = useCallback(async (targetRoomId: string, entryDir?: ExitDirection | null) => {
    if (!worldState) return;

    let foundRoom: GridRoom | undefined;
    for (const row of worldState.grid) {
      for (const room of row) {
        if (room?.id === targetRoomId) {
          foundRoom = room;
          break;
        }
      }
      if (foundRoom) break;
    }

    if (!foundRoom) return;

    // If bonded ally, show party gather modal
    if (activeNpcId && activeNpcName) {
      setPendingDestination(foundRoom);
      setPendingEntryDirection(entryDir || null);
      setShowPartyGatherModal(true);
      setShowMap(false);
      return;
    }

    setShowMap(false);
    await performRoomTransition(foundRoom, false, entryDir);
  }, [worldState, activeNpcId, activeNpcName, performRoomTransition]);

  const handleBringNpcAlong = useCallback(async () => {
    if (!pendingDestination) return;
    setShowPartyGatherModal(false);

    if (activeNpcName) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `*${activeNpcName} follows you into ${pendingDestination.name}*`,
        timestamp: Date.now(),
        metadata: { type: 'npc_follows', npcId: activeNpcId }
      });
    }

    await performRoomTransition(pendingDestination, true, pendingEntryDirection);
    setPendingDestination(null);
    setPendingEntryDirection(null);
  }, [pendingDestination, pendingEntryDirection, activeNpcName, activeNpcId, addMessage, performRoomTransition]);

  const handleLeaveNpcHere = useCallback(async () => {
    if (!pendingDestination) return;
    setShowPartyGatherModal(false);

    if (activeNpcName) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `*${activeNpcName} stays behind*`,
        timestamp: Date.now(),
        metadata: { type: 'npc_stays', npcId: activeNpcId }
      });
    }

    await performRoomTransition(pendingDestination, false, pendingEntryDirection);
    setPendingDestination(null);
    setPendingEntryDirection(null);
  }, [pendingDestination, pendingEntryDirection, activeNpcName, activeNpcId, addMessage, performRoomTransition]);

  const handleClosePartyGatherModal = useCallback(() => {
    setShowPartyGatherModal(false);
    setPendingDestination(null);
    setPendingEntryDirection(null);
  }, []);

  const handleLocalMapTileClick = useCallback(() => {
    // Non-combat tile clicks can be handled here
  }, []);

  const handleLocalMapEntityClick = useCallback((entityId: string) => {
    if (entityId === 'player') {
      setInventoryTarget('player');
      setShowInventoryModal(true);
      return;
    }
    if (entityId === activeNpcId && !isInCombat) {
      setInventoryTarget('ally');
      setShowInventoryModal(true);
      return;
    }
    handleSelectNpc(entityId);
  }, [activeNpcId, isInCombat, handleSelectNpc]);

  const handleLocalMapExitClick = useCallback((exit: { direction: ExitDirection; targetRoomId: string }) => {
    handleNavigate(exit.targetRoomId, exit.direction);
  }, [handleNavigate]);

  const handleEnterThreatZone = useCallback(() => {
    // Threat zone entry triggers combat via NPC interaction hook
  }, []);

  const handleLocalMapStateChange = useCallback((newState: LocalMapState) => {
    setLocalMapStateCache(newState);
  }, []);

  const handleCombatContinue = useCallback(() => {
    setCombatEndState(null);
    setIsInCombat(false);
    gridCombat.endCombat();
    setLevelUpInfo(null);
  }, [gridCombat, setIsInCombat]);

  const handleInventoryChange = useCallback((newInventory: typeof playerInventory) => {
    if (inventoryTarget === 'player') {
      setPlayerInventory(newInventory);
    } else {
      setAllyInventory(newInventory);
    }
    debouncedSaveRuntimeState();
  }, [inventoryTarget, setPlayerInventory, setAllyInventory, debouncedSaveRuntimeState]);

  const handleCloseInventory = useCallback(() => {
    setShowInventoryModal(false);
  }, []);

  const handleDismissAllyFromInventory = useCallback(() => {
    setShowInventoryModal(false);
    dismissBondedAlly();
  }, [dismissBondedAlly]);

  // ==========================================================================
  // Memoized Values
  // ==========================================================================

  const timeDisplay = timeConfig.enableDayNightCycle
    ? `Day ${timeState.currentDay} - ${getTimeOfDayDescription(timeState.timeOfDay)}`
    : undefined;

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

  const roomBackgroundImage = currentRoom?.image_path
    ? `/api/world-assets/${currentRoom.image_path}`
    : currentRoom?.id
      ? roomApi.getRoomImageUrl(currentRoom.id)
      : null;

  const playerProgressForHUD = useMemo(() => {
    const progress = getXPProgress(playerProgression.xp, playerProgression.level);
    return {
      level: playerProgression.level,
      xpCurrent: progress.current,
      xpNeeded: progress.needed,
      gold: playerProgression.gold,
    };
  }, [playerProgression.xp, playerProgression.level, playerProgression.gold]);

  // ==========================================================================
  // Early Returns (Loading/Error States)
  // ==========================================================================

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

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <>
      <LoadingScreen
        visible={isTransitioning}
        sourceRoomName={transitionState.sourceRoomName}
        targetRoomName={transitionState.targetRoomName}
        phase={transitionState.phase}
        progress={transitionState.progress}
      />

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
              key={currentRoom.id}
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
            {combatEndState && (
              <CombatEndScreen
                phase={combatEndState.phase}
                result={combatEndState.result}
                combatants={combatEndState.combatants}
                levelUpInfo={levelUpInfo}
                genre="fantasy"
                onContinue={handleCombatContinue}
              />
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

      {showPartyGatherModal && pendingDestination && (
        <PartyGatherModal
          npcName={activeNpcName}
          destinationRoomName={pendingDestination.name}
          onBringAlong={handleBringNpcAlong}
          onLeaveHere={handleLeaveNpcHere}
          onClose={handleClosePartyGatherModal}
        />
      )}

      {showJournal && (
        <JournalModal
          sessionNotes={sessionNotes}
          setSessionNotes={setSessionNotes}
          onClose={() => setShowJournal(false)}
        />
      )}

      {showInventoryModal && (
        <InventoryModal
          characterId={inventoryTarget === 'player' ? (currentUser?.id || 'player') : (activeNpcId || '')}
          characterName={inventoryTarget === 'player' ? (currentUser?.name || 'Player') : activeNpcName}
          characterImagePath={inventoryTarget === 'player' ? playerImagePath : companionImagePath}
          currentHp={deriveGridCombatStats(playerProgression.level).maxHp}
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
 * WorldPlayViewRefactored wrapped with ErrorBoundary.
 */
function WorldPlayViewRefactoredWithErrorBoundary(props: WorldPlayViewProps) {
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
      onError={(error) => console.error('WorldPlayViewRefactored error:', error)}
    >
      <WorldPlayViewRefactored {...props} />
    </ErrorBoundary>
  );
}

export default WorldPlayViewRefactoredWithErrorBoundary;
