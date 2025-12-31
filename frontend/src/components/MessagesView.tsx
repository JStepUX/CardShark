import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, Trash2, Sparkles } from 'lucide-react'; // Icons
import { useCharacter } from '../contexts/CharacterContext'; // Character data context
import { useAPIConfig } from '../contexts/APIConfigContext'; // API configuration context
import RichTextEditor from './RichTextEditor'; // Import the RichTextEditor
import { ChatStorage } from '../services/chatStorage'; // Service to call backend
import LoadingSpinner from './common/LoadingSpinner'; // Added
import { htmlToPlainText } from '../utils/contentUtils'; // Import HTML to plain text converter

// Interface defining the structure of a message within this component's state
interface Message {
  order: number; // Used for sorting alternate greetings
  id: string;    // Unique ID for React key and manipulation
  content: string; // The actual text content of the message
  isFirst: boolean; // Flag indicating if this is the primary 'first_mes'
}

// --- MessageCard Sub-component ---
// Renders a single message with controls
const MessageCard: React.FC<{
  message: Message;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Message>) => void;
  onSetFirst: (id: string) => void;
}> = React.memo(({ message, onDelete, onUpdate, onSetFirst }) => (
  <div className="bg-gradient-to-b from-zinc-800 via-zinc-900 to-stone-950 rounded-lg p-4 mb-4 shadow-lg border border-zinc-700/50">
    <div className="flex items-center justify-between mb-3">
      {/* Checkbox to set this message as the primary 'first_mes' */}
      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white">
        <input
          type="checkbox"
          checked={message.isFirst}
          onChange={() => onSetFirst(message.id)}
          className="form-checkbox h-4 w-4 text-blue-500 bg-zinc-700 border-zinc-600 rounded focus:ring-blue-600 focus:ring-offset-zinc-900"
        />
        Set as Primary Greeting
      </label>
      {/* Delete button */}
      <button
        onClick={() => onDelete(message.id)}
        className="p-1.5 text-gray-400 hover:text-red-400 rounded-full hover:bg-red-900/30 transition-colors"
        aria-label="Delete message"
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
    {/* Rich text editor for editing the message content */}
    <RichTextEditor
      content={message.content}
      onChange={(html) => onUpdate(message.id, { content: htmlToPlainText(html) })} // Convert HTML to plain text before storing
      className="w-full bg-zinc-950 text-gray-100 rounded min-h-[100px] border border-zinc-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500" // Apply styles, use focus-within for border
      placeholder="Enter message content (supports Markdown)..."
      preserveWhitespace={true} // Preserve formatting
    />
  </div>
));
MessageCard.displayName = 'MessageCard'; // For React DevTools

// --- Main MessagesView Component ---
const MessagesView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const { apiConfig } = useAPIConfig(); // Get API config for generation

  // Local state for managing the list of messages shown in the UI
  const [messages, setMessages] = useState<Message[]>([]);
  // Loading state specifically for the AI greeting generation
  const [isGeneratingGreeting, setIsGeneratingGreeting] = useState(false);
  // State to hold and display error messages
  const [error, setError] = useState<string | null>(null);
  // Ref to prevent processing/syncing effects during initial mount/load cycles
  const isMounted = useRef(false); // Changed name for clarity

  // Effect to load messages from characterData when it changes
  useEffect(() => {
    // Reset error and state when the character changes
    setError(null);
    setMessages([]); // Clear previous messages immediately
    isMounted.current = false; // Reset mount flag on character change

    if (!characterData?.data) {
      return; // Exit if no character data
    }

    const initialMessages: Message[] = [];
    let orderCounter = 0;

    // Add the primary 'first_mes' if it exists
    if (characterData.data.first_mes) {
      initialMessages.push({
        id: crypto.randomUUID(),
        content: characterData.data.first_mes,
        isFirst: true, // Mark as the primary
        order: orderCounter++,
      });
    }

    // Add 'alternate_greetings'
    characterData.data.alternate_greetings?.forEach((content: string) => {
      if (content && content.trim()) { // Only add non-empty alternates
        initialMessages.push({
          id: crypto.randomUUID(),
          content,
          // Set 'isFirst' only if 'first_mes' was empty AND this is the very first alternate
          isFirst: initialMessages.length === 0,
          order: orderCounter++,
        });
      }
    });

    // Ensure exactly one message is marked as 'isFirst' if messages exist
    const firstIndex = initialMessages.findIndex(m => m.isFirst);
    if (firstIndex > 0) { // If 'isFirst' is not the first element, correct it
        initialMessages.forEach((m, index) => m.isFirst = (index === firstIndex));
    } else if (firstIndex === -1 && initialMessages.length > 0) { // If no message is marked 'isFirst', mark the first one
        initialMessages[0].isFirst = true;
    }

    setMessages(initialMessages);
    // Set mount flag after initial load is complete
    requestAnimationFrame(() => { isMounted.current = true; });

  }, [characterData?.data?.name]); // Rerun when character name changes (good proxy for character change)

  // --- Message Management Handlers ---

  // Add a new, blank message card
  const handleAddMessage = useCallback(() => {
    setMessages(prev => {
      const newMessage: Message = {
        id: crypto.randomUUID(),
        content: '',
        isFirst: prev.length === 0, // Only set true if it's the very first message
        order: prev.length, // Append to the end order-wise
      };
      return [...prev, newMessage];
    });
    setError(null); // Clear any previous error
  }, []);

  // Delete a message card by its ID
  const handleDeleteMessage = useCallback((id: string) => {
    setMessages(prev => {
        const remaining = prev.filter(msg => msg.id !== id);
        // If the deleted message was the primary 'isFirst', and others remain,
        // designate the new first message in the list as the primary.
        if (remaining.length > 0 && !remaining.some(m => m.isFirst)) {
            // Sort remaining by order before assigning 'isFirst'
            remaining.sort((a, b) => a.order - b.order);
            remaining[0].isFirst = true;
        }
        // Re-calculate order based on new array indices for consistency
        return remaining.map((msg, index) => ({ ...msg, order: index }));
    });
    setError(null);
  }, []);

  // Update content of a message card
  const handleUpdateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, ...updates } : msg
    ));
    // No need to clear error here, typing shouldn't clear generation errors
  }, []);

  // Set a specific message card as the primary 'isFirst' greeting
  const handleSetFirst = useCallback((id: string) => {
    setMessages(prev => prev.map(msg => ({
      ...msg,
      isFirst: msg.id === id, // Set true only for the clicked message ID
    })));
    setError(null);
  }, []);

  // --- AI Greeting Generation Handler ---
  const handleGenerateGreeting = useCallback(async () => {
    // Prevent generation if already running, or data is missing
    if (isGeneratingGreeting || !characterData || !apiConfig) return;

    // Check if the API is configured and enabled
    if (!apiConfig.enabled) {
        setError("API is not enabled. Please configure and enable it in Settings.");
        return;
    }
    // Basic check for API URL
    if (!apiConfig.url) {
        setError("API URL is missing. Please configure it in Settings.");
        return;
    }

    setIsGeneratingGreeting(true); // Set loading state
    setError(null); // Clear previous errors

    // Create a new ID for the message being generated
    const newMessageId = crypto.randomUUID();

    // Add a placeholder message immediately
    setMessages(prev => {
        const newMessage: Message = {
            id: newMessageId,
            content: '',
            isFirst: prev.length === 0,
            order: prev.length,
        };
        return [...prev, newMessage];
    });

    try {
      // Use streaming greeting generation
      const result = await ChatStorage.generateGreetingStream(
          characterData, 
          apiConfig,
          (chunk) => {
              // Update message content as chunks arrive
              setMessages(prev => prev.map(msg => 
                  msg.id === newMessageId 
                      ? { ...msg, content: msg.content + chunk }
                      : msg
              ));
          }
      );

      if (!result.success) {
        // If failed, remove the placeholder
        setMessages(prev => prev.filter(msg => msg.id !== newMessageId));
        throw new Error(result.message || 'Greeting generation failed on the backend.');
      }
      
      // If success, the message is already fully populated via the stream
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred during generation.');
      // Remove the partial/empty message on error
      setMessages(prev => prev.filter(msg => msg.id !== newMessageId));
    } finally {
      setIsGeneratingGreeting(false); // Clear loading state regardless of outcome
    }
  }, [isGeneratingGreeting, characterData, apiConfig]); // Dependencies for the handler


  // --- Derived State & Effects ---

  // Memoized sorted list of messages for rendering, 'isFirst' always comes first
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      if (a.isFirst && !b.isFirst) return -1; // a is first, b is not -> a comes first
      if (!a.isFirst && b.isFirst) return 1;  // b is first, a is not -> b comes first
      return a.order - b.order; // Otherwise, sort by original order
    });
  }, [messages]);

  // Effect to synchronize local 'messages' state back to the global 'characterData' context
  useEffect(() => {
    // Only run sync logic after initial mount/load and if characterData exists
    if (!isMounted.current || !characterData) return;

    // Find the content of the message marked as primary ('isFirst')
    const firstMessageContent = messages.find(m => m.isFirst)?.content || '';

    // Collect content of all other messages, preserving order, filtering empty ones
    const alternateGreetings = messages
      .filter(m => !m.isFirst && m.content && m.content.trim()) // Exclude primary and empty/whitespace
      .sort((a, b) => a.order - b.order) // Ensure sorted by original order
      .map(m => m.content);

    // Prevent unnecessary updates if the relevant data hasn't actually changed
    if (characterData.data.first_mes === firstMessageContent &&
        JSON.stringify(characterData.data.alternate_greetings || []) === JSON.stringify(alternateGreetings)) {
      // console.log("Messages sync skipped: No change detected.");
      return; // Exit if no actual change to sync
    }

    console.log("Syncing UI messages back to characterData context");
    // Update the characterData context using functional update
    setCharacterData(prevData => {
      // Ensure prevData exists before spreading
      if (!prevData) return prevData;
      return {
        ...prevData,
        data: {
          ...prevData.data,
          first_mes: firstMessageContent,
          alternate_greetings: alternateGreetings,
        },
      };
    });

  }, [messages, characterData, setCharacterData]); // Dependencies for the sync effect


  // --- Render JSX ---
  return (
    <div className="h-full flex flex-col bg-stone-900 text-gray-200">
      {/* Header Section */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-100">Greeting Manager</h2>
          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Generate Greeting Button */}
            <button
              onClick={handleGenerateGreeting}
              disabled={isGeneratingGreeting || !apiConfig?.enabled}
              className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                isGeneratingGreeting || !apiConfig?.enabled
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500'
              }`}
              title={!apiConfig?.enabled ? "API is not enabled in Settings" : "Generate a new greeting using AI"}
            >
              {/* Loading Spinner/Icon */}
              {isGeneratingGreeting ? (
                <LoadingSpinner size="sm" />
              ) : (
                <Sparkles size={18} />
              )}
              <span>{isGeneratingGreeting ? 'Generating...' : 'Generate'}</span>
            </button>

            {/* Add New Manual Message Button */}
            <button
              onClick={handleAddMessage}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
              title="Add a blank greeting card to write manually"
            >
              <Plus size={18} />
              <span>New Manual</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Display Area */}
      {error && (
        <div className="px-6 py-3 mx-6 mt-4 bg-red-800/40 border border-red-700/60 text-red-200 rounded-md flex justify-between items-center text-sm" role="alert">
          <span>Error: {error}</span>
          {/* Button to dismiss the error */}
          <button onClick={() => setError(null)} className="p-1 text-red-100 hover:text-white rounded-full hover:bg-red-700/50" aria-label="Dismiss error">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Message Cards Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length > 0 ? (
          <div className="space-y-4">
            {/* Render sorted messages */}
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
        ) : (
          // Placeholder when no messages exist (and not currently generating the first one)
          !isGeneratingGreeting && (
            <div className="text-center py-16 text-gray-500">
              <p>No greetings defined for this character yet.</p>
              <p className="mt-2 text-sm">Use "Generate" to ask the AI for ideas or "New Manual" to write your own.</p>
            </div>
          )
        )}
        {/* Optional: You could add a subtle loading indicator here too while generating */}
        {/* {isGeneratingGreeting && <div className="text-center text-gray-400 py-4">Generating...</div>} */}
      </div>
    </div>
  );
};

export default MessagesView;