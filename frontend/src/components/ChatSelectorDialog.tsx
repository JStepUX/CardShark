import React from 'react';
import { X } from 'lucide-react';
import ChatSelector from './ChatSelector';
import { CharacterCard } from '../types/schema';

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
  // If dialog is not open, don't render anything
  if (!isOpen) return null;

  // Handle chat selection
  const handleSelectChat = (chatId: string) => {
    // Call the onSelect callback with the chat ID
    onSelect(chatId);
    
    // Close the dialog
    onClose();
  };

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
          {isOpen && (
            <ChatSelector onSelect={handleSelectChat} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatSelectorDialog;
