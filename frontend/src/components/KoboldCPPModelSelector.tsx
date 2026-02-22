import React, { useState, useEffect } from 'react';
import { FolderOpen, Rocket, Lightbulb, X } from 'lucide-react';
import { useKoboldCPP } from '../hooks/useKoboldCPP';
import Button from './common/Button';

interface Model {
  name: string;
  path: string;
  size_gb: number;
  extension: string;
  last_modified: string;
}

interface ModelConfig {
  contextsize?: number;
  threads?: number;
  gpulayers?: number;
  usecublas?: boolean;
  usevulkan?: boolean;
  usecpu?: boolean;
  port?: number;
  defaultgenamt?: number;
  multiuser?: number;
}

interface KoboldCPPModelSelectorProps {
  onStatusChange?: (status: any) => void;
  onModelLaunched?: (modelInfo: any) => void;
}

const contextSizeOptions = [
  { value: 1024, label: '1K' },
  { value: 2048, label: '2K' },
  { value: 4096, label: '4K' },
  { value: 8192, label: '8K' },
  { value: 16384, label: '16K' },
  { value: 32768, label: '32K' }
];

const KoboldCPPModelSelector: React.FC<KoboldCPPModelSelectorProps> = ({
  onStatusChange,
  onModelLaunched
}) => {
  const [modelsDirectory, setModelsDirectory] = useState('');
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isFetchingDirectory, setIsFetchingDirectory] = useState(true);
  
  // Use the centralized KoboldCPP hook
  const { status, refresh: refreshKoboldStatus } = useKoboldCPP();
  
  // Model configuration
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    contextsize: 4096,
    threads: undefined,
    defaultgenamt: 128,
    port: 5001
  });
  
  // Hardware acceleration options
  const [useGPU, setUseGPU] = useState(false);

  // Load the saved models directory on component mount
  useEffect(() => {
    const fetchModelsDirectory = async () => {
      try {
        setIsFetchingDirectory(true);
        const response = await fetch('/api/koboldcpp/models-directory');
        
        if (response.ok) {
          const data = await response.json();
          if (data.directory) {
            setModelsDirectory(data.directory);
            // If we have a directory, automatically scan it
            scanModelsDirectoryFromSetting(data.directory);
          }
        } else {
          console.error('Failed to fetch models directory from settings');
        }
      } catch (err) {
        console.error('Error fetching models directory:', err);
      } finally {
        setIsFetchingDirectory(false);
      }
    };

    fetchModelsDirectory();
  }, []);

  // Pass status to parent if available and onStatusChange prop is provided
  useEffect(() => {
    if (status && onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  // Save the models directory to settings when it changes
  const saveModelsDirectoryToSettings = async (directory: string) => {
    try {
      const response = await fetch('/api/koboldcpp/models-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ directory }),
      });

      if (!response.ok) {
        console.error('Failed to save models directory to settings');
      }
    } catch (err) {
      console.error('Error saving models directory:', err);
    }
  };
  
  // Scan models directory and save the path to settings
  const scanModelsDirectoryFromSetting = async (directory: string) => {
    if (!directory) {
      return;
    }
    
    try {
      setIsScanning(true);
      setError(null);
      
      const response = await fetch('/api/koboldcpp/scan-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || response.statusText);
      }
      
      const data = await response.json();
      setAvailableModels(data.models);
      
      // Auto-select first model if any are found
      if (data.models.length > 0) {
        setSelectedModel(data.models[0]);
        getRecommendedConfig(data.models[0].size_gb);
        setSuccess(`Found ${data.models.length} models in the directory`);
      } else {
        setSuccess(`No models found. Try adding models to the directory.`);
      }
    } catch (err) {
      setError(`Error scanning models directory: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsScanning(false);
    }
  };
  
  // Scan a directory for models
  const scanModelsDirectory = async () => {
    if (!modelsDirectory) {
      setError('Please enter a models directory path');
      return;
    }
    
    try {
      // First, save the directory to settings for future use
      await saveModelsDirectoryToSettings(modelsDirectory);
      
      // Then scan the directory
      await scanModelsDirectoryFromSetting(modelsDirectory);
    } catch (err) {
      setError(`Error scanning models directory: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  // Get recommended configuration for a model based on its size
  const getRecommendedConfig = async (modelSizeGB: number) => {
    try {
      const response = await fetch('/api/koboldcpp/recommended-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_size_gb: modelSizeGB })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || response.statusText);
      }
      
      const config = await response.json();
      setModelConfig(prev => ({
        ...prev,
        ...config
      }));
      
      // Update GPU usage based on recommendation
      setUseGPU(!!config.usevulkan || !!config.usecublas);
      
      setSuccess(`Applied recommended configuration for ${modelSizeGB.toFixed(1)}GB model`);
    } catch (err) {
      setError(`Error getting recommendations: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  // Launch KoboldCPP with selected model and config
  const launchModel = async () => {
    if (!selectedModel) {
      setError('Please select a model to launch');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Prepare configuration based on UI settings
      const config: ModelConfig = {
        ...modelConfig,
      };
      
      // Apply GPU settings
      if (useGPU) {
        config.usevulkan = true; // Prefer Vulkan as it's more broadly compatible
        config.gpulayers = -1; // Auto-detect
      } else {
        config.usecpu = true;
      }
      
      const response = await fetch('/api/koboldcpp/launch-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_path: selectedModel.path,
          config: config
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || response.statusText);
      }
      
      const result = await response.json();
      setSuccess(`Successfully launched KoboldCPP with model: ${selectedModel.name}`);
      
      // Notify parent component if callback provided
      if (onModelLaunched) {
        onModelLaunched({
          model: selectedModel,
          config: config,
          result: result
        });
      }
      
      // Refresh KoboldCPP status through the hook
      await refreshKoboldStatus();
      
    } catch (err) {
      setError(`Error launching model: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Get auto-recommendations when model selection changes
  useEffect(() => {
    if (selectedModel) {
      getRecommendedConfig(selectedModel.size_gb);
    }
  }, [selectedModel]);
  
  return (
    <div className="space-y-6 p-4 bg-stone-900 rounded-lg">
      <h3 className="text-xl font-medium">KoboldCPP Model Manager</h3>
      
      {/* Directory Selection */}
      <div className="flex space-x-2">
        <input
          type="text"
          value={modelsDirectory}
          onChange={(e) => setModelsDirectory(e.target.value)}
          placeholder="Path to models directory"
          className="flex-grow px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
          disabled={isScanning || isFetchingDirectory}
        />
        <Button
          variant="secondary"
          icon={isScanning || isFetchingDirectory
            ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            : <FolderOpen className="h-4 w-4" />}
          onClick={scanModelsDirectory}
          disabled={isScanning || !modelsDirectory || isFetchingDirectory}
          title="Scan directory for models"
        >
          {isScanning ? 'Scanning...' : isFetchingDirectory ? 'Loading...' : 'Scan'}
        </Button>
      </div>
      
      {/* Models List */}
      {availableModels.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300 mb-2">Select Model</label>
          <select
            value={selectedModel?.path || ''}
            onChange={(e) => {
              const model = availableModels.find(m => m.path === e.target.value);
              if (model) {
                setSelectedModel(model);
              }
            }}
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
          >
            <option value="" disabled>Select a model</option>
            {availableModels.map((model) => (
              <option key={model.path} value={model.path}>
                {model.name} ({model.size_gb} GB)
              </option>
            ))}
          </select>
        </div>
      )}
      
      {/* Configuration */}
      {selectedModel && (
        <div className="p-4 space-y-4 border border-stone-800 rounded-lg bg-stone-950">
          <div className="flex justify-between items-center">
            <h4 className="text-lg font-medium">Model Configuration</h4>
            <Button
              variant="secondary"
              size="sm"
              icon={<Lightbulb className="h-3.5 w-3.5" />}
              onClick={() => getRecommendedConfig(selectedModel.size_gb)}
              title="Get recommended settings"
            >
              Auto-Configure
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Context Size</label>
              <select
                value={modelConfig.contextsize}
                onChange={(e) => setModelConfig({...modelConfig, contextsize: Number(e.target.value)})}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
              >
                {contextSizeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label} tokens
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Default Generation Amount</label>
              <input
                type="number"
                value={modelConfig.defaultgenamt}
                onChange={(e) => setModelConfig({...modelConfig, defaultgenamt: Number(e.target.value)})}
                min={1}
                max={modelConfig.contextsize ? modelConfig.contextsize / 2 : 2048}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Threads</label>
              <input
                type="number"
                value={modelConfig.threads || ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  setModelConfig({...modelConfig, threads: val});
                }}
                placeholder="Auto"
                min={1}
                max={32}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Port</label>
              <input
                type="number"
                value={modelConfig.port || 5001}
                onChange={(e) => setModelConfig({...modelConfig, port: Number(e.target.value)})}
                min={1}
                max={65535}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2 py-2">
            <input
              type="checkbox"
              id="useGPU"
              checked={useGPU}
              onChange={(e) => setUseGPU(e.target.checked)}
              className="h-4 w-4 rounded bg-stone-700 border-stone-500 focus:ring-blue-500"
            />
            <label htmlFor="useGPU" className="text-sm text-gray-300 cursor-pointer">
              Use GPU Acceleration (recommended for large models)
            </label>
          </div>
          
          {/* Launch Button */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={loading
              ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              : <Rocket className="h-4 w-4" />}
            onClick={launchModel}
            disabled={loading || !selectedModel}
            className="!bg-purple-600 hover:!bg-purple-700"
          >
            {loading ? 'Launching...' : 'Launch Model'}
          </Button>
        </div>
      )}
      
      {/* Status Messages */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-white px-4 py-3 rounded-lg flex items-start gap-2">
          <div className="flex-shrink-0 mt-0.5">⚠️</div>
          <div className="flex-grow">{error}</div>
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={14} />}
            onClick={() => setError(null)}
            className="ml-auto flex-shrink-0"
          />
        </div>
      )}
      
      {success && (
        <div className="bg-green-900/40 border border-green-700 text-white px-4 py-3 rounded-lg flex items-start gap-2">
          <div className="flex-shrink-0 mt-0.5">✓</div>
          <div className="flex-grow">{success}</div>
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={14} />}
            onClick={() => setSuccess(null)}
            className="ml-auto flex-shrink-0"
          />
        </div>
      )}
    </div>
  );
};

export default KoboldCPPModelSelector;