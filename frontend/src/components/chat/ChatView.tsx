/**
 * @file ChatView.tsx
 * @description Primary orchestration view for the chat interface. Handles message display, input, background settings, and connects to chat context.
 * @dependencies useChat, useCharacter, ChatBubble, ChatInputArea, ChatHeader, ChatBackgroundLayer
 * @consumers AppRoutes.tsx, SideNav.tsx
 */
// frontend/src/components/chat/ChatView.tsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useCharacter } from '../../contexts/CharacterContext';
import ChatBubble from './ChatBubble';
import ThoughtBubble from '../ThoughtBubble';
import UserSelect from '../UserSelect';
import ChatSelectorDialog from './ChatSelectorDialog';
import ContextWindowModal from './ContextWindowModal';
import ChatBackgroundSettings, { BackgroundSettings } from './ChatBackgroundSettings';
import { useEmotionDetection } from '../../hooks/useEmotionDetection';
import { Message } from '../../types/messages';
import { substituteVariables } from '../../utils/variableUtils';
import ErrorMessage from '../common/ErrorMessage';
import { useScrollToBottom } from '../../hooks/useScrollToBottom';
import { useChat } from '../../contexts/ChatContext';

// New Components
import ChatBackgroundLayer from './ChatBackgroundLayer';
import ChatHeader from './ChatHeader';
import ChatInputArea from './ChatInputArea';
import WorldSidePanel from './WorldSidePanel';

// Types and Utilities
import { Room } from '../../types/room';
import { FullWorldState } from '../../types/worldState';
import { formatWorldName } from '../../utils/formatters';

// Define the ReasoningSettings interface
interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
}

// Local storage keys
const BACKGROUND_SETTINGS_KEY = 'cardshark_background_settings';

import { DEFAULT_BACKGROUND_SETTINGS, DEFAULT_REASONING_SETTINGS } from '../../constants/defaults';

// Custom hook for stall detection
export const useStallDetection = (
  isGenerating: boolean,
  content: string,
  onStallDetected: () => void,
  stallTimeout = 8000
) => {
  const contentRef = useRef(content);
  const lastUpdateRef = useRef(Date.now());
  const stallCheckRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (content !== contentRef.current) {
      contentRef.current = content;
      lastUpdateRef.current = Date.now();
    }
  }, [content]);

  useEffect(() => {
    if (isGenerating) {
      stallCheckRef.current = setInterval(() => {
        const timeSinceUpdate = Date.now() - lastUpdateRef.current;
        if (timeSinceUpdate > stallTimeout) {
          console.warn(`Generation appears stalled (${stallTimeout}ms without updates)`);
          onStallDetected();
          if (stallCheckRef.current) {
            clearInterval(stallCheckRef.current);
            stallCheckRef.current = null;
          }
        }
      }, 1000);
    } else {
      if (stallCheckRef.current) {
        clearInterval(stallCheckRef.current);
        stallCheckRef.current = null;
      }
    }
    return () => {
      if (stallCheckRef.current) {
        clearInterval(stallCheckRef.current);
        stallCheckRef.current = null;
      }
    };
  }, [isGenerating, stallTimeout, onStallDetected]);
};

// Main ChatView component
const ChatView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [showContextWindow, setShowContextWindow] = useState(false);

  // World Card State
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);

  const isWorldCard = useMemo(() => {
    return characterData?.data?.tags?.includes('world') || !!characterData?.data?.extensions?.world;
  }, [characterData]);

  const worldId = useMemo(() => {
    return characterData?.data?.extensions?.world || characterData?.data?.name || '';
  }, [characterData]);
  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);
  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings>(DEFAULT_BACKGROUND_SETTINGS);
  const [localError, setLocalError] = useState<string | null>(null);

  const { endRef: messagesEndRef, containerRef: messagesContainerRef, scrollToBottom } = useScrollToBottom();

  const {
    messages,
    isGenerating,
    error: hookError,
    currentUser,
    lastContextWindow,
    generatingId,
    reasoningSettings: hookReasoningSettings,
    generateResponse,
    regenerateMessage,
    cycleVariation,
    stopGeneration,
    deleteMessage,
    updateMessage,
    setCurrentUser,
    loadExistingChat,
    createNewChat: handleNewChat,
    updateReasoningSettings,
    clearError: clearHookError,
    currentChatId,
    continueResponse,
    regenerateGreeting
  } = useChat();

  const scrollToBottomUnified = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem(BACKGROUND_SETTINGS_KEY);
      if (storedSettings) {
        setBackgroundSettings(JSON.parse(storedSettings));
      }
    } catch (err) {
      console.error('Error loading background settings:', err);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(BACKGROUND_SETTINGS_KEY, JSON.stringify(backgroundSettings));
  }, [backgroundSettings]);

  useEffect(() => {
    if (lastContextWindow?.type === 'chat_loaded' || lastContextWindow?.type === 'loaded_chat') {
      if (lastContextWindow.backgroundSettings) {
        console.log('Loading background settings from chat metadata:', lastContextWindow.backgroundSettings);
        setBackgroundSettings(lastContextWindow.backgroundSettings);
      }
    }
  }, [lastContextWindow]);

  useEffect(() => {
    const handleForceStop = () => {
      console.log('Received force stop event, resetting UI state');
      if (isGenerating) {
        stopGeneration();
      }
    };
    window.addEventListener('cardshark:force-generation-stop', handleForceStop);
    return () => {
      window.removeEventListener('cardshark:force-generation-stop', handleForceStop);
    };
  }, [isGenerating, stopGeneration]);

  useEffect(() => {
    const handleScrollEvent = () => {
      scrollToBottomUnified();
    };
    window.addEventListener('cardshark:scroll-to-bottom', handleScrollEvent);
    return () => {
      window.removeEventListener('cardshark:scroll-to-bottom', handleScrollEvent);
    };
  }, [scrollToBottomUnified]);

  const combinedError = localError || hookError;

  const handleDismissError = useCallback(() => {
    if (localError) setLocalError(null);
    if (hookError) clearHookError();
  }, [localError, hookError, clearHookError]);

  const [reasoningSettings, setReasoningSettings] = useState<ReasoningSettings>(
    hookReasoningSettings || DEFAULT_REASONING_SETTINGS
  );

  useEffect(() => {
    if (hookReasoningSettings) {
      setReasoningSettings(hookReasoningSettings);
    }
  }, [hookReasoningSettings]);

  const handleReasoningSettingsChange = (settings: ReasoningSettings) => {
    setReasoningSettings(settings);
    updateReasoningSettings(settings);
  };

  useEffect(() => {
    const handleFirstMessageCreation = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.messageContent) {
        const rawContent = customEvent.detail.messageContent;
        const substitutedContent = substituteVariables(
          rawContent,
          currentUser,
          characterData?.data?.name
        );
        customEvent.detail.substituteWith = substitutedContent;
      }
    };
    window.addEventListener('cardshark:process-first-message', handleFirstMessageCreation);
    return () => {
      window.removeEventListener('cardshark:process-first-message', handleFirstMessageCreation);
    };
  }, [currentUser, characterData]);

  const handleLoadChat = (chatId: string) => {
    if (!characterData) return;
    loadExistingChat(chatId);
    setShowChatSelector(false);
  };

  const prevMessageCountRef = useRef(messages.length);
  const prevGeneratingRef = useRef(isGenerating);

  useEffect(() => {
    const currentMessageCount = messages.length;
    const wasGenerating = prevGeneratingRef.current;

    const shouldScroll =
      currentMessageCount > prevMessageCountRef.current ||
      (!wasGenerating && isGenerating) ||
      (isGenerating && generatingId && messages.some(msg => msg.id === generatingId && msg.status === 'streaming'));

    if (shouldScroll) {
      scrollToBottomUnified();
    }

    prevMessageCountRef.current = currentMessageCount;
    prevGeneratingRef.current = isGenerating;
  }, [messages, isGenerating, generatingId, scrollToBottomUnified]);

  const handleContinueResponse = (message: Message) => {
    if (message.role === 'assistant') {
      if (!isGenerating) {
        console.log('Starting continuation for message:', message.id);
      }
      continueResponse(message);
    }
  };

  const getStopHandler = (message: Message): (() => void) | undefined => {
    if (message.role !== 'assistant') return undefined;
    return isGenerating && (generatingId === message.id)
      ? stopGeneration
      : undefined;
  };

  const getFirstAssistantMessageIndex = useCallback(() => {
    return messages.findIndex(msg => msg.role === 'assistant');
  }, [messages]);

  const isFirstAssistantMessage = useCallback((messageId: string): boolean => {
    const firstAssistantIndex = getFirstAssistantMessageIndex();
    return firstAssistantIndex !== -1 && messages[firstAssistantIndex].id === messageId;
  }, [messages, getFirstAssistantMessageIndex]);

  const handleRegenerateGreeting = useCallback(async () => {
    if (!characterData || isGenerating) return;
    const firstAssistantIndex = getFirstAssistantMessageIndex();
    if (firstAssistantIndex === -1) {
      console.error("Cannot regenerate greeting: No assistant message found.");
      return;
    }
    handleDismissError();
    regenerateGreeting();
  }, [characterData, isGenerating, getFirstAssistantMessageIndex, handleDismissError, regenerateGreeting]);

  const handleSendMessage = (content: string) => {
    if (!content.trim() || isGenerating) return;
    generateResponse(content);
  };

  // Handle Room Navigation (World Cards)
  const handleRoomChange = useCallback((room: Room, _position: string, worldState: FullWorldState) => {
    if (!characterData) return;

    // Check if this is a navigation event (vs initial sync)
    // We determine this by checking if we already have a room set and it's different
    const isNavigation = currentRoom && currentRoom.id !== room.id;

    // Update local state
    setCurrentRoom(room);

    // Update Character Context for the AI
    // We create a new character card with updated scenario/system prompt reflecting the location
    const worldUserIntroduction = room.introduction ||
      `You find yourself in ${room.name || 'an interesting place'}.`;

    // Helper to check if we actually need to update the card content to avoid loops
    // In a real implementation we would do a deep comparison or just update properties
    // For now we mutate the current object reference copy carefully or use setCharacterData
    // NOTE: setCharacterData triggers re-render.

    // Logic adapted from WorldCardsPlayView
    const newCard = { ...characterData };
    if (!newCard.data) return;

    const newScenario = `The user is exploring ${room.name || 'this location'} in the world of ${formatWorldName(worldState.name) || 'Unknown'}.`;
    const newSystemPrompt = `You are the narrator describing the world of ${formatWorldName(worldState.name) || 'Unknown'}.`;

    // Only update if changed
    if (newCard.data.scenario !== newScenario) {
      newCard.data.scenario = newScenario;
      newCard.data.system_prompt = newSystemPrompt;
      newCard.data.first_mes = worldUserIntroduction; // Update greeting for new chats?

      // Use setCharacterData to update global context
      // This ensures the NEXT generation uses these values
      setCharacterData(newCard);
    }

    // Generate response if navigation
    if (isNavigation && !isGenerating) {
      const previousRoomName = currentRoom?.name || "the previous area";
      const roomIntroduction = room.introduction || room.description || `You've entered ${room.name || "a new room"}.`;
      const message = `You leave ${previousRoomName} and enter ${room.name || "a new area"}. ${roomIntroduction}`;

      // Trigger generation
      generateResponse(message);
    }
  }, [characterData, currentRoom, isGenerating, generateResponse, setCharacterData]);

  // Handle NPC interactions from the side panel
  const handleNpcClick = useCallback(() => {
    // Placeholder for now, or open NPC dialog if needed
    console.log("NPC icon clicked in ChatView");
  }, []);

  // Compute emotion here to pass to InputArea
  const { currentEmotion: emotion } = useEmotionDetection(messages, characterData?.data?.name);

  if (!characterData) {
    return <div className="flex items-center justify-center h-full text-gray-400">Select a character to start chatting.</div>;
  }

  return (
    <div className="h-full relative flex flex-col overflow-hidden">
      {/* Background Layer */}
      <ChatBackgroundLayer
        backgroundSettings={backgroundSettings}
        messages={messages}
        characterName={characterData.data.name || 'Character'}
      />

      {/* Header */}
      <ChatHeader
        characterName={characterData.data.name || ''}
        reasoningSettings={reasoningSettings}
        onReasoningSettingsChange={handleReasoningSettingsChange}
        onShowContextWindow={() => setShowContextWindow(true)}
        onShowBackgroundSettings={() => setShowBackgroundSettings(true)}
        onShowChatSelector={() => setShowChatSelector(true)}
        onNewChat={handleNewChat}
      />

      <div className="flex-1 overflow-hidden relative z-10 flex flex-row">
        {/* Main Chat Column */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          {/* Error Display */}
          <div className="relative z-10 px-8 py-2">
            <ErrorMessage
              message={combinedError}
              onDismiss={handleDismissError}
            />
          </div>

          {/* Messages Area */}
          <div ref={messagesContainerRef} className="flex-1 overflow-hidden relative z-10">
            <div className="h-full overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <React.Fragment key={message.id}>
                  {message.role === 'thinking' && reasoningSettings.visible ? (
                    <ThoughtBubble
                      message={message}
                      isGenerating={message.status === 'streaming'}
                      onContentChange={(newContent) => console.log('Thought changed (not implemented):', newContent)}
                      onDelete={() => console.log('Delete thought (not implemented)')}
                      characterName={characterData.data.name}
                    />
                  ) : null}
                  {message.role !== 'thinking' && (
                    <ChatBubble
                      message={message}
                      characterName={characterData.data.name || 'Character'}
                      currentUser={currentUser || undefined}
                      isGenerating={isGenerating && generatingId === message.id}
                      onTryAgain={() => regenerateMessage(message)}
                      onContinue={() => handleContinueResponse(message)}
                      onDelete={() => deleteMessage(message.id)}
                      onContentChange={(newContent) => updateMessage(message.id, newContent)}
                      onStop={getStopHandler(message)}
                      isFirstMessage={isFirstAssistantMessage(message.id)}
                      onRegenerateGreeting={handleRegenerateGreeting}
                      isRegeneratingGreeting={isGenerating && isFirstAssistantMessage(message.id)}
                      onNextVariation={() => cycleVariation(message.id, 'next')}
                      onPrevVariation={() => cycleVariation(message.id, 'prev')}
                    />
                  )}
                </React.Fragment>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="relative z-10">
            <ChatInputArea
              onSend={handleSendMessage}
              isGenerating={isGenerating}
              currentUser={currentUser}
              onUserSelect={() => setShowUserSelect(true)}
              emotion={emotion}
            />
          </div>
        </div>

        {/* World Side Panel (3rd Column) */}
        {isWorldCard && worldId && (
          <WorldSidePanel
            worldId={worldId}
            currentRoomId={currentRoom?.id || null}
            onRoomChange={handleRoomChange}
            onNpcClick={handleNpcClick}
            onInventoryClick={() => console.log('Inventory clicked')}
            onSpellsClick={() => console.log('Spells clicked')}
            onMeleeClick={() => console.log('Melee clicked')}
          />
        )}
      </div>

      {/* Modals and Dialogs */}
      <UserSelect
        isOpen={showUserSelect}
        onClose={() => setShowUserSelect(false)}
        onSelect={(user) => {
          setCurrentUser(user);
          setShowUserSelect(false);
        }}
      />
      <ChatSelectorDialog
        isOpen={showChatSelector}
        onClose={() => setShowChatSelector(false)}
        onSelect={handleLoadChat}
        characterData={characterData}
        currentChatId={currentChatId}
      />
      <ContextWindowModal
        isOpen={showContextWindow}
        onClose={() => setShowContextWindow(false)}
        contextData={lastContextWindow}
      />
      {showBackgroundSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <ChatBackgroundSettings
            settings={backgroundSettings}
            onSettingsChange={setBackgroundSettings}
            onClose={() => setShowBackgroundSettings(false)}
          />
        </div>
      )}
    </div>
  );
};

export default ChatView;