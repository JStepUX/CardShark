import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import { useAPIConfig } from '../contexts/APIConfigContext'; // Add this import
import HighlightedTextArea from './HighlightedTextArea';

// Types remain the same
interface Message {
  order: number;
  id: string;
  content: string;
  isFirst: boolean;
}

const MessageCard: React.FC<{
  message: Message;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Message>) => void;
  onSetFirst: (id: string) => void;
}> = React.memo(({ message, onDelete, onUpdate, onSetFirst }) => (
  <div className="bg-gradient-to-b from-zinc-900 to-stone-950 rounded-lg p-4 mb-4 shadow-lg">
    <div className="flex items-center justify-between mb-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={message.isFirst}
          onChange={() => onSetFirst(message.id)}
          className="form-checkbox h-4 w-4 text-blue-600 rounded"
        />
        <span className="text-sm text-gray-300">First Message</span>
      </label>
      <button
        onClick={() => onDelete(message.id)}
        className="p-2 text-gray-400 hover:text-red-400 transition-colors"
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
    <HighlightedTextArea
      value={message.content}
      onChange={(value) => onUpdate(message.id, { content: value })}
      className="w-full bg-zinc-950 text-white rounded px-3 py-2 min-h-[100px] h-96 resize-y"
      placeholder="Enter message content..."
    />
  </div>
));

MessageCard.displayName = 'MessageCard';

const MessagesView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  useAPIConfig(); // Keep this, it may be used elsewhere
  const [messages, setMessages] = useState<Message[]>([]);
  // Remove the unused state
  // const [isGenerating, setIsGenerating] = useState(false);
  const [error] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  // Load initial messages
  useEffect(() => {
    if (!characterData?.data || hasLoaded.current) return;
    
    const initialMessages: Message[] = [];
    if (characterData.data.first_mes) {
      initialMessages.push({
        id: crypto.randomUUID(),
        content: characterData.data.first_mes,
        isFirst: true,
        order: 0
      });
    }

    characterData.data.alternate_greetings?.forEach((content: string) => {
      initialMessages.push({
        id: crypto.randomUUID(),
        content,
        isFirst: false,
        order: 0
      });
    });

    setMessages(initialMessages);
    hasLoaded.current = true;
  }, [characterData?.data]);

  // Basic message management
  const handleAddMessage = () => {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      content: '',
      isFirst: messages.length === 0,
      order: messages.length
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleDeleteMessage = (id: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== id));
  };

  const handleUpdateMessage = (id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  };

  const handleSetFirst = (id: string) => {
    setMessages(prev => prev.map(msg => ({
      ...msg,
      isFirst: msg.id === id
    })));
  };

  // Sort messages for display
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      if (a.isFirst) return -1;
      if (b.isFirst) return 1;
      return a.order - b.order;
    });
  }, [messages]);

  // Sync with character data
  useEffect(() => {
    if (!characterData || messages.length === 0) return;

    const firstMessage = messages.find(m => m.isFirst)?.content || '';
    const alternateGreetings = messages
      .filter(m => !m.isFirst)
      .sort((a, b) => a.order - b.order)
      .map(m => m.content);

    setCharacterData({
      ...characterData,
      data: {
        ...characterData.data,
        first_mes: firstMessage,
        alternate_greetings: alternateGreetings
      }
    });
  }, [messages]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-8 pb-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Messages Manager</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddMessage}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              New
            </button>
            </div>
        </div>
      </div>

      {error && (
        <div className="px-8 py-4 bg-red-900/50 text-red-200">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-8">
          <div className="space-y-4">
            {sortedMessages.map(message => (
              <MessageCard
                key={message.id}
                message={message}
                onDelete={handleDeleteMessage}
                onUpdate={handleUpdateMessage}
                onSetFirst={handleSetFirst}
              />
            ))}
            {messages.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                No messages yet. Click "Add Message" to create one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessagesView;