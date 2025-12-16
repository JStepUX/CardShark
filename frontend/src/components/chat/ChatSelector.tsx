import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCharacter } from '../../contexts/CharacterContext';
import { useChat } from '../../contexts/ChatContext';

import { Plus, RefreshCw, MessageSquare, Trash2, AlertTriangle, X, Search, Filter, Download, SortAsc, SortDesc, ChevronDown } from 'lucide-react';
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';

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
  
  // Search and filtering state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'messages'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [messageCountFilter, setMessageCountFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Load available chats when character changes
  useEffect(() => {
    if (!characterData) return;
    
    loadAvailableChats();
  }, [characterData]);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
    };

    if (showExportDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExportDropdown]);

  const loadAvailableChats = async () => {
    if (!characterData) return;
    
    try {
      setLoading(true);
      setError(null);
      setDeleteError(null);
      
      // Use the new database-centric API endpoint
      const characterUuid = characterData.data?.character_uuid;
      if (!characterUuid) {
        throw new Error('Character UUID not found');
      }

      const response = await fetch(`/api/reliable-list-chats/${characterUuid}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to load chats: ${response.status}`);
      }

      const data = await response.json();
      const chats = data.data || [];
      
      if (Array.isArray(chats)) {
        // Transform the database response into our ChatInfo format
        const charName = characterData?.data?.name;
        const chatInfoList: ChatInfo[] = chats.map((chat: any) => {
          // Handle both old JSONL format and new database format
          const chatId = chat.chat_session_uuid || chat.id || chat.chat_id;
          const title = chat.title || formatChatTitle(
            chat.start_time || chat.create_date || chat.display_date, 
            chat.preview || chat.last_message, 
            charName, 
            chat.user_name
          );
          const lastModified = chat.last_message_time || chat.last_updated || chat.last_modified || chat.start_time || chat.create_date;
          const messageCount = chat.message_count || 0;
          
          // Skip chats with less than 2 messages (likely just system prompt/first message)
          if (messageCount < 2) {
            return null;
          }
          
          // Clean up preview text
          const rawPreview = chat.preview || chat.last_message || 'No messages';
          let cleanPreview = rawPreview.replace(/<[^>]*>/g, '');
          let finalPreview = cleanPreview;

          if (charName) {
            finalPreview = finalPreview.replace(/\{\{char\}\}/g, charName);
          }
          if (chat.user_name) {
            finalPreview = finalPreview.replace(/\{\{user\}\}/g, chat.user_name);
          }

          return {
            id: chatId,
            filename: chat.filename || `chat_${chatId}.jsonl`, // Fallback for database entries
            title,
            lastModified: formatDate(lastModified),
            messageCount,
            preview: finalPreview
          };
        }).filter((chat): chat is ChatInfo => chat !== null);
        
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
      // Use the new database-centric API endpoint for deleting chats
      const response = await fetch(`/api/reliable-delete-chat/${deletingChat.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to delete chat: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // Remove the deleted chat from the list
        setAvailableChats(prev => prev.filter(chat => chat.id !== deletingChat.id));
        setIsDeleteConfirmOpen(false);
        
        // If we deleted the current chat, create a new one automatically
        if (deletingChat.id === currentChatId) {
             setDeletingChat(null);
             await handleCreateNewChat();
             return;
        }
        
        setDeletingChat(null);
      } else {
        throw new Error(result.message || 'Failed to delete chat');
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

  // Filter and sort chats
  const filteredAndSortedChats = useMemo(() => {
    let filtered = [...availableChats];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(chat => 
        chat.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (chat.preview && chat.preview.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(chat => {
        const chatDate = new Date(chat.lastModified);
        switch (dateFilter) {
          case 'today':
            return chatDate >= today;
          case 'week':
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            return chatDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            return chatDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    // Apply message count filter
    if (messageCountFilter !== 'all') {
      filtered = filtered.filter(chat => {
        const count = chat.messageCount;
        switch (messageCountFilter) {
          case 'short':
            return count <= 10;
          case 'medium':
            return count > 10 && count <= 50;
          case 'long':
            return count > 50;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'messages':
          comparison = a.messageCount - b.messageCount;
          break;
        case 'date':
        default:
          comparison = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [availableChats, searchTerm, sortBy, sortOrder, dateFilter, messageCountFilter]);

  // Export functionality - Updated for database-centric approach
  const handleExportChats = async (format: 'json' | 'jsonl' = 'json') => {
    if (!characterData) return;
    
    setIsExporting(true);
    try {
      const chatsToExport = filteredAndSortedChats.length > 0 ? filteredAndSortedChats : availableChats;
      
      if (format === 'jsonl') {
        // Use the new bulk export endpoint for JSONL format
        const response = await fetch('/api/export-chats-bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            character_uuid: characterData.data?.character_uuid,
            chat_session_uuids: chatsToExport.map(chat => chat.id)
          })
        });

        if (response.ok) {
          const exportData = await response.json();
          if (exportData.success && exportData.data) {
            const blob = new Blob([exportData.data.content], { type: 'application/jsonl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = exportData.data.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } else {
            throw new Error(exportData.message || 'Export failed');
          }
        } else {
          throw new Error(`Export failed with status: ${response.status}`);
        }
      } else {
        // Export summary data in JSON format
        const exportData = {
          character: characterData.data?.name || 'Unknown',
          exportDate: new Date().toISOString(),
          totalChats: chatsToExport.length,
          chats: chatsToExport.map(chat => ({
            id: chat.id,
            title: chat.title,
            messageCount: chat.messageCount,
            lastModified: chat.lastModified,
            preview: chat.preview
          }))
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${characterData.data?.name || 'character'}_chats_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting chats:', error);
      setError('Failed to export chats');
    } finally {
      setIsExporting(false);
    }
  };

  // Helper to format date from ISO string
  const formatDate = (dateString: string): string => {
    try {
      // Guard against invalid dates
      if (!dateString) return 'Unknown date';
      
      // Try to parse as Date object directly first (covers ISO with/without Z, and other standard formats)
      const date = new Date(dateString);
      if (!isNaN(date.getTime()) && date.getFullYear() > 1990) {
        return date.toLocaleString();
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
  const formatChatTitle = (dateString: string, lastMessage?: string, characterName?: string, userName?: string): string => {
    try {
      const formattedDate = formatDate(dateString);
      
      if (lastMessage && lastMessage.length > 0) {
        // Strip any HTML tags for cleaner display
        const cleanMessage = lastMessage.replace(/<[^>]*>/g, '');
        
        let substitutedMessage = cleanMessage;
        if (characterName) {
          substitutedMessage = substitutedMessage.replace(/\{\{char\}\}/g, characterName);
        }
        if (userName) {
          substitutedMessage = substitutedMessage.replace(/\{\{user\}\}/g, userName);
        }
        
        // Use a snippet from the last message as part of the title
        const messagePreview = substitutedMessage.substring(0, 30).trim();
        
        return `Chat from ${formattedDate}${messagePreview ? ` - "${messagePreview}${messagePreview.length < substitutedMessage.length ? '...' : ''}"` : ''}`;
      }
      
      return `Chat from ${formattedDate}`;
    } catch (e) {
      console.error('Title formatting error:', e);
      return 'Untitled Chat';
    }
  };

  return (
    <div className="chat-selector p-4 bg-stone-900 text-white rounded-lg max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h2 className="text-xl font-semibold">
            {characterData?.data?.name ? `Chats with ${characterData.data.name}` : 'Character Chats'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-stone-400">Database-centric storage</span>
          </div>
        </div>
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
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-full transition-colors ${
              showFilters ? 'bg-orange-700 hover:bg-orange-600' : 'bg-stone-800 hover:bg-stone-700'
            }`}
            title="Toggle filters"
          >
            <Filter size={16} />
          </button>
          <div className="relative" ref={exportDropdownRef}>
            <button 
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              className="p-2 bg-stone-800 hover:bg-stone-700 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              disabled={isExporting || availableChats.length === 0}
              title="Export chats"
            >
              <Download size={16} className={isExporting ? 'animate-pulse' : ''} />
              <ChevronDown size={12} />
            </button>
            
            {showExportDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-stone-800 border border-stone-600 rounded-lg shadow-lg z-50 min-w-[160px]">
                <button
                  onClick={() => {
                    handleExportChats('json');
                    setShowExportDropdown(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-stone-700 transition-colors flex items-center gap-2 rounded-t-lg"
                  disabled={isExporting}
                >
                  <Download size={14} />
                  Export as JSON
                </button>
                <button
                  onClick={() => {
                    handleExportChats('jsonl');
                    setShowExportDropdown(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-stone-700 transition-colors flex items-center gap-2 rounded-b-lg border-t border-stone-600"
                  disabled={isExporting}
                >
                  <Download size={14} />
                  Export as JSONL
                </button>
              </div>
            )}
          </div>
          <button 
            onClick={handleCreateNewChat}
            className="p-2 bg-stone-800 hover:bg-stone-700 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
            title="New chat"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4 mt-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search chats by title or content..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-800 border border-stone-600 rounded-lg focus:outline-none focus:border-orange-500 text-white placeholder-stone-400"
          />
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="mb-4 p-4 bg-stone-800 rounded-lg border border-stone-600">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">Sort By</label>
              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'title' | 'messages')}
                  className="flex-1 px-3 py-2 bg-stone-700 border border-stone-600 rounded focus:outline-none focus:border-orange-500 text-white"
                >
                  <option value="date">Last Modified</option>
                  <option value="title">Title</option>
                  <option value="messages">Message Count</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="p-2 bg-stone-700 hover:bg-stone-600 rounded transition-colors"
                  title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                >
                  {sortOrder === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />}
                </button>
              </div>
            </div>

            {/* Date Filter */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">Date Range</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
                className="w-full px-3 py-2 bg-stone-700 border border-stone-600 rounded focus:outline-none focus:border-orange-500 text-white"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>

            {/* Message Count Filter */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">Message Count</label>
              <select
                value={messageCountFilter}
                onChange={(e) => setMessageCountFilter(e.target.value as 'all' | 'short' | 'medium' | 'long')}
                className="w-full px-3 py-2 bg-stone-700 border border-stone-600 rounded focus:outline-none focus:border-orange-500 text-white"
              >
                <option value="all">All Lengths</option>
                <option value="short">Short (≤10 messages)</option>
                <option value="medium">Medium (11-50 messages)</option>
                <option value="long">Long ({'>'}50 messages)</option>
              </select>
            </div>
          </div>

          {/* Results Summary */}
          <div className="mt-3 pt-3 border-t border-stone-600 text-sm text-stone-400">
            Showing {filteredAndSortedChats.length} of {availableChats.length} chats
            {searchTerm && (
              <span className="ml-2">
                • Filtered by: "{searchTerm}"
              </span>
            )}
          </div>
        </div>
      )}

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
          </p>          <button 
            onClick={handleCreateNewChat}
            className="mt-4 px-4 py-2 bg-orange-700 hover:bg-orange-600 rounded-lg flex items-center gap-2 mx-auto transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            <Plus size={16} /> Start New Chat
          </button>
        </div>
      ) : (
        <ul className="chat-list space-y-2 max-h-96 overflow-y-auto pr-1">
          {filteredAndSortedChats.map((chat) => {
            const isCurrentChat = chat.id === currentChatId;
            return (
            <li 
              key={chat.id}
              className={`p-3 rounded-lg cursor-pointer transition-colors group relative ${
                isCurrentChat 
                  ? 'bg-orange-900/40 border border-orange-700/50' 
                  : 'bg-stone-800 hover:bg-stone-700'
              }`}
              onClick={() => !isCurrentChat && handleLoadChat(chat.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <MessageSquare size={20} className={isCurrentChat ? "text-orange-400" : "text-orange-500"} />
                </div>
                <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{chat.title}</h3>
                    {isCurrentChat && (
                      <span className="px-2 py-0.5 text-xs bg-orange-600 text-white rounded-full">
                        Current
                      </span>
                    )}
                  </div>
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
                  className={`absolute top-2 right-2 p-1.5 rounded-full bg-stone-700 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 ${
                    isCurrentChat ? 'z-10' : ''
                  }`}
                  onClick={(e) => handleDeleteClick(e, chat)}
                  aria-label="Delete chat"
                  title="Delete chat"
                >
                  <Trash2 size={16} className="text-stone-300 hover:text-white" />
                </button>
              </div>
            </li>
          );
        })}
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
