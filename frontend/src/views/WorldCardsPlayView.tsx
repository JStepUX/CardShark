import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, User } from 'lucide-react';
import GameWorldIconBar from '../components/GameWorldIconBar';
import { useCharacter, CharacterData } from '../contexts/CharacterContext';
import { Dialog } from '../components/Dialog';
import { CharacterCard } from '../types/schema';
import { NpcGridItem } from '../types/worldState';
import { Location as WorldLocation } from '../types/world';
import worldStateApi from '../utils/worldStateApi';
import { apiService } from '../services/apiService';
import ChatBubble from '../components/ChatBubble';
import ThoughtBubble from '../components/ThoughtBubble';
import UserSelect from '../components/UserSelect';
import MoodIndicator from '../components/MoodIndicator';
import { useChatMessages } from '../hooks/useChatMessages';
import { Message, UserProfile } from '../types/messages';
import RichTextEditor from '../components/RichTextEditor';
import { generateUUID } from '../utils/uuidUtils';
import ErrorMessage from '../components/ErrorMessage';
import GalleryGrid from '../components/GalleryGrid';
import NpcCard from '../components/NpcCard';
import { useAPIConfig } from '../contexts/APIConfigContext';
import MapDialog from '../components/MapDialog';
import { formatWorldName } from '../utils/formatters';
import { worldDataService } from '../services/WorldDataService';
import LoadingSpinner from '../components/common/LoadingSpinner';

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

const InputArea: React.FC<{
  onSend: (text: string) => void;
  isGenerating: boolean;
  currentUser: UserProfile | null;
  onUserSelect: () => void;
  emotion: any; 
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
  generateNpcIntroduction: (roomContext: string) => Promise<void>;
}

const WorldCardsPlayView: React.FC = () => {
  const { worldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();
  const { characterData, setCharacterData, setImageUrl } = useCharacter();
  const [isLoadingWorld, setIsLoadingWorld] = useState(true);
  const [worldLoadError, setWorldLoadError] = useState<string | null>(null);
  const [currentRoomName, setCurrentRoomName] = useState<string>("Play");
  const [currentRoom, setCurrentRoom] = useState<WorldLocation | null>(null);
  const [worldState, setWorldState] = useState<any>(null);
  const { apiConfig } = useAPIConfig();
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [isNpcDialogOpen, setIsNpcDialogOpen] = useState(false);
  const [isMapDialogOpen, setIsMapDialogOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);

  const { messagesEndRef, messagesContainerRef, scrollToBottom } = useScrollToBottom();

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
    activeCharacterData,
    generateNpcIntroduction
  }: UseChatMessagesReturn = useChatMessages(characterData, { isWorldPlay: true });

  useEffect(() => {
    const loadWorldChat = async () => {
      if (!worldId) return;
      try {
        const chatData = await worldStateApi.loadLatestChat(worldId);
        if (chatData) {
          if (chatData.metadata?.chat_id) {
            setChatId(chatData.metadata.chat_id);
          } else {
            const newChatId = `${worldId}-${generateUUID().slice(0, 8)}`;
            setChatId(newChatId);
          }
        } else {
          const newChatId = `${worldId}-${generateUUID().slice(0, 8)}`;
          setChatId(newChatId);
        }
      } catch (error) {
        console.error("Error loading world chat:", error);
        const newChatId = `${worldId}-${generateUUID().slice(0, 8)}`;
        setChatId(newChatId);
      }
    };
    loadWorldChat();
  }, [worldId]);

  useEffect(() => {
    const saveWorldChat = async () => {
      if (!worldId || !chatId || messages.length === 0) return;
      try {
        console.log("Saving chat messages:", messages.length, 
          messages.map(m => ({id: m.id.substring(0, 6), role: m.role, preview: m.content.substring(0, 20)})));
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
    if (!isGenerating && messages.length > 0) {
      saveWorldChat();
    }
  }, [messages, worldId, chatId, isGenerating]);

  const ensureAllLocationsConnected = (worldData: any): any => {
    if (!worldData || !worldData.locations) return worldData;
    const updatedWorldData = JSON.parse(JSON.stringify(worldData));
    Object.entries(updatedWorldData.locations).forEach(([_, location]: [string, any]) => {
      if (location && location.connected !== false) {
        location.connected = true;
      }
    });
    console.log(`Processed ${Object.keys(updatedWorldData.locations).length} locations, ensuring they are connected`);
    return updatedWorldData;
  };

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
        const initialWorldData = await worldDataService.loadWorld(worldId);
        const processedWorldData = ensureAllLocationsConnected(initialWorldData);
        setWorldState(processedWorldData);

        const { room: currentLoc } = worldDataService.getCurrentRoom(processedWorldData); 
        if (!currentLoc) {
          setWorldLoadError('No locations found in this world state or current position is invalid. Please add a location or check world state.');
          setCurrentRoom(null);
          setCurrentRoomName('No Room');
          setIsLoadingWorld(false);
          return;
        }
        setCurrentRoom(currentLoc);
        setCurrentRoomName(currentLoc.name || 'Unnamed Room');

        const worldSystemDescription = currentLoc.description ||
          `This location is part of the world of ${formatWorldName(processedWorldData.name) || 'Unknown'}.`;
        const worldUserIntroduction = currentLoc.introduction ||
          `You find yourself in ${currentLoc.name || 'an interesting place'}.`; 
        const characterBookEntries = worldDataService.processWorldItems(processedWorldData);

        const characterCardForContext: CharacterCard = {
          name: processedWorldData.name || "World Narrator",
          description: worldSystemDescription, 
          personality: "", 
          scenario: `The user is exploring ${currentLoc.name || 'this location'} in the world of ${formatWorldName(processedWorldData.name) || 'Unknown'}.`,
          first_mes: worldUserIntroduction, 
          mes_example: "",
          creatorcomment: "",
          avatar: "none",
          chat: "",
          talkativeness: "0.5",
          fav: false,
          tags: ["world", processedWorldData.name || "unknown"],
          spec: "chara_card_v2",
          spec_version: "2.0",
          create_date: "",
          data: {
            name: processedWorldData.name || "World Narrator",
            description: worldSystemDescription, 
            personality: "", 
            scenario: `The user is exploring ${currentLoc.name || 'this location'} in the world of ${formatWorldName(processedWorldData.name) || 'Unknown'}.`,
            first_mes: worldUserIntroduction, 
            mes_example: "",
            creator_notes: "",
            system_prompt: `You are the narrator describing the world of ${formatWorldName(processedWorldData.name) || 'Unknown'}.`,
            post_history_instructions: "Describe the surroundings and events.",
            tags: ["world", processedWorldData.name || "unknown"],
            creator: "",
            character_version: "1.0",
            alternate_greetings: [],
            extensions: {
              talkativeness: "0.5",
              fav: false,
              world: processedWorldData.name || "Unknown World",
              depth_prompt: { prompt: "", depth: 4, role: "system" }
            },
            group_only_greetings: [],
            character_book: {
              entries: characterBookEntries,
              name: "World Items"
            },
            spec: ''
          }
        };
        if (!characterData) {
          setCharacterData(characterCardForContext);
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
  }, [worldId, setCharacterData, apiConfig]);

  useEnhancedGenerationTimeout(isGenerating, stopGeneration);
  useStallDetection(isGenerating, messages[messages.length - 1]?.content || '', stopGeneration);

  useEffect(() => {
    return () => {
      if (isGenerating) {
        console.log("WorldCardsPlayView unmounting, stopping generation.");
        stopGeneration();
      }
    };
  }, [isGenerating, stopGeneration]);

  useEffect(() => {
    scrollToBottom();
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [messages, isGenerating, scrollToBottom]);

  const handleRoomSelect = useCallback(async (position: string) => {
    if (!worldId) return;
    try {
      const currentState = worldState || await worldDataService.loadWorld(worldId);
      if (!currentState.locations[position]) {
        throw new Error("Selected room not found in world state");
      }
      const previousPosition = currentState.current_position;
      const previousRoom = previousPosition ? currentState.locations[previousPosition] : null;
      const updatedState = {
        ...currentState,
        current_position: position,
        visited_positions: currentState.visited_positions.includes(position) 
          ? currentState.visited_positions 
          : [...currentState.visited_positions, position]
      };
      await worldDataService.saveWorldState(worldId, updatedState);
      const selectedRoom = updatedState.locations[position];
      setWorldState(updatedState);
      setCurrentRoom(selectedRoom);
      setCurrentRoomName(selectedRoom.name || "Unnamed Room");
      const roomIntroduction = selectedRoom.introduction || 
        selectedRoom.description || 
        `You've entered ${selectedRoom.name || "a new room"}.`;
      const previousRoomName = previousRoom?.name || "the previous area";
      const message = `You leave ${previousRoomName} and enter ${selectedRoom.name || "a new area"}. ${roomIntroduction}`;
      generateResponse(message);
    } catch (error) {
      console.error("Error navigating to room:", error);
      setWorldLoadError(`Failed to navigate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [worldId, worldState, generateResponse]);

  const handleNpcIconClick = useCallback(() => {
    if (!currentRoom || !currentRoom.npcs || currentRoom.npcs.length === 0) {
      console.log("No NPCs in the current room.");
      return;
    }
    setIsNpcDialogOpen(true);
  }, [currentRoom]);

  const handleInventoryIconClick = useCallback(() => {
    console.log("Inventory icon clicked");
  }, []);

  const handleSpellsIconClick = useCallback(() => {
    console.log("Spells icon clicked");
  }, []);

  const handleMeleeIconClick = useCallback(() => {
    console.log("Melee icon clicked");
  }, []);

  const handleNpcSelect = useCallback(async (npc: NpcGridItem) => {
    setIsNpcDialogOpen(false);
    if (!npc.path) {
      console.warn("NPC path is missing, cannot load character.");
      return;
    }
    try {
      const fetchedNpcData: any = await apiService.get(`/api/character-by-path?path=${encodeURIComponent(npc.path)}`);
      if (fetchedNpcData) {
        const npcCharacterCard = fetchedNpcData as CharacterCard;
        setCharacterData(npcCharacterCard);
        if (npcCharacterCard.avatar && npcCharacterCard.avatar !== 'none') {
          setImageUrl(`/api/character-image/${encodeURIComponent(npcCharacterCard.avatar)}`);
        } else {
          setImageUrl(undefined); 
        }
        const introContext = `The user, ${currentUser?.name || 'Adventurer'}, encounters ${npcCharacterCard.name} in ${currentRoomName || 'this area'}. ${npcCharacterCard.first_mes || npcCharacterCard.data.first_mes || ''}`;
        await generateNpcIntroduction(introContext);
      } else {
        console.error(`Could not load character data for NPC: ${npc.name} with path ${npc.path}`);
      }
    } catch (error) {
      console.error("Error selecting NPC:", error);
    }
  }, [setCharacterData, setImageUrl, currentRoomName, currentUser?.name, generateNpcIntroduction, worldId, apiConfig]);

  const handleClearError = () => {
    setWorldLoadError(null);
    clearChatError();
  };

  const handleSendMessage = (content: string) => {
    if (!currentUser) {
      setShowUserSelect(true);
      return;
    }
    generateResponse(content);
  };

  useEffect(() => {
    if (!currentUser && !characterData && worldState) {
      // Default narrator logic handled in loadWorldForPlay
    }
  }, [currentUser, characterData, worldState, setCharacterData, worldId]);

  let content;
  if (isLoadingWorld) {
    content = <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
  } else if (worldLoadError) {
    content = <ErrorMessage message={worldLoadError} onDismiss={handleClearError} />;
  } else if (!worldState || !currentRoom) {
    content = <ErrorMessage message="World data or current room is not available. Please check the world configuration." onDismiss={handleClearError} />;
  } else {
    content = (
      <>
        <div className="absolute inset-0 bg-black opacity-50" />
        <div className="relative h-full flex flex-col z-10">
          <nav className="flex-none flex items-center gap-2 p-4 bg-stone-900/80">
            <button onClick={() => navigate(`/worlds/${worldId}`)} className="text-orange-500 hover:text-orange-300">
              &larr; Back to World
            </button>
            <h1 className="text-xl font-semibold text-stone-200">{currentRoomName}</h1>
          </nav>
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-opacity-75 bg-stone-950 scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent">
            {chatError && (
            <div className="relative z-10 px-8 py-2">
              <ErrorMessage message={chatError} onDismiss={clearChatError} />
            </div>
            )}
            {messages.map((message: Message) => (
              <React.Fragment key={message.id}>
                {message.role === 'thinking' && (
                  <ThoughtBubble
                    message={message}
                    isGenerating={isGenerating && generatingId === message.id}
                    characterName={activeCharacterData?.data?.name || characterData?.data?.name}
                    onDelete={() => deleteMessage(message.id)}
                    onContentChange={(newContent) => updateMessage(message.id, newContent)}
                  />
                )}
                {message.role !== 'thinking' && (
                  <ChatBubble
                    message={message}
                    isGenerating={isGenerating && generatingId === message.id}
                    characterName={activeCharacterData?.data?.name || characterData?.data?.name}
                    onContentChange={(newContent) => updateMessage(message.id, newContent)}
                    onDelete={() => deleteMessage(message.id)}
                    onStop={stopGeneration}
                    onTryAgain={() => regenerateMessage(message)}
                    onNextVariation={() => cycleVariation(message.id, 'next')}
                    onPrevVariation={() => cycleVariation(message.id, 'prev')}
                    currentUser={currentUser || undefined}
                  />
                )}
              </React.Fragment>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="px-4 py-2 bg-stone-900/90 border-t border-b border-stone-700">
            <GameWorldIconBar
              onMap={() => setIsMapDialogOpen(true)}
              onNpcs={handleNpcIconClick}
              onInventory={handleInventoryIconClick}
              onSpells={handleSpellsIconClick}
              onMelee={handleMeleeIconClick}
              npcCount={currentRoom?.npcs?.length || 0}
            />
          </div>
          <div className="bg-stone-900/95 border-t border-stone-700">
            <InputArea
              onSend={handleSendMessage}
              isGenerating={isGenerating}
              currentUser={currentUser}
              onUserSelect={() => setShowUserSelect(true)}
              emotion={null}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="w-full h-full relative">
      {content}
      <Dialog isOpen={isNpcDialogOpen} onClose={() => setIsNpcDialogOpen(false)} title="Select NPC">
        <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2 mb-4">
          {currentRoom && currentRoom.npcs && currentRoom.npcs.length > 0 ? (
            <GalleryGrid
              items={worldDataService.processNpcs(currentRoom)}
              renderItem={(item: NpcGridItem) => (
                <NpcCard npc={item} onClick={() => handleNpcSelect(item)} />
              )}
              columns={3}
            />
          ) : (
            <p>No NPCs in this room.</p>
          )}
        </div>
      </Dialog>
      {showUserSelect && (
        <UserSelect
          isOpen={showUserSelect}
          onClose={() => setShowUserSelect(false)}
          onSelect={(user) => {
            setCurrentUser(user);
            setShowUserSelect(false);
          }}
        />
      )}
      {isMapDialogOpen && worldId && (
        <MapDialog
          worldId={worldId}
          isOpen={isMapDialogOpen} 
          onClose={() => setIsMapDialogOpen(false)}
          onRoomSelect={(_, position) => handleRoomSelect(position)}
          playMode={true}
        />
      )}
    </div>
  );
};

export default WorldCardsPlayView;