/**
 * @file ChatGenerationContext.tsx
 * @description Manages AI generation state: streaming, generation functions, lore image tracking.
 * Consumes useChatSession(), useChatMessageStore(), useChatCompression(), plus external hooks.
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Message } from '../types/messages';
import { APIConfig, APIProvider, DEFAULT_GENERATION_SETTINGS } from '../types/api';
import { APIConfigContext } from '../contexts/APIConfigContext';
import { streamResponse, generateChatResponse } from '../services/generation';
import { ChatStorage } from '../services/chatStorage';
import { MessageUtils } from '../utils/messageUtils';
import { useContentFilter } from '../hooks/useContentFilter';
import {
  TriggeredLoreImage,
  AvailablePreviewImage,
  processLoreEntriesForImageTracking,
  getAvailableImagesForPreview,
  resetTriggeredImages as resetGlobalTriggeredImages
} from '../handlers/loreHandler';
import { LoreEntry } from '../types/schema';
import { buildContextMessages } from '../utils/contextBuilder';
import { stripCharacterPrefix, removeIncompleteSentences } from '../utils/contentProcessing';
import { useCharacter } from '../contexts/CharacterContext';
import { useChatSession } from './ChatSessionContext';
import { useChatMessageStore } from './ChatMessageContext';
import { useChatCompression } from './ChatCompressionContext';

interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
  instructions?: string;
}

const DEFAULT_REASONING_SETTINGS: ReasoningSettings = {
  enabled: false,
  visible: false,
  instructions: "!important! Embody {{char}}. **Think** through the context of this interaction with <thinking></thinking> tags. Consider your character, your relationship with the user, and relevant context from the conversation history."
};

interface ChatGenerationContextType {
  isGenerating: boolean;
  generatingId: string | null;
  reasoningSettings: ReasoningSettings;
  triggeredLoreImages: TriggeredLoreImage[];
  availablePreviewImages: AvailablePreviewImage[];
  currentPreviewImageIndex: number;
  currentGenerationRef: React.MutableRefObject<AbortController | null>;
  generateResponse: (prompt: string, retryCount?: number) => Promise<void>;
  regenerateMessage: (message: Message, retryCount?: number) => Promise<void>;
  regenerateGreeting: () => Promise<void>;
  impersonateUser: (partialMessage?: string, onChunk?: (chunk: string) => void) => Promise<{ success: boolean; response?: string; error?: string }>;
  continueResponse: (message: Message) => Promise<void>;
  stopGeneration: () => void;
  updateReasoningSettings: (settings: ReasoningSettings) => void;
  navigateToPreviewImage: (index: number) => void;
  trackLoreImages: (matchedEntries: LoreEntry[], characterUuid: string) => void;
  resetTriggeredLoreImagesState: () => void;
  setIsGenerating: (value: boolean) => void;
  setGeneratingId: (id: string | null) => void;
  setTriggeredLoreImages: (images: TriggeredLoreImage[]) => void;
  setAvailablePreviewImages: (images: AvailablePreviewImage[]) => void;
  setCurrentPreviewImageIndex: (index: number) => void;
}

const ChatGenerationContext = createContext<ChatGenerationContextType | null>(null);

export const ChatGenerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { characterData } = useCharacter();
  const apiConfigContext = useContext(APIConfigContext);
  const apiConfig = apiConfigContext ? apiConfigContext.apiConfig : null;

  const session = useChatSession();
  const messageStore = useChatMessageStore();
  const compression = useChatCompression();
  const { getRequestParameters, filterText, shouldUseClientFiltering } = useContentFilter();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [reasoningSettings, setReasoningSettings] = useState<ReasoningSettings>(() => {
    try {
      const savedSettings = localStorage.getItem('cardshark_reasoning_settings');
      return savedSettings ? JSON.parse(savedSettings) : DEFAULT_REASONING_SETTINGS;
    } catch {
      return DEFAULT_REASONING_SETTINGS;
    }
  });
  const [triggeredLoreImages, setTriggeredLoreImages] = useState<TriggeredLoreImage[]>([]);
  const [availablePreviewImages, setAvailablePreviewImages] = useState<AvailablePreviewImage[]>([]);
  const [currentPreviewImageIndex, setCurrentPreviewImageIndex] = useState<number>(0);
  const currentGenerationRef = useRef<AbortController | null>(null);

  const resetTriggeredLoreImagesState = useCallback(() => {
    resetGlobalTriggeredImages();
    setTriggeredLoreImages([]);
    const charImgPath = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
      ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
    const defaultAvailImages = getAvailableImagesForPreview(charImgPath);
    setAvailablePreviewImages(defaultAvailImages);
    setCurrentPreviewImageIndex(0);
  }, [characterData]);

  const prepareAPIConfig = useCallback((config?: APIConfig | null): APIConfig => {
    const defaultConfigSettings = { ...DEFAULT_GENERATION_SETTINGS };
    if (config) {
      const fullConfig = JSON.parse(JSON.stringify(config));
      if (!fullConfig.generation_settings) {
        fullConfig.generation_settings = defaultConfigSettings;
      }
      const contentFilterParams = getRequestParameters();
      return { ...fullConfig, ...contentFilterParams };
    }
    return {
      id: 'default', provider: APIProvider.KOBOLD, url: 'http://localhost:5001',
      enabled: false, templateId: 'mistral', generation_settings: defaultConfigSettings,
      ...getRequestParameters()
    };
  }, [getRequestParameters]);

  const handleGenerationError = useCallback((err: unknown, messageId: string) => {
    console.error('Generation error:', err);
    const errorMsg = err instanceof Error ? err.message : 'Unknown error during generation.';
    messageStore.setError(errorMsg);
    messageStore.setMessages((prev: Message[]) => prev.map(msg => {
      if (msg.id === messageId) {
        if (msg.variations && msg.variations.length > 1 && typeof msg.currentVariation === 'number' && msg.currentVariation > 0) {
          const prevVarIdx = msg.currentVariation - 1;
          return { ...msg, role: 'assistant', content: msg.variations[prevVarIdx], currentVariation: prevVarIdx, error: errorMsg };
        }
        return { ...msg, role: 'system', content: `Generation failed: ${errorMsg}` };
      }
      return msg;
    }));
    messageStore.setMessages(currentMsgs => { messageStore.saveChat(currentMsgs); return currentMsgs; });
  }, [messageStore]);

  const regenerateMessage = useCallback(async (message: Message, retryCount: number = 0) => {
    if (!characterData || message.role !== 'assistant') return;

    let effectiveChatId = session.currentChatId;
    if (!effectiveChatId) {
      if (session.createNewChatRef.current) {
        effectiveChatId = await session.createNewChatRef.current();
        if (!effectiveChatId) {
          messageStore.setError("Failed to establish chat. Try creating a new chat.");
          return;
        }
      } else {
        messageStore.setError("Chat creation function not available.");
        return;
      }
    }

    const msgIdx = messageStore.messagesRef.current.findIndex(m => m.id === message.id);
    if (msgIdx <= 0) return;
    const lastUserMsg = messageStore.messagesRef.current[msgIdx - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') return;

    const origContent = message.content;
    const origVariations = message.variations ? [...message.variations] : [origContent];
    const origVarIdx = message.currentVariation ?? origVariations.length - 1;

    messageStore.setMessages((prev: Message[]) => prev.map(m => m.id === message.id ? { ...m, content: '...', role: 'assistant' } : m));
    setIsGenerating(true); setGeneratingId(message.id); messageStore.setError(null);

    const abortCtrl = new AbortController(); currentGenerationRef.current = abortCtrl;

    try {
      const { buildGenerationContext, executeGeneration } = await import('../utils/generationOrchestrator');
      const effectiveCharData = session.characterDataOverride || characterData;

      const genConfig = {
        type: 'regenerate' as const,
        chatSessionUuid: effectiveChatId,
        characterData: effectiveCharData,
        apiConfig: prepareAPIConfig(apiConfig),
        signal: abortCtrl.signal,
        sessionNotes: session.sessionNotes,
        compressionLevel: compression.compressionLevel,
        compressedContextCache: compression.compressedContextCache,
        onCompressionStart: () => compression.setIsCompressing(true),
        onCompressionEnd: () => compression.setIsCompressing(false),
        onPayloadReady: (payload: Record<string, unknown>) => {
          if (payload.compressedContextCache) {
            compression.setCompressedContextCache(payload.compressedContextCache as import('../services/chat/chatTypes').CompressedContextCache);
          }
          session.setLastContextWindow({
            type: 'regeneration',
            timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name || 'Unknown',
            messageId: message.id,
            ...payload
          });
        }
      };

      const context = buildGenerationContext(genConfig, {
        existingMessages: messageStore.messagesRef.current,
        targetMessage: message,
        excludeMessageId: message.id
      });

      const response = await executeGeneration(genConfig, context);

      let fullContent = ''; let buffer = ''; const bufferInt = 50;
      let bufTimer: NodeJS.Timeout | null = null;
      const updateRegenMsgContent = (chunk: string) => {
        buffer += chunk;
        if (bufTimer) clearTimeout(bufTimer);
        bufTimer = setTimeout(() => {
          const curBuf = buffer; buffer = ''; fullContent += curBuf;
          const filtContent = shouldUseClientFiltering ? filterText(fullContent) : fullContent;
          messageStore.setMessages((prevMsgs: Message[]) => prevMsgs.map(msg => {
            if (msg.id === message.id) {
              const newVars = [...origVariations, filtContent];
              return {
                ...msg, content: filtContent, variations: newVars,
                currentVariation: newVars.length - 1, role: 'assistant' as const,
                status: 'streaming' as const
              };
            } return msg;
          }));
        }, bufferInt);
      };

      const charName = (session.characterDataOverride || characterData)?.data?.name || '';

      for await (const chunk of streamResponse(response, charName)) {
        if (abortCtrl.signal.aborted) {
          if (bufTimer) clearTimeout(bufTimer);
          bufTimer = null;
          if (buffer.length > 0) { fullContent += buffer; buffer = ''; }
          break;
        }
        updateRegenMsgContent(chunk);
      }

      if (!abortCtrl.signal.aborted) {
        if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; }
        if (buffer.length > 0) { fullContent += buffer; buffer = ''; }
      }

      const strippedContent = stripCharacterPrefix(fullContent, charName);
      const cleanedContent = session.settingsRef.current?.remove_incomplete_sentences !== false
        ? removeIncompleteSentences(strippedContent) : strippedContent;
      const finalMsgs = messageStore.messagesRef.current.map(msg => {
        if (msg.id === message.id) {
          const finalFiltContent = shouldUseClientFiltering ? filterText(cleanedContent) : cleanedContent;
          const newVars = [...origVariations, finalFiltContent];
          return {
            ...msg, content: finalFiltContent, variations: newVars,
            currentVariation: newVars.length - 1, role: 'assistant' as const, status: 'complete' as const
          };
        } return msg;
      });
      messageStore.setMessages(finalMsgs);
      messageStore.saveChat(finalMsgs);

      if (!abortCtrl.signal.aborted && fullContent.trim().length === 0) {
        if (retryCount < 2) {
          if (retryCount > 0) await new Promise(resolve => setTimeout(resolve, 500));
          const msgToRegen = finalMsgs.find(m => m.id === message.id) || message;
          await regenerateMessage(msgToRegen, retryCount + 1);
          return;
        } else {
          messageStore.setError("Received empty response from the model. Please try again.");
        }
      }

      session.setLastContextWindow((prev: Record<string, unknown>) => ({ ...prev, type: 'message_regenerated', regeneratedMessageId: message.id }));
    } catch (err) {
      if (!abortCtrl.signal.aborted) handleGenerationError(err, message.id);
      else {
        messageStore.setMessages(prevMsgs => prevMsgs.map(m => m.id === message.id ? { ...m, content: origContent, variations: origVariations, currentVariation: origVarIdx, role: 'assistant' } : m));
        messageStore.saveChat(messageStore.messagesRef.current);
      }
    } finally {
      if (!abortCtrl.signal.aborted) { setIsGenerating(false); setGeneratingId(null); }
      currentGenerationRef.current = null;
    }
  }, [characterData, session, messageStore, compression, apiConfig, prepareAPIConfig, shouldUseClientFiltering, filterText, handleGenerationError]);

  const generateResponse = useCallback(async (prompt: string, retryCount: number = 0) => {
    if (!characterData) { messageStore.setError('No character data for response.'); return; }

    let effectiveChatId = session.currentChatId;
    if (!effectiveChatId) {
      if (session.createNewChatRef.current) {
        effectiveChatId = await session.createNewChatRef.current();
        if (!effectiveChatId && !messageStore.messagesRef.current.find(m => m.role === 'assistant')) {
          messageStore.setError("Failed to establish chat. Try creating a new chat.");
          return;
        }
      } else { messageStore.setError("Chat creation fn not available."); return; }
    }
    if (!effectiveChatId) { messageStore.setError("Failed to get valid chat ID for response."); return; }

    const userMsg = MessageUtils.createUserMessage(prompt);
    const msgWithId = { ...userMsg, id: userMsg.id || crypto.randomUUID() };
    const existingMessagesSnapshot = messageStore.messagesRef.current;

    messageStore.setMessages((prev: Message[]) => [...prev, msgWithId]);

    try {
      await ChatStorage.appendMessage(effectiveChatId, msgWithId);
    } catch (err) {
      console.error('Failed to persist user message:', err);
    }

    const assistantMsgId = crypto.randomUUID();
    const assistantMsg = MessageUtils.createAssistantMessage('', assistantMsgId);
    messageStore.setMessages((prev: Message[]) => [...prev, assistantMsg]);
    setIsGenerating(true); setGeneratingId(assistantMsgId); messageStore.setError(null);

    const abortCtrl = new AbortController(); currentGenerationRef.current = abortCtrl;

    try {
      const ctxMsgs = buildContextMessages({
        existingMessages: existingMessagesSnapshot,
        newUserMessage: userMsg,
        excludeMessageId: assistantMsgId
      });
      const fmtAPIConfig = prepareAPIConfig(apiConfig);
      const effectiveCharData = session.characterDataOverride || characterData;
      const response = await generateChatResponse({
        chatSessionUuid: effectiveChatId,
        contextMessages: ctxMsgs,
        apiConfig: fmtAPIConfig,
        signal: abortCtrl.signal,
        characterCard: effectiveCharData,
        sessionNotes: session.sessionNotes,
        compressionLevel: compression.compressionLevel,
        compressedContextCache: compression.compressedContextCache,
        onCompressionStart: () => compression.setIsCompressing(true),
        onCompressionEnd: () => compression.setIsCompressing(false),
        onPayloadReady: (payload) => {
          if (payload.compressedContextCache) {
            compression.setCompressedContextCache(payload.compressedContextCache as import('../services/chat/chatTypes').CompressedContextCache);
          }
          session.setLastContextWindow({
            type: 'generation',
            timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name || 'Unknown',
            messageId: assistantMsgId,
            ...payload
          });
        },
      });

      let fullContent = ''; let buffer = ''; const bufferInterval = 50;
      let bufTimer: NodeJS.Timeout | null = null;
      const updateAssistantMsgContent = (chunk: string) => {
        buffer += chunk;
        if (bufTimer) clearTimeout(bufTimer);
        bufTimer = setTimeout(() => {
          const curBuf = buffer; buffer = ''; fullContent += curBuf;
          const filtContent = shouldUseClientFiltering ? filterText(fullContent) : fullContent;
          messageStore.setMessages((prevMsgs: Message[]) => prevMsgs.map((msg: Message) =>
            msg.id === assistantMsgId ? {
              ...msg, content: filtContent, variations: [filtContent],
              currentVariation: 0, status: 'streaming' as const
            } : msg
          ));
        }, bufferInterval);
      };

      const charName = (session.characterDataOverride || characterData)?.data?.name || '';

      for await (const chunk of streamResponse(response, charName)) {
        if (abortCtrl.signal.aborted) {
          if (bufTimer) clearTimeout(bufTimer);
          bufTimer = null;
          if (buffer.length > 0) { fullContent += buffer; buffer = ''; }
          break;
        }
        updateAssistantMsgContent(chunk);
      }

      if (!abortCtrl.signal.aborted) {
        if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; }
        if (buffer.length > 0) { fullContent += buffer; buffer = ''; }
      }

      const strippedContent = stripCharacterPrefix(fullContent, charName);
      const cleanedContent = session.settingsRef.current?.remove_incomplete_sentences !== false
        ? removeIncompleteSentences(strippedContent) : strippedContent;
      const finalContent = shouldUseClientFiltering ? filterText(cleanedContent) : cleanedContent;
      const finalMsgs = messageStore.messagesRef.current.map(msg => msg.id === assistantMsgId ? {
        ...msg, content: finalContent, variations: [finalContent],
        currentVariation: 0, status: 'complete' as const
      } : msg);
      messageStore.setMessages(finalMsgs);
      messageStore.saveChat(finalMsgs);

      if (!abortCtrl.signal.aborted && fullContent.trim().length === 0) {
        if (retryCount < 2) {
          if (retryCount > 0) await new Promise(resolve => setTimeout(resolve, 500));
          const msgToRegen = finalMsgs.find(m => m.id === assistantMsgId);
          if (msgToRegen) {
            await regenerateMessage(msgToRegen, retryCount + 1);
            return;
          }
        } else {
          messageStore.setError("Received empty response from the model. Please try again.");
        }
      }

      session.setLastContextWindow((curWin: Record<string, unknown>) => ({ ...curWin, type: 'response_generated', lastPrompt: prompt, responseLength: fullContent.length }));
    } catch (err) {
      if (!abortCtrl.signal.aborted) handleGenerationError(err, assistantMsgId);
      else {
        const finalMsgs = messageStore.messagesRef.current.map(msg => msg.id === assistantMsgId ? { ...msg, content: shouldUseClientFiltering ? filterText(msg.content) : msg.content } : msg);
        messageStore.saveChat(finalMsgs);
      }
    } finally {
      if (!abortCtrl.signal.aborted) { setIsGenerating(false); setGeneratingId(null); }
      currentGenerationRef.current = null;
    }
  }, [characterData, session, messageStore, compression, apiConfig, prepareAPIConfig, shouldUseClientFiltering, filterText, handleGenerationError, regenerateMessage]);

  const regenerateGreeting = useCallback(async () => {
    if (!characterData || isGenerating) return;

    const msgs = messageStore.messagesRef.current;
    const firstAssMsgIdx = msgs.findIndex(m => m.role === 'assistant');
    if (firstAssMsgIdx === -1) return;

    const greetingMsg = msgs[firstAssMsgIdx];
    const origContent = greetingMsg.content;
    const origVariations = greetingMsg.variations ? [...greetingMsg.variations] : [origContent];

    setIsGenerating(true); setGeneratingId(greetingMsg.id); messageStore.setError(null);

    try {
      let fullGreeting = '';
      const result = await ChatStorage.generateGreetingStream(
        characterData, apiConfig,
        (chunk) => {
          fullGreeting += chunk;
          messageStore.setMessages(prevMsgs => prevMsgs.map(msg => {
            if (msg.id === greetingMsg.id) {
              const newVars = [...origVariations, fullGreeting];
              return { ...msg, content: fullGreeting, variations: newVars, currentVariation: newVars.length - 1 };
            }
            return msg;
          }));
        }
      );

      if (result.success && result.greeting) {
        const charName = characterData?.data?.name || '';
        const strippedGreeting = stripCharacterPrefix(result.greeting, charName);
        messageStore.setMessages(prevMsgs => {
          const updatedMsgs = prevMsgs.map(msg => {
            if (msg.id === greetingMsg.id) {
              const newVars = [...origVariations, strippedGreeting];
              return { ...msg, content: strippedGreeting, variations: newVars, currentVariation: newVars.length - 1 };
            }
            return msg;
          });
          messageStore.debouncedSave(updatedMsgs);
          return updatedMsgs;
        });
      } else {
        throw new Error(result.message || "Failed to generate new greeting");
      }
    } catch (err) {
      console.error("Error regenerating greeting:", err);
      messageStore.setError(err instanceof Error ? err.message : 'Failed to regenerate greeting');
    } finally {
      setIsGenerating(false);
      setGeneratingId(null);
    }
  }, [characterData, isGenerating, apiConfig, messageStore]);

  const impersonateUser = useCallback(async (
    partialMessage: string = '',
    onChunk?: (chunk: string) => void
  ): Promise<{ success: boolean; response?: string; error?: string }> => {
    if (!characterData || isGenerating) {
      return { success: false, error: 'Cannot impersonate: no character or generation in progress' };
    }

    setIsGenerating(true); messageStore.setError(null);

    try {
      const userName = session.currentUser?.name || 'User';
      const userDescription = session.currentUser?.description?.trim() || '';
      const contextMessages = messageStore.messagesRef.current.filter(m => m.role !== 'system' && m.role !== 'thinking');

      const result = await ChatStorage.generateImpersonateStream(
        characterData, apiConfig, contextMessages, partialMessage, userName, userDescription, onChunk
      );

      if (!result.success) {
        throw new Error(result.message || 'Failed to generate impersonate response');
      }
      return { success: true, response: result.response };
    } catch (err) {
      console.error('Error in impersonateUser:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate response';
      messageStore.setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsGenerating(false);
    }
  }, [characterData, isGenerating, apiConfig, session.currentUser, messageStore]);

  const continueResponse = useCallback(async (message: Message) => {
    if (!characterData || message.role !== 'assistant' || !message.content) return;

    let effectiveChatId = session.currentChatId;
    if (!effectiveChatId) {
      if (session.createNewChatRef.current) {
        effectiveChatId = await session.createNewChatRef.current();
        if (!effectiveChatId) {
          messageStore.setError("Failed to establish chat. Try creating a new chat.");
          return;
        }
      } else {
        messageStore.setError("Chat creation function not available.");
        return;
      }
    }

    const msgIdx = messageStore.messagesRef.current.findIndex(m => m.id === message.id);
    if (msgIdx === -1) return;
    const origContent = message.content;

    setIsGenerating(true); setGeneratingId(message.id); messageStore.setError(null);
    const abortCtrl = new AbortController(); currentGenerationRef.current = abortCtrl;
    let appendedContent = '';

    try {
      const { buildGenerationContext, executeGeneration } = await import('../utils/generationOrchestrator');
      const effectiveCharData = session.characterDataOverride || characterData;

      const genConfig = {
        type: 'continue' as const,
        chatSessionUuid: effectiveChatId,
        characterData: effectiveCharData,
        apiConfig: prepareAPIConfig(apiConfig),
        signal: abortCtrl.signal,
        sessionNotes: session.sessionNotes,
        compressionLevel: compression.compressionLevel,
        compressedContextCache: compression.compressedContextCache,
        onCompressionStart: () => compression.setIsCompressing(true),
        onCompressionEnd: () => compression.setIsCompressing(false),
        onPayloadReady: (payload: Record<string, unknown>) => {
          if (payload.compressedContextCache) {
            compression.setCompressedContextCache(payload.compressedContextCache as import('../services/chat/chatTypes').CompressedContextCache);
          }
          session.setLastContextWindow({
            type: 'continuation',
            timestamp: new Date().toISOString(),
            characterName: characterData?.data?.name || 'Unknown',
            messageId: message.id,
            ...payload
          });
        }
      };

      const context = buildGenerationContext(genConfig, {
        existingMessages: messageStore.messagesRef.current,
        targetMessage: message,
        includeTargetInContext: false,
        excludeMessageId: undefined
      });

      const response = await executeGeneration(genConfig, context);

      let buffer = ''; const bufferInt = 50;
      let bufTimer: NodeJS.Timeout | null = null;
      const updateContinueMsgContent = (chunk: string) => {
        buffer += chunk;
        if (bufTimer) clearTimeout(bufTimer);
        bufTimer = setTimeout(() => {
          const curBuf = buffer; buffer = ''; appendedContent += curBuf;
          const combinedContent = origContent + appendedContent;
          const filtContent = shouldUseClientFiltering ? filterText(combinedContent) : combinedContent;
          messageStore.setMessages(prevMsgs => prevMsgs.map(msg => {
            if (msg.id === message.id) {
              const newVars = msg.variations ? [...msg.variations] : [origContent];
              newVars[msg.currentVariation ?? newVars.length - 1] = filtContent;
              return { ...msg, content: filtContent, variations: newVars };
            } return msg;
          }));
        }, bufferInt);
      };

      const charName = (session.characterDataOverride || characterData)?.data?.name || '';

      for await (const chunk of streamResponse(response, charName)) {
        if (abortCtrl.signal.aborted) {
          if (bufTimer) clearTimeout(bufTimer);
          bufTimer = null;
          if (buffer.length > 0) { appendedContent += buffer; buffer = ''; }
          break;
        }
        updateContinueMsgContent(chunk);
      }

      if (!abortCtrl.signal.aborted) {
        if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; }
        if (buffer.length > 0) { appendedContent += buffer; buffer = ''; }
      }

      const strippedAppended = stripCharacterPrefix(appendedContent, charName);
      const finalMsgs = messageStore.messagesRef.current.map(msg => {
        if (msg.id === message.id) {
          const finalCombined = origContent + strippedAppended;
          const cleanedCombined = session.settingsRef.current?.remove_incomplete_sentences !== false
            ? removeIncompleteSentences(finalCombined) : finalCombined;
          const finalFilt = shouldUseClientFiltering ? filterText(cleanedCombined) : cleanedCombined;
          const newVars = msg.variations ? [...msg.variations] : [origContent];
          newVars[msg.currentVariation ?? newVars.length - 1] = finalFilt;
          return { ...msg, content: finalFilt, variations: newVars };
        } return msg;
      });
      messageStore.setMessages(finalMsgs);
      messageStore.saveChat(finalMsgs);
    } catch (err) {
      if (!abortCtrl.signal.aborted) handleGenerationError(err, message.id);
      else {
        const charName = (session.characterDataOverride || characterData)?.data?.name || '';
        const strippedAppended = stripCharacterPrefix(appendedContent, charName);
        const finalMsgs = messageStore.messagesRef.current.map(msg => {
          if (msg.id === message.id) {
            const finalCombined = origContent + strippedAppended;
            const finalFilt = shouldUseClientFiltering ? filterText(finalCombined) : finalCombined;
            const newVars = msg.variations ? [...msg.variations] : [origContent];
            newVars[msg.currentVariation ?? newVars.length - 1] = finalFilt;
            return { ...msg, content: finalFilt, variations: newVars };
          } return msg;
        });
        messageStore.saveChat(finalMsgs);
      }
    } finally {
      if (!abortCtrl.signal.aborted) { setIsGenerating(false); setGeneratingId(null); }
      currentGenerationRef.current = null;
    }
  }, [characterData, session, messageStore, compression, apiConfig, prepareAPIConfig, shouldUseClientFiltering, filterText, handleGenerationError]);

  const stopGeneration = useCallback(() => {
    if (currentGenerationRef.current) {
      currentGenerationRef.current.abort();
      setIsGenerating(false); setGeneratingId(null);
      messageStore.saveChat(messageStore.messagesRef.current);
      session.setLastContextWindow((prev: Record<string, unknown>) => ({ ...prev, type: 'generation_stopped', timestamp: new Date().toISOString() }));
    }
  }, [messageStore, session]);

  const updateReasoningSettings = useCallback((settings: ReasoningSettings) => {
    setReasoningSettings(settings);
    try { localStorage.setItem('cardshark_reasoning_settings', JSON.stringify(settings)); }
    catch (err) { console.error('Error saving reasoning settings:', err); }
  }, []);

  const navigateToPreviewImage = useCallback((index: number) => {
    if (availablePreviewImages && index >= 0 && index < availablePreviewImages.length) {
      setCurrentPreviewImageIndex(index);
    }
  }, [availablePreviewImages]);

  const trackLoreImages = useCallback((matchedEntries: LoreEntry[], characterUuidFromHook: string) => {
    if (!characterData || characterData.data.character_uuid !== characterUuidFromHook) return;

    processLoreEntriesForImageTracking(matchedEntries, characterUuidFromHook);

    const charImgPath = (characterData?.avatar !== 'none' && characterData?.data?.character_uuid)
      ? `/api/character-image/${characterData.data.character_uuid}.png` : '';
    const allAvailableImages = getAvailableImagesForPreview(charImgPath);

    setAvailablePreviewImages(allAvailableImages);

    if (currentPreviewImageIndex >= allAvailableImages.length) setCurrentPreviewImageIndex(0);
    else {
      const curImg = availablePreviewImages[currentPreviewImageIndex];
      if (curImg?.type === 'lore') {
        const stillAvail = allAvailableImages.find((img: AvailablePreviewImage) => img.type === 'lore' && img.entryId === curImg.entryId && img.imageUuid === curImg.imageUuid);
        if (!stillAvail) setCurrentPreviewImageIndex(0);
      }
    }
    messageStore.saveChat(messageStore.messagesRef.current);
  }, [characterData, currentPreviewImageIndex, availablePreviewImages, messageStore]);

  const contextValue: ChatGenerationContextType = {
    isGenerating,
    generatingId,
    reasoningSettings,
    triggeredLoreImages,
    availablePreviewImages,
    currentPreviewImageIndex,
    currentGenerationRef,
    generateResponse,
    regenerateMessage,
    regenerateGreeting,
    impersonateUser,
    continueResponse,
    stopGeneration,
    updateReasoningSettings,
    navigateToPreviewImage,
    trackLoreImages,
    resetTriggeredLoreImagesState,
    setIsGenerating,
    setGeneratingId,
    setTriggeredLoreImages,
    setAvailablePreviewImages,
    setCurrentPreviewImageIndex,
  };

  return (
    <ChatGenerationContext.Provider value={contextValue}>
      {children}
    </ChatGenerationContext.Provider>
  );
};

export const useChatGeneration = (): ChatGenerationContextType => {
  const context = useContext(ChatGenerationContext);
  if (!context) throw new Error('useChatGeneration must be used within a ChatGenerationProvider');
  return context;
};

export { ChatGenerationContext };
