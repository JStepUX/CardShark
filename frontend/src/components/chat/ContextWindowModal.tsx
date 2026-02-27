import React, { useState, useMemo } from 'react';
import { Dialog } from '../common/Dialog';
import Button from '../common/Button';
import { Copy, FileText, MessageSquare, Settings } from 'lucide-react';
import { z } from 'zod';

const ContextWindowSchema = z.object({
  type: z.enum([
    'generation', 'regeneration', 'generation_complete',
    'regeneration_complete', 'initial_message',
    'loaded_chat', 'chat_loaded', 'new_chat'
  ]),
  timestamp: z.string().datetime(),
  characterName: z.string(),
  systemPrompt: z.string().optional(),
  description: z.string().optional(),
  personality: z.string().optional(),
  scenario: z.string().optional(),
  memory: z.string().optional(),
  historyLength: z.number().int().nonnegative(),
  currentMessage: z.string().optional(),
  enhancedPrompt: z.string().optional(),
  thinkingIncluded: z.boolean().optional(),
  formattedPrompt: z.string().optional(),
  messageHistory: z.array(z.object({
    role: z.string(),
    content: z.string()
  })).optional(),
  config: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    templateId: z.string().optional(),
    max_context_length: z.number().int().positive(),
    max_length: z.number().int().positive()
  }).optional(),
  template: z.object({
    id: z.string(),
    name: z.string()
  }).optional()
});

// Use for type inference and validation
export type ContextWindowData = z.infer<typeof ContextWindowSchema>;

interface ContextWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
  contextData: any;
  title?: string;
}

// Token estimation: ~4 characters per token for English text
// This matches the backend's estimate and is closer to real tokenizer output than word count
const countTokens = (text?: string): number => {
  if (!text || typeof text !== 'string') return 0;
  const len = text.trim().length;
  if (len === 0) return 0;
  return Math.max(1, Math.ceil(len / 4));
};

const ContextWindowModal: React.FC<ContextWindowModalProps> = ({
  isOpen,
  onClose,
  contextData,
  title = "API Context Window"
}) => {
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'payload'>('analysis');

  // Extract raw payload - only what's actually sent to the LLM
  const rawPayload = useMemo(() => {
    if (!contextData) return null;

    const payload = contextData.generation_params || contextData;
    const apiConfig = contextData.api_config || payload.api_config || contextData.config;
    const genSettings = apiConfig?.generation_settings || {};

    return {
      memory: payload.displayMemory || payload.memory || '',
      prompt: payload.prompt || '',
      stop_sequence: payload.stop_sequence || apiConfig?.stopSequences || [],
      generation_settings: {
        max_length: genSettings.max_length || payload.max_length,
        max_context_length: genSettings.max_context_length || payload.max_context_length,
        temperature: genSettings.temperature || payload.temperature,
        top_p: genSettings.top_p || payload.top_p,
        top_k: genSettings.top_k || payload.top_k,
        top_a: genSettings.top_a || payload.top_a,
        typical: genSettings.typical || payload.typical,
        tfs: genSettings.tfs || payload.tfs,
        rep_pen: genSettings.rep_pen || payload.rep_pen,
        rep_pen_range: genSettings.rep_pen_range || payload.rep_pen_range,
        rep_pen_slope: genSettings.rep_pen_slope || payload.rep_pen_slope,
        min_p: genSettings.min_p || payload.min_p,
        dynatemp_range: genSettings.dynatemp_range || payload.dynatemp_range,
        dynatemp_exponent: genSettings.dynatemp_exponent || payload.dynatemp_exponent,
        smoothing_factor: genSettings.smoothing_factor || payload.smoothing_factor,
        presence_penalty: genSettings.presence_penalty || payload.presence_penalty,
        sampler_order: genSettings.sampler_order || payload.sampler_order,
        banned_tokens: genSettings.banned_tokens || apiConfig?.banned_tokens || []
      }
    };
  }, [contextData]);

  // Copy to clipboard functionality - Copy the raw payload (what's sent to LLM)
  const handleCopy = async () => {
    try {
      const dataToCopy = JSON.stringify(rawPayload, null, 2);

      await navigator.clipboard.writeText(dataToCopy);
      setCopySuccess(true);

      // Reset the "Copied!" message after 2 seconds
      setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Extract text between markers from the prompt string
  const extractBlock = (text: string, startMarker: string, endMarker: string): string => {
    const startIdx = text.indexOf(startMarker);
    if (startIdx === -1) return '';
    const contentStart = startIdx + startMarker.length;
    const endIdx = text.indexOf(endMarker, contentStart);
    if (endIdx === -1) return '';
    return text.substring(startIdx, endIdx + endMarker.length);
  };

  // Analyze token usage from the actual API payload
  const tokenAnalysis = useMemo(() => {
    if (!contextData) return null;

    const analysis: Record<string, number> = {};
    let totalTokens = 0;

    const payload = contextData.generation_params || contextData;

    // Memory (character card + lore + system instruction)
    // displayMemory is the frontend preview; payload.memory is the legacy field
    const memoryText = contextData.displayMemory || payload.displayMemory || payload.memory || '';
    if (memoryText) {
      const memoryTokens = countTokens(memoryText);
      analysis.memory = memoryTokens;
      totalTokens += memoryTokens;
    }

    // Break down the prompt into sub-categories instead of counting as one blob
    // The prompt contains: compressed summary + session notes + formatted chat history
    if (payload.prompt) {
      const promptStr = payload.prompt as string;

      // Extract compressed summary
      const compressedBlock = extractBlock(promptStr, '[Previous Events Summary]', '[End Summary - Recent conversation follows]');
      if (compressedBlock) {
        const compressedTokens = countTokens(compressedBlock);
        analysis.compressed = compressedTokens;
        totalTokens += compressedTokens;
      }

      // Extract session notes
      const notesBlock = extractBlock(promptStr, '[Session Notes]', '[End Session Notes]');
      if (notesBlock) {
        const notesTokens = countTokens(notesBlock);
        analysis.session_notes = notesTokens;
        totalTokens += notesTokens;
      }

      // Chat history = prompt minus the extracted blocks
      let chatPortion = promptStr;
      if (compressedBlock) chatPortion = chatPortion.replace(compressedBlock, '');
      if (notesBlock) chatPortion = chatPortion.replace(notesBlock, '');
      const chatTokens = countTokens(chatPortion.trim());
      analysis.chat_history = chatTokens;
      totalTokens += chatTokens;

      // Keep total prompt tokens for reference (but don't double-count)
      analysis.prompt = countTokens(promptStr);
    }

    // Message count for display
    if (payload.chat_history && Array.isArray(payload.chat_history)) {
      analysis.message_count = payload.chat_history.length;
    }

    analysis.total = totalTokens;

    // Read max_context_length from the correct nested path
    const apiConfig = contextData.api_config || payload.api_config || contextData.config;
    const estimatedCapacity =
      apiConfig?.generation_settings?.max_context_length ||
      apiConfig?.max_context_length ||
      8192;
    analysis.remainingCapacity = Math.max(0, estimatedCapacity - totalTokens);
    analysis.usagePercentage = Math.min(100, (totalTokens / estimatedCapacity) * 100);
    analysis.maxContext = estimatedCapacity;

    return analysis;
  }, [contextData]);

  const getContextTypeSummary = () => {
    if (!contextData) return "No data";

    const type = contextData.type || 'unknown';
    const timestamp = contextData.timestamp ? new Date(contextData.timestamp).toLocaleTimeString() : 'unknown time';

    switch (type) {
      case 'generation':
        return `Generation request at ${timestamp}`;
      case 'regeneration':
        return `Regeneration request at ${timestamp}`;
      case 'generation_complete':
        return `Completed generation at ${timestamp}`;
      case 'regeneration_complete':
        return `Completed regeneration at ${timestamp}`;
      case 'initial_message':
        return `Initial character greeting at ${timestamp}`;
      case 'loaded_chat':
        return `Loaded existing chat at ${timestamp}`;
      case 'chat_loaded':
        return `Loaded chat with ${contextData.messageCount || 'unknown'} messages at ${timestamp}`;
      case 'new_chat':
        return `Started new chat at ${timestamp}`;
      default:
        return `${type} at ${timestamp}`;
    }
  };

  const renderTokenAnalysis = () => {
    if (!tokenAnalysis) return <div className="text-gray-400">No token analysis available</div>;

    return (
      <div className="space-y-4">
        <div className="bg-stone-800 p-4 rounded-lg">
          <div className="text-sm text-gray-300 mb-2">{getContextTypeSummary()}</div>

          <div className="flex items-center gap-2 mb-2">
            <div className="text-lg font-semibold">
              ~{tokenAnalysis.total.toLocaleString()} tokens used
            </div>
            <div className="text-sm text-gray-400">
              / {tokenAnalysis.maxContext?.toLocaleString()} limit (~{tokenAnalysis.remainingCapacity.toLocaleString()} remaining)
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-stone-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${tokenAnalysis.usagePercentage > 90 ? 'bg-red-500' : tokenAnalysis.usagePercentage > 70 ? 'bg-orange-500' : 'bg-green-500'}`}
              style={{ width: `${tokenAnalysis.usagePercentage}%` }}
            />
          </div>
        </div>

        {/* Character Card Field Breakdown (if available) */}
        {contextData.fieldBreakdown && Array.isArray(contextData.fieldBreakdown) && contextData.fieldBreakdown.length > 0 && (
          <div className="bg-stone-800 p-4 rounded-lg">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <FileText size={16} />
              <span>Character Card Fields</span>
            </h3>

            <div className="space-y-2">
              {contextData.fieldBreakdown.map((field: any) => (
                <div
                  key={field.fieldKey}
                  className={`flex justify-between items-center ${field.status === 'expired' ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={field.status === 'expired' ? 'line-through' : ''}>
                      {field.fieldLabel}
                    </span>
                    {field.status === 'permanent' && (
                      <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">
                        permanent
                      </span>
                    )}
                    {field.status === 'expired' && field.expiredAtMessage && (
                      <span className="text-xs text-gray-500">
                        (expired @ msg {field.expiredAtMessage})
                      </span>
                    )}
                  </div>
                  <div className={`text-sm ${field.status === 'expired' ? 'text-gray-600' : 'text-gray-300'}`}>
                    {field.tokens.toLocaleString()} tokens
                  </div>
                </div>
              ))}
            </div>

            {contextData.savedTokens > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-700 flex justify-between items-center">
                <span className="text-sm text-green-400">Tokens Saved by Field Expiration</span>
                <span className="text-sm font-medium text-green-400">
                  {contextData.savedTokens.toLocaleString()} tokens
                </span>
              </div>
            )}
          </div>
        )}

        {/* Token breakdown */}
        <div className="bg-stone-800 p-4 rounded-lg">
          <h3 className="text-sm font-medium mb-3">Token Usage Breakdown</h3>

          <div className="space-y-2">
            {tokenAnalysis.memory !== undefined && tokenAnalysis.memory > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-400" />
                  <span>Memory (Card + Lore + System)</span>
                </div>
                <div className="text-gray-300">~{tokenAnalysis.memory.toLocaleString()} tokens</div>
              </div>
            )}

            {tokenAnalysis.compressed !== undefined && tokenAnalysis.compressed > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-purple-400" />
                  <span>Compressed Summary</span>
                </div>
                <div className="text-gray-300">~{tokenAnalysis.compressed.toLocaleString()} tokens</div>
              </div>
            )}

            {tokenAnalysis.session_notes !== undefined && tokenAnalysis.session_notes > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-yellow-400" />
                  <span>Session Notes</span>
                </div>
                <div className="text-gray-300">~{tokenAnalysis.session_notes.toLocaleString()} tokens</div>
              </div>
            )}

            {tokenAnalysis.chat_history !== undefined && tokenAnalysis.chat_history > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-green-400" />
                  <span>Chat History{tokenAnalysis.message_count ? ` (${tokenAnalysis.message_count} messages)` : ''}</span>
                </div>
                <div className="text-gray-300">~{tokenAnalysis.chat_history.toLocaleString()} tokens</div>
              </div>
            )}
          </div>

          {/* Overflow warning */}
          {tokenAnalysis.usagePercentage > 90 && (
            <div className="mt-3 pt-3 border-t border-stone-700 text-xs text-red-400">
              Context is {tokenAnalysis.usagePercentage >= 100 ? 'overflowing' : 'near capacity'}. KoboldCPP will silently truncate from the front, potentially losing character card and system context.
            </div>
          )}
        </div>

        {/* API Configuration */}
        {(contextData.api_config || contextData.config) && (
          <div className="bg-stone-800 p-4 rounded-lg">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Settings size={16} />
              <span>API Configuration</span>
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-400">Provider</div>
                <div>{(contextData.api_config || contextData.config)?.provider || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Model</div>
                <div>{(contextData.api_config || contextData.config)?.model || 'Default'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Context Limit</div>
                <div>{((contextData.api_config || contextData.config)?.generation_settings?.max_context_length)?.toLocaleString() || '8192'} tokens</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Max Output</div>
                <div>{((contextData.api_config || contextData.config)?.generation_settings?.max_length)?.toLocaleString() || '220'} tokens</div>
              </div>
            </div>
          </div>
        )}

        {/* Template Information */}
        {contextData.template && (
          <div className="bg-stone-800 p-4 rounded-lg">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <FileText size={16} />
              <span>Template Information</span>
            </h3>

            <div className="mb-2">
              <div className="text-xs text-gray-400">Template Name</div>
              <div>{contextData.template.name || 'Unknown'}</div>
            </div>

            {contextData.template.format && (
              <div>
                <div className="text-xs text-gray-400">Format</div>
                <code className="block mt-1 p-2 bg-stone-950 rounded text-xs overflow-x-auto">
                  System: <span className="text-blue-400">{contextData.template.format.system_start || ''}</span>...<span className="text-blue-400">{contextData.template.format.system_end || ''}</span><br />
                  User: <span className="text-green-400">{contextData.template.format.user_start || ''}</span>...<span className="text-green-400">{contextData.template.format.user_end || ''}</span><br />
                  Assistant: <span className="text-purple-400">{contextData.template.format.assistant_start || ''}</span>...<span className="text-purple-400">{contextData.template.format.assistant_end || ''}</span>
                </code>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showCloseButton={true}
      className="max-w-4xl w-2/3"
    >
      <div className="w-full h-[70vh] flex flex-col performance-contain performance-transform">
        {/* Tab Controls */}
        <div className="flex border-b border-stone-700 mb-4 performance-contain">
          <Button
            variant="ghost"
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 rounded-none border-x-0 border-t-0 performance-transform ${activeTab === 'analysis'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : ''
              }`}
          >
            Analysis
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('payload')}
            className={`px-4 py-2 rounded-none border-x-0 border-t-0 performance-transform ${activeTab === 'payload'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : ''
              }`}
          >
            Raw Payload
          </Button>

          {/* Copy button aligned to the right */}
          <div className="ml-auto performance-contain">
            <Button
              variant="secondary"
              size="sm"
              icon={<Copy size={14} />}
              onClick={handleCopy}
              className="my-1 performance-transform"
              title="Copy raw data to clipboard"
            >
              {copySuccess ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'analysis' ? (
          <div className="flex-1 overflow-auto px-1 performance-contain">
            {renderTokenAnalysis()}
          </div>
        ) : (
          <div className="flex-1 overflow-auto performance-contain">
            <div className="performance-contain performance-transform">
              <pre className="bg-stone-900 text-gray-300 font-mono text-sm
                           rounded-lg p-4 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(rawPayload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default ContextWindowModal;