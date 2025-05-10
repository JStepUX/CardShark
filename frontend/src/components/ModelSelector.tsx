// frontend/src/components/ModelSelector.tsx
import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle as AlertCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { APIProvider, ModelInfo, FeatherlessModelInfo } from '../types/api';
import { useKoboldCPP } from '../hooks/useKoboldCPP';

// --- Interfaces ---

// Local Kobold Model
interface Model {
  name: string;
  path: string;
  size_gb: number;
  extension: string;
  last_modified: string;
}

// OpenRouter Model (Extends base ModelInfo)
interface OpenRouterModel extends ModelInfo {
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string; };
}

// --- Props Interfaces ---

interface ModelSelectorProps {
  apiUrl: string;
  provider: APIProvider;
  modelsDirectory?: string;
  selectedModel?: string;
  onChange: (model: string) => void;
  apiKey?: string;
}

interface OpenRouterModelSelectorProps {
  apiUrl: string;
  apiKey: string | null;
  selectedModel: string;
  onChange: (model: string) => void;
}

interface FeatherlessModelSelectorProps {
  apiUrl: string;
  apiKey: string | null;
  selectedModel: string;
  onChange: (model: string) => void;
}

// --- Child Selector Components ---

// OpenRouter Model Selector Component
const OpenRouterModelSelector: React.FC<OpenRouterModelSelectorProps> = ({
  apiUrl,
  apiKey,
  selectedModel,
  onChange
}) => {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (apiKey) {
      fetchOpenRouterModels();
    } else {
      setModels([]);
      setError("API Key required to load OpenRouter models.");
    }
  }, [apiKey, apiUrl]); // Re-fetch if URL or key changes

  const fetchOpenRouterModels = async () => {
    if (!apiKey) return; // Guard clause
    setIsLoading(true);
    setError(null);
    try {
       const response = await fetch('/api/openrouter/models', { // Placeholder endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl, apiKey: apiKey })
      });
       if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
      }
      const fetchedData = await response.json();
      if (!fetchedData.success) {
         throw new Error(fetchedData.error || 'Backend failed to fetch models');
      }
      // Add explicit types to sort callback parameters
      const validModels = (fetchedData.models || [])
        .filter((model: OpenRouterModel) => model.id && model.name)
        .sort((a: OpenRouterModel, b: OpenRouterModel) => (a.name || '').localeCompare(b.name || ''));
      setModels(validModels);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load models';
      setError(message);
      toast.error(`OpenRouter Error: ${message}`);
      setModels([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredModels = models.filter(model =>
    (model.name || model.id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300 mb-1">OpenRouter Model</label>
      <input
        type="text"
        placeholder="Search models..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-1.5 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 text-sm mb-2"
        disabled={!apiKey || isLoading}
      />
      {isLoading ? (
        <div className="flex items-center text-gray-400">
          <Loader2 className="animate-spin mr-2" size={16} /> Loading models...
        </div>
      ) : error ? (
        <div className="text-red-400 flex items-center text-xs p-2 bg-red-950/30 rounded">
          <AlertCircleIcon size={16} className="mr-2 flex-shrink-0" /> {error}
        </div>
      ) : !apiKey ? (
         <div className="text-yellow-400 text-xs p-2 bg-yellow-950/30 rounded">API Key required to load models.</div>
      ) : models.length === 0 && !isLoading ? (
         <div className="text-gray-400">No models found.</div>
      ) : (
        <select
          value={selectedModel || ''} // Ensure value is controlled
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 text-sm"
          size={Math.min(10, filteredModels.length + 1)}
          disabled={isLoading}
        >
          <option value="" disabled={!!selectedModel}>-- Select a Model --</option>
          {filteredModels.length === 0 && searchTerm && (
            <option value="" disabled>No models match "{searchTerm}"</option>
          )}
          {filteredModels.map((model) => (
            <option key={model.id} value={model.id} title={model.description}>
              {model.name} ({model.id})
              {model.context_length && ` - Context: ${model.context_length}`}
              {model.pricing?.prompt && model.pricing?.completion ?
                ` - Price: $${(parseFloat(model.pricing.prompt) * 1000000).toFixed(2)}/$${(parseFloat(model.pricing.completion) * 1000000).toFixed(2)} per 1M`
                : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};


// Featherless Model Selector Component
const FeatherlessModelSelector: React.FC<FeatherlessModelSelectorProps> = ({
  apiUrl,
  apiKey,
  selectedModel,
  onChange,
}) => {
  const [models, setModels] = useState<FeatherlessModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Clear models and show error if API key is removed
    if (!apiKey) {
      setModels([]);
      setError("API Key required to load Featherless models.");
      return; // Exit early
    }

    // Debounce the fetchModels call
    const handler = setTimeout(() => {
      if (apiKey) { // Double-check apiKey presence before fetching
        fetchModels();
      }
    }, 500); // 500ms debounce

    // Cleanup function to clear the timeout if apiKey or apiUrl changes before timeout triggers
    return () => {
      clearTimeout(handler);
    };
  }, [apiKey, apiUrl]); // Re-fetch if URL or key changes, debounced

  const fetchModels = async () => {
    // Guard clause already handled by the effect, but good for direct calls if any
    if (!apiKey) {
        setError("API Key required to load Featherless models.");
        setModels([]);
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
       const response = await fetch('/api/featherless/models', { // Placeholder endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl, apiKey: apiKey })
      });
       if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
      }
      const fetchedData = await response.json();
       if (!fetchedData.success) {
         throw new Error(fetchedData.error || 'Backend failed to fetch models');
      }
       // Add explicit types to sort callback parameters
       const validModels = (fetchedData.models || [])
        .filter((model: FeatherlessModelInfo) => model.id && model.name)
        .sort((a: FeatherlessModelInfo, b: FeatherlessModelInfo) => (a.name || "").localeCompare(b.name || ""));
      setModels(validModels);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load models';
      setError(message);
      toast.error(`Featherless Error: ${message}`);
      setModels([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredModels = models.filter(model =>
    (model.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300 mb-1">Featherless Model</label>
       <input
        type="text"
        placeholder="Search models..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-1.5 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 text-sm mb-2"
        disabled={!apiKey || isLoading}
      />
      {isLoading ? (
        <div className="flex items-center text-gray-400">
          <Loader2 className="animate-spin mr-2" size={16} /> Loading models...
        </div>
      ) : error ? (
        <div className="text-red-400 flex items-center text-xs p-2 bg-red-950/30 rounded">
           <AlertCircleIcon size={16} className="mr-2 flex-shrink-0" /> {error}
        </div>
       ) : !apiKey ? (
         <div className="text-yellow-400 text-xs p-2 bg-yellow-950/30 rounded">API Key required to load models.</div>
      ) : models.length === 0 && !isLoading ? (
         <div className="text-gray-400">No models found.</div>
      ) : (
        <>
          <select
          value={selectedModel || ''} // Ensure value is controlled
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 text-sm"
          size={Math.min(10, filteredModels.length + 1)}
          disabled={isLoading}
        >
           <option value="" disabled={!!selectedModel}>-- Select a Model --</option>
          {filteredModels.length === 0 && searchTerm && (
            <option value="" disabled>No models match "{searchTerm}"</option>
          )}
          {filteredModels.map((model) => (
            <option key={model.id} value={model.id} title={model.description}>
              {model.name} ({model.id})
              {model.context_length && ` - Context: ${model.context_length}`}
              {model.max_tokens && ` - Max Tokens: ${model.max_tokens}`}
            </option>
          ))}
        </select>
{selectedModel && filteredModels.length > 0 && (() => {
        const currentModelDetails = filteredModels.find(m => m.id === selectedModel);
        return currentModelDetails ? (
          <div className="mt-2 text-xs text-gray-400">
            Selected: <span className="font-semibold text-gray-200">{currentModelDetails.name} ({currentModelDetails.id})</span>
          </div>
        ) : null;
      })()}
        </>
      )}
    </div>
  );
};


// KoboldCPP Model Selector Component (Main ModelSelector)
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  apiUrl,
  provider,
  modelsDirectory,
  selectedModel,
  onChange,
  apiKey
}) => {
  const [models, setModels] = useState<Model[]>([]); // For Kobold local models
  const [isLoading, setIsLoading] = useState(false); // Loading state for this specific selector/action
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Use the hook correctly
  const { status: koboldHookStatus, refresh: refreshKoboldStatus } = useKoboldCPP();

  // Add useEffect to log models state changes
  useEffect(() => {
    console.log(`[ModelSelector State Watcher] models state updated (${models.length}):`, models.slice(0, 5));
  }, [models]);

  const isKobold = provider === APIProvider.KOBOLD;
  const isOpenRouter = provider === APIProvider.OPENROUTER;
  const isFeatherless = provider === APIProvider.FEATHERLESS;

  // Fetch local models for KoboldCPP
  useEffect(() => {
    if (isKobold && modelsDirectory) {
      fetchLocalModels();
    } else if (isKobold && !modelsDirectory) {
        setError("Model directory not set in General Settings.");
        setModels([]);
    }
  }, [isKobold, modelsDirectory]);

  const fetchLocalModels = async () => {
    if (!modelsDirectory) {
        console.log("[ModelSelector] fetchLocalModels skipped: no modelsDirectory");
        return;
    }
    console.log(`[ModelSelector] fetchLocalModels called for directory: ${modelsDirectory}`);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/koboldcpp/scan-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: modelsDirectory })
      });
      console.log(`[ModelSelector] fetchLocalModels response status: ${response.status}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: `HTTP error! status: ${response.status}` } }));
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
      }
      const fetchedData = await response.json();
      console.log(`[ModelSelector] fetchLocalModels fetchedData:`, fetchedData);
      // Removed incorrect success check: if (!fetchedData.success) { ... }
      // Directly use the models array from the response
      const modelsFromBackend = fetchedData.models || [];
      const sortedModels = [...modelsFromBackend].sort((a: Model, b: Model) => a.name.localeCompare(b.name)); // Ensure sorting a copy
      console.log(`[ModelSelector] Attempting to set local models state with ${sortedModels.length} models. First 5:`, sortedModels.slice(0, 5));
      setModels(sortedModels); // Call state setter
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load local models';
      console.error(`[ModelSelector] Error in fetchLocalModels: ${message}`, e);
      setError(message);
      toast.error(`KoboldCPP Error: ${message}`);
      setModels([]); // Clear models on error
    } finally {
      setIsLoading(false);
    }
  };

  // KoboldCPP Connection Handlers using placeholder backend endpoints
  const handleConnectKobold = async () => {
    if (selectedModel && modelsDirectory) {
       setIsLoading(true);
       setError(null);
      try {
         console.log(`Requesting backend to connect KoboldCPP with model: ${selectedModel}`);
         const response = await fetch('/api/koboldcpp/connect', { // Placeholder endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_path: selectedModel, models_directory: modelsDirectory })
         });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
         }
          const result = await response.json();
         if (!result.success) {
            throw new Error(result.error || 'Backend failed to start KoboldCPP');
         }
          toast.info("KoboldCPP server starting...");
        setTimeout(refreshKoboldStatus, 5000); // Refresh status after delay
      } catch (error) {
         const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to connect KoboldCPP:", error);
        setError(`Failed to start KoboldCPP: ${message}`);
        toast.error(`KoboldCPP Error: ${message}`);
      } finally {
         setIsLoading(false);
      }
    } else {
      setError("Please select a model and ensure model directory is set.");
      toast.warning("Select a model and set model directory first.");
    }
  };

  const handleDisconnectKobold = async () => {
     setIsLoading(true);
     setError(null);
     try {
        console.log("Requesting backend to disconnect KoboldCPP");
        const response = await fetch('/api/koboldcpp/disconnect', { method: 'POST' }); // Placeholder endpoint
         if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
         }
         const result = await response.json();
         if (!result.success) {
            throw new Error(result.error || 'Backend failed to stop KoboldCPP');
         }
        toast.info("KoboldCPP server stopping...");
        setTimeout(refreshKoboldStatus, 3000); // Refresh status after delay
     } catch (error) {
         const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to disconnect KoboldCPP:", error);
        setError(`Failed to stop KoboldCPP: ${message}`);
        toast.error(`KoboldCPP Error: ${message}`);
     } finally {
        setIsLoading(false);
     }
  };

  // Filter local models
  const filteredLocalModels = models.filter(model =>
    model.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Log state just before rendering
  console.log(`[ModelSelector Render] Provider: ${provider}, isKobold: ${isKobold}, isOpenRouter: ${isOpenRouter}, isFeatherless: ${isFeatherless}`);
  console.log(`[ModelSelector Render] modelsDirectory prop:`, modelsDirectory);
  if (isKobold) {
    console.log(`[ModelSelector Render - Kobold] models state (${models.length}):`, models.slice(0, 5)); // Log first 5
  }

  // Render specific selector based on provider
  if (isKobold) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300 mb-1">Local Model (KoboldCPP)</label>
        <input
          type="text"
          placeholder="Search local models..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-1.5 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 text-sm mb-2"
          disabled={isLoading || !modelsDirectory}
        />
        {isLoading && !models.length ? ( // Show loading only if models aren't loaded yet
          <div className="flex items-center text-gray-400">
            <Loader2 className="animate-spin mr-2" size={16} /> Loading models...
          </div>
        ) : error ? (
          <div className="text-red-400 flex items-center text-xs p-2 bg-red-950/30 rounded">
             <AlertCircleIcon size={16} className="mr-2 flex-shrink-0" /> {error}
          </div>
        ) : !modelsDirectory ? (
             <div className="text-yellow-400 text-xs p-2 bg-yellow-950/30 rounded">Model directory not set in General Settings.</div>
        ) : models.length === 0 && !isLoading ? (
          <div className="text-gray-400">No models found in directory: {modelsDirectory}</div>
        ) : (
          <>
            <div className="flex gap-2 items-center">
              <select
                value={selectedModel || ''} // Ensure value is controlled
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 text-sm"
                size={Math.min(10, filteredLocalModels.length + 1)}
                disabled={isLoading}
              >
                 <option value="" disabled={!!selectedModel}>-- Select a Model --</option>
                {filteredLocalModels.length === 0 && searchTerm && (
                  <option value="" disabled>No models match "{searchTerm}"</option>
                )}
                {filteredLocalModels.map((model) => (
                  <option key={model.path} value={model.path}>
                    {model.name} ({model.size_gb.toFixed(2)} GB)
                  </option>
                ))}
              </select>
              {/* Use is_running from the hook's status */}
              {koboldHookStatus?.is_running ? (
                <button
                  onClick={handleDisconnectKobold}
                  disabled={isLoading} // Disable button during connect/disconnect actions
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-sm flex-shrink-0"
                  title="Stop KoboldCPP Server (via backend)"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleConnectKobold}
                  disabled={!selectedModel || !modelsDirectory || isLoading}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-sm flex-shrink-0"
                  title={!selectedModel || !modelsDirectory ? "Select a model and set model directory first" : "Start KoboldCPP Server with selected model (via backend)"}
                >
                  Start
                </button>
              )}
            </div>
            {/* Display running status - removed model name check as it's not available from hook */}
            {koboldHookStatus?.is_running && (
               <p className="text-xs text-green-400 mt-1">KoboldCPP running.</p>
            )}
          </>
        )}
      </div>
    );
  } else if (isOpenRouter) {
    return (
      <OpenRouterModelSelector
        apiUrl={apiUrl}
        apiKey={apiKey || null}
        selectedModel={selectedModel || ''}
        onChange={onChange}
      />
    );
  } else if (isFeatherless) {
    return (
      <FeatherlessModelSelector
        apiUrl={apiUrl}
        apiKey={apiKey || null}
        selectedModel={selectedModel || ''}
        onChange={onChange}
      />
    );
  }

  // Fallback for providers without specific selectors
  return null;
};