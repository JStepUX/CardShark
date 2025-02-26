// APICard.tsx - Updated to use template service
import React, { useState, useEffect } from 'react';
import { Globe2, Key, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { 
  APIProvider, 
  APIConfig, 
  PROVIDER_CONFIGS
} from '../types/api';
import { templateService } from '../services/templateService';
import { Template } from '../types/templateTypes';

interface APICardProps {
  api: APIConfig;
  onUpdate: (updates: Partial<APIConfig>) => void;
  onRemove: () => void;
  onProviderChange: (provider: APIProvider) => void;
}

export const APICard: React.FC<APICardProps> = ({
  api,
  onUpdate,
  onRemove,
  onProviderChange
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [templates, setTemplates] = useState<Template[]>([]);
  const config = PROVIDER_CONFIGS[api.provider];

  // Load available templates on component mount
  useEffect(() => {
    setTemplates(templateService.getAllTemplates());
  }, []);

  const handleTest = async () => {
    try {
      setIsLoading(true);
      setError(undefined);

      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: api.url,
          apiKey: api.apiKey,
          provider: api.provider,
          model: api.model,
          templateId: api.templateId
        })
      });

      const data = await response.json();

      if (data.success) {
        onUpdate({
          enabled: true,
          lastConnectionStatus: {
            connected: true,
            timestamp: Date.now()
          },
          ...(data.model && { model_info: data.model })
        });
      } else {
        throw new Error(data.message || 'Connection failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setError(message);
      onUpdate({
        enabled: false,
        lastConnectionStatus: {
          connected: false,
          timestamp: Date.now(),
          error: message
        }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    onUpdate({
      enabled: false,
      lastConnectionStatus: undefined,
      model_info: undefined
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with Status and Remove */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm
            ${api.enabled ? 'bg-green-900/50 text-green-300' : 'bg-stone-800 text-gray-300'}`}
          >
            {api.enabled ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            <span className="ml-1">{api.enabled ? "Connected" : "Not Connected"}</span>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"
          title="Remove API"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          API Type
        </label>
        <select
          value={api.provider}
          onChange={(e) => onProviderChange(e.target.value as APIProvider)}
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 
                   rounded-lg focus:ring-1 focus:ring-blue-500"
        >
          {Object.values(APIProvider).map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      </div>

      {/* URL Field */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4" />
            API URL
          </div>
        </label>
        <input
          type="text"
          value={api.url}
          onChange={(e) => onUpdate({ url: e.target.value })}
          placeholder="Enter API URL"
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 
                   rounded-lg focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* API Key Field (if required) */}
      {config.requiresApiKey && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Key
            </div>
          </label>
          <input
            type="password"
            value={api.apiKey || ''}
            onChange={(e) => onUpdate({ apiKey: e.target.value })}
            placeholder="Enter API key"
            className="w-full px-3 py-2 bg-stone-900 border border-stone-700 
                     rounded-lg focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Model Selection (if available) */}
      {config.availableModels && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Model
          </label>
          <select
            value={api.model}
            onChange={(e) => onUpdate({ model: e.target.value })}
            className="w-full px-3 py-2 bg-stone-900 border border-stone-700 
                     rounded-lg focus:ring-1 focus:ring-blue-500"
          >
            {config.availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Template Selection (use templates from templateService) */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Chat Template
        </label>
        <select
          value={api.templateId || ''}
          onChange={(e) => onUpdate({ templateId: e.target.value })}
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 
                   rounded-lg focus:ring-1 focus:ring-blue-500"
        >
          <option value="">-- Select Template --</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-950/50 rounded-lg">
          {error}
        </div>
      )}

      {/* Model Info */}
      {api.model_info && (
        <div className="p-3 bg-stone-900/50 rounded-lg space-y-1">
          <div className="text-sm font-medium">Connected Model</div>
          <div className="text-sm text-gray-400">
            {api.model_info.name || api.model_info.id}
            {api.model_info.provider && (
              <span className="text-xs ml-1">
                by {api.model_info.provider}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-2">
        {api.enabled ? (
          <button
            onClick={handleDisconnect}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg 
                     transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleTest}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg 
                     transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Testing...' : 'Test Connection'}
          </button>
        )}
      </div>

      {/* Last Tested Info */}
      {api.lastConnectionStatus?.timestamp && (
        <div className="text-xs text-gray-500 text-right">
          Last tested: {new Date(api.lastConnectionStatus.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default APICard;