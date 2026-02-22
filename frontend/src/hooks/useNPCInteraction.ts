/**
 * @file useNPCInteraction.ts
 * @description Manages NPC conversation, bonding, multi-speaker parsing,
 * sentiment/affinity tracking, time advancement, and context injection.
 * Extracted from WorldPlayView.tsx.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { CharacterCard } from '../types/schema';
import type { GridRoom, CombatDisplayNPC } from '../types/worldGrid';
import type { WorldCard } from '../types/worldCard';
import type { NPCRelationship, TimeState, TimeConfig } from '../types/worldRuntime';
import type { CombatInitData } from '../types/combat';
import { injectRoomContext, injectNPCContext, buildThinNPCContext, buildDualSpeakerContext } from '../utils/worldCardAdapter';
import {
  parseMultiSpeakerResponse,
  splitIntoMessages,
  hasAllyInterjection,
  type MultiSpeakerConfig
} from '../utils/multiSpeakerParser';
import { createDefaultRelationship, updateRelationshipAffinity, resetDailyAffinity } from '../utils/affinityUtils';
import { calculateSentimentAffinity, updateSentimentHistory, resetSentimentAfterGain } from '../utils/sentimentAffinityCalculator';
import { advanceTime } from '../utils/timeUtils';
import { dispatchScrollToBottom } from '../hooks/useScrollToBottom';
import { removeIncompleteSentences } from '../utils/contentProcessing';
import type { EmotionState } from '../hooks/useEmotionDetection';


/** Message shape (subset of ChatMessage) */
interface ChatMessage {
  id: string;
  role: string;
  content: string;
  status?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface UseNPCInteractionOptions {
  currentRoom: GridRoom | null;
  roomNpcs: CombatDisplayNPC[];
  worldCard: WorldCard | null;
  worldId: string;
  characterData: CharacterCard | null;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  addMessage: (message: ChatMessage) => void;
  setCharacterDataOverride: (data: CharacterCard | null) => void;
  apiConfig: unknown;
  currentUser: { id?: string; name?: string; filename?: string; user_uuid?: string } | null;
  timeState: TimeState;
  setTimeState: (state: TimeState) => void;
  timeConfig: TimeConfig;
  npcRelationships: Record<string, NPCRelationship>;
  setNpcRelationships: (rel: Record<string, NPCRelationship> | ((prev: Record<string, NPCRelationship>) => Record<string, NPCRelationship>)) => void;
  currentEmotion: EmotionState | null;
  // Combat trigger callback: view initiates combat when hostile NPC clicked
  onHostileNpcClicked: (initData: CombatInitData) => void;
}

export interface UseNPCInteractionReturn {
  conversationTargetId: string | undefined;
  conversationTargetName: string;
  activeNpcId: string | undefined;
  activeNpcName: string;
  activeNpcCard: CharacterCard | null;
  setActiveNpcId: (id: string | undefined) => void;
  setActiveNpcName: (name: string) => void;
  setActiveNpcCard: (card: CharacterCard | null) => void;
  handleSelectNpc: (npcId: string) => Promise<void>;
  handleBondNpc: () => Promise<void>;
  clearConversationTarget: () => void;
  dismissBondedAlly: () => void;
}

export function useNPCInteraction({
  currentRoom,
  roomNpcs,
  worldCard,
  worldId,
  characterData,
  messages,
  setMessages,
  addMessage,
  setCharacterDataOverride,
  apiConfig,
  currentUser,
  timeState,
  setTimeState,
  timeConfig,
  npcRelationships,
  setNpcRelationships,
  currentEmotion,
  onHostileNpcClicked,
}: UseNPCInteractionOptions): UseNPCInteractionReturn {
  // Conversation target state (for talking to NPCs WITHOUT bonding)
  const [conversationTargetId, setConversationTargetId] = useState<string | undefined>();
  const [conversationTargetName, setConversationTargetName] = useState<string>('');
  const [conversationTargetCard, setConversationTargetCard] = useState<CharacterCard | null>(null);

  // Bonded ally state
  const [activeNpcId, setActiveNpcId] = useState<string | undefined>();
  const [activeNpcName, setActiveNpcName] = useState<string>('');
  const [activeNpcCard, setActiveNpcCard] = useState<CharacterCard | null>(null);

  // Track processed message IDs for multi-speaker parsing
  const processedMultiSpeakerIds = useRef<Set<string>>(new Set());

  // ============================================
  // CONTEXT INJECTION - 4 modes
  // ============================================
  useEffect(() => {
    if (conversationTargetCard && activeNpcCard && currentRoom) {
      // DUAL-SPEAKER MODE
      const dualCard = buildDualSpeakerContext(
        conversationTargetCard,
        activeNpcCard,
        worldCard as any,
        currentRoom
      );
      setCharacterDataOverride(dualCard);
      console.log(`[NPC] Dual-speaker mode: ${conversationTargetName} (target) + ${activeNpcName} (ally)`);
    } else if (conversationTargetCard && currentRoom) {
      setCharacterDataOverride(conversationTargetCard);
    } else if (activeNpcCard && currentRoom) {
      const worldCharCard = characterData;
      const modifiedNpcCard = injectNPCContext(activeNpcCard, worldCharCard, currentRoom, roomNpcs);
      setCharacterDataOverride(modifiedNpcCard);
    } else if (worldCard && currentRoom) {
      const modifiedCharacterData = injectRoomContext(worldCard as any, currentRoom);
      setCharacterDataOverride(modifiedCharacterData);
    } else {
      setCharacterDataOverride(null);
    }
  }, [characterData, currentRoom, activeNpcCard, activeNpcName, conversationTargetCard, conversationTargetName, setCharacterDataOverride, worldCard, roomNpcs]);

  // ============================================
  // MULTI-SPEAKER PARSING
  // ============================================
  useEffect(() => {
    if (!conversationTargetId || !activeNpcId || !activeNpcName || !conversationTargetName) {
      return;
    }

    const recentMessages = [...messages].reverse();
    const targetMessage = recentMessages.find(msg =>
      msg.role === 'assistant' &&
      msg.status === 'complete' &&
      !processedMultiSpeakerIds.current.has(msg.id) &&
      !msg.metadata?.multiSpeaker
    );

    if (!targetMessage) return;

    processedMultiSpeakerIds.current.add(targetMessage.id);

    if (!hasAllyInterjection(targetMessage.content, activeNpcName)) return;

    const config: MultiSpeakerConfig = {
      targetName: conversationTargetName,
      targetId: conversationTargetId,
      allyName: activeNpcName,
      allyId: activeNpcId
    };

    const segments = parseMultiSpeakerResponse(targetMessage.content, config);
    if (segments.length <= 1) return;

    console.log(`[NPC] Splitting multi-speaker response into ${segments.length} messages`);
    const newMessages = splitIntoMessages(segments, targetMessage as any, config);

    const messageIndex = messages.findIndex(m => m.id === targetMessage.id);
    if (messageIndex === -1) return;

    const before = messages.slice(0, messageIndex);
    const after = messages.slice(messageIndex + 1);
    setMessages([...before, ...newMessages, ...after]);
  }, [messages, conversationTargetId, conversationTargetName, activeNpcId, activeNpcName, setMessages]);

  // ============================================
  // SENTIMENT / AFFINITY TRACKING
  // ============================================
  useEffect(() => {
    const currentNpcId = conversationTargetId || activeNpcId;
    const currentNpcName = conversationTargetName || activeNpcName;

    if (!currentNpcId || !currentNpcName || !currentEmotion) return;

    const relationship = npcRelationships[currentNpcId] || createDefaultRelationship(currentNpcId);

    const updatedRelationship = updateSentimentHistory(
      relationship,
      currentEmotion.valence,
      messages.length
    );

    const sentimentResult = calculateSentimentAffinity(
      updatedRelationship,
      currentEmotion.valence,
      messages.length,
      timeState.currentDay,
      60
    );

    setNpcRelationships((prev: Record<string, NPCRelationship>) => ({
      ...prev,
      [currentNpcId]: updatedRelationship,
    }));

    if (sentimentResult.shouldGainAffinity) {
      const finalRelationship = updateRelationshipAffinity(updatedRelationship, sentimentResult.affinityDelta);
      finalRelationship.affinity_gained_today += sentimentResult.affinityDelta;
      finalRelationship.affinity_day_started = timeState.currentDay;
      const resetRelationship = resetSentimentAfterGain(finalRelationship, messages.length);

      setNpcRelationships((prev: Record<string, NPCRelationship>) => ({
        ...prev,
        [currentNpcId]: resetRelationship,
      }));

      console.log(`[Affinity] ${currentNpcName}: ${updatedRelationship.affinity} -> ${finalRelationship.affinity} (${sentimentResult.affinityDelta > 0 ? '+' : ''}${sentimentResult.affinityDelta}) - ${sentimentResult.reason}`);

      const emoji = sentimentResult.affinityDelta > 0 ? '\u2764\uFE0F' : '\uD83D\uDC94';
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
          speakerName: 'Narrator',
        }
      } as ChatMessage);
    }
  }, [messages.length, currentEmotion, activeNpcId, activeNpcName, conversationTargetId, conversationTargetName, addMessage, timeState.currentDay]);

  // ============================================
  // TIME ADVANCEMENT
  // ============================================
  useEffect(() => {
    if (!timeConfig.enableDayNightCycle) return;

    const gameplayMessages = messages.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    const gameplayMessageCount = gameplayMessages.length;

    if (gameplayMessageCount <= timeState.totalMessages) return;

    const { newState, newDayStarted } = advanceTime(timeState, timeConfig);
    setTimeState(newState);

    if (newDayStarted) {
      setNpcRelationships((prev: Record<string, NPCRelationship>) => {
        const updated = { ...prev };
        Object.keys(updated).forEach(npcId => {
          updated[npcId] = resetDailyAffinity(updated[npcId], newState.currentDay);
        });
        return updated;
      });

      addMessage({
        id: crypto.randomUUID(),
        role: 'system' as const,
        content: `*A new day dawns... (Day ${newState.currentDay})*`,
        timestamp: Date.now(),
        metadata: {
          type: 'day_transition',
          day: newState.currentDay,
          speakerName: 'Narrator',
        }
      } as ChatMessage);

      console.log(`[Time] Day ${newState.currentDay} started - Daily affinity caps reset`);
    }
  }, [messages, timeState, timeConfig, addMessage, setTimeState, setNpcRelationships]);

  // ============================================
  // ACTIONS
  // ============================================

  const clearConversationTarget = useCallback(() => {
    if (conversationTargetId) {
      console.log(`Ending conversation with ${conversationTargetName}`);
      setConversationTargetId(undefined);
      setConversationTargetName('');
      setConversationTargetCard(null);
    }
  }, [conversationTargetId, conversationTargetName]);

  const handleSelectNpc = useCallback(async (npcId: string) => {
    if (!currentRoom) return;

    const npc = roomNpcs.find((n: CombatDisplayNPC) => n.id === npcId);
    if (!npc) {
      console.error(`NPC not found: ${npcId}`);
      return;
    }

    if (activeNpcId === npcId) {
      console.log(`NPC ${npc.name} is already bonded as ally.`);
      return;
    }

    if (conversationTargetId === npcId) {
      console.log(`Already in conversation with ${npc.name}.`);
      return;
    }

    // Hostile NPC - delegate combat initiation to the view
    if (npc.hostile) {
      clearConversationTarget();

      const hostileNpcs = roomNpcs.filter((n: CombatDisplayNPC) => n.hostile);
      const allies: Array<{ id: string; name: string; level: number; imagePath: string | null }> = [];

      if (activeNpcId && activeNpcName) {
        const boundNpc = roomNpcs.find((n: CombatDisplayNPC) => n.id === activeNpcId);
        if (boundNpc && !boundNpc.hostile) {
          allies.push({
            id: boundNpc.id,
            name: boundNpc.name,
            level: 5,
            imagePath: boundNpc.imageUrl || null,
          });
        }
      }

      const initData: CombatInitData = {
        playerData: {
          id: 'player',
          name: currentUser?.name || 'Player',
          level: 5,
          imagePath: currentUser?.filename
            ? `/api/user-image/${encodeURIComponent(currentUser.filename)}`
            : null,
        },
        enemies: hostileNpcs.map((enemy: CombatDisplayNPC) => ({
          id: enemy.id,
          name: enemy.name,
          level: enemy.monster_level || 1,
          imagePath: enemy.imageUrl || null,
        })),
        allies: allies.length > 0 ? allies : undefined,
        roomImagePath: currentRoom.image_path
          ? `/api/world-assets/${worldId}/${currentRoom.image_path.split('/').pop()}`
          : null,
        roomName: currentRoom.name,
        playerAdvantage: true,
      };

      onHostileNpcClicked(initData);

      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `*Combat begins against ${hostileNpcs.map((n: CombatDisplayNPC) => n.name).join(', ')}!*`,
        timestamp: Date.now(),
        metadata: {
          type: 'combat_start',
          roomId: currentRoom.id,
          speakerName: 'Narrator',
        }
      } as ChatMessage);

      return;
    }

    // Non-hostile NPC - start conversation with THIN CONTEXT
    clearConversationTarget();
    setConversationTargetId(npcId);
    setConversationTargetName(npc.name);

    try {
      const response = await fetch(`/api/character/${npcId}`);
      if (!response.ok) {
        console.error('Failed to load NPC character data');
        return;
      }

      const npcCharacterData = await response.json();
      const worldCharCard = characterData;
      const thinContextCard = buildThinNPCContext(npcCharacterData, worldCharCard, currentRoom);
      setConversationTargetCard(thinContextCard);

      if (!apiConfig) {
        console.warn('No API configuration available yet — greeting generation skipped. Click again once your API is connected.');
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: `*You approach ${npc.name}*`,
          timestamp: Date.now(),
          metadata: {
            type: 'conversation_start',
            npcId,
            roomId: currentRoom.id,
            characterId: npcCharacterData.data?.character_uuid,
            isBonded: false,
            generated: false,
            speakerName: npc.name,
          }
        } as ChatMessage);
        // Clear conversation target so clicking again retries with a live API
        clearConversationTarget();
        return;
      }

      const introMessageId = crypto.randomUUID();
      addMessage({
        id: introMessageId,
        role: 'assistant' as const,
        content: '...',
        timestamp: Date.now(),
        metadata: {
          type: 'conversation_start',
          npcId,
          roomId: currentRoom.id,
          characterId: npcCharacterData.data?.character_uuid,
          isBonded: false,
          generated: true,
          speakerName: npc.name,
        }
      } as ChatMessage);

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
        (setMessages as any)((prev: any) => prev.map((msg: any) =>
          msg.id === introMessageId
            ? { ...msg, content: `*${npc.name} looks up as you approach*` }
            : msg
        ));
        return;
      }

      const { PromptHandler } = await import('../handlers/promptHandler');

      let generatedIntro = '';
      const bufferInterval = 50;
      let buffer = '';
      let bufTimer: NodeJS.Timeout | null = null;

      const updateIntroContent = (chunk: string, isFinal = false) => {
        buffer += chunk;
        if (bufTimer) clearTimeout(bufTimer);
        bufTimer = setTimeout(() => {
          const curBuf = buffer;
          buffer = '';
          generatedIntro += curBuf;
          (setMessages as any)((prev: any) => prev.map((msg: any) =>
            msg.id === introMessageId
              ? { ...msg, content: generatedIntro }
              : msg
          ));
          dispatchScrollToBottom();
        }, isFinal ? 0 : bufferInterval);
      };

      try {
        for await (const chunk of PromptHandler.streamResponse(greetingResponse, npc.name)) {
          updateIntroContent(chunk);
        }
        if (buffer.length > 0) updateIntroContent('', true);

        (setMessages as any)((prev: any) => prev.map((msg: any) =>
          msg.id === introMessageId
            ? { ...msg, content: removeIncompleteSentences(generatedIntro.trim()) || `*${npc.name} looks up as you approach*` }
            : msg
        ));

        console.log(`Started conversation with ${npc.name} (thin context, not bonded)`);
      } catch (streamErr) {
        console.error('Error streaming NPC greeting:', streamErr);
        (setMessages as any)((prev: any) => prev.map((msg: any) =>
          msg.id === introMessageId
            ? { ...msg, content: `*${npc.name} looks up as you approach*` }
            : msg
        ));
      }
    } catch (err) {
      console.error('Error starting conversation with NPC:', err);
    }
  }, [roomNpcs, currentRoom, addMessage, characterData, worldId, apiConfig, currentUser, activeNpcId, activeNpcName, conversationTargetId, clearConversationTarget, setMessages, onHostileNpcClicked]);

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
          speakerName: 'Narrator',
        }
      } as ChatMessage);
      return;
    }

    try {
      const response = await fetch(`/api/character/${conversationTargetId}`);
      if (!response.ok) {
        console.error('Failed to load NPC character data for bonding');
        return;
      }

      const npcCharacterData = await response.json();

      setConversationTargetId(undefined);
      setConversationTargetName('');
      setConversationTargetCard(null);

      setActiveNpcId(conversationTargetId);
      setActiveNpcName(npc.name);
      setActiveNpcCard(npcCharacterData);

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
          speakerName: npc.name,
        }
      } as ChatMessage);

      console.log(`Bonded with NPC: ${npc.name} (full context, ally)`);
    } catch (err) {
      console.error('Error bonding with NPC:', err);
    }
  }, [roomNpcs, currentRoom, addMessage, conversationTargetId, activeNpcId, activeNpcName]);

  const dismissBondedAlly = useCallback(() => {
    if (!currentRoom) return;

    const npc = roomNpcs.find((n: CombatDisplayNPC) => n.id === activeNpcId);
    if (!npc) return;

    setActiveNpcId(undefined);
    setActiveNpcName('');
    setActiveNpcCard(null);

    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: `${npc.name} has been dismissed, but will remain in the area.`,
      timestamp: Date.now(),
      metadata: {
        type: 'npc_dismissed',
        npcId: activeNpcId,
        roomId: currentRoom.id,
        speakerName: npc.name,
      }
    } as ChatMessage);

    console.log(`Dismissed NPC: ${npc.name} - full character context cleared`);
  }, [roomNpcs, currentRoom, addMessage, activeNpcId]);

  return {
    conversationTargetId,
    conversationTargetName,
    activeNpcId,
    activeNpcName,
    activeNpcCard,
    setActiveNpcId,
    setActiveNpcName,
    setActiveNpcCard,
    handleSelectNpc,
    handleBondNpc,
    clearConversationTarget,
    dismissBondedAlly,
  };
}
