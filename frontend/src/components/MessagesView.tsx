import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';

// Types
interface Message {
  order: number;
  id: string;  // Change to string for UUID
  content: string;
  isFirst: boolean;
}

const MessageCard: React.FC<{
  message: Message;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Message>) => void;
  onSetFirst: (id: string) => void;
}> = React.memo(({ message, onDelete, onUpdate, onSetFirst }) => {
  return (
    <div className="bg-gradient-to-b from-zinc-900 to-stone-950 rounded-lg p-4 mb-4 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
                    
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={message.isFirst}
              onChange={() => onSetFirst(message.id)}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-300">First Message</span>
          </label>
        </div>

        <button
          onClick={() => onDelete(message.id)}
          className="p-2 text-gray-400 hover:text-red-400 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      <textarea
        value={message.content}
        onChange={(e) => onUpdate(message.id, { content: e.target.value })}
        className="w-full bg-zinc-950 text-white rounded px-3 py-2 min-h-[100px] h-96 resize-y"
        placeholder="Enter message content..."
      />
    </div>
  );
});

const MessagesView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const [messages, setMessages] = useState<Message[]>([]);
  const hasLoaded = useRef(false);

  // Load messages from character data
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

  // Update character data when messages change
  const updateCharacterData = useCallback((updatedMessages: Message[]) => {
    if (!characterData) return;

    const firstMessage = updatedMessages.find(msg => msg.isFirst);
    const alternateGreetings = updatedMessages
      .filter(msg => !msg.isFirst)
      .map(msg => msg.content);

    setCharacterData({
      ...characterData,
      data: {
        ...characterData.data,
        first_mes: firstMessage?.content || '',
        alternate_greetings: alternateGreetings
      }
    });
  }, [characterData, setCharacterData]);


  const handleSetFirst = (id: string) => {
    setMessages(prev => {
      const updated = prev.map(msg => ({
        ...msg,
        isFirst: msg.id === id
      }));
      updateCharacterData(updated);
      return updated;
    });
  };

  const handleDeleteMessage = (id: string) => {
    setMessages(prev => {
      const updated = prev.filter(msg => msg.id !== id);
      updateCharacterData(updated);
      return updated;
    });
  };

  // Sort messages for display only
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      if (a.isFirst) return -1;
      if (b.isFirst) return 1;
      return a.order - b.order;
    });
  }, [messages]);

  // Add new message
  const handleAddMessage = () => {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      content: '',
      isFirst: messages.length === 0,
      order: messages.length
    };
    setMessages(prev => [...prev, newMessage]);
  };

  // Update message
  const handleUpdateMessage = (id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  };

  // Update characterData when messages change
  useEffect(() => {
    if (!characterData || messages.length === 0) return;

    const firstMessage = messages.find(m => m.isFirst)?.content || '';
    const alternateGreetings = messages
      .filter(m => !m.isFirst)
      .sort((a, b) => a.order - b.order)
      .map(m => m.content);

    const newData = {
      ...characterData,
      data: {
        ...characterData.data,
        first_mes: firstMessage,
        alternate_greetings: alternateGreetings
      }
    };

    setCharacterData(newData);
  }, [messages]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-8 pb-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Messages Manager</h2>
          <button
            onClick={handleAddMessage}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 
                     text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Add Message
          </button>
        </div>
      </div>

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
          </div>

          {messages.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              No messages yet. Click "Add Message" to create one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessagesView;