import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, User, Plus, Eye, Wallpaper, MessageSquare } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import ChatBubble from './ChatBubble';
import ThoughtBubble from './ThoughtBubble';
import UserSelect from './UserSelect';
import ChatSelectorDialog from './ChatSelectorDialog';
import ContextWindowModal from './ContextWindowModal';
import ChatBackgroundSettings, { BackgroundSettings } from './ChatBackgroundSettings';
import MoodBackground from './MoodBackground';
import MoodIndicator from './MoodIndicator'; // Import the MoodIndicator component
import { useChatMessages } from '../hooks/useChatMessages';
import { useEmotionDetection } from '../hooks/useEmotionDetection';
import { useChatContinuation } from '../hooks/useChatContinuation'; // Import the continuation hook
import { apiService } from '../services/apiService';
import { Message, UserProfile } from '../types/messages';
import { EmotionState } from '../hooks/useEmotionDetection'; // Import EmotionState type
import RichTextEditor from './RichTextEditor';
import { htmlToText, markdownToHtml } from '../utils/contentUtils';
import { generateUUID } from '../utils/uuidUtils';
import { substituteVariables } from '../utils/variableUtils'; // Import substituteVariables
import ErrorMessage from './ErrorMessage'; // Import the new ErrorMessage component
import { ChatStorage } from '../services/chatStorage'; // Make sure this is imported

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
// This hook is exported for use in other components
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

// Separate hook for scroll management
function useScrollToBottom() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current || !messagesEndRef.current) return;
    
    // Option 1: Use scrollIntoView with specific options
    messagesEndRef.current.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'end',
      inline: 'nearest'
    });
    
    // Double-check scroll position with a slight delay to account for layout adjustments
    setTimeout(() => {
      const container = messagesContainerRef.current;
      const endElement = messagesEndRef.current;
      if (!container || !endElement) return;
      
      // Check if we're actually at the bottom
      const containerRect = container.getBoundingClientRect();
      const endElementRect = endElement.getBoundingClientRect();
      
      // If we're not close enough to the bottom, force direct scrolling
      const scrollOffset = endElementRect.bottom - containerRect.bottom;
      if (Math.abs(scrollOffset) > 20) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }, []);

  return {
    messagesEndRef,
    messagesContainerRef,
    scrollToBottom
  };
}

// Separate InputArea component
const InputArea: React.FC<{
  onSend: (text: string) => void;
  isGenerating: boolean;
  currentUser: UserProfile | null;
  onUserSelect: () => void;
  emotion: EmotionState; // Changed from string | null to EmotionState
}> = ({ onSend, isGenerating, currentUser, onUserSelect, emotion }) => {
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
        <div
          onClick={onUserSelect}
          className="w-24 h-32 rounded-lg cursor-pointer overflow-hidden"
        >
          {currentUser && !imageError ? (
            <img
              src={`/api/user-image/${encodeURIComponent(currentUser.filename)}`}
              alt={currentUser.name}
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
        </div>

        <div className="flex-1 h-32 flex flex-col overflow-hidden"> {/* Added flex flex-col and overflow-hidden */}
          <RichTextEditor
            content={inputValue}
            onChange={setInputValue}
            className="bg-stone-950 border border-stone-800 rounded-lg flex-1 overflow-y-auto" /* Added flex-1 and overflow-y-auto */
            placeholder="Type your message..."
            onKeyDown={handleKeyPress}
            preserveWhitespace={true}
          />
        </div>

        <div className="flex flex-col items-center gap-2">
          {/* Add mood indicator directly above send button */}
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
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [showContextWindow, setShowContextWindow] = useState(false);
  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);
  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings>(DEFAULT_BACKGROUND_SETTINGS);
  
  // Use the custom scroll hook
  const { messagesEndRef, messagesContainerRef, scrollToBottom } = useScrollToBottom();

  const {
    messages,
    isGenerating,
    error,
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
    updateReasoningSettings,
    clearError
  } = useChatMessages(characterData);
  
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
    
    // Also update background settings in current chat metadata
    if (characterData && messages.length > 0) {
      try {
        // Pass current background settings when saving the chat
        ChatStorage.saveChat(
          characterData, 
          messages, 
          currentUser, 
          null, // No need to pass apiInfo here
          backgroundSettings // Pass current background settings
        );
      } catch (err) {
        console.error('Error saving background settings to chat metadata:', err);
      }
    }
  }, [backgroundSettings, characterData, messages, currentUser]);
  
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

  // Use the chat continuation hook
  const {
    continueResponse,
    stopContinuation,
    error: continuationError,
    clearError: clearContinuationError
  } = useChatContinuation(
    messages,
    characterData,
    (updatedMessages) => {
      // This is the saveMessages function passed to useChatContinuation
      apiService.saveChat(characterData!, updatedMessages, currentUser);
    },
    (updatedMessages) => {
      // This is the updateMessagesState function 
      // We don't have direct access to setState from useChatMessages, so we need a workaround
      const messagesToUpdate = updatedMessages.filter((msg, index) => 
        index < messages.length && JSON.stringify(msg) !== JSON.stringify(messages[index])
      );
      
      messagesToUpdate.forEach(msg => {
        // Pass true for isStreamingUpdate to prevent immediate saves during continuation
        updateMessage(msg.id, msg.content, true);
      });
    },
    // Now we properly set isGenerating state to show the stop button during continuation
    (isGen) => {
      // Update global generating state during continuation
      if (isGen && !isGenerating) {
        // We need a way to update the isGenerating state
        // Simulate clicking stop and re-starting to update UI state
        console.log('Setting continuation generating state');
        // Fire a custom event to notify components of generating state
        window.dispatchEvent(new CustomEvent('cardshark:continuation-generating', {
          detail: { generating: isGen }
        }));
      }
    },
    (genId) => {
      // No way to directly update generatingId from useChatMessages
      console.log('Continuation generating ID:', genId);
    },
    (contextWindow) => {
      console.log('Continuation context window:', contextWindow);
    }
  );

  // Add listener for forced generation stop
  useEffect(() => {
    const handleForceStop = () => {
      console.log('Received force stop event, resetting UI state');
      // If we're still generating, reset state
      if (isGenerating) {
        stopGeneration();
        stopContinuation();
      }
    };
    
    window.addEventListener('cardshark:force-generation-stop', handleForceStop);
    
    return () => {
      window.removeEventListener('cardshark:force-generation-stop', handleForceStop);
    };
  }, [isGenerating, stopGeneration, stopContinuation]);

  // If there's a continuation error, merge it with the main error
  const combinedError = error || continuationError;
  
  // Handle error dismissal from either source
  const handleDismissError = useCallback(() => {
    if (error) {
      // Clear error from useChatMessages hook
      clearError();
    }
    if (continuationError) {
      // Clear error from useChatContinuation hook
      clearContinuationError();
    }
  }, [error, continuationError, clearError, clearContinuationError]);

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
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.messageContent) {
        // Get the raw message content before any processing
        const rawContent = customEvent.detail.messageContent;
        // Return the substituted content to be used instead
        const substitutedContent = substituteVariables(
          rawContent,
          currentUser?.name,
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

  // Modified handleNewChat function - simpler approach
  const handleNewChat = async () => {
    if (!characterData?.data?.first_mes) return;
    
    // Clear persisted context window
    try {
      await apiService.clearContextWindow();
    } catch (err) {
      console.error('Error clearing context window:', err);
    }
    
    // Create a new chat file on the backend
    try {
      const result = await ChatStorage.createNewChat(characterData);
      if (result?.success) {
        // Trigger the new chat creation with the special command
        generateResponse('/new');
      }
    } catch (err) {
      console.error('Error creating new chat:', err);
    }
  };

  const handleLoadChat = (chatId: string) => {
    if (!characterData) return;
    loadExistingChat(chatId);
    setShowChatSelector(false);
  };

  // Scroll when messages change, generation status changes, or on sidenav toggling
  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating, scrollToBottom]);

  // Handle message continuation
  const handleContinueResponse = (message: Message) => {
    if (message.role === 'assistant') {
      // Make sure we indicate generation is happening
      // Don't need to simulate anything here since continueResponse will trigger
      // the appropriate state changes through the callbacks we provided
      if (!isGenerating) {
        console.log('Starting continuation for message:', message.id);
        // No direct state setters available here from the hook
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
      : stopContinuation;
  };

  const handleSendMessage = (content: string) => {
    // First strip any HTML that might already be in the content
    const plainContent = content.replace(/<[^>]*>/g, '');
    
    // Convert markdown image syntax to HTML if needed
    const htmlContent = markdownToHtml(plainContent);
    
    // Create a message with both HTML content and raw text
    const userMessage = {
      id: generateUUID(),
      role: 'user',
      content: htmlContent,
      rawContent: htmlToText(htmlContent),
      timestamp: Date.now()
    };
    
    // Add the message to your state
    generateResponse(userMessage.content);
  };

  // Get current emotion for the indicator
  const { currentEmotion } = useEmotionDetection(messages, characterData?.data?.name);

  // Fix the character ID access

  // Debug: Log messages array before rendering
  console.log("DEBUG: Chat messages", messages);

  return (
    <div className="h-full relative flex flex-col overflow-hidden">
      {/* Mood-based Background */}
      {backgroundSettings.moodEnabled ? (
        <div className="absolute inset-0 z-0">
          <MoodEmotionBackground
            messages={messages}
            characterName={characterData?.data?.name}
            transparency={backgroundSettings.transparency}
            fadeLevel={backgroundSettings.fadeLevel}
          />
        </div>
      ) : (
        /* Static Background Image */
        backgroundSettings.background?.url && (
          <div
            className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${backgroundSettings.background.url})`,
              filter: `blur(${backgroundSettings.fadeLevel / 3}px)`
            }}
          />
        )
      )}
      
      {/* Header */}
      <div className="flex-none p-8 pb-4 flex justify-between items-center relative z-10"
           style={{ 
             backgroundColor: backgroundSettings.background?.url 
               ? `rgba(28, 25, 23, ${1 - backgroundSettings.transparency / 100})` 
               : undefined 
           }}>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">
            {characterData?.data?.name
              ? `Chatting with ${characterData.data.name}`
              : 'Chat'}
          </h2>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Reasoning settings toggles */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reasoningSettings.enabled}
                onChange={(e) => {
                  const updated = { ...reasoningSettings, enabled: e.target.checked };
                  handleReasoningSettingsChange(updated);
                }}
                className="form-checkbox h-4 w-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-300">Think</span>
            </label>
            {reasoningSettings.enabled && (
              <label className="flex items-center gap-2 cursor-pointer ml-4">
                <input
                  type="checkbox"
                  checked={reasoningSettings.visible}
                  onChange={(e) => {
                    const updated = { ...reasoningSettings, visible: e.target.checked };
                    handleReasoningSettingsChange(updated);
                  }}
                  className="form-checkbox h-4 w-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-300">Show Thoughts</span>
              </label>
            )}
          </div>

          {/* Background Settings button */}
          <button
            onClick={() => setShowBackgroundSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-transparent text-white rounded-lg hover:bg-gray-600 transition-colors"
            title="Background Settings"
          >
            <Wallpaper size={18} />
            BG
          </button>
          
          {/* Add Context Window button */}
          <button
            onClick={() => setShowContextWindow(true)}
            className="flex items-center gap-2 px-4 py-2 bg-transparent text-white rounded-lg hover:bg-gray-600 transition-colors"
            title="View API Context Window"
          >
            <Eye size={18} />
            Context
          </button>

          {/* Debug button - Add this for temporary troubleshooting }
          <button
            onClick={async () => {
              try {
                // Log character data to help debug
                console.log("Character data for API call:", characterData);
                
                // Ensure we have character data before proceeding
                if (!characterData) {
                  console.error("No character data available for debug call");
                  return;
                }
                
                // Make a direct API call to check response
                const response = await fetch('/api/list-character-chats', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    character_data: characterData, // Send the complete character data object
                    format: 'jsonl'
                  }),
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(`API error (${response.status}): ${errorText}`);
                }
                
                const data = await response.json();
                console.log("API response (list-character-chats):", data);
              } catch (err) {
                console.error("Debug API call failed:", err);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-transparent text-white rounded-lg hover:bg-yellow-700 transition-colors"
            title="Debug Chat Loading"
          >
            Debug
          </button>*/}

          <button
            onClick={() => setShowChatSelector(true)}
            className="flex items-center gap-2 px-4 py-2 bg-transparent text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <MessageSquare size={18} />
            Load Chat
          </button>

          <button
            onClick={handleNewChat}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            New
          </button>
        </div>
      </div>

      {/* Error display using the new component */}
      {combinedError && (
        <div className="relative z-10 px-8 py-2">
          <ErrorMessage 
            message={combinedError}
            severity="error"
            onDismiss={handleDismissError}
          />
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-8 py-4 scroll-smooth relative z-10"
        style={{ 
          backgroundColor: backgroundSettings.background?.url 
            ? `rgba(28, 25, 23, ${1 - backgroundSettings.transparency / 100})` 
            : undefined 
        }}
      >
        <div className="flex flex-col space-y-4">

          {messages.map((message) => (
            <React.Fragment key={message.id}>
              {message.role === 'thinking' && reasoningSettings.visible ? (
                <ThoughtBubble
                  message={message}
                  isGenerating={isGenerating && message.id === generatingId}
                  onContentChange={(content) => updateMessage(message.id, content)}
                  onDelete={() => deleteMessage(message.id)}
                  characterName={characterData?.data?.name}
                />
              ) : null}
              
              {message.role !== 'thinking' && (
                <ChatBubble
                  message={message}
                  isGenerating={isGenerating && message.id === generatingId}
                  onContentChange={(content) => updateMessage(message.id, content)}
                  onDelete={() => deleteMessage(message.id)}
                  onStop={getStopHandler(message)}
                  onTryAgain={
                    message.role === 'assistant' 
                      ? () => regenerateMessage(message) 
                      : undefined
                  }
                  onContinue={
                    message.role === 'assistant' 
                      ? () => handleContinueResponse(message) 
                      : undefined
                  }
                  onNextVariation={() => cycleVariation(message.id, 'next')}
                  onPrevVariation={() => cycleVariation(message.id, 'prev')}
                  currentUser={currentUser?.name}
                  characterName={characterData?.data?.name}
                />
              )}
            </React.Fragment>
          ))}
          <div ref={messagesEndRef} className="h-px" />
        </div>
      </div>

      {/* Input Area */}
      <div
        className="relative z-10"
        style={{ 
          backgroundColor: backgroundSettings.background?.url 
            ? `rgba(28, 25, 23, ${1 - backgroundSettings.transparency / 100})` 
            : undefined 
        }}
      >
        <InputArea
          onSend={handleSendMessage}
          isGenerating={isGenerating}
          currentUser={currentUser}
          onUserSelect={() => setShowUserSelect(true)}
          emotion={currentEmotion}
        />
      </div>

      {/* User Select Modal */}
      <UserSelect
        isOpen={showUserSelect}
        onClose={() => setShowUserSelect(false)}
        onSelect={(user) => {
          setCurrentUser(user);
          setShowUserSelect(false);
        }}
        currentUser={currentUser?.name}
      />

      {/* Chat Selector Dialog */}
      <ChatSelectorDialog
        isOpen={showChatSelector}
        onClose={() => setShowChatSelector(false)}
        onSelect={handleLoadChat}
        characterData={characterData}
      />

      {/* Context Window Modal */}
      <ContextWindowModal
        isOpen={showContextWindow}
        onClose={() => setShowContextWindow(false)}
        contextData={lastContextWindow}
        title="API Context Window"
      />

      {/* Background Settings Dialog */}
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

// Wrapper component for MoodBackground that connects to emotion detection
const MoodEmotionBackground: React.FC<{
  messages: Message[];
  characterName?: string;
  transparency: number;
  fadeLevel: number;
}> = ({ messages, characterName, transparency, fadeLevel }) => {
  const { currentEmotion } = useEmotionDetection(messages, characterName);
  
  return (
    <MoodBackground
      emotion={currentEmotion}
      backgroundUrl={null}
      transparency={transparency}
      fadeLevel={fadeLevel}
    >
      <div></div> {/* Empty div to satisfy the children prop requirement */}
    </MoodBackground>
  );
};

export default ChatView;