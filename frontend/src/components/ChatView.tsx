// ChatView.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Check } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import { PromptHandler } from '../handlers/promptHandler';
import HighlightedTextArea from './HighlightedTextArea';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface EditState {
  messageId: string;
  content: string;
}

const highlightText = (text: string): string => {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("([^"\\]|\\.)*")/g, '<span class="text-orange-200">$1</span>')
      .replace(/(\*[^*\n]+\*)/g, '<span class="text-blue-300">$1</span>')
      .replace(/(`[^`\n]+`)/g, '<span class="text-yellow-300">$1</span>')
      .replace(/(\{\{[^}\n]+\}\})/g, '<span class="text-pink-300">$1</span>')
      .replace(/\n$/g, '\n\n');
  };

const ChatView: React.FC = () => {
  const { characterData } = useCharacter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editTextAreaRef = useRef<HTMLTextAreaElement>(null);

  // Handle auto-focus when entering edit mode
  useEffect(() => {
    if (editState && editTextAreaRef.current) {
      editTextAreaRef.current.focus();
      // Put cursor at end of text
      const length = editTextAreaRef.current.value.length;
      editTextAreaRef.current.setSelectionRange(length, length);
    }
  }, [editState]);

  // Scroll handling
  useEffect(() => {
    if (messagesEndRef.current) {
      const parent = messagesEndRef.current.parentElement;
      if (parent) {
        const isScrolledToBottom = parent.scrollHeight - parent.scrollTop <= parent.clientHeight + 100;
        
        if (isScrolledToBottom) {
          messagesEndRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'end'
          });
        }
      }
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || !characterData || isGenerating) return;

    messagesEndRef.current?.scrollIntoView({
      behavior: 'instant',
      block: 'end'
    });

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setError(null);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsGenerating(true);

    try {
      const response = await PromptHandler.generateChatResponse(
        characterData,
        userMessage.content,
        messages.map(({ role, content }) => ({ role, content }))
      );

      if (!response.ok) {
        throw new Error('Generation failed - check API settings');
      }

      for await (const chunk of PromptHandler.streamResponse(response)) {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessage.id
            ? { ...msg, content: msg.content + chunk }
            : msg
        ));
      }
    } catch (error) {
      console.error('Generation failed:', error);
      setError(error instanceof Error ? error.message : 'Generation failed');
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessage.id));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartEdit = (message: Message) => {
    if (isGenerating) return;
    setEditState({
      messageId: message.id,
      content: message.content
    });
  };

  const handleSaveEdit = () => {
    if (!editState) return;
    setMessages(prev => prev.map(msg =>
      msg.id === editState.messageId
        ? { ...msg, content: editState.content }
        : msg
    ));
    setEditState(null);
  };

  const handleCancelEdit = () => {
    setEditState(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessage = (message: Message) => {
    const isEditing = editState?.messageId === message.id;
    const isUserMessage = message.role === 'user';

    return (
      <div
        key={message.id}
        className={`flex ${isUserMessage ? 'justify-start' : 'justify-start'}`}
      >
        <div
          className={`max-w-[100%] w-full rounded-lg ${
            isEditing 
              ? 'bg-stone-900 border border-stone-600' 
              : isUserMessage
                ? 'bg-slate-900'
                : 'bg-slate-950'
          }`}
        >
          {isEditing ? (
            <div className="p-4">
              <HighlightedTextArea
                value={editState.content}
                onChange={(content) => setEditState({ ...editState, content })}
                className="bg-transparent rounded-lg min-h-[6rem] w-full"
                placeholder="Edit message..."
              />
              <div className="flex justify-end gap-2 mt-2 border-t border-stone-700 pt-2">
                <button
                  onClick={handleCancelEdit}
                  className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="p-1 text-gray-400 hover:text-green-400 transition-colors"
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div
            className={`p-4 ${!isGenerating && 'cursor-pointer hover:brightness-110'}`}
            onClick={() => !isGenerating && handleStartEdit(message)}
            >
            <div 
                className="whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: highlightText(message.content) }}
            />
            <div className="text-xs opacity-50 mt-1">
                {new Date(message.timestamp).toLocaleTimeString()}
            </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-none p-8 pb-4">
        <h2 className="text-lg font-semibold">Chat</h2>
      </div>

      {error && (
        <div className="flex-none px-8 py-4 bg-red-900/50 text-red-200">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-4 scroll-smooth">
        <div className="flex flex-col space-y-4">
          {messages.map(renderMessage)}
          <div ref={messagesEndRef} className="h-px" />
        </div>
      </div>

      <div className="flex-none p-4 border-t border-stone-800">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <HighlightedTextArea
              value={inputValue}
              onChange={setInputValue}
              className="bg-stone-950 border border-stone-800 rounded-lg h-24"
              placeholder="Type your message..."
              onKeyDown={handleKeyPress}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isGenerating}
            className="px-4 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatView;