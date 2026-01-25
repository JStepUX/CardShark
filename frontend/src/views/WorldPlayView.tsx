/**
 * @file WorldPlayView.tsx
 * @description Main orchestrator for World Card gameplay. Integrates the existing ChatView
 *              with SidePanel (in world mode) and MapModal for navigation.
 * @dependencies worldApi (V2), roomApi, ChatView, SidePanel, MapModal, CombatModal
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChat } from '../contexts/ChatContext';
import { useCharacter } from '../contexts/CharacterContext';
import { useAPIConfig } from '../contexts/APIConfigContext';
import ChatView from '../components/chat/ChatView';
import { SidePanel } from '../components/SidePanel';
import { JournalModal } from '../components/SidePanel/JournalModal';
import { PartyGatherModal } from '../components/world/PartyGatherModal';
import { PixiMapModal } from '../components/world/pixi/PixiMapModal';
import { CombatModal } from '../components/combat';
import { worldApi } from '../api/worldApi';
import { roomApi } from '../api/roomApi';
import type { WorldCard } from '../types/worldCard';
import type { CharacterCard } from '../types/schema';
import type { GridWorldState, GridRoom, DisplayNPC } from '../types/worldGrid';
import type { CombatInitData, CombatState } from '../types/combat';
import { resolveNpcDisplayData } from '../utils/worldStateApi';
import { roomCardToGridRoom, placementToGridRoomStub } from '../utils/roomCardAdapter';
import { injectRoomContext, injectNPCContext } from '../utils/worldCardAdapter';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { WorldLoadError } from '../components/world/WorldLoadError';
import { calculateCombatAffinity } from '../utils/combatAffinityCalculator';
import type { NPCRelationship, TimeState, TimeConfig } from '../types/worldRuntime';
import { createDefaultRelationship, updateRelationshipAffinity, resetDailyAffinity } from '../utils/affinityUtils';
import { useEmotionDetection } from '../hooks/useEmotionDetection';
import { dispatchScrollToBottom } from '../hooks/useScrollToBottom';
import { calculateSentimentAffinity, updateSentimentHistory, resetSentimentAfterGain } from '../utils/sentimentAffinityCalculator';
import { createDefaultTimeState, advanceTime } from '../utils/timeUtils';

// Extended DisplayNPC with combat info from RoomNPC
interface CombatDisplayNPC extends DisplayNPC {
  hostile?: boolean;
  monster_level?: number;
}

interface WorldPlayViewProps {
  worldId?: string;
}

export function WorldPlayView({ worldId: propWorldId }: WorldPlayViewProps) {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
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

  // State
  const [worldCard, setWorldCard] = useState<WorldCard | null>(null);
  const [worldState, setWorldState] = useState<GridWorldState | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GridRoom | null>(null);
  const [roomNpcs, setRoomNpcs] = useState<CombatDisplayNPC[]>([]);
  const [activeNpcId, setActiveNpcId] = useState<string | undefined>(); // Active responder, NOT session
  const [activeNpcName, setActiveNpcName] = useState<string>(''); // For PartyGatherModal display
  const [activeNpcCard, setActiveNpcCard] = useState<CharacterCard | null>(null); // Active NPC's character card
  const [showMap, setShowMap] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showPartyGatherModal, setShowPartyGatherModal] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<GridRoom | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
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

  // Combat state
  const [combatInitData, setCombatInitData] = useState<CombatInitData | null>(null);
  const [isInCombat, setIsInCombat] = useState(false);

  // Emotion detection for sentiment-based affinity
  const { currentEmotion } = useEmotionDetection(messages, activeNpcName);

  // Load world data from API (V2) - LAZY LOADING
  // Only fetches world card + starting room (2 API calls instead of N+1)
  useEffect(() => {
    async function loadWorld() {
      if (!worldId) {
        setError('No world ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Load world card (V2) - single API call
        const world = await worldApi.getWorld(worldId);
        setWorldCard(world);

        const worldData = world.data.extensions.world_data;
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
        const currentPlacement = worldData.rooms.find(
          r => r.grid_position.x === playerPos.x && r.grid_position.y === playerPos.y
        );

        if (currentPlacement) {
          try {
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
            const npcsWithCombatData: CombatDisplayNPC[] = resolvedNpcs.map(npc => {
              const roomNpc = fullCurrentRoom.npcs.find(rn => rn.character_uuid === npc.id);
              return {
                ...npc,
                hostile: roomNpc?.hostile,
                monster_level: roomNpc?.monster_level,
              };
            });
            setRoomNpcs(npcsWithCombatData);

            // Debug logging for NPC data
            console.log('Initial room NPCs loaded:', npcsWithCombatData);
            console.log('Placement instance_npcs:', currentPlacement.instance_npcs);
            console.log('Room card NPCs:', fullCurrentRoom.npcs);

            // Update worldState with the full room
            setWorldState(prev => prev ? { ...prev, grid } : null);

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
  }, [worldId]);

  // Inject context into character data for LLM generation
  // Two modes: Room mode (world narrator) or NPC mode (specific NPC)
  useEffect(() => {
    if (activeNpcCard && currentRoom) {
      // NPC conversation mode - use NPC's character card with world+room context
      const worldCharCard = characterData; // World card loaded as base character
      const modifiedNpcCard = injectNPCContext(activeNpcCard, worldCharCard, currentRoom);
      setCharacterDataOverride(modifiedNpcCard);
    } else if (characterData && currentRoom) {
      // Room mode - use world card with room context
      const modifiedCharacterData = injectRoomContext(characterData, currentRoom);
      setCharacterDataOverride(modifiedCharacterData);
    } else {
      // Clear override if no room is set
      setCharacterDataOverride(null);
    }
  }, [characterData, currentRoom, activeNpcCard, setCharacterDataOverride]);

  // Track sentiment and grant affinity for positive conversations
  useEffect(() => {
    // Only track sentiment when actively talking to an NPC
    if (!activeNpcId || !activeNpcName || !currentEmotion) return;

    // Get or create relationship
    const relationship = npcRelationships[activeNpcId] || createDefaultRelationship(activeNpcId);

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
      [activeNpcId]: updatedRelationship,
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
        [activeNpcId]: resetRelationship,
      }));

      // Log the change
      console.log(`[Affinity] ${activeNpcName}: ${updatedRelationship.affinity} -> ${finalRelationship.affinity} (${sentimentResult.affinityDelta > 0 ? '+' : ''}${sentimentResult.affinityDelta}) - ${sentimentResult.reason} (avg valence: ${Math.round(sentimentResult.averageValence)})`);

      // Add notification to chat
      const emoji = sentimentResult.affinityDelta > 0 ? '❤️' : '💔';
      addMessage({
        id: crypto.randomUUID(),
        role: 'system' as const,
        content: `*${activeNpcName} ${sentimentResult.affinityDelta > 0 ? '+' : ''}${sentimentResult.affinityDelta} ${emoji} (${sentimentResult.reason})*`,
        timestamp: Date.now(),
        metadata: {
          type: 'affinity_change',
          source: 'sentiment',
          npcId: activeNpcId,
          delta: sentimentResult.affinityDelta,
          reason: sentimentResult.reason,
        }
      });
    }
  }, [messages.length, currentEmotion, activeNpcId, activeNpcName, addMessage, timeState.currentDay]);

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


  // Handle NPC selection - either starts combat (hostile) or sets active responder
  const handleSelectNpc = useCallback(async (npcId: string) => {
    if (!currentRoom) return;

    const npc = roomNpcs.find((n: CombatDisplayNPC) => n.id === npcId);
    if (!npc) {
      console.error(`NPC not found: ${npcId}`);
      return;
    }

    // Prevent re-clicking already bound allies
    if (!npc.hostile && activeNpcId === npcId) {
      console.log(`NPC ${npc.name} is already bound. Use regenerate button to get a new greeting.`);
      return;
    }

    // Check if NPC is hostile - initiate combat instead of conversation
    if (npc.hostile) {
      // Gather all hostile NPCs in the room for combat
      const hostileNpcs = roomNpcs.filter((n: CombatDisplayNPC) => n.hostile);

      // Include bound NPC as ally if one is active
      const allies: Array<{
        id: string;
        name: string;
        level: number;
        imagePath: string | null;
      }> = [];

      if (activeNpcId && activeNpcName) {
        // Find the bound NPC in roomNpcs
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

    // Non-hostile NPC - set as active responder (changes who responds, NOT the session)
    setActiveNpcId(npcId);
    setActiveNpcName(npc.name);

    try {
      // Fetch full character card data for the NPC
      const response = await fetch(`/api/character/${npcId}`);
      if (!response.ok) {
        console.error('Failed to load NPC character data');
        return;
      }

      const npcCharacterData = await response.json();

      // Store the NPC's character card for context injection
      setActiveNpcCard(npcCharacterData);

      // CRITICAL: Do NOT call setCharacterDataInContext here
      // That would trigger a new session load
      // The context injection effect will handle using the NPC's card

      // Check if API is configured
      if (!apiConfig) {
        console.error('No API configuration available for greeting generation');
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: `*${npc.name} enters the scene*`,
          timestamp: Date.now(),
          metadata: {
            type: 'npc_introduction',
            npcId: npcId,
            roomId: currentRoom.id,
            characterId: npcCharacterData.data?.character_uuid,
            generated: false
          }
        });
        return;
      }

      // Inject world + room context into NPC character data for greeting generation
      // This ensures the NPC's introduction is aware of their current location
      const worldCharCard = characterData; // World card loaded as base character
      const npcWithContext = injectNPCContext(npcCharacterData, worldCharCard, currentRoom);

      // Create a placeholder message immediately for visual feedback
      const introMessageId = crypto.randomUUID();
      const placeholderMessage = {
        id: introMessageId,
        role: 'assistant' as const,
        content: '...',
        timestamp: Date.now(),
        metadata: {
          type: 'npc_introduction',
          npcId: npcId,
          roomId: currentRoom.id,
          characterId: npcCharacterData.data?.character_uuid,
          generated: true
        }
      };

      addMessage(placeholderMessage);

      // Use the /api/generate-greeting endpoint with context-injected NPC data
      const greetingResponse = await fetch('/api/generate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: npcWithContext,
          api_config: apiConfig // Use actual API config instead of null
        })
      });

      if (!greetingResponse.ok) {
        console.error('Failed to generate NPC introduction');
        // Update the placeholder with fallback message
        (setMessages as any)((prev: any) => prev.map((msg: any) =>
          msg.id === introMessageId
            ? { ...msg, content: `*${npc.name} enters the scene*` }
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
          // Type assertion needed because ChatContext type definition doesn't include functional form
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
              content: generatedIntro.trim() || `*${npc.name} enters the scene*`
            }
            : msg
        ));

        console.log(`Summoned NPC: ${npc.name} (active responder, same session)`);
      } catch (streamErr) {
        console.error('Error streaming NPC greeting:', streamErr);
        // Update with fallback on error
        (setMessages as any)((prev: any) => prev.map((msg: any) =>
          msg.id === introMessageId
            ? { ...msg, content: `*${npc.name} enters the scene*` }
            : msg
        ));
      }
    } catch (err) {
      console.error('Error summoning NPC:', err);
    }
  }, [roomNpcs, currentRoom, addMessage, characterData, worldId, apiConfig, currentUser]);

  // Handle combat end - process results and update state
  const handleCombatEnd = useCallback(async (result: CombatState['result'], finalState: CombatState) => {
    setIsInCombat(false);
    setCombatInitData(null);

    if (!result || !currentRoom) return;

    // Build combat result context for AI narrative generation
    const { buildCombatResultContext } = await import('../services/combat/combatResultContext');
    const combatContext = buildCombatResultContext(finalState);

    if (result.outcome === 'victory') {
      // Remove defeated enemies from the room
      const defeatedIds = new Set(result.defeatedEnemies);

      // Update room NPCs to remove defeated hostile NPCs
      setRoomNpcs((prev: CombatDisplayNPC[]) => prev.filter((npc: CombatDisplayNPC) => !defeatedIds.has(npc.id)));

      // Generate AI narrative for victory
      if (apiConfig && characterData) {
        const narrativeMessageId = crypto.randomUUID();
        const placeholderMessage = {
          id: narrativeMessageId,
          role: 'assistant' as const,
          content: '...',
          timestamp: Date.now(),
          metadata: {
            type: 'combat_victory',
            roomId: currentRoom.id,
            rewards: result.rewards,
          }
        };

        addMessage(placeholderMessage);

        try {
          // Build prompt for AI narrative generation
          const narrativePrompt = `Combat has just ended in victory. Generate a vivid, dramatic return-to-RP narrative describing the aftermath of the battle. Reference specific events from the combat context below. Keep it concise (2-3 paragraphs max).

Combat Context:
${JSON.stringify(combatContext, null, 2)}

Style: Write in second person, present tense. Acknowledge the player's victory, mention notable moments, and transition back to the room setting.`;

          const response = await fetch('/api/generate-greeting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              character_data: characterData,
              api_config: apiConfig,
              custom_prompt: narrativePrompt
            })
          });

          if (!response.ok) {
            throw new Error('Failed to generate combat narrative');
          }

          // Stream the AI response
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

              // Trigger scroll-to-bottom in ChatView during streaming
              dispatchScrollToBottom();
            }, isFinal ? 0 : bufferInterval);
          };

          for await (const chunk of PromptHandler.streamResponse(response)) {
            updateNarrativeContent(chunk);
          }

          // Flush any remaining buffer
          if (buffer.length > 0) {
            updateNarrativeContent('', true);
          }

          // Final update with complete content
          (setMessages as any)((prev: any) => prev.map((msg: any) =>
            msg.id === narrativeMessageId
              ? {
                ...msg,
                content: generatedNarrative.trim() || `*Victory! You earned ${result.rewards?.xp || 0} XP and ${result.rewards?.gold || 0} gold.*`
              }
              : msg
          ));

        } catch (err) {
          console.error('Error generating combat narrative:', err);
          // Fallback to simple message
          (setMessages as any)((prev: any) => prev.map((msg: any) =>
            msg.id === narrativeMessageId
              ? { ...msg, content: `*Victory! You earned ${result.rewards?.xp || 0} XP and ${result.rewards?.gold || 0} gold.*` }
              : msg
          ));
        }
      } else {
        // No API config, use simple message
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: `*Victory! You earned ${result.rewards?.xp || 0} XP and ${result.rewards?.gold || 0} gold.*`,
          timestamp: Date.now(),
          metadata: {
            type: 'combat_victory',
            roomId: currentRoom.id,
            rewards: result.rewards,
          }
        });
      }

      // Calculate and apply affinity changes from combat with daily cap
      const affinityChanges = calculateCombatAffinity(
        finalState,
        npcRelationships,
        timeState.currentDay,
        60 // daily cap
      );
      if (affinityChanges.length > 0) {
        setNpcRelationships(prev => {
          const updated = { ...prev };
          affinityChanges.forEach(({ npcUuid, delta, reason }) => {
            const currentRelationship = updated[npcUuid] || createDefaultRelationship(npcUuid);
            const newRelationship = updateRelationshipAffinity(currentRelationship, delta);

            // Track daily gain
            newRelationship.affinity_gained_today += delta;
            newRelationship.affinity_day_started = timeState.currentDay;

            updated[npcUuid] = newRelationship;

            // Log affinity change with daily tracking
            console.log(`[Affinity] ${npcUuid}: ${currentRelationship.affinity} -> ${newRelationship.affinity} (+${delta}) (${newRelationship.affinity_gained_today}/60 today) - ${reason}`);
          });
          return updated;
        });

        // Add affinity change notification to chat
        const affinityMessage = affinityChanges.map(({ npcUuid, delta }) => {
          // Try to find NPC name from roomNpcs
          const npc = roomNpcs.find((n: CombatDisplayNPC) => n.id === npcUuid);
          const npcName = npc?.name || 'Ally';
          return `${npcName} ${delta > 0 ? '+' : ''}${delta} ❤️`;
        }).join(', ');

        addMessage({
          id: crypto.randomUUID(),
          role: 'system' as const,
          content: `*${affinityMessage}*`,
          timestamp: Date.now(),
          metadata: {
            type: 'affinity_change',
            changes: affinityChanges,
          }
        });
      }

      // TODO: Update currentRoom.npcs in worldState to persist defeated enemies
      // This would require updating the world card backend

    } else if (result.outcome === 'fled') {
      // Generate AI narrative for fleeing
      if (apiConfig && characterData) {
        const narrativeMessageId = crypto.randomUUID();
        const placeholderMessage = {
          id: narrativeMessageId,
          role: 'assistant' as const,
          content: '...',
          timestamp: Date.now(),
          metadata: {
            type: 'combat_fled',
            roomId: currentRoom.id,
          }
        };

        addMessage(placeholderMessage);

        try {
          const narrativePrompt = `Combat has just ended with the player fleeing. Generate a tense, dramatic narrative describing their escape. Reference the combat context below. Keep it concise (1-2 paragraphs).

Combat Context:
${JSON.stringify(combatContext, null, 2)}

Style: Write in second person, present tense. Convey the tension of escape, mention the player's condition, and note that the enemies remain.`;

          const response = await fetch('/api/generate-greeting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              character_data: characterData,
              api_config: apiConfig,
              custom_prompt: narrativePrompt
            })
          });

          if (!response.ok) {
            throw new Error('Failed to generate flee narrative');
          }

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

              // Trigger scroll-to-bottom in ChatView during streaming
              dispatchScrollToBottom();
            }, isFinal ? 0 : bufferInterval);
          };

          for await (const chunk of PromptHandler.streamResponse(response)) {
            updateNarrativeContent(chunk);
          }

          if (buffer.length > 0) {
            updateNarrativeContent('', true);
          }

          (setMessages as any)((prev: any) => prev.map((msg: any) =>
            msg.id === narrativeMessageId
              ? {
                ...msg,
                content: generatedNarrative.trim() || '*You managed to escape from combat. The enemies remain in the area...*'
              }
              : msg
          ));

        } catch (err) {
          console.error('Error generating flee narrative:', err);
          (setMessages as any)((prev: any) => prev.map((msg: any) =>
            msg.id === narrativeMessageId
              ? { ...msg, content: '*You managed to escape from combat. The enemies remain in the area...*' }
              : msg
          ));
        }
      } else {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: '*You managed to escape from combat. The enemies remain in the area...*',
          timestamp: Date.now(),
          metadata: {
            type: 'combat_fled',
            roomId: currentRoom.id,
          }
        });
      }

      // Note: NPCs are NOT removed - they're still there if player returns

    } else if (result.outcome === 'defeat') {
      // Generate AI narrative for defeat
      if (apiConfig && characterData) {
        const narrativeMessageId = crypto.randomUUID();
        const placeholderMessage = {
          id: narrativeMessageId,
          role: 'assistant' as const,
          content: '...',
          timestamp: Date.now(),
          metadata: {
            type: 'combat_defeat',
            roomId: currentRoom.id,
          }
        };

        addMessage(placeholderMessage);

        try {
          const narrativePrompt = `Combat has just ended in defeat. Generate a grim, dramatic narrative describing the player's defeat and awakening. Reference the combat context below. Keep it concise (1-2 paragraphs).

Combat Context:
${JSON.stringify(combatContext, null, 2)}

Style: Write in second person, present tense. Convey the weight of defeat, mention how the player fell, and describe awakening at the starting area.`;

          const response = await fetch('/api/generate-greeting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              character_data: characterData,
              api_config: apiConfig,
              custom_prompt: narrativePrompt
            })
          });

          if (!response.ok) {
            throw new Error('Failed to generate defeat narrative');
          }

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

              // Trigger scroll-to-bottom in ChatView during streaming
              dispatchScrollToBottom();
            }, isFinal ? 0 : bufferInterval);
          };

          for await (const chunk of PromptHandler.streamResponse(response)) {
            updateNarrativeContent(chunk);
          }

          if (buffer.length > 0) {
            updateNarrativeContent('', true);
          }

          (setMessages as any)((prev: any) => prev.map((msg: any) =>
            msg.id === narrativeMessageId
              ? {
                ...msg,
                content: generatedNarrative.trim() || '*You have been defeated. You awaken at the starting area...*'
              }
              : msg
          ));

        } catch (err) {
          console.error('Error generating defeat narrative:', err);
          (setMessages as any)((prev: any) => prev.map((msg: any) =>
            msg.id === narrativeMessageId
              ? { ...msg, content: '*You have been defeated. You awaken at the starting area...*' }
              : msg
          ));
        }
      } else {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: '*You have been defeated. You awaken at the starting area...*',
          timestamp: Date.now(),
          metadata: {
            type: 'combat_defeat',
            roomId: currentRoom.id,
          }
        });
      }

      // TODO: Reset player to starting position
      // TODO: Apply defeat penalties
    }
  }, [currentRoom, addMessage, apiConfig, characterData, setMessages]);

  // Handle dismissing a bound NPC
  const handleDismissNpc = useCallback((npcId: string) => {
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
  const performRoomTransition = useCallback(async (
    targetRoomStub: GridRoom,
    keepActiveNpc: boolean = false
  ) => {
    if (!worldState || !worldId || !worldCard) return;

    // PRUNE MESSAGES: Keep only the last 2 messages for continuity
    if (messages.length > 0) {
      const lastTwoMessages = messages.slice(-2);
      setMessages(lastTwoMessages);
      console.log(`Pruned messages: kept last ${lastTwoMessages.length} messages for continuity`);
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
    // We detect stubs by checking if introduction_text is empty AND description is brief
    // (stubs have empty introduction_text because that's not cached in placements)
    let targetRoom = targetRoomStub;
    const worldData = worldCard.data.extensions.world_data;
    const placement = worldData.rooms.find(r => r.room_uuid === targetRoomStub.id);

    if (placement) {
      try {
        // Always fetch full room data for the destination
        // This ensures we have introduction_text, description, lore, etc.
        const roomCard = await roomApi.getRoom(placement.room_uuid);
        targetRoom = roomCardToGridRoom(roomCard, { x: foundX, y: foundY }, placement);

        // Update the grid with full room data for future reference
        const newGrid = [...worldState.grid.map(row => [...row])];
        if (foundY >= 0 && foundY < newGrid.length && foundX >= 0 && foundX < newGrid[0].length) {
          newGrid[foundY][foundX] = targetRoom;
        }

        setWorldState(prev => prev ? {
          ...prev,
          grid: newGrid,
          player_position: { x: foundX, y: foundY },
        } : null);

        console.log(`Lazy loaded room: ${targetRoom.name}`);
      } catch (err) {
        console.error(`Failed to fetch room ${targetRoomStub.id}:`, err);
        // Fall back to stub data
      }
    }

    // Update local state
    setCurrentRoom(targetRoom);

    // Clear active NPC unless explicitly keeping them
    if (!keepActiveNpc) {
      setActiveNpcId(undefined);
      setActiveNpcName('');
      setActiveNpcCard(null);
    }

    // Resolve NPCs in the new room and merge with combat data
    const npcUuids = targetRoom.npcs.map(npc => npc.character_uuid);
    const resolvedNpcs = await resolveNpcDisplayData(npcUuids);

    // Merge hostile/monster_level from room NPCs
    const npcsWithCombatData: CombatDisplayNPC[] = resolvedNpcs.map(npc => {
      const roomNpc = targetRoom.npcs.find(rn => rn.character_uuid === npc.id);
      return {
        ...npc,
        hostile: roomNpc?.hostile,
        monster_level: roomNpc?.monster_level,
      };
    });
    setRoomNpcs(npcsWithCombatData);

    // Persist position to backend (V2)
    try {
      await worldApi.updateWorld(worldId, {
        player_position: { x: foundX, y: foundY },
      });
    } catch (err) {
      console.error('Failed to persist player position:', err);
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
  }, [worldCard, worldState, worldId, messages, setMessages, addMessage, activeNpcName, activeNpcId]);


  // Handle room navigation - persists position to backend
  const handleNavigate = useCallback(async (roomId: string) => {
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
      setShowPartyGatherModal(true);
      return; // Don't navigate immediately, wait for user choice
    }

    // No active NPC - navigate immediately
    await performRoomTransition(targetRoom);
  }, [worldState, worldId, performRoomTransition, activeNpcId, activeNpcName]);

  const handleOpenMap = useCallback(() => {
    setShowMap(true);
  }, []);

  const handleCloseMap = useCallback(() => {
    setShowMap(false);
  }, []);

  // Party Gather Modal Handlers
  const handleBringNpcAlong = useCallback(async () => {
    if (!pendingDestination) return;

    setShowPartyGatherModal(false);
    await performRoomTransition(pendingDestination, true); // keepActiveNpc = true
    setPendingDestination(null);
  }, [pendingDestination, performRoomTransition]);

  const handleLeaveNpcHere = useCallback(async () => {
    if (!pendingDestination) return;

    setShowPartyGatherModal(false);
    // Add farewell message before clearing NPC
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

    // Clear active NPC before transition
    setActiveNpcId(undefined);
    setActiveNpcName('');
    setActiveNpcCard(null);

    await performRoomTransition(pendingDestination, false); // keepActiveNpc = false
    setPendingDestination(null);
  }, [pendingDestination, activeNpcName, activeNpcId, addMessage, performRoomTransition]);

  const handleClosePartyGatherModal = useCallback(() => {
    setShowPartyGatherModal(false);
    setPendingDestination(null);
  }, []);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Note: activeCharacter could be used here for displaying NPC-specific UI
  // const activeCharacter = activeNpcId ? roomNpcs.find(n => n.id === activeNpcId) : null;

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
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">
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

      {/* Chat View (Main Content) - Uses existing ChatView component */}
      <div className="flex-1 overflow-hidden">
        <ChatView disableSidePanel={true} />
      </div>

      {/* World Side Panel */}
      <SidePanel
        mode="world"
        currentRoom={currentRoom}
        npcs={roomNpcs}
        activeNpcId={activeNpcId}
        onSelectNpc={handleSelectNpc}
        onDismissNpc={handleDismissNpc}
        onOpenMap={handleOpenMap}
        isCollapsed={isPanelCollapsed}
        onToggleCollapse={() => setIsPanelCollapsed(!isPanelCollapsed)}
        worldId={worldId}
        onOpenJournal={() => setShowJournal(true)}
        relationships={npcRelationships}
        timeState={timeState}
        timeConfig={timeConfig}
      />

      {/* Map Modal */}
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

      {/* Combat Modal */}
      {isInCombat && combatInitData && (
        <CombatModal
          initData={combatInitData}
          onCombatEnd={handleCombatEnd}
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
    </div>
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