import React, { useState, useEffect } from 'react';
import { Globe2, Key, CheckCircle2, XCircle } from 'lucide-react';
import { ChatTemplate, TEMPLATE_NAMES } from '../../types/api';

interface APISettingsProps {
  settings: {
    enabled: boolean;
    url: string;
    apiKey: string;
    template: ChatTemplate;
    lastConnectionStatus?: {
      connected: boolean;
      timestamp: number;
      error?: string;
    }
  };
  onUpdate: (updates: Partial<APISettingsProps['settings']>) => void;
}

const APISettings: React.FC<APISettingsProps> = ({ settings, onUpdate }) => {
  const [url, setUrl] = useState(settings.url);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Update form when settings change
  useEffect(() => {
    setUrl(settings.url);
    setApiKey(settings.apiKey);
  }, [settings]);

  // Connection test handler
  const handleTestConnection = async () => {
    try {
      setIsConnecting(true);
      setConnectionError(null);

      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url,
          apiKey: apiKey
        })
      });

      const data = await response.json();

      if (data.success) {
        // Update all settings including enabled state
        onUpdate({
          url,
          apiKey,
          enabled: true, // Enable API on successful connection
          lastConnectionStatus: {
            connected: true,
            timestamp: Date.now(),
            error: undefined
          }
        });
      } else {
        throw new Error(data.message || 'Connection failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      setConnectionError(message);
      onUpdate({
        enabled: false,
        lastConnectionStatus: {
          connected: false,
          timestamp: Date.now(),
          error: message
        }
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center justify-between bg-stone-900 p-4 rounded-lg">
        <div className="flex items-center gap-2">
          {settings.enabled ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-sm text-gray-300">Connected</span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm text-gray-300">Not Connected</span>
            </>
          )}
        </div>
        <button
          onClick={handleTestConnection}
          disabled={isConnecting}
          className={`px-4 py-2 rounded-lg transition-colors ${isConnecting
            ? 'bg-stone-600 text-gray-300 cursor-wait'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
        >
          {isConnecting ? 'Testing...' : 'Test Connection'}
        </button>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {/* URL Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <div className="flex items-center gap-2">
              <Globe2 className="w-4 h-4" />
              API URL
            </div>
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:5001"
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 
                     rounded-lg focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* API Key Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Key (Optional)
            </div>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key if required"
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 
                     rounded-lg focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Template Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Chat Template
          </label>
          <select
            value={settings.template}
            onChange={(e) => onUpdate({ template: e.target.value as ChatTemplate })}
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 
                     rounded-lg focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(TEMPLATE_NAMES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Message */}
      {connectionError && (
        <div className="text-sm text-red-500 bg-red-950/50 p-4 rounded-lg">
          {connectionError}
        </div>
      )}

      {!settings.enabled && (
        <div className="text-sm text-orange-500 bg-orange-950/50 p-4 rounded-lg">
          Please test the connection before using the API features.
        </div>
      )}
    </div>
  );
};

export default APISettings;