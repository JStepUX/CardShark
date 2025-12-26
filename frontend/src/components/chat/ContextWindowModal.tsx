import React, { useState, useMemo } from 'react';
import { Dialog } from '../common/Dialog';
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

// Simple token counting for estimation
const countTokens = (text?: string): number => {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  // More accurate approximation: split on whitespace and count
  // Also account for punctuation as separate tokens
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);

  // Rough estimate: 1 token per word, plus extra for punctuation
  // This is a simple heuristic - real tokenization is more complex
  return Math.max(1, words.length);
};

const ContextWindowModal: React.FC<ContextWindowModalProps> = ({
  isOpen,
  onClose,
  contextData,
  title = "API Context Window"
}) => {
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'raw'>('analysis');

  // Copy to clipboard functionality - Copy the active context
  const handleCopy = async () => {
    try {
      const dataToCopy = JSON.stringify(contextData, null, 2);

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

  // Analyze token usage from the actual API payload
  const tokenAnalysis = useMemo(() => {
    if (!contextData) return null;

    const analysis: Record<string, number> = {};
    let totalTokens = 0;

    // The payload structure can be in different places depending on when it was captured
    // Check for: contextData.generation_params (direct from onPayloadReady callback)
    // or contextData itself if it has the fields we need
    const payload = contextData.generation_params || contextData;

    // Memory/System Prompt
    if (payload.memory) {
      const memoryTokens = countTokens(payload.memory);
      analysis.memory = memoryTokens;
      totalTokens += memoryTokens;
    }

    // Main prompt (includes formatted chat history)
    if (payload.prompt) {
      const promptTokens = countTokens(payload.prompt);
      analysis.prompt = promptTokens;
      totalTokens += promptTokens;
    }

    // Chat history (raw messages)
    if (payload.chat_history && Array.isArray(payload.chat_history)) {
      let historyTokens = 0;
      payload.chat_history.forEach((msg: { role: string, content: string }) => {
        historyTokens += countTokens(msg.content);
      });
      analysis.chat_history = historyTokens;
      totalTokens += historyTokens;
    }

    analysis.total = totalTokens;

    // Estimate remaining capacity - check both possible locations for api_config
    const apiConfig = contextData.api_config || payload.api_config || contextData.config;
    const estimatedCapacity = apiConfig?.max_context_length || 8192;
    analysis.remainingCapacity = Math.max(0, estimatedCapacity - totalTokens);
    analysis.usagePercentage = Math.min(100, (totalTokens / estimatedCapacity) * 100);

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
              {tokenAnalysis.total.toLocaleString()} tokens used
            </div>
            <div className="text-sm text-gray-400">
              (~{tokenAnalysis.remainingCapacity.toLocaleString()} remaining)
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

        {/* Token breakdown */}
        <div className="bg-stone-800 p-4 rounded-lg">
          <h3 className="text-sm font-medium mb-3">Token Usage Breakdown</h3>

          <div className="space-y-2">
            {tokenAnalysis.memory !== undefined && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-400" />
                  <span>Memory (System Prompt)</span>
                </div>
                <div className="text-gray-300">{tokenAnalysis.memory.toLocaleString()} tokens</div>
              </div>
            )}

            {tokenAnalysis.prompt !== undefined && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-green-400" />
                  <span>Formatted Prompt</span>
                </div>
                <div className="text-gray-300">{tokenAnalysis.prompt.toLocaleString()} tokens</div>
              </div>
            )}

            {tokenAnalysis.chat_history !== undefined && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-orange-400" />
                  <span>Raw Chat History</span>
                </div>
                <div className="text-gray-300">{tokenAnalysis.chat_history.toLocaleString()} tokens</div>
              </div>
            )}
          </div>
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
                <div>{((contextData.api_config || contextData.config)?.max_context_length)?.toLocaleString() || '8192'} tokens</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Max Output</div>
                <div>{((contextData.api_config || contextData.config)?.max_length)?.toLocaleString() || '220'} tokens</div>
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
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 performance-transform ${activeTab === 'analysis'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-400 hover:text-gray-300'
              }`}
          >
            Analysis
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`px-4 py-2 performance-transform ${activeTab === 'raw'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-400 hover:text-gray-300'
              }`}
          >
            Raw Data
          </button>

          {/* Copy button aligned to the right */}
          <div className="ml-auto performance-contain">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1 my-1 bg-stone-800 hover:bg-stone-700 
                         rounded text-sm transition-colors performance-transform"
              title="Copy raw data to clipboard"
            >
              <Copy size={14} />
              <span>{copySuccess ? "Copied!" : "Copy"}</span>
            </button>
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
                {JSON.stringify(contextData, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default ContextWindowModal;