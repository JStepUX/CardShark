// hooks/useChatContinuation.ts
import { useState, useRef, useContext } from 'react';
import { Message } from '../types/messages';
import { CharacterData } from '../contexts/CharacterContext';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { PromptHandler } from '../handlers/promptHandler';
import { APIConfig } from '../types/api';

export function useChatContinuation(
  messages: Message[],
  characterData: CharacterData | null,
  saveMessages: (messages: Message[]) => void,
  updateMessagesState: (updatedMessages: Message[]) => void,
  setIsGenerating: (isGenerating: boolean) => void,
  setGeneratingId: (id: string | null) => void,
  setContextWindow: (contextWindow: any) => void
) {
  const apiConfigContext = useContext(APIConfigContext);
  const apiConfig = apiConfigContext ? apiConfigContext.apiConfig : null;
  const currentGenerationRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prepare API config with default values if needed
  const prepareAPIConfig = (config?: APIConfig | null): APIConfig => {
    if (config) {
      const fullConfig = JSON.parse(JSON.stringify(config));
      
      if (!fullConfig.generation_settings) {
        fullConfig.generation_settings = {
          max_length: 220,
          max_context_length: 6144,
          temperature: 1.05,
          top_p: 0.92,
          top_k: 100,
        };
      }
      
      return fullConfig;
    }
    
    return {
      id: 'default',
      provider: 'KoboldCPP',
      url: 'http://localhost:5001',
      enabled: false,
      templateId: 'mistral',
      generation_settings: {},
    };
  };

  const continueResponse = async (message: Message) => {
    if (!characterData || !apiConfig) {
      setError(!apiConfig ? "API configuration not loaded" : "Cannot continue message");
      return;
    }

    const targetIndex = messages.findIndex(msg => msg.id === message.id);
    if (targetIndex === -1) {
      console.error(`Message with ID ${message.id} not found`);
      return;
    }

    setIsGenerating(true);
    setGeneratingId(message.id);
    console.log(`Continuing message at index ${targetIndex}`);

    try {
      // Get context messages up to and including the target message
      const contextMessages = messages
        .slice(0, targetIndex + 1)
        .filter(msg => msg.role !== 'thinking')
        .map(({ role, content }) => {
          let validRole: 'user' | 'assistant' | 'system' = 'system';
          if (role === 'user') {
            validRole = 'user';
          } else if (role === 'assistant') {
            validRole = 'assistant';
          }
          return { role: validRole, content };
        });

      const contextWindow = {
        type: 'continuation',
        timestamp: new Date().toISOString(),
        characterName: characterData.data?.name || 'Unknown',
        messageId: message.id,
        messageIndex: targetIndex,
        contextMessageCount: contextMessages.length,
        originalContent: message.content,
      };
      
      setContextWindow(contextWindow);

      const continuationPrompt: {
        role: 'user' | 'assistant' | 'system';
        content: string;
      } = {
        role: 'system',
        content: "Continue from exactly where you left off without repeating anything. Do not summarize or restart."
      };

      contextMessages.push(continuationPrompt);

      const formattedAPIConfig = prepareAPIConfig(apiConfig);
      
      const abortController = new AbortController();
      currentGenerationRef.current = abortController;
      const response = await PromptHandler.generateChatResponse(
        characterData,
        message.content,
        contextMessages,
        'User', // Using default user name as currentUser is not available in this hook
        formattedAPIConfig, 
        abortController.signal
      );

      if (!response.ok) {
        throw new Error("Continuation failed - check API settings");
      }

      // Stream response
      let newContent = message.content; // Start with existing content
      let buffer = '';
      let bufferTimer: NodeJS.Timeout | null = null;
      
      // During streaming, ONLY update the current message content - don't modify variations yet
      for await (const chunk of PromptHandler.streamResponse(response)) {
        // Batch updates for smoother performance
        if (!bufferTimer) {
          bufferTimer = setInterval(() => {
            if (buffer.length > 0) {
              const content = newContent + buffer;
              buffer = '';
              
              // Update UI with temporary content without modifying variations
              const updatedMessages = [...messages];
              updatedMessages[targetIndex] = {
                ...updatedMessages[targetIndex],
                content
              };
              
              updateMessagesState(updatedMessages);
              newContent = content;
            }
          }, 50);
        }
        
        // Add new content to buffer
        buffer += chunk;
      }

      // Clean up buffer timer
      if (bufferTimer) {
        clearInterval(bufferTimer);
        bufferTimer = null;
      }

      // Final update - add as new variation only at the END of streaming
      if (buffer.length > 0) {
        newContent += buffer;
      }
      
      // Create updated message with new variation
      const updatedMessages = [...messages];
      const targetMsg = updatedMessages[targetIndex];
      
      // Create or update variations array
      const variations = [...(targetMsg.variations || [])];
      
      // Add the full completed continuation as a single variation
      if (!variations.includes(newContent)) {
        variations.push(newContent);
      }
      
      // Update the message with new content and variations
      updatedMessages[targetIndex] = {
        ...targetMsg,
        content: newContent,
        variations,
        currentVariation: variations.length - 1
      };

      // Update state and context window
      updateMessagesState(updatedMessages);
      setContextWindow({
        ...contextWindow,
        type: 'continuation_complete',
        finalResponse: newContent,
        completionTime: new Date().toISOString(),
        variationsCount: variations.length
      });
      
      // Save completed messages
      saveMessages(updatedMessages);
    } catch (err) {
      console.error("Continuation error:", err);
      setError(err instanceof Error ? err.message : "Continuation failed");
      
      setContextWindow({
        type: 'continuation_error',
        timestamp: new Date().toISOString(),
        characterName: characterData?.data?.name || 'Unknown',
        errorTime: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error during continuation'
      });
    } finally {
      currentGenerationRef.current = null;
      setIsGenerating(false);
      setGeneratingId(null);
    }
  };

  const stopContinuation = () => {
    if (currentGenerationRef.current) {
      console.log('Stopping continuation - aborting controller');
      currentGenerationRef.current.abort();
      currentGenerationRef.current = null;
    }
  };

  return {
    continueResponse,
    stopContinuation,
    error,
    clearError: () => setError(null)
  };
}