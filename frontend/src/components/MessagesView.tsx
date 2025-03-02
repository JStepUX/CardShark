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
  const { apiConfig } = useAPIConfig(); // Get API configuration
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Generate message
  const handleGenerateMessage = async () => {
    try {
      setIsGenerating(true);
      setError(null);

      // Check if API configuration exists
      if (!apiConfig) {
        throw new Error('API not configured. Please set up API in Settings first.');
      }

      // Create new message first
      const messageId = crypto.randomUUID();
      const newMessage: Message = {
        id: messageId,
        content: '',
        isFirst: messages.length === 0,
        order: messages.length
      };
      
      setMessages(prev => [...prev, newMessage]);

      // Start generation
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_config: apiConfig, // Pass API configuration
          generation_params: {
            prompt: `You are tasked with crafting a new, engaging first message for a character using the information provided below. Your new message should be natural, distinctly in-character, and should not replicate the scenario of the current first message, while still matching its style, formatting, and relative length as a quality benchmark.

Character Name: "${characterData?.data?.name}"
Description: ${characterData?.data?.description}
Personality: ${characterData?.data?.personality}
Scenario: ${characterData?.data?.scenario}

Use the following as reference points:
Current First Message: ${characterData?.data?.first_mes}
Example Messages: 
${characterData?.data?.mes_example}

Craft a new introductory message that starts the conversation in a fresh and engaging way, ensuring variety from the existing scenario.`
          }
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Generation failed - check API settings');
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let generatedText = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) throw new Error(data.error);
                if (data.content) {
                  generatedText += data.content;
                  setMessages(prev => prev.map(msg =>
                    msg.id === messageId ? { ...msg, content: generatedText } : msg
                  ));
                }
              } catch (e) {
                if (line.includes('[DONE]')) continue;
                console.error('Error parsing SSE message:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      console.error('Generation failed:', error);
      setError(error instanceof Error ? error.message : 'Generation failed');
      // Remove the empty message if generation failed
      setMessages(prev => prev.filter(msg => msg.content !== ''));
    } finally {
      setIsGenerating(false);
    }
  };

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
            {/*<button
                onClick={handleGenerateMessage}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 size={18} />
                )}
                Generate Message
              </button>*/}
            <button
              onClick={handleAddMessage}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              Add Message
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