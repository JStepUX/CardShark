// components/APIConfigurationPanel.tsx
// Component for displaying and updating API configuration settings
import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Sliders, Save, AlertCircle, Loader2 } from 'lucide-react';
import { APIConfig, FeatherlessModelInfo } from '../types/api';
import { apiService } from '../services/apiService';
import { useKoboldCPP } from '../hooks/useKoboldCPP';

// Model selection related types
interface Model {
  name: string;
  path: string;
  size_gb: number;
  extension: string;
  last_modified: string;
}

// OpenRouter model interface
interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
}

interface APIConfigurationPanelProps {
  config: APIConfig;
  onUpdate: (updates: Partial<APIConfig>) => void;
  modelsDirectory?: string;
}

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  width?: string;
}> = ({ label, value, onChange, min, max, tooltip, width = 'w-32' }) => {
  // Add local state to track input value as string
  const [inputValue, setInputValue] = useState(value.toString());
  
  // Update local input value when external value changes
  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  // Handle blur event for validation
  const handleBlur = () => {
    let val = parseFloat(inputValue);
    
    // If input is invalid, reset to previous valid value
    if (isNaN(val)) {
      setInputValue(value.toString());
      return;
    }
    
    // Apply min/max constraints
    if (min !== undefined && val < min) val = min;
    if (max !== undefined && val > max) val = max;
    
    // Update both local input and parent state
    setInputValue(val.toString());
    onChange(val);
  };

  return (
    <div className={`${width}`}>
      <label className="block text-sm font-medium text-gray-300 mb-1" title={tooltip}>
        {label}
      </label>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        className="w-full px-3 py-1.5 bg-stone-950 border border-stone-700 rounded-lg 
                  focus:ring-1 focus:ring-blue-500 text-sm"
      />
    </div>
  );
};

const SamplerOrderItem: React.FC<{
  sampler: { id: number; label: string };
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = ({ sampler, index, isFirst, isLast, onMoveUp, onMoveDown }) => (
  <div className="flex items-center justify-between p-2 bg-stone-800 rounded-lg">
    <span className="text-sm flex-1">{sampler.label}</span>
    <span className="text-xs text-gray-500 mr-4">Order: {index + 1}</span>
    <div className="flex gap-1">
      <button
        onClick={onMoveUp}
        disabled={isFirst}
        className={`p-1 rounded ${
          isFirst ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-gray-700'
        }`}
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={onMoveDown}
        disabled={isLast}
        className={`p-1 rounded ${
          isLast ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-gray-700'
        }`}
      >
        <ChevronDown size={16} />
      </button>
    </div>
  </div>
);

const SAMPLER_ORDER_OPTIONS = [
  { id: 6, label: 'Repetition Penalty' },
  { id: 0, label: 'Temperature' },
  { id: 1, label: 'Top K' },
  { id: 3, label: 'Top P' },
  { id: 4, label: 'TFS' },
  { id: 2, label: 'Top A' },
  { id: 5, label: 'Typical' }
];

const APIConfigurationPanel: React.FC<APIConfigurationPanelProps> = ({ config, onUpdate, modelsDirectory }) => {
  const [expanded, setExpanded] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<any>(null);
  const [settings, setSettings] = useState({
    max_length: config.generation_settings?.max_length ?? 220,
    max_context_length: config.generation_settings?.max_context_length ?? 6144,
    temperature: config.generation_settings?.temperature ?? 1.05,
    top_p: config.generation_settings?.top_p ?? 0.92,
    top_k: config.generation_settings?.top_k ?? 100,
    top_a: config.generation_settings?.top_a ?? 0,
    typical: config.generation_settings?.typical ?? 1,
    tfs: config.generation_settings?.tfs ?? 1,
    min_p: config.generation_settings?.min_p ?? 0,
    rep_pen: config.generation_settings?.rep_pen ?? 1.07,
    rep_pen_range: config.generation_settings?.rep_pen_range ?? 360,
    rep_pen_slope: config.generation_settings?.rep_pen_slope ?? 0.7,
    sampler_order: config.generation_settings?.sampler_order ?? [6, 0, 1, 3, 4, 2, 5],
    dynatemp_enabled: config.generation_settings?.dynatemp_enabled ?? false,
    dynatemp_min: config.generation_settings?.dynatemp_min ?? 0.0,
    dynatemp_max: config.generation_settings?.dynatemp_max ?? 2.0,
    dynatemp_exponent: config.generation_settings?.dynatemp_exponent ?? 1.0
  });
  
  // Add state for selected model
  const [selectedModel, setSelectedModel] = useState(config.model || '');
  
  // Add provider detection logic
  const apiUrl = config.url || '';
  const isFeatherless = apiUrl && 
    (apiUrl.includes('featherless.ai') || apiUrl.toLowerCase().includes('featherless'));
  const isOpenRouter = apiUrl && 
    (apiUrl.includes('openrouter.ai') || apiUrl.toLowerCase().includes('openrouter'));

  // Update local state when config changes from outside
  useEffect(() => {
    if (config.generation_settings) {
      const newSettings = {
        max_length: config.generation_settings.max_length ?? 220,
        max_context_length: config.generation_settings.max_context_length ?? 6144,
        temperature: config.generation_settings.temperature ?? 1.05,
        top_p: config.generation_settings.top_p ?? 0.92,
        top_k: config.generation_settings.top_k ?? 100,
        top_a: config.generation_settings.top_a ?? 0,
        typical: config.generation_settings.typical ?? 1,
        tfs: config.generation_settings.tfs ?? 1,
        min_p: config.generation_settings.min_p ?? 0,
        rep_pen: config.generation_settings.rep_pen ?? 1.07,
        rep_pen_range: config.generation_settings.rep_pen_range ?? 360,
        rep_pen_slope: config.generation_settings.rep_pen_slope ?? 0.7,
        sampler_order: config.generation_settings.sampler_order ?? [6, 0, 1, 3, 4, 2, 5],
        dynatemp_enabled: config.generation_settings.dynatemp_enabled ?? false,
        dynatemp_min: config.generation_settings.dynatemp_min ?? 0.0,
        dynatemp_max: config.generation_settings.dynatemp_max ?? 2.0,
        dynatemp_exponent: config.generation_settings.dynatemp_exponent ?? 1.0
      };
      
      setSettings(newSettings);
      setOriginalSettings(JSON.stringify(newSettings));
      setHasChanges(false);
    }
    
    // Update selected model when config changes
    setSelectedModel(config.model || '');
  }, [config.generation_settings, config.model, config]);

  // Check for unsaved changes whenever settings are updated
  useEffect(() => {
    if (originalSettings) {
      const currentSettings = JSON.stringify(settings);
      const modelChanged = selectedModel !== (config.model || '');
      setHasChanges(originalSettings !== currentSettings || modelChanged);
    }
  }, [settings, originalSettings, selectedModel, config.model]);

  const handleSettingChange = (key: keyof typeof settings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
  };
  
  // Model change handler
  const handleModelChange = (model: string) => {
    setSelectedModel(model);
  };

  const handleMoveSampler = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...settings.sampler_order];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    const newSettings = { ...settings, sampler_order: newOrder };
    setSettings(newSettings);
  };

  const handleSave = () => {
    // Create update object with standard generation settings
    const updates: Partial<APIConfig> = { 
      generation_settings: settings
    };
    
    // Always save the selected model to the main model field
    if (selectedModel) {
      updates.model = selectedModel;
      
      // For provider-specific fields, also save to the specialized field
      // This ensures the model is available in both places
      if (isFeatherless) {
        // If we don't have generation_settings yet, initialize it
        if (!updates.generation_settings) {
          updates.generation_settings = {};
        }
        // Save specifically for Featherless adapter
        updates.generation_settings.featherless_model = selectedModel;
      } else if (isOpenRouter) {
        // If we don't have generation_settings yet, initialize it
        if (!updates.generation_settings) {
          updates.generation_settings = {};
        }
        // Save specifically for OpenRouter adapter
        updates.generation_settings.openrouter_model = selectedModel;
      }
    }
    
    onUpdate(updates);
  };

  return (
    <div className="space-y-4 mt-4 border-t border-stone-800 pt-4">
      <div className="flex items-center justify-between">
        <button 
          onClick={() => setExpanded(!expanded)} 
          className="flex items-center gap-2 text-gray-300 hover:text-white py-2"
        >
          <Sliders size={18} />
          <span className="text-md font-medium">Generation Settings</span>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-colors 
            ${hasChanges 
              ? 'bg-blue-600/40 hover:bg-blue-600/60 text-blue-200' 
              : 'bg-gray-800/40 text-gray-500 cursor-not-allowed'}`}
          title={hasChanges ? "Save changes" : "No changes to save"}
        >
          <Save size={16} />
          <span>Save</span>
        </button>
      </div>

      {/* Model Selection */}
      <div className="space-y-4">
        <ModelSelector
          apiUrl={config.url || ''}
          modelsDirectory={modelsDirectory}
          selectedModel={selectedModel}
          onChange={handleModelChange}
          apiKey={config.apiKey || ''}
        />
      </div>

      <div className={`space-y-6 pt-2 transition-expand ${expanded ? 'expanded' : ''}`}>
          {/* Basic Settings */}
          <div className="space-y-4">
            <h4 className="text-sm text-gray-400">Basic Parameters</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NumberField
                label="Max Length"
                value={settings.max_length}
                onChange={val => handleSettingChange('max_length', val)}
                min={1}
                max={512}
                step={1}
                tooltip="Maximum number of tokens to generate"
                width="w-full"
              />
              <NumberField
                label="Max Context Length"
                value={settings.max_context_length}
                onChange={val => handleSettingChange('max_context_length', val)}
                min={512}
                max={16384}
                step={128}
                tooltip="Maximum context window size"
                width="w-full"
              />
              <NumberField
                label="Temperature"
                value={settings.temperature}
                onChange={val => handleSettingChange('temperature', val)}
                min={0.0}
                max={2}
                step={0.05}
                tooltip="Controls randomness (higher = more random)"
                width="w-full"
              />
            </div>
          </div>

          {/* Sampling Parameters */}
          <div className="space-y-4">
            <h4 className="text-sm text-gray-400">Sampling Parameters</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NumberField
                label="Top P"
                value={settings.top_p}
                onChange={val => handleSettingChange('top_p', val)}
                min={0}
                max={1}
                step={0.01}
                tooltip="Nucleus sampling - consider tokens with cumulative probability"
                width="w-full"
              />
              <NumberField
                label="Top K"
                value={settings.top_k}
                onChange={val => handleSettingChange('top_k', val)}
                min={0}
                max={200}
                step={1}
                tooltip="Consider only the top K most likely tokens"
                width="w-full"
              />
              <NumberField
                label="Top A"
                value={settings.top_a}
                onChange={val => handleSettingChange('top_a', val)}
                min={0}
                max={1}
                step={0.01}
                tooltip="Dynamic adaptation of the probability threshold"
                width="w-full"
              />
              <NumberField
                label="Typical"
                value={settings.typical}
                onChange={val => handleSettingChange('typical', val)}
                min={0}
                max={1}
                step={0.01}
                tooltip="Selects tokens that are typical in context"
                width="w-full"
              />
              <NumberField
                label="TFS"
                value={settings.tfs}
                onChange={val => handleSettingChange('tfs', val)}
                min={0}
                max={1}
                step={0.01}
                tooltip="Tail-free sampling parameter"
                width="w-full"
              />
              <NumberField
                label="Min P"
                value={settings.min_p}
                onChange={val => handleSettingChange('min_p', val)}
                min={0}
                max={1}
                step={0.01}
                tooltip="Minimum probability threshold for token selection"
                width="w-full"
              />
            </div>
          </div>

          {/* Repetition Control */}
          <div className="space-y-4">
            <h4 className="text-sm text-gray-400">Repetition Control</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NumberField
                label="Repetition Penalty"
                value={settings.rep_pen}
                onChange={val => handleSettingChange('rep_pen', val)}
                min={1}
                max={3}
                step={0.01}
                tooltip="Higher values penalize repetition more strongly"
                width="w-full"
              />
              <NumberField
                label="Rep Pen Range"
                value={settings.rep_pen_range}
                onChange={val => handleSettingChange('rep_pen_range', val)}
                min={0}
                max={1024}
                step={8}
                tooltip="How many tokens back to apply repetition penalty"
                width="w-full"
              />
              <NumberField
                label="Rep Pen Slope"
                value={settings.rep_pen_slope}
                onChange={val => handleSettingChange('rep_pen_slope', val)}
                min={0}
                max={10}
                step={0.1}
                tooltip="Adjusts how penalty scales with distance"
                width="w-full"
              />
            </div>
          </div>

          {/* Sampler Order */}
          <div className="space-y-4">
            <h4 className="text-sm text-gray-400">Sampler Order</h4>
            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto border border-stone-700 rounded-lg p-3 bg-stone-900">
              {settings.sampler_order.map((samplerId: number, index: number) => {
                const sampler = SAMPLER_ORDER_OPTIONS.find(s => s.id === samplerId);
                if (!sampler) return null;
                return (
                  <SamplerOrderItem
                    key={index}
                    sampler={sampler}
                    index={index}
                    isFirst={index === 0}
                    isLast={index === settings.sampler_order.length - 1}
                    onMoveUp={() => handleMoveSampler(index, 'up')}
                    onMoveDown={() => handleMoveSampler(index, 'down')}
                  />
                );
              })}
            </div>
          </div>

          {/* DynaTemp Settings */}
          <div className="space-y-4">
            <h4 className="text-sm text-gray-400">Dynamic Temperature Settings</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="dynatemp-enabled"
                  checked={settings.dynatemp_enabled}
                  onChange={(e) => handleSettingChange('dynatemp_enabled', e.target.checked)}
                  className="mr-2 h-4 w-4 rounded bg-stone-700 border-stone-500 focus:ring-blue-500"
                />
                <label htmlFor="dynatemp-enabled" className="text-sm font-medium text-gray-300">
                  Enable Dynamic Temperature
                </label>
              </div>
            </div>
            
            {settings.dynatemp_enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pl-6">
                <NumberField
                  label="Min Temperature"
                  value={settings.dynatemp_min}
                  onChange={val => handleSettingChange('dynatemp_min', val)}
                  min={0.0}
                  max={2.0}
                  step={0.05}
                  tooltip="Minimum temperature value at the start of generation"
                  width="w-full"
                />
                <NumberField
                  label="Max Temperature"
                  value={settings.dynatemp_max}
                  onChange={val => handleSettingChange('dynatemp_max', val)}
                  min={0.0}
                  max={2.0}
                  step={0.05}
                  tooltip="Maximum temperature value at the end of generation"
                  width="w-full"
                />
                <NumberField
                  label="Curve Exponent"
                  value={settings.dynatemp_exponent}
                  onChange={val => handleSettingChange('dynatemp_exponent', val)}
                  min={0.1}
                  max={3.0}
                  step={0.1}
                  tooltip="Curve steepness for temperature progression (higher = steeper curve)"
                  width="w-full"
                />
              </div>
            )}
          </div>
        </div>
    </div>
  );
};

// Model selector component 
interface ModelSelectorProps {
  apiUrl: string;
  modelsDirectory?: string;
  selectedModel?: string;
  onChange: (model: string) => void;
  apiKey?: string;
}

// OpenRouter model selector props
interface OpenRouterModelSelectorProps {
  apiUrl: string;
  apiKey: string | null;
  selectedModel: string;
  onChange: (model: string) => void;
}

// OpenRouter model selector component
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

  // Fetch available models from OpenRouter when API URL or key changes
  useEffect(() => {
    if (apiUrl && apiKey) {
      fetchOpenRouterModels();
    }
  }, [apiUrl, apiKey]);

  const fetchOpenRouterModels = async () => {
    if (!apiUrl || !apiKey) {
      setError("API URL and key are required to fetch models");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/openrouter/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl, apiKey })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || response.statusText);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch models");
      }

      setModels(data.models || []);
    } catch (err) {
      setError(`Error fetching OpenRouter models: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter models based on search term
  const filteredModels = models.filter(model =>
    (model.name || model.id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {/* Search input */}
      {models.length > 0 && (
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search models..."
          className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 mb-2"
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-400">Loading models...</span>
        </div>
      ) : error ? (
        <div className="text-sm text-red-500 bg-red-900/20 p-2 rounded flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : models.length === 0 && !isLoading ? (
        <div className="text-yellow-500 text-sm bg-yellow-900/20 p-2 rounded flex items-center gap-2">
          <AlertCircle size={16} />
          <span>No models found. Please check your API key and URL.</span>
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto border border-stone-700 rounded-lg bg-stone-900">
          <div className="divide-y divide-stone-700">
            {filteredModels.map((model) => (
              <div 
                key={model.id}
                className={`p-2 flex flex-col cursor-pointer hover:bg-stone-800 transition-colors ${
                  selectedModel === model.id ? 'bg-blue-900/30 border-l-2 border-blue-500' : ''
                }`}
                onClick={() => onChange(model.id)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{model.name || model.id}</span>
                  {model.context_length && (
                    <span className="text-xs text-gray-400">{model.context_length.toLocaleString()} tokens</span>
                  )}
                </div>
                {model.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{model.description}</p>
                )}
                {model.pricing && (
                  <div className="text-xs text-gray-400 mt-1">
                    {model.pricing.prompt && model.pricing.completion ? (
                      <span>
                        ${model.pricing.prompt}/1M prompt, ${model.pricing.completion}/1M completion
                      </span>
                    ) : (
                      <span>Pricing info available</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual input fallback */}
      {!isLoading && (
        <div className="pt-2">
          <label className="block text-xs text-gray-400 mb-1">
            Or enter model ID manually:
          </label>
          <input
            type="text"
            value={selectedModel}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g., anthropic/claude-3-opus-20240229"
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  );
};
// Featherless model selector props
interface FeatherlessModelSelectorProps {
  apiUrl: string;
  apiKey: string | null;
  selectedModel: string;
  onChange: (model: string) => void;
}

// Featherless model selector component
const FeatherlessModelSelector: React.FC<FeatherlessModelSelectorProps> = ({
  apiUrl,
  apiKey,
  selectedModel,
  onChange
}) => {
  const [models, setModels] = useState<FeatherlessModelInfo[]>([]); // Use FeatherlessModelInfo type
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch available models from Featherless when API URL or key changes
  useEffect(() => {
    if (apiUrl) { // API Key might be optional for listing models
      fetchModels();
    }
  }, [apiUrl, apiKey]);

  const fetchModels = async () => {
    if (!apiUrl) {
      setError("API URL is required to fetch models");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use the apiService method we created
      const data = await apiService.fetchFeatherlessModels(apiUrl, apiKey || undefined);

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch models from backend");
      }

      setModels(data.models || []);
    } catch (err) {
      setError(`Error fetching Featherless models: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Featherless fetch error:", err); // Add console log for debugging
    } finally {
      setIsLoading(false);
    }
  };

  // Filter models based on search term (name or id)
  const filteredModels = models.filter(model =>
    (model.name || model.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (model.id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {/* Search input */}
      {models.length > 0 && (
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search models (e.g., Llama-3-8B)..."
          className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 mb-2"
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-400">Loading models...</span>
        </div>
      ) : error ? (
        <div className="text-sm text-red-500 bg-red-900/20 p-2 rounded flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : models.length === 0 && !isLoading ? (
        <div className="text-yellow-500 text-sm bg-yellow-900/20 p-2 rounded flex items-center gap-2">
          <AlertCircle size={16} />
          <span>No models found. Check API URL/Key or connection.</span>
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto border border-stone-700 rounded-lg bg-stone-900">
          <div className="divide-y divide-stone-700">
            {filteredModels.map((model) => (
              <div 
                key={model.id}
                className={`p-2 flex flex-col cursor-pointer hover:bg-stone-800 transition-colors ${
                  selectedModel === model.id ? 'bg-blue-900/30 border-l-2 border-blue-500' : ''
                }`}
                onClick={() => onChange(model.id)}
                title={`ID: ${model.id}\nClass: ${model.model_class || 'N/A'}\nContext: ${model.context_length || 'N/A'}\nMax Tokens: ${model.max_tokens || 'N/A'}`} // Add tooltip
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{model.name || model.id}</span>
                  {model.context_length && (
                    <span className="text-xs text-gray-400">{model.context_length.toLocaleString()} tokens</span>
                  )}
                </div>
                {model.model_class && (
                  <p className="text-xs text-gray-400 mt-1">Class: {model.model_class}</p>
                )}
                 {model.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{model.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual input fallback */}
      {!isLoading && (
        <div className="pt-2">
          <label className="block text-xs text-gray-400 mb-1">
            Or enter model ID manually:
          </label>
          <input
            type="text"
            value={selectedModel}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g., vicgalle/Roleplay-Llama-3-8B"
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  );
};

const ModelSelector: React.FC<ModelSelectorProps> = ({ 
  apiUrl, 
  modelsDirectory,
  selectedModel,
  onChange,
  apiKey
}) => {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, _] = useState(''); // Changed setSearchTerm to _ to indicate intentionally unused
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Use the centralized KoboldCPP hook instead of direct API calls
  const { status, refresh: refreshKoboldStatus } = useKoboldCPP();
  const isRunning = status?.is_running || false;
  
  // Determine provider from URL
  const isLocalKobold = apiUrl && (
    apiUrl.includes('localhost') || 
    apiUrl.includes('127.0.0.1') ||
    apiUrl.match(/^https?:\/\/\d+\.\d+\.\d+\.\d+/) // IP address pattern
  );
  
  // Check if it's OpenRouter
  const isOpenRouter = apiUrl && 
    (apiUrl.includes('openrouter.ai') || apiUrl.toLowerCase().includes('openrouter'));

  // Check if it's Featherless
  const isFeatherless = apiUrl &&
    (apiUrl.includes('featherless.ai') || apiUrl.toLowerCase().includes('featherless'));
    (apiUrl.includes('featherless.ai') || apiUrl.toLowerCase().includes('featherless'));

  useEffect(() => {
    if (isLocalKobold && modelsDirectory) {
      fetchLocalModels();
    } else {
      // For non-local APIs, we could potentially fetch available models
      // from the provider API if they have such an endpoint
      setModels([]);
    }
  }, [apiUrl, modelsDirectory]);
  
  const fetchLocalModels = async () => {
    if (!modelsDirectory) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/koboldcpp/scan-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: modelsDirectory })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || response.statusText);
      }
      
      const data = await response.json();
      setModels(data.models);
    } catch (err) {
      setError(`Error scanning models: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter models based on search term
  const filteredModels = models.filter(model =>
    model.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle connecting to KoboldCPP with the selected model
  const handleConnect = async () => {
    if (!selectedModel) {
      setConnectionError("Please choose a model before connecting to KoboldCPP.");
      return;
    }

    try {
      setIsConnecting(true);
      setConnectionError(null);

      // Launch KoboldCPP with the selected model
      const response = await fetch('/api/koboldcpp/launch-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_path: selectedModel,
          config: {
            // Use default config settings
            contextsize: 4096,
            port: 5001,
            defaultgenamt: 128
            // Additional parameters could be added based on model size or user preferences
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || response.statusText);
      }

      // Wait a moment and then refresh KoboldCPP status using our hook
      setTimeout(() => {
        refreshKoboldStatus();
        setIsConnecting(false);
      }, 2000);

    } catch (err) {
      setConnectionError(`Error connecting to KoboldCPP: ${err instanceof Error ? err.message : String(err)}`);
      setIsConnecting(false);
    }
  };

  // Handle disconnecting KoboldCPP
  const handleDisconnect = async () => {
    try {
      setIsDisconnecting(true);
      
      // Simple mechanism to stop the KoboldCPP process
      // This assumes you have a backend endpoint for this
      const response = await fetch('/api/koboldcpp/stop', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to stop KoboldCPP');
      }
      
      // Wait a moment and then refresh KoboldCPP status using our hook
      setTimeout(() => {
        refreshKoboldStatus();
        setIsDisconnecting(false);
      }, 1000);
      
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300 mb-1">
        Model Selection
        {isLocalKobold && !modelsDirectory && (
          <span className="ml-2 text-yellow-500 text-xs">
            Set models directory in General Settings first
          </span>
        )}
      </label>

      {isLocalKobold ? (
        <>
          {isLoading && (
            <div className="flex justify-center py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            </div>
          )}

          {modelsDirectory ? (
            <>
              <div className="flex gap-2 items-center">
                <select
                  value={selectedModel || ''}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
                  disabled={isRunning}
                >
                  <option value="">Select a model</option>
                  {filteredModels.map((model) => (
                    <option key={model.path} value={model.path}>
                      {model.name} ({model.size_gb.toFixed(1)} GB)
                    </option>
                  ))}
                </select>

                {isRunning ? (
                  <button
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="whitespace-nowrap px-4 py-2 rounded-lg transition-colors bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    onClick={handleConnect}
                    disabled={isConnecting || !selectedModel}
                    className={`whitespace-nowrap px-4 py-2 rounded-lg transition-colors ${
                      !selectedModel 
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : isConnecting
                          ? 'bg-blue-600/40 text-blue-200 cursor-wait' 
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isConnecting ? 'Connecting...' : 'Connect'}
                  </button>
                )}
              </div>

              {/* Connection status indicator */}
              {isRunning && (
                <div className="mt-1 text-sm text-green-500 flex items-center">
                  <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                  Connected: {selectedModel ? selectedModel.split('/').pop() : 'model loaded'}
                </div>
              )}

              {connectionError && (
                <div className="mt-2 text-sm text-red-500">
                  {connectionError}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-yellow-500 flex items-center gap-2 p-2 bg-yellow-900/20 rounded">
              <AlertCircle size={16} />
              <span>Please set a models directory in General Settings</span>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500">{error}</div>
          )}
          
          {models.length === 0 && !isLoading && modelsDirectory && !error && (
            <div className="text-sm text-yellow-500">
              No models found in the specified directory
            </div>
          )}
        </>
      ) : isOpenRouter ? (
        <OpenRouterModelSelector
          apiUrl={apiUrl}
          apiKey={apiKey || null}
          selectedModel={selectedModel || ''}
          onChange={onChange}
        />
      ) : isFeatherless ? (
        <FeatherlessModelSelector
          apiUrl={apiUrl}
          apiKey={apiKey || null}
          selectedModel={selectedModel || ''}
          onChange={onChange}
        />
      ) : (
        <input
          type="text"
          value={selectedModel || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter model name (e.g., gpt-4, claude-3-opus-20240229)"
          className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
        />
      )}
    </div>
  );
};

export default APIConfigurationPanel;