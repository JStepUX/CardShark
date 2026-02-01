/**
 * @file useNPCInteraction.ts
 * @description Hook for managing NPC interactions in world play.
 *
 * Extracted from WorldPlayView to separate concerns:
 * - Conversation target state (thin context, non-bonded)
 * - Bonded ally state (full context, follows player)
 * - NPC selection (talk vs combat initiation)
 * - Multi-speaker parsing for dual-speaker mode
 * - Sentiment tracking and affinity changes
 *
 * This hook manages all aspects of player-NPC interaction.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CharacterCard } from '../types/schema';
import type { GridRoom } from '../types/worldGrid';
import type { NPCRelationship, TimeState } from '../types/worldRuntime';
import type { Message } from '../services/chat/chatTypes';
import type { CombatInitData } from '../types/combat';
import { buildThinNPCContext, buildDualSpeakerContext, injectNPCContext } from '../utils/worldCardAdapter';
import {
  parseMultiSpeakerResponse,
  splitIntoMessages,
  hasAllyInterjection,
  type MultiSpeakerConfig
} from '../utils/multiSpeakerParser';
import { createDefaultRelationship, updateRelationshipAffinity } from '../utils/affinityUtils';
import { calculateSentimentAffinity, updateSentimentHistory, resetSentimentAfterGain } from '../utils/sentimentAffinityCalculator';
import { dispatchScrollToBottom } from './useScrollToBottom';
import type { CombatDisplayNPC } from './useRoomTransition';

// =============================================================================
// Types
// =============================================================================

export interface NPCInteractionState {
  // Conversation target (thin context, temporary)
  conversationTargetId: string | undefined;
  conversationTargetName: string;
  conversationTargetCard: CharacterCard | null;

  // Bonded ally (full context, follows player)
  activeNpcId: string | undefined;
  activeNpcName: string;
  activeNpcCard: CharacterCard | null;

  // Combat state
  isInCombat: boolean;
  combatInitData: CombatInitData | null;
}

export interface NPCInteractionDependencies {
  // Room context
  currentRoom: GridRoom | null;
  roomNpcs: CombatDisplayNPC[];
  worldId: string;

  // Character data (world card loaded as base character)
  characterData: CharacterCard | null;

  // API config
  apiConfig: Record<string, unknown> | null;

  // User info
  currentUser: { id?: string; name?: string; filename?: string; user_uuid?: string } | null;

  // Message management
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;

  // Character override (for context injection)
  setCharacterDataOverride: (card: CharacterCard | null) => void;

  // Emotion detection for sentiment
  currentEmotion: { valence: number; arousal: number } | null;

  // Time state for affinity tracking
  timeState: TimeState;

  // Relationship state
  npcRelationships: Record<string, NPCRelationship>;
  setNpcRelationships: React.Dispatch<React.SetStateAction<Record<string, NPCRelationship>>>;
}

export interface UseNPCInteractionResult {
  // State
  conversationTargetId: string | undefined;
  conversationTargetName: string;
  conversationTargetCard: CharacterCard | null;
  activeNpcId: string | undefined;
  activeNpcName: string;
  activeNpcCard: CharacterCard | null;
  isInCombat: boolean;
  combatInitData: CombatInitData | null;

  // Setters
  setActiveNpcId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setActiveNpcName: React.Dispatch<React.SetStateAction<string>>;
  setActiveNpcCard: React.Dispatch<React.SetStateAction<CharacterCard | null>>;
  setIsInCombat: React.Dispatch<React.SetStateAction<boolean>>;
  setCombatInitData: React.Dispatch<React.SetStateAction<CombatInitData | null>>;

  // Actions
  handleSelectNpc: (npcId: string) => Promise<void>;
  handleBondNpc: () => Promise<void>;
  clearConversationTarget: () => void;
  dismissBondedAlly: () => void;

  // Computed
  currentSpeakingNpcName: string;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useNPCInteraction(deps: NPCInteractionDependencies): UseNPCInteractionResult {
  const {
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
  } = deps;

  // Conversation target state (thin context, temporary)
  const [conversationTargetId, setConversationTargetId] = useState<string | undefined>();
  const [conversationTargetName, setConversationTargetName] = useState<string>('');
  const [conversationTargetCard, setConversationTargetCard] = useState<CharacterCard | null>(null);

  // Bonded ally state (full context, follows player)
  const [activeNpcId, setActiveNpcId] = useState<string | undefined>();
  const [activeNpcName, setActiveNpcName] = useState<string>('');
  const [activeNpcCard, setActiveNpcCard] = useState<CharacterCard | null>(null);

  // Combat state
  const [isInCombat, setIsInCombat] = useState(false);
  const [combatInitData, setCombatInitData] = useState<CombatInitData | null>(null);

  // Track processed multi-speaker messages to avoid reprocessing
  const processedMultiSpeakerIds = useRef<Set<string>>(new Set());

  // Computed
  const currentSpeakingNpcName = conversationTargetName || activeNpcName;

  // ==========================================================================
  // Character Context Injection
  // ==========================================================================

  useEffect(() => {
    if (!characterData || !currentRoom) return;

    // World card as base
    const worldCharCard = characterData;

    if (conversationTargetCard && activeNpcCard && currentRoom) {
      // Dual-speaker mode: talking to an NPC while having a bonded ally
      const dualSpeakerCard = buildDualSpeakerContext(
        conversationTargetCard,
        activeNpcCard,
        worldCharCard,
        currentRoom
      );
      setCharacterDataOverride(dualSpeakerCard);
      console.log(`[useNPCInteraction] Dual-speaker mode: ${conversationTargetName} (target) + ${activeNpcName} (ally)`);
    } else if (conversationTargetCard && currentRoom) {
      // Conversation mode with thin context
      setCharacterDataOverride(conversationTargetCard);
    } else if (activeNpcCard && currentRoom) {
      // Bonded ally mode: inject room/world context into ally card
      // Use injectNPCContext for full context with thin frame support
      const modifiedNpcCard = injectNPCContext(activeNpcCard, worldCharCard, currentRoom, roomNpcs);
      setCharacterDataOverride(modifiedNpcCard);
    } else {
      // No active NPC - use base world card (with room injected if available)
      setCharacterDataOverride(null);
    }
  }, [characterData, currentRoom, activeNpcCard, activeNpcName, conversationTargetCard, conversationTargetName, setCharacterDataOverride, roomNpcs]);

  // ==========================================================================
  // Multi-Speaker Parsing
  // ==========================================================================

  useEffect(() => {
    // Only process if in dual-speaker mode
    if (!conversationTargetId || !activeNpcId || !activeNpcName || !conversationTargetName) {
      return;
    }

    // Find the most recent assistant message that hasn't been processed
    const recentMessages = [...messages].reverse();
    const targetMessage = recentMessages.find(msg =>
      msg.role === 'assistant' &&
      msg.status === 'complete' &&
      !processedMultiSpeakerIds.current.has(msg.id) &&
      !msg.metadata?.multiSpeaker
    );

    if (!targetMessage) {
      return;
    }

    // Mark as processed
    processedMultiSpeakerIds.current.add(targetMessage.id);

    // Check for ally interjections
    if (!hasAllyInterjection(targetMessage.content, activeNpcName)) {
      return;
    }

    // Parse multi-speaker response
    const config: MultiSpeakerConfig = {
      targetName: conversationTargetName,
      targetId: conversationTargetId,
      allyName: activeNpcName,
      allyId: activeNpcId
    };

    const segments = parseMultiSpeakerResponse(targetMessage.content, config);

    if (segments.length <= 1) {
      return;
    }

    console.log(`[useNPCInteraction] Splitting multi-speaker response into ${segments.length} messages`);

    // Create new messages from segments
    const newMessages = splitIntoMessages(segments, targetMessage, config);

    // Replace original message with split messages
    const messageIndex = messages.findIndex(m => m.id === targetMessage.id);
    if (messageIndex === -1) return;

    const before = messages.slice(0, messageIndex);
    const after = messages.slice(messageIndex + 1);

    setMessages([...before, ...newMessages, ...after]);

  }, [messages, conversationTargetId, conversationTargetName, activeNpcId, activeNpcName, setMessages]);

  // ==========================================================================
  // Sentiment Tracking
  // ==========================================================================

  useEffect(() => {
    const currentNpcId = conversationTargetId || activeNpcId;
    const currentNpcName = conversationTargetName || activeNpcName;

    if (!currentNpcId || !currentNpcName || !currentEmotion) return;

    // Get or create relationship
    const relationship = npcRelationships[currentNpcId] || createDefaultRelationship(currentNpcId);

    // Update sentiment history
    const updatedRelationship = updateSentimentHistory(
      relationship,
      currentEmotion.valence,
      messages.length
    );

    // Calculate potential affinity change
    const sentimentResult = calculateSentimentAffinity(
      updatedRelationship,
      currentEmotion.valence,
      messages.length,
      timeState.currentDay,
      60 // daily cap
    );

    // Update relationship state
    setNpcRelationships(prev => ({
      ...prev,
      [currentNpcId]: updatedRelationship,
    }));

    // Grant affinity if conditions met
    if (sentimentResult.shouldGainAffinity) {
      const finalRelationship = updateRelationshipAffinity(updatedRelationship, sentimentResult.affinityDelta);

      finalRelationship.affinity_gained_today += sentimentResult.affinityDelta;
      finalRelationship.affinity_day_started = timeState.currentDay;

      const resetRelationship = resetSentimentAfterGain(finalRelationship, messages.length);

      setNpcRelationships(prev => ({
        ...prev,
        [currentNpcId]: resetRelationship,
      }));

      console.log(`[Affinity] ${currentNpcName}: ${updatedRelationship.affinity} -> ${finalRelationship.affinity} (${sentimentResult.affinityDelta > 0 ? '+' : ''}${sentimentResult.affinityDelta}) - ${sentimentResult.reason}`);

      // Add notification
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
  }, [messages.length, currentEmotion, activeNpcId, activeNpcName, conversationTargetId, conversationTargetName, addMessage, timeState.currentDay, npcRelationships, setNpcRelationships]);

  // ==========================================================================
  // Actions
  // ==========================================================================

  const clearConversationTarget = useCallback(() => {
    if (conversationTargetId) {
      console.log(`Ending conversation with ${conversationTargetName}`);
      setConversationTargetId(undefined);
      setConversationTargetName('');
      setConversationTargetCard(null);
    }
  }, [conversationTargetId, conversationTargetName]);

  /**
   * Handle NPC selection - starts combat (hostile) or conversation (non-hostile)
   */
  const handleSelectNpc = useCallback(async (npcId: string) => {
    if (!currentRoom) return;

    const npc = roomNpcs.find((n: CombatDisplayNPC) => n.id === npcId);
    if (!npc) {
      console.error(`NPC not found: ${npcId}`);
      return;
    }

    // Already bonded ally
    if (activeNpcId === npcId) {
      console.log(`NPC ${npc.name} is already bonded as ally.`);
      return;
    }

    // Already in conversation
    if (conversationTargetId === npcId) {
      console.log(`Already in conversation with ${npc.name}.`);
      return;
    }

    // Hostile NPC - initiate combat
    if (npc.hostile) {
      clearConversationTarget();

      const hostileNpcs = roomNpcs.filter((n: CombatDisplayNPC) => n.hostile);

      // Include bonded NPC as ally
      const allies: Array<{
        id: string;
        name: string;
        level: number;
        imagePath: string | null;
      }> = [];

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

      setCombatInitData(initData);
      setIsInCombat(true);

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

    // Non-hostile NPC - start conversation with thin context
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

      // Build thin context card
      const worldCharCard = characterData;
      const thinContextCard = buildThinNPCContext(npcCharacterData, worldCharCard, currentRoom);

      setConversationTargetCard(thinContextCard);

      // Check API config
      if (!apiConfig) {
        console.error('No API configuration available');
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

      // Create placeholder message
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

      // Generate greeting
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

      // Stream the response
      const { PromptHandler } = await import('../handlers/promptHandler');

      let generatedIntro = '';
      const bufferInterval = 50;
      let buffer = '';
      let bufTimer: ReturnType<typeof setTimeout> | null = null;

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

        if (buffer.length > 0) {
          updateIntroContent('', true);
        }

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
   * Upgrades from thin context to full context.
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

    // Check if already have bonded ally
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

      // Set as bonded ally
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
        }
      });

      console.log(`Bonded with NPC: ${npc.name} (full context, ally)`);
    } catch (err) {
      console.error('Error bonding with NPC:', err);
    }
  }, [roomNpcs, currentRoom, addMessage, conversationTargetId, activeNpcId, activeNpcName]);

  /**
   * Dismiss the bonded ally.
   */
  const dismissBondedAlly = useCallback(() => {
    if (!activeNpcId || !activeNpcName) return;

    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: `*${activeNpcName} stays behind as you part ways.*`,
      timestamp: Date.now(),
      metadata: {
        type: 'ally_dismissed',
        npcId: activeNpcId,
        npcName: activeNpcName,
      }
    });

    setActiveNpcId(undefined);
    setActiveNpcName('');
    setActiveNpcCard(null);

    console.log(`[useNPCInteraction] Dismissed ally: ${activeNpcName}`);
  }, [activeNpcId, activeNpcName, addMessage]);

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    // State
    conversationTargetId,
    conversationTargetName,
    conversationTargetCard,
    activeNpcId,
    activeNpcName,
    activeNpcCard,
    isInCombat,
    combatInitData,

    // Setters
    setActiveNpcId,
    setActiveNpcName,
    setActiveNpcCard,
    setIsInCombat,
    setCombatInitData,

    // Actions
    handleSelectNpc,
    handleBondNpc,
    clearConversationTarget,
    dismissBondedAlly,

    // Computed
    currentSpeakingNpcName,
  };
}
