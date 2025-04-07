import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CharacterCard } from '../types/schema';
import { ChatStorage } from '../services/chatStorage';

interface ChatInfo {
  id: string;
  date: string;
  preview: string;
}

interface ChatSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (chatId: string) => void;
  characterData: CharacterCard | null;
}

const ChatSelectorDialog: React.FC<ChatSelectorDialogProps> = ({
  isOpen,
  onClose,
  onSelect,
  characterData
}) => {
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && characterData) {
      loadChats();
    }
  }, [isOpen, characterData]);

  const loadChats = async () => {
    if (!characterData) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Loading chats for character:', characterData.data?.name);
      const chatList = await ChatStorage.listChats(characterData);
      
      if (!Array.isArray(chatList)) {
        console.error('Invalid chat list format:', chatList);
        setError('Failed to load chats: Invalid response format');
        setChats([]);
        return;
      }
      
      console.log('Raw chat list:', chatList);
      const formattedChats = chatList.map(chat => {
        // Format the date simply
        let formattedDate = 'Unknown date';
        if (chat.date) {
          try {
            const date = new Date(chat.date);
            if (!isNaN(date.getTime())) {
              formattedDate = date.toLocaleDateString() + ' ' + 
                              date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
          } catch (err) {
            console.warn('Error formatting date:', err);
          }
        }
        
        return {
          id: chat.id,
          date: formattedDate,
          preview: chat.preview || 'No preview available'
        };
      });
      
      setChats(formattedChats);
    } catch (err) {
      console.error('Error loading chats:', err);
      setError('Failed to load chats. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="relative bg-stone-900 rounded-lg shadow-lg max-w-xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-stone-800">
          <h2 className="text-xl font-semibold text-white">
            {characterData?.data?.name ? `Load Chat with ${characterData.data.name}` : 'Load Chat'}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-stone-700 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-2">
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-white px-4 py-2 rounded mb-4">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
            </div>
          ) : chats.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-gray-400">No saved chats found.</p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[60vh]">
              <ul className="space-y-2">
                {chats.map((chat) => (
                  <li key={chat.id}>
                    <button
                      onClick={() => onSelect(chat.id)}
                      className="w-full text-left p-3 rounded hover:bg-stone-700 transition-colors"
                    >
                      <div className="font-medium mb-1">Chat from {chat.date}</div>
                      <div className="text-sm text-gray-400 truncate">
                        {chat.preview}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatSelectorDialog;
