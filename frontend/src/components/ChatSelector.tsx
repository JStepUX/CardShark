import React, { useState, useEffect } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { useChat } from '../contexts/ChatContext';
import { ChatStorage } from '../services/chatStorage';
import { Plus, RefreshCw, MessageSquare, Trash2, AlertTriangle, X } from 'lucide-react';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';

interface ChatInfo {
  id: string;
  title: string;
  lastModified: string;
  messageCount: number;
  preview?: string;
  filename?: string; // For deletion and reference
}

interface ChatSelectorProps {
  onSelect?: (chatId: string) => void;
  onClose?: () => void;
  currentChatId?: string | null;
}

const ChatSelector: React.FC<ChatSelectorProps> = ({ onSelect, onClose, currentChatId }) => {
  const { characterData } = useCharacter();
  const { createNewChat, loadExistingChat } = useChat();
  const [availableChats, setAvailableChats] = useState<ChatInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingChat, setDeletingChat] = useState<ChatInfo | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      setDeleteError(null);
      
      const chats = await ChatStorage.listChats(characterData);
      
      if (Array.isArray(chats)) {
        // Transform the API response into our ChatInfo format
        const chatInfoList: ChatInfo[] = chats.map((chat: any) => ({
          id: chat.id || chat.chat_id,
          filename: chat.filename,
          title: formatChatTitle(chat.create_date || chat.display_date, chat.preview || chat.last_message),
          lastModified: formatDate(chat.last_modified || chat.create_date || chat.display_date),
          messageCount: chat.message_count || 0,
          preview: chat.preview || chat.last_message || 'No messages'
        }));
        
        // Filter out the current chat if currentChatId is provided
        const filteredChatList = currentChatId 
          ? chatInfoList.filter(chat => chat.id !== currentChatId)
          : chatInfoList;
        
        setAvailableChats(filteredChatList);
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
      
      // If there's an onClose callback (e.g., closing the dialog after creating a new chat)
      if (onClose) {
        onClose();
      } else {
        // Otherwise refresh the list
        await loadAvailableChats();
      }
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
      
      // If there's an onClose callback (e.g., closing the dialog after selecting a chat)
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Error loading chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteClick = (e: React.MouseEvent, chat: ChatInfo) => {
    e.stopPropagation(); // Prevent the chat from being selected
    setDeletingChat(chat);
    setIsDeleteConfirmOpen(true);
  };
  
  const handleConfirmDelete = async () => {
    if (!deletingChat || !characterData) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    
    try {
      const result = await ChatStorage.deleteChat(characterData, deletingChat.id);
      
      if (result.success) {
        // Remove the deleted chat from the list
        setAvailableChats(prev => prev.filter(chat => chat.id !== deletingChat.id));
        setIsDeleteConfirmOpen(false);
      } else {
        throw new Error(result.error || 'Failed to delete chat');
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete chat');
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleCancelDelete = () => {
    setIsDeleteConfirmOpen(false);
    setDeletingChat(null);
  };

  const dismissDeleteError = () => {
    setDeleteError(null);
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
        // Handle potential Unix timestamp in seconds or milliseconds
        const date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
        if (!isNaN(date.getTime()) && date.getFullYear() > 1990) { // Sanity check for reasonable dates
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
      
      // Try to parse from YYYYMMDD_HHMMSS format (used in filenames)
      const filenamePattern = /(\d{8})_(\d{6})/;  
      const filenameMatch = dateString.match(filenamePattern);
      if (filenameMatch) {
        const datePart = filenameMatch[1];
        const timePart = filenameMatch[2];
        
        if (datePart && timePart) {
          const year = parseInt(datePart.substring(0, 4));
          const month = parseInt(datePart.substring(4, 6)) - 1;
          const day = parseInt(datePart.substring(6, 8));
          
          const hour = parseInt(timePart.substring(0, 2));
          const minute = parseInt(timePart.substring(2, 4));
          const second = parseInt(timePart.substring(4, 6));
          
          const date = new Date(year, month, day, hour, minute, second);
          if (!isNaN(date.getTime())) {
            return date.toLocaleString();
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
        // Strip any HTML tags for cleaner display
        const cleanMessage = lastMessage.replace(/<[^>]*>/g, '');
        
        // Use a snippet from the last message as part of the title
        const messagePreview = cleanMessage.substring(0, 30).trim();
        
        return `Chat from ${formattedDate}${messagePreview ? ` - "${messagePreview}${messagePreview.length < cleanMessage.length ? '...' : ''}"` : ''}`;
      }
      
      return `Chat from ${formattedDate}`;
    } catch (e) {
      console.error('Title formatting error:', e);
      return 'Untitled Chat';
    }
  };

  return (
    <div className="chat-selector p-4 bg-stone-900 text-white rounded-lg max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">
          {characterData?.data?.name ? `Chats with ${characterData.data.name}` : 'Character Chats'}
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={loadAvailableChats}
            className="p-2 bg-stone-800 hover:bg-stone-700 rounded-full transition-colors"
            disabled={loading}
            title="Refresh chats"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={handleCreateNewChat}
            className="p-2 bg-stone-800 hover:bg-stone-700 rounded-full transition-colors"
            disabled={loading}
            title="New chat"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message p-3 mb-4 bg-red-900/30 text-red-200 border border-red-800 rounded flex items-center justify-between">
          <div className="flex items-center">
            <AlertTriangle size={18} className="mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-red-100">
            <X size={16} />
          </button>
        </div>
      )}

      {deleteError && (
        <div className="error-message p-3 mb-4 bg-red-900/30 text-red-200 border border-red-800 rounded flex items-center justify-between">
          <div className="flex items-center">
            <AlertTriangle size={18} className="mr-2 flex-shrink-0" />
            <span><strong>Delete Error:</strong> {deleteError}</span>
          </div>
          <button onClick={dismissDeleteError} className="text-red-300 hover:text-red-100">
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading p-8 text-center text-stone-400">
          <div className="inline-block w-8 h-8 border-4 border-stone-600 border-t-orange-500 rounded-full animate-spin mb-4"></div>
          <p>Loading chats...</p>
        </div>
      ) : availableChats.length === 0 ? (
        <div className="no-chats p-8 text-center text-stone-400">
          <p>
            {currentChatId ? 
              "No other chats found for this character" : 
              "No previous chats found"}
          </p>
          <button 
            onClick={handleCreateNewChat}
            className="mt-4 px-4 py-2 bg-orange-700 hover:bg-orange-600 rounded-lg flex items-center gap-2 mx-auto transition-colors"
          >
            <Plus size={16} /> Start New Chat
          </button>
        </div>
      ) : (
        <ul className="chat-list space-y-2 max-h-96 overflow-y-auto pr-1">
          {availableChats.map((chat) => (
            <li 
              key={chat.id}
              className="p-3 bg-stone-800 hover:bg-stone-700 rounded-lg cursor-pointer transition-colors group relative"
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
                
                {/* Delete button that shows on hover */}
                <button
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-stone-700 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                  onClick={(e) => handleDeleteClick(e, chat)}
                  aria-label="Delete chat"
                  title="Delete chat"
                >
                  <Trash2 size={16} className="text-stone-300 hover:text-white" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      
      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        isOpen={isDeleteConfirmOpen}
        title="Delete Chat"
        description="Are you sure you want to delete this chat?"
        itemName={deletingChat?.title}
        isDeleting={isDeleting}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default ChatSelector;
