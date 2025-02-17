import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Check, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import { PromptHandler } from '../handlers/promptHandler';
import HighlightedTextArea from './HighlightedTextArea';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  variations?: string[];
  currentVariation?: number;
}

interface EditState {
  messageId: string;
  content: string;
}

const ChatView: React.FC = () => {
  const { characterData } = useCharacter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const lastCharacterId = useRef<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [, setIsLoading] = useState(false);

  // Load chat history when character changes or component mounts
  useEffect(() => {
    const loadChatHistory = async () => {
      // Don't load if we don't have character data
      if (!characterData?.data?.name) {
        console.log('No character data available');
        return;
      }
      
      console.log('Loading chat history for:', characterData.data.name);
      setIsLoading(true);
      setError(null);

      try {
        // Make sure we're sending the full character data
        const response = await fetch('/api/load-latest-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            character_data: characterData // Send full character data
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to load chat: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Received chat data:', data);

        if (data.success) {
          if (data.messages && data.messages.length > 0) {
            console.log(`Setting ${data.messages.length} messages from history`);
            setMessages(data.messages);
          } else if (isInitialLoad && characterData.data.first_mes) {
            // Only set first message on initial load with no history
            console.log('Setting initial message');
            const firstMessage = {
              id: Date.now().toString(),
              role: 'assistant' as "assistant",
              content: characterData.data.first_mes,
              timestamp: Date.now()
            };
            setMessages([firstMessage]);
            
            // Save this initial message
            await fetch('/api/save-chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                character_data: characterData,
                messages: [firstMessage],
                force_new: true
              })
            });
          }
        } else {
          throw new Error(data.message || 'Failed to load chat history');
        }
      } catch (error) {
        console.error('Chat loading error:', error);
        setError(error instanceof Error ? error.message : 'Failed to load chat');
        setMessages([]); // Clear messages on error
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    };

    // Load chat history when character changes
    if (characterData?.data?.name !== lastCharacterId.current) {
      console.log('Character changed, reloading chat history');
      lastCharacterId.current = characterData?.data?.name || null;
      loadChatHistory();
    }
  }, [characterData?.data?.name, isInitialLoad]);

  // Update handleNewChat function
  const handleNewChat = async () => {
    if (!characterData?.data?.first_mes) return;
  
    // Clear messages immediately
    setMessages([]); 
  
    await new Promise(resolve => setTimeout(resolve, 50));
  
    // Create fresh first message from character
    const firstMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: characterData.data.first_mes,
      timestamp: Date.now()
    };
  
    setMessages([firstMessage]);
  
    // Save with force_new=true to create new chat file
    try {
      const response = await fetch('/api/save-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: characterData,  // Send full data
          messages: [firstMessage],
          force_new: true
        })
      });
  
      if (!response.ok) {
        console.error('Failed to start new chat');
      }
    } catch (error) {
      console.error('Error starting new chat:', error);
    }
  };

  // Clear chat and post first message when character changes
  useEffect(() => {
    const currentCharId = characterData?.data?.name;

    if (currentCharId !== lastCharacterId.current) {
      // Clear existing messages
      setMessages([]);
      lastCharacterId.current = currentCharId !== undefined ? currentCharId : null;

      // Post character's first message if available
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

  // Handle auto-focus when entering edit mode
  useEffect(() => {
    if (editState && editTextAreaRef.current) {
      editTextAreaRef.current.focus();
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

  // Update saveChatState function
  const saveChatState = async () => {
    if (!characterData?.data?.name) {
      console.log('No character data available for saving');
      return false;
    }

    try {
      console.log(`Saving ${messages.length} messages for ${characterData.data.name}`);
      const response = await fetch('/api/save-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: characterData,
          messages: messages
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save chat state');
      }

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to save chat:', error);
      return false;
    }
  };

  // Update appendMessage function
  const appendMessage = async (message: Message) => {
    if (!characterData?.data?.name) return;
    
    try {
      const response = await fetch('/api/append-chat-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: characterData,  // Send full data
          message
        })
      });
      
      if (!response.ok) {
        console.error('Failed to append message');
      }
    } catch (error) {
      console.error('Error appending message:', error);
    }
  };

  // Modify handleSend to save after complete exchange
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
    
    // Save user message immediately
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

    try {
      const response = await PromptHandler.generateChatResponse(
        characterData,
        userMessage.content,
        messages.map(({ role, content }) => ({ role, content }))
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

      // Save assistant message after completion
      const completedAssistantMessage = {
        ...assistantMessage,
        content: newContent,
        variations: [newContent],
        currentVariation: 0
      };
      await appendMessage(completedAssistantMessage);
      
    } catch (error) {
      console.error('Generation failed:', error);
      setError(error instanceof Error ? error.message : 'Generation failed');
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessage.id));
    } finally {
      setIsGenerating(false);
    }
  };

  // Save after edits/variations confirmed
  const handleSaveEdit = async () => {
    if (!editState) return;
    
    setMessages(prev => prev.map(msg =>
      msg.id === editState.messageId
        ? { ...msg, content: editState.content, variations: [editState.content], currentVariation: 0 }
        : msg
    ));
    
    // Save after variation/edit confirmed
    await saveChatState();
    setEditState(null);
  };

  const handleStartEdit = (message: Message) => {
    if (isGenerating) return;
    setEditState({
      messageId: message.id,
      content: message.content
    });
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

  const handleTryAgain = async (message: Message) => {
    if (!characterData || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      // Get all messages up to this one for context
      const messageIndex = messages.findIndex(m => m.id === message.id);
      const contextMessages = messages.slice(0, messageIndex + 1).map(({ role, content }) => ({ role, content }));

      const response = await PromptHandler.generateChatResponse(
        characterData,
        "Please rework your previous response into a new, engaging version that's both insightful and clearly connected to the current scene.",
        contextMessages
      );

      if (!response.ok) {
        throw new Error('Generation failed - check API settings');
      }

      // Initialize variations if needed
      const currentVariations = message.variations || [message.content];
      let newVariation = '';

      // Update edit state to show streaming content
      setEditState(prev => ({
        ...prev,
        messageId: message.id,
        content: ''  // Start empty
      }));

      for await (const chunk of PromptHandler.streamResponse(response)) {
        newVariation += chunk;
        
        // Update just the edit state during streaming
        setEditState(prev => ({
          ...prev,
          messageId: message.id,
          content: newVariation
        }));
      }

      // Only add to variations once streaming is complete
      setMessages(prev => prev.map(msg =>
        msg.id === message.id
          ? {
              ...msg,
              content: newVariation,
              variations: [...currentVariations, newVariation],
              currentVariation: currentVariations.length // Point to the new variation
            }
          : msg
      ));

      // Update edit state with final content
      setEditState(prev => ({
        ...prev,
        messageId: message.id,
        content: newVariation
      }));

    } catch (error) {
      console.error('Generation failed:', error);
      setError(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrevVariation = (message: Message) => {
    const variations = message.variations || [message.content];
    if (variations.length <= 1) return;
    
    const currentIndex = message.currentVariation ?? 0;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : variations.length - 1;
    
    // Ensure we have a valid variation to switch to
    const newContent = variations[newIndex];
    if (!newContent) return;
    
    // Update both the message and edit state
    setMessages(prev => prev.map(msg =>
      msg.id === message.id
        ? {
            ...msg,
            content: newContent,
            currentVariation: newIndex
          }
        : msg
    ));

    setEditState(_prev => ({
      messageId: message.id,
      content: newContent
    }));
  };

  const handleNextVariation = (message: Message) => {
    const variations = message.variations || [message.content];
    if (variations.length <= 1) return;
    
    const currentIndex = message.currentVariation ?? 0;
    const newIndex = currentIndex < variations.length - 1 ? currentIndex + 1 : 0;
    
    // Ensure we have a valid variation to switch to
    const newContent = variations[newIndex];
    if (!newContent) return;
    
    // Update both the message and edit state
    setMessages(prev => prev.map(msg =>
      msg.id === message.id
        ? {
            ...msg,
            content: newContent,
            currentVariation: newIndex
          }
        : msg
    ));

    setEditState(_prev => ({
      messageId: message.id,
      content: newContent
    }));
  };

  const renderEditControls = (message: Message) => {
    const variations = message.variations || [];
    const variationCount = variations.length || 1;
    const currentVariation = (message.currentVariation ?? 0) + 1;

    return (
      <div className="flex justify-between items-center gap-2 mt-2 border-t border-stone-700 pt-2">
        <div className="flex items-center gap-2">
          {message.role === 'assistant' && editState?.messageId === message.id && (
            <>
              <button
                onClick={() => handlePrevVariation(message)}
                disabled={!message.variations || message.variations.length <= 1}
                className="p-1 text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
                title="Previous version"
              >
                <ChevronLeft size={16} />
              </button>
              
              <span className="text-xs text-gray-500">
                {currentVariation}/{variationCount}
              </span>
              
              <button
                onClick={() => handleNextVariation(message)}
                disabled={!message.variations || message.variations.length <= 1}
                className="p-1 text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
                title="Next version"
              >
                <ChevronRight size={16} />
              </button>

              <button
                onClick={() => handleTryAgain(message)}
                disabled={isGenerating}
                className="p-1 text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
                title="Generate another version"
              >
                <RotateCw size={16} />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
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
    );
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
              ? 'bg-stone-900 border border-stone-800' 
              : isUserMessage
                ? 'bg-stone-900'
                : 'bg-stone-900'
          }`}
        >
          {isEditing ? (
            <div className="p-4">
              <HighlightedTextArea
                value={editState.content}
                onChange={(content) => setEditState({ ...editState, content })}
                className="bg-transparent rounded-lg min-h-[8rem] w-full"
                placeholder="Edit message..."
              />
              {renderEditControls(message)}
            </div>
          ) : (
            <div
              className={`p-4 ${!isGenerating && 'cursor-pointer hover:brightness-110'}`}
              onClick={() => !isGenerating && handleStartEdit(message)}
            >
              <div 
                className="whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ 
                  __html: message.content
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/("([^"\\]|\\.)*")/g, '<span class="text-orange-200">$1</span>')
                    .replace(/(\*[^*\n]+\*)/g, '<span class="text-blue-300">$1</span>')
                    .replace(/(`[^`\n]+`)/g, '<span class="text-yellow-300">$1</span>')
                    .replace(/(\{\{[^}\n]+\}\})/g, '<span class="text-pink-300">$1</span>')
                    .replace(/\n$/g, '\n\n')
                }}
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
      <div className="flex-none p-8 pb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">
          {characterData?.data?.name 
            ? `Chatting with ${characterData.data.name}`
            : 'Chat'}
        </h2>
        <button
          onClick={handleNewChat}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 
                   transition-colors disabled:opacity-50"
          disabled={!characterData?.data?.first_mes}
        >
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
            className="px-4 py-4 bg-transparent text-white rounded-lg hover:bg-orange-700 
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