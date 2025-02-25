import { useState, useEffect } from 'react';
import { Dialog } from './Dialog';

interface ChatInfo {
  id: string;
  filename: string;
  created: string;
  last_modified: string;
  message_count: number;
  character: string;
  user_name?: string;
  api_provider?: string;
  api_model?: string;
}

interface ChatSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
  characterName: string;
}

export function ChatSelectorDialog({
  isOpen,
  onClose,
  onSelectChat,
  characterName
}: ChatSelectorDialogProps) {
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load chat list when dialog opens
  useEffect(() => {
    if (isOpen && characterName) {
      loadChats();
    }
  }, [isOpen, characterName]);

  const loadChats = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/list-chats?character_name=${encodeURIComponent(characterName)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load chats: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setChats(data.chats || []);
      } else {
        throw new Error(data.message || 'Failed to load chat list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat list');
      console.error('Error loading chats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Format date in a more concise way (no seconds)
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return dateString;
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Select Chat History"
      showCloseButton={true}
    >
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {isLoading ? (
          <div className="text-center py-8 text-gray-400">Loading chats...</div>
        ) : error ? (
          <div className="text-center py-4 text-red-500">{error}</div>
        ) : chats.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No chat history found for this character.
          </div>
        ) : (
          <div className="space-y-2">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className="w-full text-left p-4 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
              >
                <div className="flex justify-between">
                  <div className="flex-1 space-y-1 min-w-0">
                    {/* Row 1: Character | User */}
                    <div className="text-sm font-semibold truncate">
                      {chat.character || characterName} | {chat.user_name || 'User'}
                    </div>
                    
                    {/* Row 2: Date/time */}
                    <div className="text-xs text-gray-400">
                      {formatDate(chat.created)}
                    </div>
                    
                    {/* Row 3: API Provider - API Model (if available) */}
                    {(chat.api_provider || chat.api_model) && (
                      <div className="text-xs text-gray-500 truncate">
                        {chat.api_provider || 'Unknown API'}
                        {chat.api_model ? ` - ${chat.api_model}` : ''}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-shrink-0 self-start">
                    <div className="text-xs bg-blue-900 px-2 py-1 rounded-full text-gray-200">
                      {chat.message_count} messages
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default ChatSelectorDialog;