import React, { useState, useEffect } from 'react';
import { Globe2, Key, CheckCircle2, XCircle } from 'lucide-react';
import { ChatTemplate, TEMPLATE_NAMES } from '../types/api';

// Define the settings type separately for reuse
interface APISettingsData {
  enabled: boolean;
  url: string;
  apiKey: string;
  template: ChatTemplate;
  lastConnectionStatus?: {
    connected: boolean;
    timestamp: number;
    error?: string;
  }
}

interface APISettingsProps {
  settings: APISettingsData;
  onUpdate: (updates: Partial<APISettingsData>) => void;
}

const APISettings: React.FC<APISettingsProps> = ({ settings, onUpdate }) => {
  // Local state for form values
  const [url, setUrl] = useState(settings.url);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Update local state when settings change
  useEffect(() => {
    setUrl(settings.url);
    setApiKey(settings.apiKey);
  }, [settings]);

  // Handle URL changes with validation
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    
    // Only update if it's a valid URL or empty
    if (newUrl === '' || /^https?:\/\/\S+$/.test(newUrl)) {
      onUpdate({ url: newUrl });
    }
  };

  // Handle API key changes
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    onUpdate({ apiKey: newKey });
  };

  // Handle connect/disconnect
  const handleConnectionToggle = async () => {
    try {
      setIsConnecting(true);

      if (settings.enabled) {
        // Just disconnect
        onUpdate({ 
          enabled: false,
          lastConnectionStatus: undefined 
        });
        return;
      }

      // Test connection
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: settings.url,
          apiKey: settings.apiKey
        })
      });

      const data = await response.json();
      
      onUpdate({
        enabled: data.success,
        lastConnectionStatus: {
          connected: data.success,
          timestamp: data.timestamp,
          error: data.success ? undefined : data.message
        }
      });

    } catch (error) {
      onUpdate({
        enabled: false,
        lastConnectionStatus: {
          connected: false,
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Connection failed'
        }
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status and Control */}
      <div className="flex items-center justify-between bg-stone-900 p-4 rounded-lg">
        <div className="flex items-center gap-2">
          {settings.lastConnectionStatus && (
            <>
              {settings.lastConnectionStatus.connected ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="text-sm text-gray-300">
                {settings.lastConnectionStatus.connected ? 'Connected' : 'Not Connected'}
              </span>
            </>
          )}
        </div>
        <button
          onClick={handleConnectionToggle}
          disabled={isConnecting}
          className={`px-4 py-2 rounded-lg transition-colors ${
            settings.enabled
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isConnecting ? 'Please wait...' : settings.enabled ? 'Disconnect' : 'Connect'}
        </button>
      </div>

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
          onChange={handleUrlChange}
          placeholder="http://localhost:5001"
          className="w-full px-3 py-2 bg-stone-950 border border-slate-700 
                   rounded-lg focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* API Key Input */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Key
          </div>
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={handleApiKeyChange}
          placeholder="Enter API key"
          className="w-full px-3 py-2 bg-stone-950 border border-slate-700 
                   rounded-lg focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Template Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Chat Completion Template
        </label>
        <select
          value={settings.template}
          onChange={(e) => onUpdate({ template: e.target.value as ChatTemplate })}
          className="w-full px-3 py-2 bg-stone-950 border border-slate-700 
                   rounded-lg focus:ring-1 focus:ring-blue-500"
        >
          {Object.entries(TEMPLATE_NAMES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Error Message */}
      {settings.lastConnectionStatus?.error && (
        <div className="text-sm text-red-500 bg-red-950/50 p-4 rounded-lg">
          {settings.lastConnectionStatus.error}
        </div>
      )}
    </div>
  );
};

export default APISettings;