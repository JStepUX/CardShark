/**
 * @file useCombatManager.ts
 * @description Manages combat lifecycle: end-of-combat processing, XP/loot rewards,
 * post-combat narrative generation, and threat zone entry.
 * Extracted from WorldPlayView.tsx to reduce complexity.
 *
 * Handles:
 * - Combat end state tracking (victory/defeat phase + result)
 * - Level-up detection and info
 * - Loot generation on combat end
 * - handleCombatContinue: processes rewards, updates NPCs, clears combat
 * - generatePostCombatNarrative: streams LLM-generated post-combat text
 * - handleEnterThreatZone: initiates grid combat from map threat zone
 */
import { useState, useEffect, useCallback, useRef, type MutableRefObject } from 'react';
import type { GridCombatState } from '../types/combat';
import { deriveGridCombatStats } from '../types/combat';
import type { CharacterCard } from '../types/schema';
import type { CharacterInventory } from '../types/inventory';
import { addItemToInventory } from '../types/inventory';
import type { TilePosition, LocalMapState } from '../types/localMap';
import type { RoomInstanceState } from '../types/worldCard';
import type { GridRoom, CombatDisplayNPC } from '../types/worldGrid';
import { checkLevelUp, type LevelUpInfo, type PlayerProgression } from '../utils/progressionUtils';
import { buildCombatNarrativeSummary, buildPostCombatPrompt, buildDefeatPrompt } from '../services/combat/postCombatNarrative';
import { generateCombatLoot } from '../services/loot/lootGenerator';
import { soundManager } from '../components/world/pixi/local';
import { executeWorldGeneration, streamToMessage } from '../services/worldGenerationService';


interface GridCombatHandle {
  combatState: GridCombatState | null;
  startCombat: (mapState: LocalMapState, playerId: string, options?: {
    playerInventory?: CharacterInventory;
    allyInventory?: CharacterInventory;
  }) => void;
  endCombat: () => void;
}

export interface CombatEndState {
  phase: 'victory' | 'defeat';
  result: GridCombatState['result'];
  combatants: GridCombatState['combatants'];
}

interface UseCombatManagerOptions {
  currentRoom: GridRoom | null;
  roomNpcs: CombatDisplayNPC[];
  setRoomNpcs: (updater: (prev: CombatDisplayNPC[]) => CombatDisplayNPC[]) => void;
  roomStatesRef: MutableRefObject<Record<string, RoomInstanceState>>;
  playerProgression: PlayerProgression;
  setPlayerProgression: (progression: PlayerProgression) => void;
  playerInventory: CharacterInventory;
  setPlayerInventory: (inventory: CharacterInventory) => void;
  allyInventory: CharacterInventory | null;
  setIsInCombat: (inCombat: boolean) => void;
  setLocalMapStateCache: (state: LocalMapState | null) => void;
  // For narrative generation
  activeNpcId: string | undefined;
  activeNpcName: string;
  activeNpcCard: CharacterCard | null;
  characterData: CharacterCard | null;
  apiConfig: any;
  addMessage: (message: any) => void;
  setMessages: (messages: any) => void;
  // For threat zone entry
  currentUser: { id?: string; name?: string } | null;
  // For defeat respawn: navigate to starting room
  onDefeatRespawn?: () => Promise<void>;
  /** Chat session UUID — enables LogitShaper + session tracking for combat narratives */
  chatSessionUuid?: string;
  /** Session notes (Journal) — injected into combat narrative prompts */
  sessionNotes?: string;
}

interface UseCombatManagerReturn {
  combatEndState: CombatEndState | null;
  levelUpInfo: LevelUpInfo | null;
  /** Callback for useGridCombat's onCombatEnd option — no dependency on gridCombat */
  onCombatEnd: (phase: 'victory' | 'defeat', finalState: GridCombatState) => void;
  /** Ref to set with gridCombat after useGridCombat is called */
  gridCombatRef: MutableRefObject<GridCombatHandle | null>;
  handleCombatContinue: () => Promise<void>;
  handleEnterThreatZone: (hostileIds: string[], currentPosition: TilePosition, mapState: LocalMapState) => void;
}

export function useCombatManager(options: UseCombatManagerOptions): UseCombatManagerReturn {
  const {
    currentRoom,
    roomNpcs,
    setRoomNpcs,
    roomStatesRef,
    playerProgression,
    setPlayerProgression,
    playerInventory,
    setPlayerInventory,
    allyInventory,
    setIsInCombat,
    setLocalMapStateCache,
    activeNpcId,
    activeNpcName,
    activeNpcCard,
    characterData,
    apiConfig,
    addMessage,
    setMessages,
    currentUser,
    onDefeatRespawn,
    chatSessionUuid,
    sessionNotes,
  } = options;

  // Ref for gridCombat — set by the view after useGridCombat is called to break circular dependency
  const gridCombatRef = useRef<GridCombatHandle | null>(null);

  // Respawn HP penalty: fraction of max HP for next combat after defeat (1.0 = full, 0.25 = 25%)
  const respawnHpPercentRef = useRef<number>(1.0);

  // Abort controller for in-flight combat narrative generation
  const narrativeAbortRef = useRef<AbortController | null>(null);

  // Combat end screen state (tracks result until player clicks Continue)
  const [combatEndState, setCombatEndState] = useState<CombatEndState | null>(null);

  // Level-up info for display
  const [levelUpInfo, setLevelUpInfo] = useState<LevelUpInfo | null>(null);

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

  // Callback for useGridCombat's onCombatEnd
  const onCombatEnd = useCallback((phase: 'victory' | 'defeat', finalState: GridCombatState) => {
    console.log('Grid combat ended:', phase, 'rewards:', finalState.result?.rewards);
    // Generate loot eagerly so CombatEndScreen can display it
    let resultWithLoot = finalState.result;
    if (phase === 'victory' && resultWithLoot?.rewards) {
      const defeatedEnemies = (resultWithLoot.defeatedEnemies || [])
        .map(id => finalState.combatants[id])
        .filter(Boolean)
        .map(c => ({ level: c.level, isDead: c.isDead ?? false }));
      if (defeatedEnemies.length > 0) {
        const lootItems = generateCombatLoot(defeatedEnemies);
        if (lootItems.length > 0) {
          resultWithLoot = {
            ...resultWithLoot,
            rewards: { ...resultWithLoot.rewards, items: lootItems },
          };
        }
      }
    }
    // Use finalState directly (passed from reducer) to avoid stale closure issues
    setCombatEndState({
      phase,
      result: resultWithLoot,
      combatants: finalState.combatants,
    });
    // Don't set isInCombat false yet - wait for player to click Continue
  }, []);

  // Generate post-combat narrative using LLM
  const generatePostCombatNarrative = useCallback(async (combatState: GridCombatState) => {
    if (!apiConfig || !currentRoom) return;

    // Build narrative summary from combat state
    const summary = buildCombatNarrativeSummary(combatState);

    // Determine narrator: bonded ally (if present) or world narrator
    const hasAllyNarrator = activeNpcId && activeNpcCard && summary.ally;

    // Build the appropriate prompt (system instruction for the LLM)
    const systemInstruction = combatState.phase === 'defeat'
      ? buildDefeatPrompt(summary)
      : buildPostCombatPrompt(summary, !!hasAllyNarrator);

    console.log('[PostCombat] Generating narrative, ally narrator:', hasAllyNarrator);

    // Use ally's character card if available, otherwise world character
    const narratorCard = hasAllyNarrator && activeNpcCard
      ? activeNpcCard
      : characterData;

    if (!narratorCard) {
      console.warn('[PostCombat] No narrator card available');
      return;
    }

    const narratorName = hasAllyNarrator ? activeNpcName : (narratorCard.data?.name || 'Narrator');

    // Create placeholder message for streaming
    const narrativeMessageId = crypto.randomUUID();
    addMessage({
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
    });

    // Cancel any previous in-flight narrative
    narrativeAbortRef.current?.abort();

    try {
      const { response, abortController } = await executeWorldGeneration({
        characterData: narratorCard,
        apiConfig: apiConfig as Record<string, unknown>,
        systemInstruction,
        characterName: narratorName,
        userName: currentUser?.name || 'User',
        chatSessionUuid,
        sessionNotes,
        generationType: 'combat_narrative',
      });
      narrativeAbortRef.current = abortController;

      if (!response.ok) {
        throw new Error('Failed to generate post-combat narrative');
      }

      await streamToMessage({
        response,
        messageId: narrativeMessageId,
        characterName: hasAllyNarrator ? activeNpcName : undefined,
        setMessages: setMessages as any,
        fallbackText: '*The battle is over.*',
        signal: abortController.signal,
      });

      console.log('[PostCombat] Narrative generated successfully');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[PostCombat] Error generating narrative:', err);
      (setMessages as any)((prev: any) => prev.map((msg: any) =>
        msg.id === narrativeMessageId
          ? { ...msg, content: '*The dust settles as the battle ends.*' }
          : msg
      ));
    }
  }, [apiConfig, currentRoom, activeNpcId, activeNpcCard, activeNpcName, characterData, addMessage, setMessages, currentUser, chatSessionUuid, sessionNotes]);

  // Handle player clicking Continue on combat end screen
  const handleCombatContinue = useCallback(async () => {
    const gc = gridCombatRef.current;
    if (!combatEndState || !currentRoom) {
      setCombatEndState(null);
      setIsInCombat(false);
      gc?.endCombat();
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
      log: gc?.combatState?.log || [],
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

        // Add pre-generated loot items to player inventory
        const lootItems = rewards.items || [];
        if (lootItems.length > 0) {
          let updatedInventory = playerInventory;
          for (const item of lootItems) {
            updatedInventory = addItemToInventory(updatedInventory, item);
          }
          setPlayerInventory(updatedInventory);
          console.log('[Progression] Loot items added to inventory:', lootItems.map(i => i.name));
        }
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
    gc?.endCombat();

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

    // On defeat: fast travel to starting room with reduced HP for next combat
    if (combatEndState.phase === 'defeat' && onDefeatRespawn) {
      respawnHpPercentRef.current = 0.25;
      // Navigate to starting room after a short delay (let narrative start streaming first)
      setTimeout(() => {
        onDefeatRespawn();
      }, 1500);
    }
  }, [combatEndState, currentRoom, apiConfig, playerProgression, levelUpInfo, roomNpcs,
      generatePostCombatNarrative, setIsInCombat, setRoomNpcs, setPlayerProgression, setPlayerInventory,
      playerInventory, roomStatesRef, onDefeatRespawn]);

  // Handle entering a threat zone (triggers grid combat)
  const handleEnterThreatZone = useCallback((hostileIds: string[], currentPosition: TilePosition, mapState: LocalMapState) => {
    console.log('Entered threat zone, hostile IDs:', hostileIds, 'at position:', currentPosition);

    // Find hostile NPCs
    const hostiles = roomNpcs.filter(npc => hostileIds.includes(npc.id) && npc.hostile && !npc.isIncapacitated);
    if (hostiles.length === 0) return;

    // Use the map state passed from LocalMapView (has correct player position)
    // This avoids the stale cache issue where localMapStateCache hasn't updated yet
    const playerId = currentUser?.id || 'player';

    // Update cache with the correct position before starting combat
    setLocalMapStateCache(mapState);

    // Start combat with player and ally inventories for weapon stats
    // Apply respawn HP penalty if recovering from a previous defeat
    const hpPercent = respawnHpPercentRef.current;
    gridCombatRef.current?.startCombat(mapState, playerId, {
      playerInventory,
      allyInventory: allyInventory || undefined,
      ...(hpPercent < 1 ? { playerHpPercent: hpPercent } : {}),
    });
    // Reset the penalty after it's been applied
    respawnHpPercentRef.current = 1.0;
    setIsInCombat(true);
  }, [roomNpcs, currentUser, playerInventory, allyInventory, setLocalMapStateCache, setIsInCombat]);

  return {
    combatEndState,
    levelUpInfo,
    onCombatEnd,
    gridCombatRef,
    handleCombatContinue,
    handleEnterThreatZone,
  };
}
