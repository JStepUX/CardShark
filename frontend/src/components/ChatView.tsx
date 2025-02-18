import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Plus } from 'lucide-react'; // Import User icon
import { useCharacter } from '../contexts/CharacterContext';
import { PromptHandler } from '../handlers/promptHandler';
import HighlightedTextArea from './HighlightedTextArea';
import ChatBubble from './ChatBubble';
import UserSelect from './UserSelect'; // Import UserSelect

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  variations?: string[];
  currentVariation?: number;
}

interface UserProfile {
  name: string;
  path: string;
  size: number;
  modified: number;
}

const ChatView: React.FC = () => {
  const { characterData } = useCharacter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastCharacterId = useRef<string | null>(null);
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null); // Use UserProfile type
  const currentGenerationRef = useRef<AbortController | null>(null);

  // Stop generation function - used by ChatBubble
  const handleStopGeneration = () => {
    if (currentGenerationRef.current) {
      currentGenerationRef.current.abort();
    }
  };

  // Handle new chat creation
  const handleNewChat = async () => {
    if (!characterData?.data?.first_mes) return;
    setMessages([]); 
    await new Promise(resolve => setTimeout(resolve, 50));
  
    const firstMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: characterData.data.first_mes,
      timestamp: Date.now()
    };
  
    setMessages([firstMessage]);
  
    try {
      const response = await fetch('/api/save-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: characterData,
          messages: [firstMessage],
          force_new: true
        })
      });
  
      if (!response.ok) {
        throw new Error('Failed to start new chat');
      }
    } catch (err) {
      console.error('Error starting new chat:', err);
    }
  };

  // Cleanup function
  useEffect(() => {
    return () => {
      if (currentGenerationRef.current) {
        currentGenerationRef.current.abort();
      }
    };
  }, []);

  // Clear chat and post first message when character changes
  useEffect(() => {
    const currentCharId = characterData?.data?.name;

    if (currentCharId !== lastCharacterId.current) {
      setMessages([]);
      lastCharacterId.current = currentCharId !== undefined ? currentCharId : null;

      if (characterData?.data?.first_mes) {
        const firstMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: characterData.data.first_mes,
          timestamp: Date.now(),
          variations: [],
          currentVariation: 0
        };
        setMessages([firstMessage]);
      }
    }
  }, [characterData]);

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

  // Save and append message handlers
  const saveChatState = async () => {
    if (!characterData?.data?.name) return;

    try {
      const response = await fetch('/api/save-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: characterData,
          messages,
          lastUser: currentUser // Add this line
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save chat');
      }
    } catch (err) {
      console.error('Error saving chat:', err);
    }
  };

  const appendMessage = async (message: Message) => {
    if (!characterData?.data?.name) return;
    
    try {
      const response = await fetch('/api/append-chat-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: characterData,
          message
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to append message');
      }
    } catch (err) {
      console.error('Error appending message:', err);
    }
  };

  // Handle message sending
  const handleSend = async () => {
    if (!inputValue.trim() || !characterData || isGenerating) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setError(null);
    
    await appendMessage(userMessage);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      variations: [],
      currentVariation: 0
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsGenerating(true);

    const abortController = new AbortController();
    currentGenerationRef.current = abortController;

    try {
      const response = await PromptHandler.generateChatResponse(
        characterData,
        userMessage.content,
        messages.map(({ role, content }) => ({ role, content })),
        abortController.signal
      );

      if (!response.ok) {
        throw new Error('Generation failed - check API settings');
      }

      let newContent = '';
      for await (const chunk of PromptHandler.streamResponse(response)) {
        newContent += chunk;
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessage.id
            ? { ...msg, content: newContent, variations: [newContent], currentVariation: 0 }
            : msg
        ));
      }

      const completedAssistantMessage = {
        ...assistantMessage,
        content: newContent,
        variations: [newContent],
        currentVariation: 0
      };
      await appendMessage(completedAssistantMessage);
      
    } catch (err: any) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('Generation aborted');
      } else {
        console.error('Generation failed:', err);
        setError(err instanceof Error ? err.message : 'Generation failed');
        setMessages(prev => prev.filter(msg => msg.id !== assistantMessage.id));
      }
    } finally {
      setIsGenerating(false);
      currentGenerationRef.current = null;
    }
  };

  // Message update handlers
  const handleUpdateMessage = async (messageId: string, content: string) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId
        ? { ...msg, content, variations: [content], currentVariation: 0 }
        : msg
    ));
    await saveChatState();
  };

  const handleDeleteMessage = async (messageId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
    await saveChatState();
  };

  const handleTryAgain = async (message: Message) => {
    if (!characterData || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      const messageIndex = messages.findIndex(m => m.id === message.id);
      const contextMessages = messages.slice(0, messageIndex + 1).map(({ role, content }) => ({ role, content }));

      const response = await PromptHandler.generateChatResponse(
        characterData,
        "Please rework your previous response into a new version.",
        contextMessages
      );

      if (!response.ok) {
        throw new Error('Generation failed - check API settings');
      }

      const currentVariations = message.variations || [message.content];
      let newVariation = '';

      for await (const chunk of PromptHandler.streamResponse(response)) {
        newVariation += chunk;
        setMessages(prev => prev.map(msg =>
          msg.id === message.id
            ? { ...msg, content: newVariation }
            : msg
        ));
      }

      setMessages(prev => prev.map(msg =>
        msg.id === message.id
          ? {
              ...msg,
              content: newVariation,
              variations: [...currentVariations, newVariation],
              currentVariation: currentVariations.length
            }
          : msg
      ));

      await saveChatState();

    } catch (err) {
      console.error('Generation failed:', err);
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrevVariation = async (message: Message) => {
    const variations = message.variations || [message.content];
    if (variations.length <= 1) return;
    
    const currentIndex = message.currentVariation ?? 0;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : variations.length - 1;
    
    const newContent = variations[newIndex];
    if (!newContent) return;
    
    setMessages(prev => prev.map(msg =>
      msg.id === message.id
        ? {
            ...msg,
            content: newContent,
            currentVariation: newIndex
          }
        : msg
    ));

    await saveChatState();
  };

  const handleNextVariation = async (message: Message) => {
    const variations = message.variations || [message.content];
    if (variations.length <= 1) return;
    
    const currentIndex = message.currentVariation ?? 0;
    const newIndex = currentIndex < variations.length - 1 ? currentIndex + 1 : 0;
    
    const newContent = variations[newIndex];
    if (!newContent) return;
    
    setMessages(prev => prev.map(msg =>
      msg.id === message.id
        ? {
            ...msg,
            content: newContent,
            currentVariation: newIndex
          }
        : msg
    ));

    await saveChatState();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle user selection
  const handleUserSelect = (user: UserProfile) => {
    setCurrentUser(user);
    setShowUserSelect(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-none p-8 pb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">
          {characterData?.data?.name 
            ? `Chatting with ${characterData.data.name}`
            : 'Chat'}
        </h2>
        <button
              onClick={handleNewChat}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              New Chat
            </button>
      </div>

      {error && (
        <div className="flex-none px-8 py-4 bg-red-900/50 text-red-200">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-4 scroll-smooth">
        <div className="flex flex-col space-y-4">
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              isGenerating={isGenerating}
              onEdit={(content: string) => handleUpdateMessage(message.id, content)}
              onCancel={() => null}
              onDelete={() => handleDeleteMessage(message.id)}
              onStop={handleStopGeneration}
              onTryAgain={() => handleTryAgain(message)}
              onNextVariation={() => handleNextVariation(message)}
              onPrevVariation={() => handlePrevVariation(message)}
              currentUser={currentUser?.name} // Pass user name to ChatBubble
            />
          ))}
          <div ref={messagesEndRef} className="h-px" />
        </div>
      </div>

      <div className="flex-none p-4 border-t border-stone-800">
        <div className="flex items-end gap-4">
          {/* User Avatar and Selection */}
          <div
            onClick={() => setShowUserSelect(true)}
            className="w-24 h-32 rounded-lg cursor-pointer overflow-hidden"
          >
            {currentUser ? (
              <img
                src={`/api/user-image/${encodeURIComponent(currentUser.path)}`}
                alt={currentUser.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-transparent border border-gray-700 rounded-lg flex items-center justify-center">
                <User className="text-gray-400" size={24} />
              </div>
            )}
          </div>

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
            className="px-4 py-4 bg-transparent text-white rounded-lg hover:bg-orange-700 
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* User Selection Dialog */}
      <UserSelect
        isOpen={showUserSelect}
        onClose={() => setShowUserSelect(false)}
        onSelect={handleUserSelect}
        currentUser={currentUser?.name}
      />
    </div>
  );
};

export default ChatView;