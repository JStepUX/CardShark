import React, { useState, useEffect } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { useChat } from '../contexts/ChatContext';
import { ChatStorage } from '../services/chatStorage';
import { Plus, RefreshCw, MessageSquare } from 'lucide-react';

interface ChatInfo {
  id: string;
  title: string;
  lastModified: string;
  messageCount: number;
  preview?: string;
}

interface ChatSelectorProps {
  onSelect?: (chatId: string) => void;
}

const ChatSelector: React.FC<ChatSelectorProps> = ({ onSelect }) => {
  const { characterData } = useCharacter();
  const { createNewChat, loadExistingChat } = useChat();
  const [availableChats, setAvailableChats] = useState<ChatInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available chats when character changes
  useEffect(() => {
    if (!characterData) return;
    
    loadAvailableChats();
  }, [characterData]);

  const loadAvailableChats = async () => {
    if (!characterData) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await ChatStorage.listCharacterChats(characterData);
      
      if (response.success && Array.isArray(response.chats)) {
        // Transform the API response into our ChatInfo format
        const chatInfoList: ChatInfo[] = response.chats.map((chat: any) => ({
          id: chat.chat_id,
          title: formatChatTitle(chat.create_date, chat.last_message),
          lastModified: formatDate(chat.last_modified || chat.create_date),
          messageCount: chat.message_count || 0,
          preview: chat.last_message || chat.preview || 'No messages'
        }));
        
        setAvailableChats(chatInfoList);
      } else {
        setError('Failed to load chats');
        setAvailableChats([]);
      }
    } catch (err) {
      console.error('Error loading chats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chats');
      setAvailableChats([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewChat = async () => {
    try {
      setLoading(true);
      await createNewChat();
      // Refresh the list after creating a new chat
      loadAvailableChats();
    } catch (err) {
      console.error('Error creating new chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to create new chat');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadChat = async (chatId: string) => {
    try {
      setLoading(true);
      await loadExistingChat(chatId);
      
      // If there's an onSelect callback, call it
      if (onSelect) {
        onSelect(chatId);
      }
    } catch (err) {
      console.error('Error loading chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  };

  // Helper to format date from ISO string
  const formatDate = (dateString: string): string => {
    try {
      // Guard against invalid dates
      if (!dateString) return 'Unknown date';
      
      // Try to parse as ISO date
      if (dateString.includes('T') && dateString.includes('Z')) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }
      
      // Try to parse as timestamp
      const timestamp = parseInt(dateString);
      if (!isNaN(timestamp)) {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }
      
      // Try different date formats
      // For "YYYY-MM-DD HH:MM:SS" format
      if (dateString.includes('-') && dateString.includes(':')) {
        const [datePart, timePart] = dateString.split(' ');
        if (datePart && timePart) {
          const [year, month, day] = datePart.split('-').map(Number);
          const [hour, minute, second] = timePart.split(':').map(Number);
          if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            const date = new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
            if (!isNaN(date.getTime())) {
              return date.toLocaleString();
            }
          }
        }
      }
      
      // Fallback for simpler formatting
      return dateString.substring(0, 19).replace('T', ' ');
    } catch (e) {
      console.error('Date formatting error:', e);
      return 'Unknown date';
    }
  };

  // Helper to create a readable title from date and content
  const formatChatTitle = (dateString: string, lastMessage?: string): string => {
    try {
      const formattedDate = formatDate(dateString);
      
      if (lastMessage && lastMessage.length > 0) {
        // Use a snippet from the last message as part of the title
        const messagePreview = lastMessage.substring(0, 30).trim();
        return `Chat from ${formattedDate}${messagePreview ? ` - "${messagePreview}${messagePreview.length < lastMessage.length ? '...' : ''}"` : ''}`;
      }
      
      return `Chat from ${formattedDate}`;
    } catch (e) {
      console.error('Title formatting error:', e);
      return 'Untitled Chat';
    }
  };

  return (
    <div className="chat-selector p-4 bg-stone-900 text-white rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">
          {characterData?.data?.name ? `Chats with ${characterData.data.name}` : 'Character Chats'}
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={loadAvailableChats}
            className="p-2 bg-stone-800 hover:bg-stone-700 rounded-full"
            disabled={loading}
            title="Refresh chats"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={handleCreateNewChat}
            className="p-2 bg-stone-800 hover:bg-stone-700 rounded-full"
            disabled={loading}
            title="New chat"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message p-2 mb-4 bg-red-900/30 text-red-200 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading p-4 text-center text-stone-400">
          Loading chats...
        </div>
      ) : availableChats.length === 0 ? (
        <div className="no-chats p-4 text-center text-stone-400">
          <p>No previous chats found</p>
          <button 
            onClick={handleCreateNewChat}
            className="mt-2 px-4 py-2 bg-orange-700 hover:bg-orange-600 rounded-lg flex items-center gap-2 mx-auto"
          >
            <Plus size={16} /> Start New Chat
          </button>
        </div>
      ) : (
        <ul className="chat-list space-y-2 max-h-96 overflow-y-auto">
          {availableChats.map((chat) => (
            <li 
              key={chat.id}
              className="p-3 bg-stone-800 hover:bg-stone-700 rounded-lg cursor-pointer transition-colors"
              onClick={() => handleLoadChat(chat.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <MessageSquare size={20} className="text-orange-500" />
                </div>
                <div className="flex-grow">
                  <h3 className="font-medium">{chat.title}</h3>
                  <p className="text-sm text-stone-400">
                    {chat.messageCount} messages • Last updated: {chat.lastModified}
                  </p>
                  {chat.preview && (
                    <p className="text-sm text-stone-300 mt-1 truncate">
                      {chat.preview}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChatSelector;
