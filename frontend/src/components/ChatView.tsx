// frontend/src/components/ChatView.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, User, Plus, Eye, Wallpaper, MessageSquare } from 'lucide-react'; // Removed Server icon
import { useCharacter } from '../contexts/CharacterContext';
// Removed useSettings import
import ChatBubble from './ChatBubble';
import ThoughtBubble from './ThoughtBubble';
import UserSelect from './UserSelect';
import ChatSelectorDialog from './ChatSelectorDialog';
import ContextWindowModal from './ContextWindowModal';
import ChatBackgroundSettings, { BackgroundSettings } from './ChatBackgroundSettings';
import MoodBackground from './MoodBackground';
import MoodIndicator from './MoodIndicator';
import { useEmotionDetection } from '../hooks/useEmotionDetection';
import { Message, UserProfile } from '../types/messages';
import { EmotionState } from '../hooks/useEmotionDetection';
import RichTextEditor from './RichTextEditor';
import { substituteVariables } from '../utils/variableUtils';
import ErrorMessage from './ErrorMessage';
import { useScrollToBottom } from '../hooks/useScrollToBottom';
import { useChat } from '../contexts/ChatContext'; // Import useChat

// Define the ReasoningSettings interface
interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
}

// Local storage keys
const BACKGROUND_SETTINGS_KEY = 'cardshark_background_settings';

// Default background settings
const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  background: null,
  transparency: 85,
  fadeLevel: 30,
  disableAnimation: false,
  moodEnabled: false
};

// Default reasoning settings
const DEFAULT_REASONING_SETTINGS: ReasoningSettings = {
  enabled: false,
  visible: false
};

// Custom hook for stall detection - for use in ChatBubble component
export const useStallDetection = (
  isGenerating: boolean,
  content: string,
  onStallDetected: () => void,
  stallTimeout = 8000
) => {
  const contentRef = useRef(content);
  const lastUpdateRef = useRef(Date.now());
  const stallCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Update refs when content changes
  useEffect(() => {
    if (content !== contentRef.current) {
      contentRef.current = content;
      lastUpdateRef.current = Date.now();
    }
  }, [content]);

  // Set up stall detection
  useEffect(() => {
    if (isGenerating) {
      // Start stall detection
      stallCheckRef.current = setInterval(() => {
        const timeSinceUpdate = Date.now() - lastUpdateRef.current;
        if (timeSinceUpdate > stallTimeout) {
          console.warn(`Generation appears stalled (${stallTimeout}ms without updates)`);
          onStallDetected();

          // Clear the interval
          if (stallCheckRef.current) {
            clearInterval(stallCheckRef.current);
            stallCheckRef.current = null;
          }
        }
      }, 1000); // Check every second
    } else {
      // Clear stall detection when not generating
      if (stallCheckRef.current) {
        clearInterval(stallCheckRef.current);
        stallCheckRef.current = null;
      }
    }

    // Cleanup
    return () => {
      if (stallCheckRef.current) {
        clearInterval(stallCheckRef.current);
        stallCheckRef.current = null;
      }
    };
  }, [isGenerating, stallTimeout, onStallDetected]);
};

// Import the external useScrollToBottom hook instead of defining it here
// This has been moved to its own hook file for reusability

// Separate InputArea component - Reverted props
interface InputAreaProps {
  onSend: (text: string) => void;
  isGenerating: boolean;
  currentUser: UserProfile | null;
  onUserSelect: () => void;
  emotion: EmotionState;
}

const InputArea: React.FC<InputAreaProps> = ({
  onSend,
  isGenerating,
  currentUser,
  onUserSelect,
  emotion,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [imageError, setImageError] = useState(false);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isGenerating) {
        onSend(inputValue.trim());
        setInputValue('');
      }
    }
  };
  // Reset image error state when user changes
  useEffect(() => {
    setImageError(false);
  }, [currentUser?.filename]);
  return (
    <div className="flex-none p-4 border-t border-stone-800">
      <div className="flex items-end gap-4">
        {/* User Image */}
        <div
          onClick={onUserSelect}
          className="w-24 h-32 rounded-lg cursor-pointer overflow-hidden flex-shrink-0"
        >
          {currentUser && !imageError ? (
            <img
              src={`/api/user-image/${encodeURIComponent(currentUser.filename)}`}
              alt={currentUser.name || 'User'}
              className="w-full h-full object-cover"
              onError={() => {
                console.error('User image load failed');
                setImageError(true);
              }}
            />
          ) : (
            <div className="w-full h-full bg-transparent border border-gray-700 rounded-lg flex items-center justify-center">
              <User className="text-gray-400" size={24} />
            </div>
          )}
        </div>        {/* Text Input Area */}
        <div className="flex-1 h-32 flex flex-col overflow-hidden">
          <RichTextEditor
            content={inputValue}
            onChange={setInputValue}
            className="bg-stone-950 border border-stone-800 rounded-lg flex-1 overflow-y-auto"
            placeholder="Type your message..."
            onKeyDown={handleKeyPress}
            preserveWhitespace={true}
          />
          {/* Removed API Selector Dropdown */}
        </div>

        {/* Send Button & Mood Indicator */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <MoodIndicator emotion={emotion} size={24} showLabel={false} />
          <button
            onClick={() => {
              if (inputValue.trim() && !isGenerating) {
                onSend(inputValue.trim());
                setInputValue('');
              }
            }}
            disabled={!inputValue.trim() || isGenerating}
            className="px-4 py-4 bg-transparent text-white rounded-lg hover:bg-orange-700
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

// Main ChatView component
const ChatView: React.FC = () => {
  const { characterData } = useCharacter();
  // Removed selectedApiIdForNextMessage state
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [showContextWindow, setShowContextWindow] = useState(false);  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);
  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings>(DEFAULT_BACKGROUND_SETTINGS);
  // Removed selectedApiIdForNextMessage state
  const [localError, setLocalError] = useState<string | null>(null); // Local error state for UI feedback  
  
  // Use the custom scroll hook with our shared implementation  
  const { endRef: messagesEndRef, containerRef: messagesContainerRef, scrollToBottom } = useScrollToBottom();
  // Use ChatContext instead of useChatMessages hook
  const {
    messages,
    isGenerating,
    error: hookError, // Rename hook error to avoid conflict
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
    currentChatId, // Get currentChatId directly from ChatContext
    continueResponse, // Get continueResponse from ChatContext
    regenerateGreeting // Get regenerateGreeting from ChatContext
  } = useChat();
  // Create a unified scroll function that works for both virtual and regular chat lists
  const scrollToBottomUnified = useCallback(() => {
    // Use regular scrolling (virtual scrolling has been removed)
    scrollToBottom();
  }, [scrollToBottom]);

  // Load background settings from localStorage
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

  // Save background settings when they change
  useEffect(() => {
    localStorage.setItem(BACKGROUND_SETTINGS_KEY, JSON.stringify(backgroundSettings));
    // Background settings are not currently saved to the backend as part of chat metadata
    // because the reliable-save-chat endpoint doesn't support them in the payload.
    // They are only persisted locally in localStorage.
  }, [backgroundSettings]);

  // Sync background settings from loaded chat metadata
  useEffect(() => {
    // When lastContextWindow changes and indicates a chat was loaded
    if (lastContextWindow?.type === 'chat_loaded' || lastContextWindow?.type === 'loaded_chat') {
      // Check if the loaded chat has background settings in metadata
      if (lastContextWindow.backgroundSettings) {
        console.log('Loading background settings from chat metadata:', lastContextWindow.backgroundSettings);
        setBackgroundSettings(lastContextWindow.backgroundSettings);
      }
    }
  }, [lastContextWindow]);

  // Add listener for forced generation stop
  useEffect(() => {
    const handleForceStop = () => {
      console.log('Received force stop event, resetting UI state');
      // If we're still generating, reset state
      if (isGenerating) {
        stopGeneration();
      }
    };

    window.addEventListener('cardshark:force-generation-stop', handleForceStop);

    return () => {
      window.removeEventListener('cardshark:force-generation-stop', handleForceStop);
    };
  }, [isGenerating, stopGeneration]);
  // Add listener for the global scroll-to-bottom event
  useEffect(() => {
    const handleScrollEvent = () => {
      scrollToBottomUnified();
    };
    
    window.addEventListener('cardshark:scroll-to-bottom', handleScrollEvent);
    
    return () => {
      window.removeEventListener('cardshark:scroll-to-bottom', handleScrollEvent);
    };
  }, [scrollToBottomUnified]);

  // Combine local error and hook errors for display
  const combinedError = localError || hookError;

  // Handle error dismissal from either source
  const handleDismissError = useCallback(() => {
    if (localError) setLocalError(null); // Clear local error
    if (hookError) clearHookError(); // Clear hook error
  }, [localError, hookError, clearHookError]);

  // Use local state for UI control, synced with hook state
  const [reasoningSettings, setReasoningSettings] = useState<ReasoningSettings>(
    hookReasoningSettings || DEFAULT_REASONING_SETTINGS
  );

  // Sync reasoning settings when they change in the hook
  useEffect(() => {
    if (hookReasoningSettings) {
      setReasoningSettings(hookReasoningSettings);
    }
  }, [hookReasoningSettings]);

  // Update both local state and hook state when settings change
  const handleReasoningSettingsChange = (settings: ReasoningSettings) => {
    setReasoningSettings(settings);
    updateReasoningSettings(settings);
  };
  // Listen for custom event from useChatMessages when first message is being created
  useEffect(() => {
    const handleFirstMessageCreation = (event: Event) => {
      const customEvent = event as CustomEvent;      if (customEvent.detail && customEvent.detail.messageContent) {
        // Get the raw message content before any processing
        const rawContent = customEvent.detail.messageContent;
        // Return the substituted content to be used instead
        const substitutedContent = substituteVariables(
          rawContent,
          currentUser, // Pass the entire currentUser object instead of just the name property
          characterData?.data?.name
        );

        // Set a response on the event to pass back the substituted content
        customEvent.detail.substituteWith = substitutedContent;
      }
    };

    window.addEventListener('cardshark:process-first-message', handleFirstMessageCreation);

    return () => {
      window.removeEventListener('cardshark:process-first-message', handleFirstMessageCreation);
    };
  }, [currentUser, characterData]);

  // handleNewChat is now provided by useChatMessages hook

  const handleLoadChat = (chatId: string) => {
    if (!characterData) return;
    loadExistingChat(chatId);
    setShowChatSelector(false);
  };  // Track previous message count and generation status for smarter scrolling
  const prevMessageCountRef = useRef(messages.length);
  const prevGeneratingRef = useRef(isGenerating);
  
  // Only scroll on specific conditions to avoid jumping during edits
  useEffect(() => {
    const currentMessageCount = messages.length;
    const wasGenerating = prevGeneratingRef.current;
    
    // Scroll only when:
    // 1. New messages are added (message count increased)
    // 2. Generation just started (isGenerating became true)
    // 3. Last message is being streamed (content updated during generation)
    const shouldScroll = 
      currentMessageCount > prevMessageCountRef.current || // New message added
      (!wasGenerating && isGenerating) || // Generation just started
      (isGenerating && generatingId && messages.some(msg => msg.id === generatingId && msg.status === 'streaming')); // Streaming update
    
    if (shouldScroll) {
      scrollToBottomUnified();
    }
    
    // Update refs for next comparison
    prevMessageCountRef.current = currentMessageCount;
    prevGeneratingRef.current = isGenerating;
  }, [messages, isGenerating, generatingId, scrollToBottomUnified]);

  // Handle message continuation
  const handleContinueResponse = (message: Message) => {
    if (message.role === 'assistant') {
      // Make sure we indicate generation is happening
      if (!isGenerating) {
        console.log('Starting continuation for message:', message.id);
      }
      continueResponse(message);
    }
  };

  // Show the correct stop button during continuation
  const getStopHandler = (message: Message): (() => void) | undefined => {
    if (message.role !== 'assistant') return undefined;

    // If this message is currently being generated by either method
    return isGenerating && (generatingId === message.id)
      ? stopGeneration
      : undefined;
  };

  // Function to find the first assistant message index in the chat
  const getFirstAssistantMessageIndex = useCallback(() => {
    return messages.findIndex(msg => msg.role === 'assistant');
  }, [messages]);

  // Function to check if a message is the first assistant message
  const isFirstAssistantMessage = useCallback((messageId: string): boolean => {
    const firstAssistantIndex = getFirstAssistantMessageIndex();
    return firstAssistantIndex !== -1 && messages[firstAssistantIndex].id === messageId;
  }, [messages, getFirstAssistantMessageIndex]);

  // Function to regenerate the first assistant message (greeting)
  const handleRegenerateGreeting = useCallback(async () => {
    if (!characterData || isGenerating) return;

    const firstAssistantIndex = getFirstAssistantMessageIndex();
    if (firstAssistantIndex === -1) {
      console.error("Cannot regenerate greeting: No assistant message found.");
      return;
    }

    handleDismissError(); // Clear previous errors (local and hook)
    regenerateGreeting();
  }, [characterData, isGenerating, getFirstAssistantMessageIndex, handleDismissError, regenerateGreeting]);

  // Handle sending a message - Reverted to not pass API ID
  const handleSendMessage = (content: string) => {
    if (!content.trim() || isGenerating) return;
    generateResponse(content);
  };

  // Emotion detection hook - Corrected destructuring
  const { currentEmotion: emotion } = useEmotionDetection(messages, characterData?.data?.name);

  // Render logic
  if (!characterData) {
    return <div className="flex items-center justify-center h-full text-gray-400">Select a character to start chatting.</div>;
  }

  return (
    <div className="h-full relative flex flex-col overflow-hidden">
      {/* Background Image/Mood */}
      <div className="absolute inset-0 z-0">
        {backgroundSettings.moodEnabled ? (
          <MoodEmotionBackground
            messages={messages}
            characterName={characterData.data.name || 'Character'}
            transparency={backgroundSettings.transparency}
            fadeLevel={backgroundSettings.fadeLevel}
            backgroundUrl={backgroundSettings.background?.url} // Pass backgroundUrl
          />
        ) : backgroundSettings.background?.url ? ( // Check for .url
          <div
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
            style={{
              backgroundImage: `url(${backgroundSettings.background.url})`, // Use .url
              opacity: 1 - (backgroundSettings.transparency / 100), // Correct opacity
              filter: `blur(${backgroundSettings.fadeLevel / 3}px)`, // Apply blur directly, consistent with MoodBackground
            }}
          />
        ) : null}
        {/* Fade Overlay - Conditionally render */}
        {!backgroundSettings.moodEnabled && backgroundSettings.background?.url && !backgroundSettings.disableAnimation && (
          <div
            className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/80 to-transparent"
            style={{ bottom: '70%' }} /* Fixed extent for gradient, e.g., bottom 30% */
          />
        )}
      </div>

      {/* Header */}
      <div className="flex-none p-4 border-b border-stone-800 relative z-10 flex justify-between items-center">
        <h2 className="text-xl font-semibold">{characterData.data.name}</h2>
        <div className="flex items-center gap-2">
          {/* Reasoning Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={reasoningSettings.enabled}
              onChange={(e) => {
                handleReasoningSettingsChange({ ...reasoningSettings, enabled: e.target.checked });
              }}
              className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-xs text-gray-300">Show Reasoning</span>
          </label>
          {reasoningSettings.enabled && (
            <label className="flex items-center gap-2 cursor-pointer ml-4">
              <input
                type="checkbox"
                checked={reasoningSettings.visible}
                onChange={(e) => {
                  handleReasoningSettingsChange({ ...reasoningSettings, visible: e.target.checked });
                }}
                className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-xs text-gray-300">Visible</span>
            </label>
          )}
          {/* End Reasoning Toggle */}
          <button onClick={() => setShowContextWindow(true)} className="p-1 text-gray-400 hover:text-white" title="View Context Window">
            <Eye size={18} />
          </button>
          <button onClick={() => setShowBackgroundSettings(true)} className="p-1 text-gray-400 hover:text-white" title="Background Settings">
            <Wallpaper size={18} />
          </button>
          <button onClick={() => setShowChatSelector(true)} className="p-1 text-gray-400 hover:text-white" title="Select Chat">
            <MessageSquare size={18} />
          </button>
          <button onClick={handleNewChat} className="p-1 text-gray-400 hover:text-white" title="New Chat">
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Error Display */}
      <div className="relative z-10 px-8 py-2">
        <ErrorMessage
          message={combinedError}
          onDismiss={handleDismissError}
        />
      </div>      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-hidden relative z-10">
        <div className="h-full overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <React.Fragment key={message.id}>
              {message.role === 'thinking' && reasoningSettings.visible ? (
                <ThoughtBubble
                  message={message} // Pass the full message object
                  isGenerating={message.status === 'streaming'}
                  // Provide dummy handlers as editing/deleting thoughts isn't implemented here
                  onContentChange={(newContent) => console.log('Thought changed (not implemented):', newContent)}
                  onDelete={() => console.log('Delete thought (not implemented)')}
                  characterName={characterData.data.name}
                />
              ) : null}
              {message.role !== 'thinking' && (
                <ChatBubble
                  message={message}
                  characterName={characterData.data.name || 'Character'}
                  currentUser={currentUser || undefined} // Convert null to undefined for type compatibility
                  isGenerating={isGenerating && generatingId === message.id}
                  onTryAgain={() => regenerateMessage(message)} // Use onTryAgain and wrap handler
                  onContinue={() => handleContinueResponse(message)} // Wrap handler
                  onDelete={() => deleteMessage(message.id)} // Wrap handler
                  onContentChange={(newContent) => updateMessage(message.id, newContent)} // Use onContentChange for edits
                  onStop={getStopHandler(message)} // Correct prop name
                  isFirstMessage={isFirstAssistantMessage(message.id)} // Corrected prop name
                  onRegenerateGreeting={handleRegenerateGreeting}
                  isRegeneratingGreeting={isGenerating && isFirstAssistantMessage(message.id)}
                  onNextVariation={() => cycleVariation(message.id, 'next')} // Add variation handlers
                  onPrevVariation={() => cycleVariation(message.id, 'prev')} // Add variation handlers
                />
              )}
            </React.Fragment>
          ))}
          <div ref={messagesEndRef} /> {/* Scroll target */}
        </div>
      </div>

      {/* Input Area - Reverted */}
      <div className="relative z-10">
        <InputArea
          onSend={handleSendMessage}
          isGenerating={isGenerating}
          currentUser={currentUser}
          onUserSelect={() => setShowUserSelect(true)}
          emotion={emotion} // Pass the correctly destructured emotion state
          // Removed API selector props
        />
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
        onSelect={handleLoadChat} // Use onSelect prop for loading
        characterData={characterData} // Correct prop name
        currentChatId={currentChatId}
      />
      <ContextWindowModal
        isOpen={showContextWindow}
        onClose={() => setShowContextWindow(false)}
        contextData={lastContextWindow} // Correct prop name
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

// Helper component for Mood Background
interface MoodEmotionBackgroundProps {
  messages: Message[];
  characterName: string;
  transparency: number;
  fadeLevel: number;
  backgroundUrl?: string | null; // Add backgroundUrl prop
}

const MoodEmotionBackground: React.FC<MoodEmotionBackgroundProps> = ({ messages, characterName, transparency, fadeLevel, backgroundUrl }) => {
  const { currentEmotion: emotion } = useEmotionDetection(messages, characterName); // Correct destructuring

  return (
    <MoodBackground
      emotion={emotion}
      backgroundUrl={backgroundUrl} // Pass backgroundUrl to MoodBackground
      transparency={transparency}
      fadeLevel={fadeLevel}
    >
      <></> {/* Add empty children */}
    </MoodBackground>
  );
};


export default ChatView;