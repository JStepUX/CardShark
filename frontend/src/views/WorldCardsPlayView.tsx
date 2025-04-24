import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, User } from 'lucide-react'; // Removed unused MapIcon import
import GameWorldIconBar from '../components/GameWorldIconBar'; // Re-introduce the import
import { useCharacter, CharacterData } from '../contexts/CharacterContext';
import { Dialog } from '../components/Dialog'; // Correctly import the custom Dialog
import { CharacterCard } from '../types/schema';
import { NpcGridItem } from '../types/worldState';
import { Location as WorldLocation } from '../types/world'; // Import Location directly from world.ts as WorldLocation
import worldStateApi from '../utils/worldStateApi';
import ChatBubble from '../components/ChatBubble';
import ThoughtBubble from '../components/ThoughtBubble';
import UserSelect from '../components/UserSelect';
// import MoodBackground from '../components/MoodBackground'; // Removed
import MoodIndicator from '../components/MoodIndicator';
import { useChatMessages } from '../hooks/useChatMessages';
// import { useEmotionDetection, EmotionState } from '../hooks/useEmotionDetection'; // Removed
import { Message, UserProfile } from '../types/messages';
import RichTextEditor from '../components/RichTextEditor';
// import { htmlToText, markdownToHtml } from '../utils/contentUtils'; // Unused
import { generateUUID } from '../utils/uuidUtils';
// import { substituteVariables } from '../utils/variableUtils'; // Unused
import ErrorMessage from '../components/ErrorMessage';
// import { BackgroundSettings } from '../components/ChatBackgroundSettings'; // Removed unused import
import GalleryGrid from '../components/GalleryGrid';
import NpcCard from '../components/NpcCard';
import { useAPIConfig } from '../contexts/APIConfigContext';
import MapDialog from '../components/MapDialog';
import { formatWorldName } from '../utils/formatters'; // Removed unused formatUserName import

// Custom hooks for generation timing management (Included as they were in the provided file)
// Removed unused useGenerationTimeout hook

const useEnhancedGenerationTimeout = (isGenerating: boolean, stopGeneration: () => void, initialTimeout = 30000, hardTimeout = 60000) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isGenerating) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (hardTimeoutRef.current) clearTimeout(hardTimeoutRef.current);
      timeoutRef.current = setTimeout(() => { console.warn('Initial timeout'); stopGeneration(); }, initialTimeout);
      hardTimeoutRef.current = setTimeout(() => { console.error('Hard timeout'); stopGeneration(); window.dispatchEvent(new CustomEvent('cardshark:force-generation-stop')); }, hardTimeout);
    } else {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (hardTimeoutRef.current) { clearTimeout(hardTimeoutRef.current); hardTimeoutRef.current = null; }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (hardTimeoutRef.current) clearTimeout(hardTimeoutRef.current);
    };
  }, [isGenerating, stopGeneration, initialTimeout, hardTimeout]);
};

export const useStallDetection = (isGenerating: boolean, content: string, onStallDetected: () => void, stallTimeout = 8000) => {
  const contentRef = useRef(content);
  const lastUpdateRef = useRef(Date.now());
  const stallCheckRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => { if (content !== contentRef.current) { contentRef.current = content; lastUpdateRef.current = Date.now(); } }, [content]);
  useEffect(() => {
    if (isGenerating) {
      stallCheckRef.current = setInterval(() => {
        if (Date.now() - lastUpdateRef.current > stallTimeout) {
          console.warn('Stall detected'); onStallDetected();
          if (stallCheckRef.current) { clearInterval(stallCheckRef.current); stallCheckRef.current = null; }
        }
      }, 1000);
    } else if (stallCheckRef.current) { clearInterval(stallCheckRef.current); stallCheckRef.current = null; }
    return () => { if (stallCheckRef.current) clearInterval(stallCheckRef.current); };
  }, [isGenerating, stallTimeout, onStallDetected]);
};

function useScrollToBottom() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current || !messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    setTimeout(() => {
      const container = messagesContainerRef.current; const endElement = messagesEndRef.current;
      if (!container || !endElement) return;
      const containerRect = container.getBoundingClientRect(); const endElementRect = endElement.getBoundingClientRect();
      const scrollOffset = endElementRect.bottom - containerRect.bottom;
      if (Math.abs(scrollOffset) > 20) container.scrollTop = container.scrollHeight;
    }, 100);
  }, []);
  return { messagesEndRef, messagesContainerRef, scrollToBottom };
}

// Separate InputArea component
const InputArea: React.FC<{
  onSend: (text: string) => void;
  isGenerating: boolean;
  currentUser: UserProfile | null;
  onUserSelect: () => void;
  emotion: any; // Changed EmotionState to any as it's no longer defined here
}> = ({ onSend, isGenerating, currentUser, onUserSelect, emotion }) => {
  const [inputValue, setInputValue] = useState('');
  const [imageError, setImageError] = useState(false);
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (inputValue.trim() && !isGenerating) { onSend(inputValue.trim()); setInputValue(''); } }
  };
  useEffect(() => { setImageError(false); }, [currentUser?.filename]);
  return (
    <div className="p-4 border-t border-stone-800 w-full">
      <div className="flex items-end gap-4">
        <div onClick={onUserSelect} className="w-16 h-16 sm:w-20 sm:h-24 rounded-lg cursor-pointer overflow-hidden flex-shrink-0">
          {currentUser && !imageError ? (<img src={`/api/user-image/${encodeURIComponent(currentUser.filename)}`} alt={currentUser.name} className="w-full h-full object-cover" onError={() => { console.error('User image load failed'); setImageError(true); }} />)
           : (<div className="w-full h-full bg-transparent border border-gray-700 rounded-lg flex items-center justify-center"><User className="text-gray-400" size={24} /></div>)}
        </div>
        <div className="flex-1 h-24 sm:h-28 flex flex-col overflow-hidden">
          <RichTextEditor content={inputValue} onChange={setInputValue} className="bg-stone-950 border border-stone-800 rounded-lg flex-1 overflow-y-auto" placeholder="Type your message..." onKeyDown={handleKeyPress} preserveWhitespace={true} />
        </div>
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <MoodIndicator emotion={emotion} size={24} showLabel={false} />
          <button onClick={() => { if (inputValue.trim() && !isGenerating) { onSend(inputValue.trim()); setInputValue(''); } }} disabled={!inputValue.trim() || isGenerating} className="px-3 py-3 sm:px-4 sm:py-4 bg-transparent text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Send size={18} className="sm:size-18" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Removed MoodEmotionBackground wrapper component

// Room Introduction Utilities removed as intro generation is handled differently now
// --- Type Definitions for useChatMessages Hook Return ---
interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions?: string;
}
interface SimplifiedChatState {
  messages: Message[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  currentUser: UserProfile | null;
  lastContextWindow: any;
  generatingId: string | null;
  reasoningSettings: ReasoningSettings;
}
interface UseChatMessagesReturn extends SimplifiedChatState {
  generateResponse: (userInput: string) => Promise<void>;
  regenerateMessage: (messageToRegenerate: Message) => Promise<void>;
  generateVariation: (messageToVary: Message) => Promise<void>;
  cycleVariation: (messageId: string, direction: 'next' | 'prev') => void;
  stopGeneration: () => void;
  setCurrentUser: (user: UserProfile | null) => void;
  loadExistingChat: (chatId: string) => Promise<void>;
  updateReasoningSettings: (settings: Partial<ReasoningSettings>) => void;
  deleteMessage: (messageId: string) => void;
  updateMessage: (messageId: string, newContent: string, isStreamingUpdate?: boolean) => void;
  handleNewChat: () => Promise<void>;
  clearError: () => void;
  activeCharacterData: CharacterData;
}

// --- Main WorldCardsPlayView component ---
const WorldCardsPlayView: React.FC = () => {
  // --- State ---
  const { worldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();
  const { characterData, setCharacterData, setImageUrl } = useCharacter();
  const [isLoadingWorld, setIsLoadingWorld] = useState(true);
  const [worldLoadError, setWorldLoadError] = useState<string | null>(null);
  const [currentRoomName, setCurrentRoomName] = useState<string>("Play");
  const [currentRoom, setCurrentRoom] = useState<WorldLocation | null>(null);
  const [worldState, setWorldState] = useState<any>(null); // Renamed from worldDataState to worldState for clarity
  const { apiConfig } = useAPIConfig();
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [isNpcDialogOpen, setIsNpcDialogOpen] = useState(false);
  const [isMapDialogOpen, setIsMapDialogOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);

  // Use the custom scroll hook
  const { messagesEndRef, messagesContainerRef, scrollToBottom } = useScrollToBottom();

  // Use the chat messages hook
  const {
    messages,
    isGenerating,
    error: chatError,
    currentUser,
    generatingId,
    generateResponse,
    regenerateMessage,
    cycleVariation,
    stopGeneration,
    deleteMessage,
    updateMessage,
    setCurrentUser,
    clearError: clearChatError,
    activeCharacterData
  }: UseChatMessagesReturn = useChatMessages(characterData, { isWorldPlay: true });

  // Load world chat data
  useEffect(() => {
    const loadWorldChat = async () => {
      if (!worldId) return;
      
      try {
        // Try to load the latest chat for this world
        const chatData = await worldStateApi.loadLatestChat(worldId);
        
        if (chatData) {
          // setWorldChatData(chatData);
          // Generate a unique chat ID if none exists
          if (chatData.metadata?.chat_id) {
            setChatId(chatData.metadata.chat_id);
          } else {
            const newChatId = `${worldId}-${generateUUID().slice(0, 8)}`;
            setChatId(newChatId);
          }
          
          // TODO: Initialize messages from chatData if we want to handle
          // world chat storage separately from the useChatMessages hook
        } else {
          // Create a new chat ID if none exists
          const newChatId = `${worldId}-${generateUUID().slice(0, 8)}`;
          setChatId(newChatId);
        }
      } catch (error) {
        console.error("Error loading world chat:", error);
        // Create a new chat ID if loading fails
        const newChatId = `${worldId}-${generateUUID().slice(0, 8)}`;
        setChatId(newChatId);
      }
    };
    
    loadWorldChat();
  }, [worldId]);

  // Save chat messages when they change
  useEffect(() => {
    const saveWorldChat = async () => {
      if (!worldId || !chatId || messages.length === 0) return;
      
      try {
        // Save the current messages to the world chat
        await worldStateApi.saveChat(worldId, chatId, {
          messages: messages,
          metadata: {
            world_name: worldId,
            chat_id: chatId,
            updated_at: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error("Error saving world chat:", error);
      }
    };
    
    // Only save when messages change and we're not generating
    if (!isGenerating && messages.length > 0) {
      saveWorldChat();
    }
  }, [messages, worldId, chatId, isGenerating]);

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
        // Use the imported worldStateApi utility
        const worldData = await worldStateApi.getWorldState(worldId); // Type assertion removed, handled by Promise return type
        setWorldState(worldData); // Store fetched world data in state

        // Determine current location description for context
        const currentPositionKey = worldData.current_position;
        const currentLoc = worldData.locations[currentPositionKey];
        const worldContextDescription = currentLoc?.description || `You are in the world of ${formatWorldName(worldData.name) || 'Unknown'}.`;
        // Use introduction field if available, fall back to description
        const worldContextFirstMes = currentLoc?.introduction || currentLoc?.description || `Welcome to ${formatWorldName(worldData.name) || 'this world'}!`;

        // Create CharacterCard for Context (using world info and current location)
        const characterCardForContext: CharacterCard = {
          name: worldData.name || "World Narrator", // Give it a name
          description: worldContextDescription, // Use current location description
          personality: "", // World doesn't have personality
          scenario: `Exploring the world of ${formatWorldName(worldData.name) || 'Unknown'}`,
          first_mes: worldContextFirstMes, // Use introduction field if available
          mes_example: "",
          creatorcomment: "",
          avatar: "none", // World doesn't have avatar
          chat: "", // No specific chat ID for the world itself
          talkativeness: "0.5",
          fav: false,
          tags: ["world", worldData.name || "unknown"],
          spec: "chara_card_v2",
          spec_version: "2.0",
          create_date: "", // Add creation date if available from backend
          data: {
            name: worldData.name || "World Narrator",
            description: worldContextDescription, // Use derived description
            personality: "",
            scenario: `Exploring the world of ${formatWorldName(worldData.name) || 'Unknown'}`,
            first_mes: worldContextFirstMes, // Also empty it in the data property
            mes_example: "",
            creator_notes: "",
            system_prompt: `You are the narrator describing the world of ${formatWorldName(worldData.name) || 'Unknown'}.`,
            post_history_instructions: "Describe the surroundings and events.",
            tags: ["world", worldData.name || "unknown"],
            creator: "", // Add creator if available
            character_version: "1.0",
            alternate_greetings: [],
            extensions: {
              talkativeness: "0.5",
              fav: false,
              world: worldData.name || "Unknown World",
              depth_prompt: { prompt: "", depth: 4, role: "system" }
            },
            group_only_greetings: [],
            character_book: { // Populate world items if available
              entries: (worldData as any).worldItems?.map((item: any) => ({
                keys: [item.name || "Unknown Item"],
                content: item.description || ""
              })) || [],
              name: "World Items"
            },
            spec: ''
          }
        };
        // Set this world-based character data in context if no character is selected
        // This allows useChatMessages to use world context when no specific character is active
        if (!characterData) {
             setCharacterData(characterCardForContext);
        }


        // Find the starting/current room using current_position
        // const currentPositionKey = worldData.current_position; // Already defined above
        let foundRoom: WorldLocation | null = worldData.locations[currentPositionKey] || null; // Use WorldLocation type directly
        let foundRoomId: string | null = foundRoom ? currentPositionKey : null; // Keep track of the key used

        // If no room found at current_position, try defaulting to "0,0,0" or the first available location
        if (!foundRoom && worldData.locations && Object.keys(worldData.locations).length > 0) {
          const defaultKey = "0,0,0";
          if (worldData.locations[defaultKey]) {
              foundRoomId = defaultKey;
              foundRoom = worldData.locations[defaultKey];
              console.warn("Current position invalid, defaulting to '0,0,0'.");
          } else {
              // Fallback to the very first location if "0,0,0" doesn't exist either
              foundRoomId = Object.keys(worldData.locations)[0];
              foundRoom = worldData.locations[foundRoomId];
              console.warn("Current position and '0,0,0' invalid, defaulting to the first available location:", foundRoom?.name);
          }
        }

        if (!foundRoom) {
          setWorldLoadError('No locations found in this world state or current position is invalid. Please add a location or check world state.');
          // setCurrentRoomId call removed
          setCurrentRoom(null);
          setCurrentRoomName('No Room');
        } else {
          // Handle potential undefined from find before setting state
          // setCurrentRoomId call removed
          setCurrentRoom(foundRoom);
          setCurrentRoomName(foundRoom.name || 'Unnamed Room');
          // Removed roomHistory initialization
          // Removed intro generation logic - initial message should be handled by chat hook or context
          // TODO: Review useChatMessages hook initialization to see if it can add the first message based on world/room description
        }
      } catch (err) {
        console.error("Error loading world:", err);
        setWorldLoadError(err instanceof Error ? err.message : 'Error loading world data.');
      } finally {
        setIsLoadingWorld(false);
      }
    };
    loadWorldForPlay();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, setCharacterData, apiConfig]); // Removed messages.length dependency, intro logic needs review

  // --- Generation Management ---
  useEnhancedGenerationTimeout(isGenerating, stopGeneration);
  useStallDetection(isGenerating, messages[messages.length - 1]?.content || '', stopGeneration);

  // Force stop generation on unmount
  useEffect(() => {
    return () => {
      if (isGenerating) {
        console.log("WorldCardsPlayView unmounting, stopping generation.");
        stopGeneration();
      }
    };
  }, [isGenerating, stopGeneration]);

  // --- Scrolling --- // Removed Emotion detection logic
  // const { currentEmotion } = useEmotionDetection(messages, activeCharacterData?.data?.name); // Removed unused variable

  // Scroll to bottom when messages change or generation stops
  useEffect(() => {
    scrollToBottom();
    const timer = setTimeout(scrollToBottom, 100); // Ensure scroll after render
    return () => clearTimeout(timer);
  }, [messages, isGenerating, scrollToBottom]);


  // --- NPC Dialog ---
  const handleNpcIconClick = useCallback(() => {
    // Assuming Location.npcs is an array of strings (character paths)
    if (currentRoom?.npcs && currentRoom.npcs.length > 0) setIsNpcDialogOpen(true);
  }, [currentRoom?.npcs]);

  // --- Other GameWorldIconBar Handlers ---
  const handleMapIconClick = useCallback(() => {
    setIsMapDialogOpen(true);
  }, []);

  const handleInventoryIconClick = useCallback(() => {
    // TODO: Implement inventory management
    console.log("Inventory icon clicked - feature to be implemented");
    window.alert("Inventory feature coming soon!");
  }, []);

  const handleSpellsIconClick = useCallback(() => {
    // TODO: Implement spells/abilities management
    console.log("Spells icon clicked - feature to be implemented");
    window.alert("Spells feature coming soon!");
  }, []);

  const handleMeleeIconClick = useCallback(() => {
    // TODO: Implement combat system
    console.log("Combat icon clicked - feature to be implemented");
    window.alert("Combat feature coming soon!");
  }, []);

  const handleNpcSelect = useCallback(async (npc: NpcGridItem) => {
    console.log("Selected NPC:", npc.name);
    
    try {
      // First load the character image
      const imageResponse = await fetch(`/api/character-image/${encodeURIComponent(npc.path)}`);
      if (!imageResponse.ok) {
        throw new Error(`Failed to load NPC image: ${imageResponse.statusText}`);
      }
      
      // Then load the character metadata
      const metadataResponse = await fetch(`/api/character-metadata/${encodeURIComponent(npc.path)}`);
      if (!metadataResponse.ok) {
        throw new Error(`Failed to load NPC metadata: ${metadataResponse.statusText}`);
      }
      
      const data = await metadataResponse.json();
      if (data.success && data.metadata) {
        // Create a modified version of the metadata that skips first_mes
        // This prevents the character's default greeting from being used in world context
        const modifiedMetadata = {
          ...data.metadata,
          first_mes: "", // Empty the first_mes to prevent it from being used
          data: {
            ...data.metadata.data,
            first_mes: "" // Also empty it in the data property
          }
        };
        
        // Set the modified character as the active character
        setCharacterData(modifiedMetadata);
        
        // Create image URL for the character
        const blob = await imageResponse.blob();
        const imageUrl = URL.createObjectURL(blob);
        
        // Set the image URL in context
        setImageUrl(imageUrl);
        
        // Close the NPC dialog
        setIsNpcDialogOpen(false);
        
        // Setup character interaction in world context
        const characterName = modifiedMetadata.data?.name || npc.name;
        // Clean up username by removing .png extension
        const userName = currentUser?.name ? currentUser.name.replace(/\.png$/i, '') : 'the user';
        const roomName = currentRoom?.name || currentRoomName;
        const roomContext = currentRoom?.description || `You are in ${roomName}.`;
        
        // Generate a context-appropriate introduction directly instead of showing the system message
        // The message will be sent as a hidden system message to the LLM but won't be displayed
        generateResponse(`__system__: Narrator, you now inhabit the role of ${characterName}, please respond to the presence of ${userName} while remaining in the context of ${roomName}. ${roomContext}`);
      } else {
        throw new Error(data.message || "Failed to get valid character metadata");
      }
    } catch (error) {
      console.error("Error loading NPC character:", error);
      window.alert(`Failed to load NPC: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [generateResponse, setCharacterData, setImageUrl, currentRoom, currentRoomName, currentUser?.name]);

  // --- Room Navigation ---
  const handleRoomSelect = useCallback(async (position: string) => {
    if (!worldId) return;
    
    try {
      // Use existing worldState if available for better performance, otherwise fetch fresh data
      const currentState = worldState || await worldStateApi.getWorldState(worldId);
      
      // Store the previous room for context
      const previousPosition = currentState.current_position;
      const previousRoom = currentState.locations[previousPosition];
      
      // Update the world state with the new position
      const updatedState = {
        ...currentState,
        current_position: position,
        visited_positions: currentState.visited_positions.includes(position) 
          ? currentState.visited_positions 
          : [...currentState.visited_positions, position]
      };
      
      // Save the updated state
      await worldStateApi.saveWorldState(worldId, updatedState);
      
      // Get the selected room
      const selectedRoom = updatedState.locations[position];
      if (!selectedRoom) {
        throw new Error("Selected room not found in world state");
      }
      
      // Update local state
      setWorldState(updatedState);
      setCurrentRoom(selectedRoom);
      setCurrentRoomName(selectedRoom.name || "Unnamed Room");
      
      // Generate a narrative for entering the new room
      const roomIntroduction = selectedRoom.introduction || selectedRoom.description || `You've entered ${selectedRoom.name || "a new room"}.`;
      
      // Add a message about entering the new room
      const previousRoomName = previousRoom?.name || "the previous area";
      const message = `You leave ${previousRoomName} and enter ${selectedRoom.name || "a new area"}. ${roomIntroduction}`;
      
      generateResponse(message);
    } catch (error) {
      console.error("Error navigating to room:", error);
      setWorldLoadError(`Failed to navigate to the selected room: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [worldId, generateResponse, worldState]); // Added worldState to dependency array

  // --- Helper Functions ---
  const getStopHandler = (message: Message): (() => void) | undefined => {
    return (message.id === generatingId && isGenerating) ? stopGeneration : undefined;
  };

  // --- Event Handlers ---
  const handleClearError = () => {
    clearChatError();
    // setIntroError(null); // Removed
    setWorldLoadError(null);
  };

  const handleSendMessage = (content: string) => {
    if (!currentUser) { setShowUserSelect(true); return; }
    if (content.trim()) {
      generateResponse(content.trim());
    }
  };

  // --- Render Logic ---
  const npcCount = currentRoom?.npcs?.length || 0;
  const combinedError = chatError || worldLoadError; // Removed introError

  if (isLoadingWorld) {
    return <div className="flex items-center justify-center h-full">Loading World...</div>;
  }

  return (
    <div className="w-full h-full relative">
      {/* Background Layer Removed */}

      {/* Foreground Content Layer */}
      <div className="relative h-full flex flex-col z-10">
        {/* Top Bar */}
        <nav className="flex-none flex items-center gap-2 p-4 bg-stone-900/80">
          <button onClick={() => navigate('/worldcards')} className="px-3 py-1 bg-stone-700 hover:bg-stone-600 text-white rounded text-sm">Back to Worlds</button>
          <span className="font-bold text-lg">{currentRoomName}</span>
          {npcCount > 0 && (
             <button onClick={handleNpcIconClick} className="px-3 py-1 bg-stone-700 hover:bg-stone-600 text-white rounded text-sm flex items-center gap-1" title={`View NPCs (${npcCount})`}>
               <User size={18} /> <span>({npcCount})</span>
             </button>
          )}
        </nav>

        {/* Error Display */}
        {combinedError && (
          <div className="relative z-10 px-8 py-2">
            {/* Ensure ErrorMessage is rendered correctly */}
            <ErrorMessage
              message={combinedError}
              onDismiss={handleClearError} // Use combined handler
            />
          </div>
        )}

        {/* Chat Messages Area */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
           {messages.map((message: Message) => (
            <React.Fragment key={message.id}>
              {message.role === 'thinking' && (
                  // Correct props for ThoughtBubble
                  <ThoughtBubble
                    message={message}
                    isGenerating={message.id === generatingId && isGenerating}
                    onContentChange={(newContent: string) => updateMessage(message.id, newContent)} // Add type
                    onDelete={() => deleteMessage(message.id)}
                    characterName={activeCharacterData?.data?.name}
                  />
              )}
              {message.role !== 'thinking' && (
                // Correct props for ChatBubble
                <ChatBubble
                  message={message}
                  isGenerating={message.id === generatingId && isGenerating}
                  onContentChange={(newContent: string) => updateMessage(message.id, newContent)} // Add type
                  onDelete={() => deleteMessage(message.id)}
                  onStop={getStopHandler(message)}
                  onTryAgain={() => regenerateMessage(message)} // Map onRegenerate to onTryAgain
                  // onContinue prop is optional and not used here
                  onNextVariation={() => cycleVariation(message.id, 'next')} // Split cycleVariation
                  onPrevVariation={() => cycleVariation(message.id, 'prev')} // Split cycleVariation
                  currentUser={currentUser?.name} // Pass name string
                  characterName={activeCharacterData?.data?.name} // Pass name string
                />
              )}
            </React.Fragment>
           ))}
          <div ref={messagesEndRef} /> {/* Scroll target */}
        </div>

        {/* Icon Bar - Inserted between chat and input */}
        <div className="px-4 py-2 bg-stone-900/90 border-t border-b border-stone-700">
          <GameWorldIconBar 
            onNpcs={npcCount > 0 ? handleNpcIconClick : undefined}
            npcCount={npcCount}
            onMap={handleMapIconClick}
            onInventory={handleInventoryIconClick}
            onSpells={handleSpellsIconClick}
            onMelee={handleMeleeIconClick}
          />
        </div>

        {/* Input Area */}
        <div className="bg-stone-900/95 border-t border-stone-700">
          <InputArea
            onSend={handleSendMessage}
            isGenerating={isGenerating} // Removed isIntroGenerating
            currentUser={currentUser}
            onUserSelect={() => setShowUserSelect(true)}
            emotion={{}} // Pass empty object as emotion is no longer calculated
          />
        </div>
      </div>

      {/* Modals */}
      {/* Use the custom Dialog component */}
      <Dialog
        isOpen={isNpcDialogOpen}
        onClose={() => setIsNpcDialogOpen(false)}
        title={`NPCs in ${currentRoomName}`}
        className="max-w-3xl" // Example: Add Tailwind class for max-width
      >
        <p className="text-sm text-stone-400 mb-4">
          Select an NPC to interact with.
        </p>
        <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2 mb-4"> {/* Adjusted padding/margin */}
           {/* Pass items and renderItem to GalleryGrid */}
           <GalleryGrid
              // Map the string array from currentRoom.npcs to NpcGridItem[]
              items={currentRoom?.npcs?.map((npcPath: string) => ({
                  name: npcPath.split(/[/\\]/).pop()?.replace('.png', '') || 'Unknown NPC',
                  path: npcPath
              })) || []}
              renderItem={(npc: NpcGridItem, idx: number) => (
                <NpcCard key={npc.path || idx} npc={npc} onClick={() => handleNpcSelect(npc)} />
              )}
           />
        </div>
        {/* Footer with Cancel button (assuming Dialog component handles this or similar pattern) */}
        <div className="flex justify-end mt-4">
          <button
            onClick={() => setIsNpcDialogOpen(false)}
            className="px-4 py-2 bg-stone-600 hover:bg-stone-500 text-white rounded text-sm"
          >
            Cancel
          </button>
        </div>
      </Dialog>

      <UserSelect
        isOpen={showUserSelect}
        onClose={() => setShowUserSelect(false)}
        onSelect={(user) => {
          setCurrentUser(user);
          setShowUserSelect(false);
        }}
      />

      <MapDialog
        isOpen={isMapDialogOpen}
        onClose={() => setIsMapDialogOpen(false)}
        worldId={worldId}
        onRoomSelect={handleRoomSelect}
        playMode={true} // Enable play mode for the map
      />
    </div>
  );
};

export default WorldCardsPlayView;