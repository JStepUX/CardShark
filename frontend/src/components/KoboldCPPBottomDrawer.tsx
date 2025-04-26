import React, { useState, useEffect, useRef } from 'react';
import { X, Play, AlertCircle } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

interface Model {
  name: string;
  path: string;
  size_gb: number;
  extension: string;
}

interface KoboldCPPBottomDrawerProps {
  onDismiss: () => void;
}

const KoboldCPPBottomDrawer: React.FC<KoboldCPPBottomDrawerProps> = ({ onDismiss }) => {
  const { settings } = useSettings();
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [filteredModels, setFilteredModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchSuccess, setLaunchSuccess] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus the input when drawer appears
  useEffect(() => {
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 300);
  }, []);

  // Fetch models when component mounts or models directory changes
  useEffect(() => {
    if (settings.models_directory) {
      fetchModels();
    }
  }, [settings.models_directory]);

  // Filter models when search query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredModels(availableModels);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = availableModels.filter(
        model => model.name.toLowerCase().includes(query)
      );
      setFilteredModels(filtered);
    }
  }, [searchQuery, availableModels]);

  // Fetch available models from the models directory
  const fetchModels = async () => {
    if (!settings.models_directory) {
      setError('No models directory set. Please set one in General Settings.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/koboldcpp/scan-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: settings.models_directory })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || response.statusText);
      }

      const data = await response.json();
      setAvailableModels(data.models);
      
      // Auto-select first model if none is selected
      if (data.models.length > 0 && !selectedModel) {
        setSelectedModel(data.models[0]);
      }
    } catch (err) {
      setError(`Error scanning models: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Launch KoboldCPP with selected model
  const launchKoboldCPP = async () => {
    if (!selectedModel) {
      setError('Please select a model first');
      return;
    }

    try {
      setIsLaunching(true);
      setError(null);

      // Launch with recommended config
      const response = await fetch('/api/koboldcpp/launch-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_path: selectedModel.path,
          config: {
            skiplauncher: true,
            nobrowser: true
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || response.statusText);
      }

      const result = await response.json();
      
      if (result.status === 'error') {
        throw new Error(result.message);
      }

      setLaunchSuccess(true);
      
      // Auto-dismiss after successful launch
      setTimeout(() => {
        onDismiss();
      }, 1500);

    } catch (err) {
      setError(`Error launching KoboldCPP: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-in-out">
      <div className="bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-t-xl shadow-xl border border-b-0 border-zinc-700 max-h-[40vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-zinc-700">
          <h2 className="text-lg font-medium text-white">KoboldCPP Model Launcher</h2>
          <button 
            onClick={onDismiss}
            className="p-1 rounded-full hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex-grow overflow-y-auto">
          {/* Main content */}
          <div className="space-y-4">
            <p className="text-zinc-300">
              You appear to have KoboldCPP installed. Would you like to load a model to start using it?
            </p>

            {/* Model Directory Warning */}
            {!settings.models_directory && (
              <div className="flex items-center gap-2 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-300">
                <AlertCircle size={18} />
                <p className="text-sm">
                  No models directory set. Please configure one in General Settings first.
                </p>
              </div>
            )}

            {/* Model Selection */}
            {settings.models_directory && (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:ring-1 focus:ring-blue-500 pr-10"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {isLoading && (
                    <div className="absolute right-3 top-2.5 animate-spin h-5 w-5 border-t-2 border-blue-500 rounded-full"></div>
                  )}
                </div>

                <div className="max-h-40 overflow-y-auto border border-zinc-700 rounded-lg">
                  {filteredModels.length > 0 ? (
                    <div className="divide-y divide-zinc-800">
                      {filteredModels.map((model) => (
                        <div
                          key={model.path}
                          className={`p-2 cursor-pointer hover:bg-zinc-800 transition-colors ${
                            selectedModel?.path === model.path ? 'bg-zinc-800 border-l-2 border-blue-500 pl-1.5' : ''
                          }`}
                          onClick={() => setSelectedModel(model)}
                        >
                          <div className="font-medium text-white">{model.name}</div>
                          <div className="text-xs text-zinc-400">Size: {model.size_gb.toFixed(1)} GB</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-zinc-500">
                      {isLoading ? 'Loading models...' : 'No models found'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Success message */}
            {launchSuccess && (
              <div className="p-3 bg-green-900/30 border border-green-700/50 rounded-lg text-green-300 text-sm">
                KoboldCPP launched successfully!
              </div>
            )}
          </div>
        </div>

        {/* Footer with buttons */}
        <div className="p-4 border-t border-zinc-700 flex justify-end gap-3">
          <button
            onClick={onDismiss}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
          >
            Dismiss
          </button>
          
          <button
            onClick={launchKoboldCPP}
            disabled={!selectedModel || isLaunching || !settings.models_directory}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              !selectedModel || isLaunching || !settings.models_directory
                ? 'bg-blue-800/50 text-blue-300/50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isLaunching ? (
              <>
                <div className="animate-spin h-4 w-4 border-t-2 border-current rounded-full"></div>
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Play size={18} />
                <span>Start KoboldCPP</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default KoboldCPPBottomDrawer;