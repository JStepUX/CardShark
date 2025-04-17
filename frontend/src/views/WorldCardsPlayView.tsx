import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, User } from 'lucide-react';
import GameWorldIconBar from '../components/GameWorldIconBar';
import { useCharacter } from '../contexts/CharacterContext';
import { CharacterCard } from '../types/schema';
import { FullWorldState } from '../types/worldState';
import ChatBubble from '../components/ChatBubble';
import ThoughtBubble from '../components/ThoughtBubble';
import UserSelect from '../components/UserSelect';
import MoodBackground from '../components/MoodBackground';
import MoodIndicator from '../components/MoodIndicator';
import { useChatMessages } from '../hooks/useChatMessages';
import { useEmotionDetection } from '../hooks/useEmotionDetection';
import { useChatContinuation } from '../hooks/useChatContinuation';
import { apiService } from '../services/apiService';
import { Message, UserProfile } from '../types/messages';
import { EmotionState } from '../hooks/useEmotionDetection';
import RichTextEditor from '../components/RichTextEditor';
import { htmlToText, markdownToHtml } from '../utils/contentUtils';
import { generateUUID } from '../utils/uuidUtils';
import { substituteVariables } from '../utils/variableUtils';
import ErrorMessage from '../components/ErrorMessage';
import { BackgroundSettings } from '../components/ChatBackgroundSettings';

// Default background settings
const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  background: null,
  transparency: 85,
  fadeLevel: 30,
  disableAnimation: false,
  moodEnabled: false
};

// Custom hooks for generation timing management
const useGenerationTimeout = (isGenerating: boolean, stopGeneration: () => void, timeout = 30000) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (isGenerating) {
      console.log(`Setting generation timeout (${timeout}ms)`);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      timeoutRef.current = setTimeout(() => {
        console.warn('Generation timeout reached - forcing stop');
        stopGeneration();
      }, timeout);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isGenerating, stopGeneration, timeout]);
};

const useEnhancedGenerationTimeout = (
  isGenerating: boolean, 
  stopGeneration: () => void, 
  initialTimeout = 30000,
  hardTimeout = 60000
) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (isGenerating) {
      console.log(`Setting generation timeouts (normal: ${initialTimeout}ms, hard: ${hardTimeout}ms)`);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (hardTimeoutRef.current) {
        clearTimeout(hardTimeoutRef.current);
        hardTimeoutRef.current = null;
      }
      
      timeoutRef.current = setTimeout(() => {
        console.warn('Generation timeout reached - attempting to stop');
        stopGeneration();
      }, initialTimeout);
      
      hardTimeoutRef.current = setTimeout(() => {
        console.error('HARD generation timeout reached - forcing stop');
        stopGeneration();
        
        window.dispatchEvent(new CustomEvent('cardshark:force-generation-stop'));
      }, hardTimeout);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (hardTimeoutRef.current) {
        clearTimeout(hardTimeoutRef.current);
        hardTimeoutRef.current = null;
      }
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (hardTimeoutRef.current) {
        clearTimeout(hardTimeoutRef.current);
        hardTimeoutRef.current = null;
      }
    };
  }, [isGenerating, stopGeneration, initialTimeout, hardTimeout]);
};

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

function useScrollToBottom() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current || !messagesEndRef.current) return;
    
    messagesEndRef.current.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'end',
      inline: 'nearest'
    });
    
    setTimeout(() => {
      const container = messagesContainerRef.current;
      const endElement = messagesEndRef.current;
      if (!container || !endElement) return;
      
      const containerRect = container.getBoundingClientRect();
      const endElementRect = endElement.getBoundingClientRect();
      
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
  emotion: EmotionState;
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

  useEffect(() => {
    setImageError(false);
  }, [currentUser?.filename]);

  return (
    <div className="p-4 border-t border-stone-800 w-full">
      <div className="flex items-end gap-4">
        <div
          onClick={onUserSelect}
          className="w-16 h-16 sm:w-20 sm:h-24 rounded-lg cursor-pointer overflow-hidden flex-shrink-0"
        >
          {currentUser && !imageError ? (
            <img
              src={`/api/user-image/serve/${encodeURIComponent(currentUser.filename)}`}
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

        <div className="flex-1 h-24 sm:h-28 flex flex-col overflow-hidden">
          <RichTextEditor
            content={inputValue}
            onChange={setInputValue}
            className="bg-stone-950 border border-stone-800 rounded-lg flex-1 overflow-y-auto"
            placeholder="Type your message..."
            onKeyDown={handleKeyPress}
            preserveWhitespace={true}
          />
        </div>

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
            className="px-3 py-3 sm:px-4 sm:py-4 bg-transparent text-white rounded-lg hover:bg-orange-700 
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} className="sm:size-18" />
          </button>
        </div>
      </div>
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
      <div></div>
    </MoodBackground>
  );
};

// Main WorldCardsPlayView component
const WorldCardsPlayView: React.FC = () => {
  const { worldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();
  const { characterData, setCharacterData } = useCharacter();
  const [isLoadingWorld, setIsLoadingWorld] = useState(true);
  const [worldLoadError, setWorldLoadError] = useState<string | null>(null);
  const [currentRoomName, setCurrentRoomName] = useState<string>("Play");
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [backgroundSettings] = useState<BackgroundSettings>(DEFAULT_BACKGROUND_SETTINGS);
  
  // Use the custom scroll hook
  const { messagesEndRef, messagesContainerRef, scrollToBottom } = useScrollToBottom();

  const {
    messages,
    isGenerating,
    error,
    currentUser,
    generatingId,
    generateResponse,
    regenerateMessage,
    cycleVariation,
    stopGeneration,
    deleteMessage,
    updateMessage,
    setCurrentUser,
    clearError
  } = useChatMessages(characterData);

  // Fetch world/character data when component mounts or worldId changes
  useEffect(() => {
    const loadWorldForPlay = async () => {
      if (!worldId) {
        setWorldLoadError("World ID missing from URL.");
        setIsLoadingWorld(false);
        return;
      }
      setIsLoadingWorld(true);
      setWorldLoadError(null);
      try {
        const response = await fetch(`/api/world-state/load/${encodeURIComponent(worldId)}`);
        if (!response.ok) {
          throw new Error(`Failed to load world data: ${response.statusText}`);
        }
        const worldData = await response.json() as FullWorldState & { current_position?: string };

        // Create CharacterCard for Context - using description as first_mes
const characterCardForContext: CharacterCard = {
          name: worldData.name || "", 
          description: worldData.description || "",
          personality: "", 
          scenario: "", 
          first_mes: worldData.description || "Welcome to this world!", // Use description as first_mes
          mes_example: "", 
          creatorcomment: "",
          avatar: "none", 
          chat: "", 
          talkativeness: "0.5", 
          fav: false, 
          tags: [],
          spec: "chara_card_v2", 
          spec_version: "2.0", 
          create_date: "",
          data: {
            name: worldData.name || "", 
            description: worldData.description || "",
            personality: "", 
            scenario: "", 
            first_mes: worldData.description || "Welcome to this world!", // Same here
            mes_example: "", 
            creator_notes: "",
            system_prompt: "", 
            post_history_instructions: "", 
            tags: [], 
            creator: "",
            character_version: "", 
            alternate_greetings: [],
            extensions: {
              talkativeness: "0.5", 
              fav: false, 
              world: worldData.name || "Unknown World",
              depth_prompt: { prompt: "", depth: 4, role: "system" }
            },
            group_only_greetings: [], 
            character_book: { 
              // Instead of accessing 'items' directly, use a safe approach:
              entries: (worldData as any).worldItems?.map((item: any) => ({
                keys: [item.name || "Unknown Item"],
                content: item.description || ""
              })) || [], 
              name: "World Items" 
            }, 
            spec: ''
          }
        };
        setCharacterData(characterCardForContext);

        // Find and set current room name
        console.log("Fetched worldData:", worldData);
        const currentRoomId = worldData.current_position;
        console.log("Attempting to find room for ID:", currentRoomId);
        const currentRoom = worldData.rooms?.find(room => room.id === currentRoomId);
        console.log("Found currentRoom object:", currentRoom);
        const roomName = currentRoom?.name || "Unknown Room";
        console.log("Setting currentRoomName state to:", roomName);
        setCurrentRoomName(roomName);

      } catch (err: any) {
        console.error("Error loading world for play:", err);
        setWorldLoadError(`Failed to load world: ${err.message || 'Unknown error'}`);
        setCharacterData(null);
      } finally {
        setIsLoadingWorld(false);
      }
    };

    loadWorldForPlay();
  }, [worldId, setCharacterData]);

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
      if (characterData) {
        apiService.saveChat(characterData, updatedMessages, currentUser);
      }
    },
    (updatedMessages) => {
      const messagesToUpdate = updatedMessages.filter((msg, index) => 
        index < messages.length && JSON.stringify(msg) !== JSON.stringify(messages[index])
      );
      
      messagesToUpdate.forEach(msg => {
        updateMessage(msg.id, msg.content, true);
      });
    },
    (isGen) => {
      if (isGen && !isGenerating) {
        console.log('Setting continuation generating state');
        window.dispatchEvent(new CustomEvent('cardshark:continuation-generating', {
          detail: { generating: isGen }
        }));
      }
    },
    (genId) => {
      console.log('Continuation generating ID:', genId);
    },
    (contextWindow) => {
      console.log('Continuation context window:', contextWindow);
    }
  );

  // Use timeout hooks
  useGenerationTimeout(isGenerating, stopGeneration, 30000);
  useGenerationTimeout(isGenerating, stopContinuation, 30000);
  useEnhancedGenerationTimeout(isGenerating, stopGeneration, 30000, 60000);
  useEnhancedGenerationTimeout(isGenerating, stopContinuation, 30000, 60000);

  // Add listener for forced generation stop
  useEffect(() => {
    const handleForceStop = () => {
      console.log('Received force stop event, resetting UI state');
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
      clearError();
    }
    if (continuationError) {
      clearContinuationError();
    }
  }, [error, continuationError, clearError, clearContinuationError]);

  // Listen for custom event from useChatMessages when first message is being created
  useEffect(() => {
    const handleFirstMessageCreation = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.messageContent) {
        const rawContent = customEvent.detail.messageContent;
        const substitutedContent = substituteVariables(
          rawContent,
          currentUser?.name,
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

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating, scrollToBottom]);

  // Handle message continuation
  const handleContinueResponse = (message: Message) => {
    if (message.role === 'assistant') {
      if (!isGenerating) {
        console.log('Starting continuation for message:', message.id);
      }
      continueResponse(message);
    }
  };

  // Show the correct stop button during continuation
  const getStopHandler = (message: Message): (() => void) | undefined => {
    if (message.role !== 'assistant') return undefined;
    
    return isGenerating && (generatingId === message.id) 
      ? stopGeneration 
      : stopContinuation;
  };

  const handleSendMessage = (content: string) => {
    const plainContent = content.replace(/<[^>]*>/g, '');
    const htmlContent = markdownToHtml(plainContent);
    
    const userMessage = {
      id: generateUUID(),
      role: 'user',
      content: htmlContent,
      rawContent: htmlToText(htmlContent),
      timestamp: Date.now()
    };
    
    generateResponse(userMessage.content);
  };

  // Get current emotion for the indicator
  const { currentEmotion } = useEmotionDetection(messages, characterData?.data?.name);

  return (
    <div className="w-full h-full relative">
      {/* Background Layer */}
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
      
      {/* Main Content Container */}
      <div className="relative h-full flex flex-col z-10">
        {/* Breadcrumb Navigation */}
        <nav className="flex-none flex items-center gap-2 p-4 bg-stone-900/80">
          <button
            className="text-blue-500 hover:underline font-semibold focus:outline-none focus:ring focus:ring-blue-300 rounded"
            onClick={() => {
              if (worldId) {
                navigate(`/worldcards/${worldId}/builder`);
              } else {
                navigate('/worldcards');
              }
            }}
            aria-label={`Back to builder for ${characterData?.data?.name || 'World'}`}
          >
            {characterData?.data?.name || 'World'}
          </button>
          <span className="text-gray-400 px-1">/</span>
          <span className="text-gray-600">{isLoadingWorld ? "Loading..." : currentRoomName}</span>
        </nav>

        {/* Header */}
        <div className="flex-none p-4 bg-stone-900/80">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold">
              {characterData?.data?.name ? `Playing in ${characterData.data.name}` : 'World Play'}
            </h2>
          </div>
        </div>

        {/* Error display */}
        {combinedError && (
          <div className="flex-none px-4 py-2">
            <ErrorMessage 
              message={combinedError}
              severity="error"
              onDismiss={handleDismissError}
            />
          </div>
        )}

        {/* Messages area - scrollable */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 pb-40"
          style={{ 
            backgroundColor: backgroundSettings.background?.url 
              ? `rgba(28, 25, 23, ${1 - backgroundSettings.transparency / 100})` 
              : undefined 
          }}
        >
          <div className="flex flex-col space-y-4">
            {messages.map((message) => (
              <React.Fragment key={message.id}>
                {message.role === 'thinking' && (
                  <ThoughtBubble
                    message={message}
                    isGenerating={isGenerating && message.id === generatingId}
                    onContentChange={(content) => updateMessage(message.id, content)}
                    onDelete={() => deleteMessage(message.id)}
                    characterName={characterData?.data?.name}
                  />
                )}
                
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

        {/* Fixed Bottom Controls */}
        <div className="absolute bottom-0 inset-x-0 w-full">
          <div className="py-2 px-4 pb-0 bg-stone-900/90">
            <GameWorldIconBar 
              onMap={() => {}}
              onInventory={() => {}}
              onSpells={() => {}}
              onMelee={() => {}}
              onStats={() => {}}
            />
          </div>
          
          <div className="bg-stone-900/95 border-t border-stone-700">
            <InputArea
              onSend={handleSendMessage}
              isGenerating={isGenerating}
              currentUser={currentUser}
              onUserSelect={() => setShowUserSelect(true)}
              emotion={currentEmotion}
            />
          </div>
        </div>
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
    </div>
  );
};

export default WorldCardsPlayView;