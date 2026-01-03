import React, { useState, useEffect } from 'react';
import Button from '../common/Button';
import { useSettings } from '../../contexts/SettingsContext';
import { APIConfig, APIProvider } from '../../types/api';

const PROVIDER_TYPES = [
  { id: APIProvider.KOBOLD, name: 'KoboldCPP' },
  { id: APIProvider.OPENAI, name: 'OpenAI' },
  { id: APIProvider.CLAUDE, name: 'Claude (Anthropic)' },
  { id: APIProvider.GEMINI, name: 'Gemini (Google)' },
  { id: APIProvider.OPENROUTER, name: 'OpenRouter' },
  { id: APIProvider.FEATHERLESS, name: 'Featherless.ai' }
];

const DEFAULT_MODELS = {
  [APIProvider.KOBOLD]: '',
  [APIProvider.OPENAI]: 'gpt-3.5-turbo',
  [APIProvider.CLAUDE]: 'claude-3-sonnet-20240229',
  [APIProvider.GEMINI]: 'gemini-pro',
  [APIProvider.OPENROUTER]: 'openai/gpt-3.5-turbo',
  [APIProvider.FEATHERLESS]: 'nous-hermes-2-mixtral-8x7b-dpo'
};

export const ApiProviderSelector: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [selectedApiId, setSelectedApiId] = useState<string>('');

  useEffect(() => {
    // If there's an active API in settings, select it
    if (settings?.apis) {
      const apiIds = Object.keys(settings.apis);
      if (apiIds.length > 0) {
        // If there's a currently active API in settings.api, use its ID
        const activeApiId = apiIds.find(id =>
          settings.api?.url === settings.apis[id].url &&
          settings.api?.apiKey === settings.apis[id].apiKey
        );

        if (activeApiId) {
          setSelectedApiId(activeApiId);
        } else {
          // Otherwise select the first API
          setSelectedApiId(apiIds[0]);
        }
      }
    }
  }, [settings?.apis, settings?.api]);

  const handleAddProvider = () => {
    // Generate unique ID for new provider
    const newId = `api-${Date.now()}`;
    const newProvider: APIConfig = {
      id: newId,
      provider: APIProvider.KOBOLD,
      url: 'http://localhost:5001',
      apiKey: '',
      model: DEFAULT_MODELS[APIProvider.KOBOLD],
      enabled: false,
      templateId: 'mistral'
    };

    const updatedApis = { ...(settings?.apis || {}), [newId]: newProvider };
    updateSettings({ apis: updatedApis });
    setSelectedApiId(newId);
  };

  const handleSelectProvider = (apiId: string) => {
    if (settings?.apis && apiId in settings.apis) {
      const selectedApi = settings.apis[apiId];
      setSelectedApiId(apiId);

      // Convert APIConfig to the format expected by settings.api
      updateSettings({
        api: {
          enabled: selectedApi.enabled || false,
          url: selectedApi.url || '',
          apiKey: selectedApi.apiKey || null,
          templateId: selectedApi.templateId || 'mistral',
          lastConnectionStatus: selectedApi.lastConnectionStatus,
          model_info: selectedApi.model_info
        }
      });
    }
  };

  const handleUpdateProvider = (apiId: string, updates: Partial<APIConfig>) => {
    if (settings?.apis && apiId in settings.apis) {
      const updatedProvider = { ...settings.apis[apiId], ...updates };

      // Update model default if provider type changed
      if (updates.provider && updates.provider !== settings.apis[apiId].provider) {
        updatedProvider.model = DEFAULT_MODELS[updates.provider] || '';
      }

      const updatedApis = { ...settings.apis, [apiId]: updatedProvider };
      updateSettings({ apis: updatedApis });

      // If this is the active API, update that too
      const isActiveApi = settings.api?.url === settings.apis[apiId].url &&
        settings.api?.apiKey === settings.apis[apiId].apiKey;

      if (isActiveApi) {
        updateSettings({
          api: {
            enabled: updatedProvider.enabled || false,
            url: updatedProvider.url || '',
            apiKey: updatedProvider.apiKey || null,
            templateId: updatedProvider.templateId || 'mistral',
            lastConnectionStatus: updatedProvider.lastConnectionStatus,
            model_info: updatedProvider.model_info
          }
        });
      }
    }
  };

  const handleDeleteProvider = (apiId: string) => {
    if (settings?.apis && apiId in settings.apis) {
      const updatedApis = { ...settings.apis };
      delete updatedApis[apiId];
      updateSettings({ apis: updatedApis });

      // If this was the active API, select another one
      const isActiveApi = settings.api?.url === settings.apis[apiId].url &&
        settings.api?.apiKey === settings.apis[apiId].apiKey;

      if (isActiveApi) {
        const firstAvailableApi = Object.values(updatedApis)[0];
        if (firstAvailableApi) {
          updateSettings({
            api: {
              enabled: firstAvailableApi.enabled || false,
              url: firstAvailableApi.url || '',
              apiKey: firstAvailableApi.apiKey || null,
              templateId: firstAvailableApi.templateId || 'mistral',
              lastConnectionStatus: firstAvailableApi.lastConnectionStatus,
              model_info: firstAvailableApi.model_info
            }
          });
          setSelectedApiId(firstAvailableApi.id || '');
        } else {
          updateSettings({ api: undefined });
          setSelectedApiId('');
        }
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">API Providers</h2>
        <Button
          variant="primary"
          size="sm"
          onClick={handleAddProvider}
          className="bg-blue-600 hover:bg-blue-700 rounded"
        >
          Add Provider
        </Button>
      </div>

      {/* Provider List */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {Object.values(settings?.apis || {}).map(api => (
          <div
            key={api.id}
            className={`p-3 border rounded cursor-pointer transition-colors ${selectedApiId === api.id ? 'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30' : 'border-gray-200 hover:bg-stone-50 dark:border-gray-700 dark:hover:bg-stone-800'
              }`}
            onClick={() => api.id && handleSelectProvider(api.id)}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{api.provider}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{api.model || 'Default model'}</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 truncate">{api.url}</div>
          </div>
        ))}

        {(!settings?.apis || Object.keys(settings.apis).length === 0) && (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            No API providers configured. Add one to get started.
          </div>
        )}
      </div>

      {/* Selected Provider Form */}
      {selectedApiId && settings?.apis && selectedApiId in settings.apis && (
        <ApiProviderForm
          api={settings.apis[selectedApiId]}
          onUpdate={(updates) => handleUpdateProvider(selectedApiId, updates)}
          onDelete={() => handleDeleteProvider(selectedApiId)}
          onSelect={() => handleSelectProvider(selectedApiId)}
        />
      )}
    </div>
  );
};

interface ApiProviderFormProps {
  api: APIConfig;
  onUpdate: (updates: Partial<APIConfig>) => void;
  onDelete: () => void;
  onSelect: () => void;
}

const ApiProviderForm: React.FC<ApiProviderFormProps> = ({ api, onUpdate, onDelete, onSelect }) => {
  return (
    <div className="space-y-4 p-4 border rounded dark:border-gray-700">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="api-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Provider Type
          </label>
          <select
            id="api-type"
            value={api.provider}
            onChange={(e) => {
              if (Object.values(APIProvider).includes(e.target.value as APIProvider)) {
                onUpdate({ provider: e.target.value as APIProvider });
              }
            }}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-stone-800 dark:border-gray-700 dark:text-white"
          >
            {PROVIDER_TYPES.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="api-enabled" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Status
          </label>
          <div className="flex items-center space-x-2 h-10">
            <input
              id="api-enabled"
              type="checkbox"
              checked={api.enabled}
              onChange={(e) => onUpdate({ enabled: e.target.checked })}
              className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="api-enabled" className="text-sm text-gray-700 dark:text-gray-300">
              Enabled
            </label>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="api-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          API URL
        </label>
        <input
          id="api-url"
          type="text"
          value={api.url || ''}
          onChange={(e) => onUpdate({ url: e.target.value })}
          placeholder={api.provider === APIProvider.KOBOLD ? 'http://localhost:5001' :
            api.provider === APIProvider.OPENAI ? 'https://api.openai.com/v1' :
              api.provider === APIProvider.CLAUDE ? 'https://api.anthropic.com/v1/messages' :
                api.provider === APIProvider.GEMINI ? 'https://generativelanguage.googleapis.com/v1beta/models' :
                  api.provider === APIProvider.FEATHERLESS ? 'https://api.featherless.ai/v1' :
                    'https://api.openrouter.ai/api/v1'}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-stone-800 dark:border-gray-700 dark:text-white"
        />
      </div>

      <div>
        <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          API Key {api.provider !== APIProvider.KOBOLD && <span className="text-red-500">*</span>}
        </label>
        <input
          id="api-key"
          type="password"
          value={api.apiKey || ''}
          onChange={(e) => onUpdate({ apiKey: e.target.value })}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-stone-800 dark:border-gray-700 dark:text-white"
          placeholder={api.provider === APIProvider.KOBOLD ? '(Optional)' : 'Required for this provider'}
        />
      </div>

      {/* Model Selection */}
      <ModelSelector api={api} onUpdate={onUpdate} />

      <div className="flex justify-between pt-2">
        <Button
          variant="primary"
          size="md"
          onClick={onSelect}
          className="bg-green-600 hover:bg-green-700 rounded"
        >
          Use This Provider
        </Button>

        <Button
          variant="destructive"
          size="md"
          onClick={onDelete}
          className="bg-red-600 hover:bg-red-700 rounded"
        >
          Delete Provider
        </Button>
      </div>
    </div>
  );
};

// Model selector component with provider-specific model options
const ModelSelector: React.FC<{ api: APIConfig; onUpdate: (updates: Partial<APIConfig>) => void }> = ({ api, onUpdate }) => {
  // Model lists for different providers
  const modelOptions: Record<APIProvider, Array<{ id: string, name: string }>> = {
    [APIProvider.KOBOLD]: [
      { id: '', name: 'Default (Use model loaded in KoboldCPP)' }
    ],
    [APIProvider.OPENAI]: [
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo' }
    ],
    [APIProvider.CLAUDE]: [
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
      { id: 'claude-2.1', name: 'Claude 2.1' }
    ],
    [APIProvider.GEMINI]: [
      { id: 'gemini-pro', name: 'Gemini Pro' },
      { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' }
    ],
    [APIProvider.OPENROUTER]: [
      { id: 'openai/gpt-3.5-turbo', name: 'OpenAI: GPT-3.5 Turbo' },
      { id: 'openai/gpt-4', name: 'OpenAI: GPT-4' },
      { id: 'anthropic/claude-3-opus', name: 'Anthropic: Claude 3 Opus' },
      { id: 'anthropic/claude-3-sonnet', name: 'Anthropic: Claude 3 Sonnet' },
      { id: 'meta-llama/llama-3-70b-instruct', name: 'Meta: Llama 3 70B' },
      { id: 'google/gemini-pro', name: 'Google: Gemini Pro' }
    ],
    [APIProvider.FEATHERLESS]: [
      { id: 'nous-hermes-2-mixtral-8x7b-dpo', name: 'Nous Hermes 2 Mixtral 8x7B' },
      { id: 'llama-3-70b-instruct', name: 'Llama 3 70B Instruct' },
      { id: 'llama-3-8b-instruct', name: 'Llama 3 8B Instruct' },
      { id: 'mistral-7b-instruct-v0.2', name: 'Mistral 7B Instruct v0.2' },
      { id: 'mixtral-8x7b-instruct-v0.1', name: 'Mixtral 8x7B Instruct v0.1' },
      { id: 'qwen2-72b-instruct', name: 'Qwen2 72B Instruct' },
      { id: 'openchat-3.5', name: 'OpenChat 3.5' },
      { id: 'dolphin-2.5-mixtral-8x7b', name: 'Dolphin 2.5 Mixtral 8x7B' }
    ]
  };

  const options = api.provider ? modelOptions[api.provider] || [] : [];

  return (
    <div>
      <label htmlFor="api-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Model
      </label>
      {options.length > 0 ? (
        <select
          id="api-model"
          value={api.model || ''}
          onChange={(e) => onUpdate({ model: e.target.value })}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-stone-800 dark:border-gray-700 dark:text-white"
        >
          {options.map(model => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          id="api-model"
          type="text"
          value={api.model || ''}
          onChange={(e) => onUpdate({ model: e.target.value })}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-stone-800 dark:border-gray-700 dark:text-white"
          placeholder="Enter model name"
        />
      )}
    </div>
  );
};

export default ApiProviderSelector;