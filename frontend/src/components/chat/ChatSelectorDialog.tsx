import React from 'react';
import { X } from 'lucide-react';
import { CharacterCard } from '../../types/schema';
import ChatSelector from './ChatSelector';

interface ChatSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (chatId: string) => void;
  characterData: CharacterCard | null;
  currentChatId?: string | null;
}

/**
 * A modal dialog that displays the ChatSelector component
 * Allows users to load, create, or delete chats
 */
const ChatSelectorDialog: React.FC<ChatSelectorDialogProps> = ({
  isOpen,
  onClose,
  onSelect,
  characterData,
  currentChatId
}) => {
  if (!isOpen) return null;

  const handleSelectChat = (chatId: string) => {
    onSelect(chatId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="relative bg-stone-900 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-stone-800">
          <h2 className="text-xl font-semibold text-white">
            {characterData?.data?.name ? `Manage Chats with ${characterData.data.name}` : 'Manage Chats'}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white hover:bg-stone-700 rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          <ChatSelector 
            onSelect={handleSelectChat}
            onClose={onClose}
            currentChatId={currentChatId}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatSelectorDialog;
