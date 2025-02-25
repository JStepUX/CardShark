import React, { useState, useEffect, useMemo } from 'react';
import { Dialog } from './Dialog';
import { Copy, FileText, MessageSquare, Settings } from 'lucide-react';

interface ContextWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
  contextData: any;
  title?: string;
}

// Simple token counting for estimation
const countTokens = (text?: string): number => {
  if (!text) return 0;
  // Split on whitespace and punctuation as a rough approximation
  return text.split(/\s+/).length;
};

const ContextWindowModal: React.FC<ContextWindowModalProps> = ({
  isOpen,
  onClose,
  contextData,
  title = "API Context Window"
}) => {
  const [formattedData, setFormattedData] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'raw'>('analysis');

  // Format the context data for display
  useEffect(() => {
    if (contextData) {
      try {
        const formatted = JSON.stringify(contextData, null, 2);
        setFormattedData(formatted);
      } catch (e) {
        setFormattedData(`Error formatting data: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      setFormattedData('No context data available');
    }
  }, [contextData]);

  // Copy to clipboard functionality
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedData);
      setCopySuccess(true);
      
      // Reset the "Copied!" message after 2 seconds
      setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Analyze token usage
  const tokenAnalysis = useMemo(() => {
    if (!contextData) return null;
    
    const analysis: Record<string, number> = {};
    let totalTokens = 0;
    
    // System information (character description, etc)
    if (contextData.systemPrompt) {
      const systemTokens = countTokens(contextData.systemPrompt);
      analysis.systemPrompt = systemTokens;
      totalTokens += systemTokens;
    }
    
    if (contextData.personality) {
      const personalityTokens = countTokens(contextData.personality);
      analysis.personality = personalityTokens;
      totalTokens += personalityTokens;
    }
    
    if (contextData.scenario) {
      const scenarioTokens = countTokens(contextData.scenario);
      analysis.scenario = scenarioTokens;
      totalTokens += scenarioTokens;
    }
    
    // Message history
    if (contextData.messageHistory && Array.isArray(contextData.messageHistory)) {
      let historyTokens = 0;
      contextData.messageHistory.forEach((msg: {role: string, content: string}) => {
        historyTokens += countTokens(msg.content);
      });
      analysis.messageHistory = historyTokens;
      totalTokens += historyTokens;
    }
    
    // User prompt
    if (contextData.prompt) {
      const promptTokens = countTokens(contextData.prompt);
      analysis.prompt = promptTokens;
      totalTokens += promptTokens;
    }
    
    analysis.total = totalTokens;
    
    // Estimate remaining capacity
    const estimatedCapacity = contextData.config?.max_context_length || 8192;
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
              className={`h-full ${tokenAnalysis.usagePercentage > 90 ? 'bg-red-500' : tokenAnalysis.usagePercentage > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${tokenAnalysis.usagePercentage}%` }}
            />
          </div>
        </div>
        
        {/* Token breakdown */}
        <div className="bg-stone-800 p-4 rounded-lg">
          <h3 className="text-sm font-medium mb-3">Token Usage Breakdown</h3>
          
          <div className="space-y-2">
            {tokenAnalysis.systemPrompt !== undefined && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-400" />
                  <span>System Prompt</span>
                </div>
                <div className="text-gray-300">{tokenAnalysis.systemPrompt.toLocaleString()} tokens</div>
              </div>
            )}
            
            {tokenAnalysis.personality !== undefined && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-purple-400" />
                  <span>Personality</span>
                </div>
                <div className="text-gray-300">{tokenAnalysis.personality.toLocaleString()} tokens</div>
              </div>
            )}
            
            {tokenAnalysis.scenario !== undefined && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-green-400" />
                  <span>Scenario</span>
                </div>
                <div className="text-gray-300">{tokenAnalysis.scenario.toLocaleString()} tokens</div>
              </div>
            )}
            
            {tokenAnalysis.messageHistory !== undefined && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-orange-400" />
                  <span>Message History</span>
                </div>
                <div className="text-gray-300">{tokenAnalysis.messageHistory.toLocaleString()} tokens</div>
              </div>
            )}
            
            {tokenAnalysis.prompt !== undefined && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-green-400" />
                  <span>Current Prompt</span>
                </div>
                <div className="text-gray-300">{tokenAnalysis.prompt.toLocaleString()} tokens</div>
              </div>
            )}
          </div>
        </div>
        
        {/* API Configuration */}
        {contextData.config && (
          <div className="bg-stone-800 p-4 rounded-lg">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Settings size={16} />
              <span>API Configuration</span>
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-400">Provider</div>
                <div>{contextData.config.provider || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Model</div>
                <div>{contextData.config.model || 'Default'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Context Limit</div>
                <div>{contextData.config.max_context_length?.toLocaleString() || '8192'} tokens</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Max Output</div>
                <div>{contextData.config.max_length?.toLocaleString() || '220'} tokens</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Character Info */}
        {contextData.characterName && (
          <div className="bg-stone-800 p-4 rounded-lg">
            <h3 className="text-sm font-medium mb-2">Character Information</h3>
            <div className="text-gray-300">{contextData.characterName}</div>
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
      className="max-w-4xl w-2/3" // Added width like JSONView
    >
      <div className="w-full h-[70vh] flex flex-col">
        {/* Tab Controls */}
        <div className="flex border-b border-stone-700 mb-4">
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 ${activeTab === 'analysis' 
              ? 'border-b-2 border-blue-500 text-blue-400' 
              : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Analysis
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`px-4 py-2 ${activeTab === 'raw' 
              ? 'border-b-2 border-blue-500 text-blue-400' 
              : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Raw Data
          </button>
          
          {/* Copy button aligned to the right */}
          <div className="ml-auto">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1 my-1 bg-stone-800 hover:bg-stone-700 
                         rounded text-sm transition-colors"
              title="Copy raw data to clipboard"
            >
              <Copy size={14} />
              <span>{copySuccess ? "Copied!" : "Copy"}</span>
            </button>
          </div>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'analysis' ? (
          <div className="flex-1 overflow-auto px-1">
            {renderTokenAnalysis()}
          </div>
        ) : (
          <div className="flex-1 relative">
            <pre className="absolute inset-0 bg-stone-900 text-gray-300 font-mono text-sm
                         rounded-lg p-4 overflow-auto whitespace-pre-wrap"
            >
              {formattedData}
            </pre>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default ContextWindowModal;