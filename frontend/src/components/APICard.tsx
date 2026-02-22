// components/APICard.tsx
// This file contains the APICard component which is used to display and manage API configurations in the UI. The component allows users to configure API settings, test the connection, and disconnect from the API. It also displays information about the connected model and provides options for selecting templates and generation settings.
import React, { useState, useEffect, useCallback } from 'react';
import { Globe2, Key, CheckCircle2, XCircle, Trash2, Star, Save, AlertTriangle, Eye, EyeOff, Download } from 'lucide-react';
import { toast } from 'sonner';
import Button from './common/Button';
import {
  APIProvider,
  APIConfig,
  PROVIDER_CONFIGS,
  createAPIConfig
} from '../types/api';
import { Template } from '../types/templateTypes';
import { templateService } from '../services/templateService';
import { useSettings } from '../contexts/SettingsContext';
import { ModelSelector } from './ModelSelector';

interface APICardProps {
  api: APIConfig; // This is the persisted API config
  apiId: string;
  isActive: boolean;
  onUpdate: (id: string, configToSave: APIConfig) => void; // Changed to pass the full config
  onRemove: () => void;
  onSetActive: () => void;
}

export const APICard: React.FC<APICardProps> = ({
  api, // Persisted API config
  apiId,
  isActive,
  onUpdate: persistUpdate, // Renamed for clarity
  onRemove,
  onSetActive
}) => {
  const [editableApi, setEditableApi] = useState<APIConfig>(api);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // General loading state for test/connect
  const [modelError, setModelError] = useState<string | undefined>(); // Specific error for model loading/connection
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showApiKey, setShowApiKey] = useState(false); // State for API key visibility
  const [isDownloading, setIsDownloading] = useState(false); // State for KoboldCPP download
  const [koboldStatus, setKoboldStatus] = useState<{ status: string, version?: string } | null>(null); // KoboldCPP status
  const { settings } = useSettings();
  const currentProviderConfig = PROVIDER_CONFIGS[editableApi.provider];

  // Sync editableApi when the persisted api prop changes (e.g., when a new API card is selected or settings are loaded)
  // This effect should primarily run when 'api' (the prop) itself changes.
  useEffect(() => {
    // If the incoming api prop is different from the current editableApi,
    // and there are no unsaved local changes, then update editableApi.
    // Or, if the api prop is different and we intend to overwrite local changes (e.g. on external save/refresh).
    // For simplicity, if 'api' prop changes its stringified value, we reset.
    // This assumes 'api' prop is stable unless a genuinely different config is passed.
    const apiPropString = JSON.stringify(api);
    const editableApiString = JSON.stringify(editableApi);

    if (apiPropString !== editableApiString) {
      // Only reset if there are no local changes OR if the base 'api' prop truly changed.
      // The latter condition is implicitly handled if apiPropString is different.
      // The main concern is not wiping out user input if 'api' prop re-renders with same content.
      // A more robust check might involve comparing api.id if it's guaranteed unique and stable per config.
      if (!hasChanges) { // If no local changes, safe to sync from prop.
        setEditableApi(api);
        // setHasChanges(false); // This will be handled by the next effect.
      } else {
        // There are local changes. If api prop string is different, it means an external update happened.
        // User should be warned or decide how to merge. For now, we prioritize local edits if 'hasChanges' is true.
        // This means an external save that changes 'api' prop while user has local edits won't auto-revert them.
        // This behavior might need refinement based on desired UX for concurrent edits/external updates.
        console.warn(`[APICard ${apiId}] 'api' prop changed but local unsaved changes exist. Local changes preserved.`);
      }
    }

  }, [api]); // Primary dependency is the 'api' prop. Add others if they should also trigger this sync.

  // Effect to determine if there are unsaved changes by comparing editableApi to the original api prop.
  useEffect(() => {
    setHasChanges(JSON.stringify(editableApi) !== JSON.stringify(api));
  }, [editableApi, api]);


  // Load available templates
  useEffect(() => {
    const allTemplates = templateService.getAllTemplates();
    setTemplates(allTemplates);
    if (editableApi.templateId) {
      const selectedTemplate = templateService.getTemplateById(editableApi.templateId);
      if (!selectedTemplate) {
        console.warn(`Template with ID "${editableApi.templateId}" not found, using default template`);
      }
    }
  }, [editableApi.provider, editableApi.templateId]);

  // Check KoboldCPP status when provider is KoboldCPP
  useEffect(() => {
    if (editableApi.provider === APIProvider.KOBOLD) {
      const checkKoboldStatus = async () => {
        try {
          const response = await fetch('/api/koboldcpp/status');
          if (response.ok) {
            const data = await response.json();
            setKoboldStatus(data);
          }
        } catch (error) {
          console.error('Failed to check KoboldCPP status:', error);
        }
      };
      checkKoboldStatus();
    } else {
      setKoboldStatus(null);
    }
  }, [editableApi.provider]);

  // Update local state
  const handleLocalUpdate = useCallback((updates: Partial<APIConfig>) => {
    setEditableApi(prev => ({ ...prev, ...updates }));
  }, []);

  // Handle provider change
  const handleProviderChangeInternal = (newProvider: APIProvider) => {
    const newProviderDefaults = createAPIConfig(newProvider);
    setEditableApi(prev => ({
      ...newProviderDefaults,
      id: prev.id,
      name: prev.name || newProviderDefaults.name,
      apiKey: prev.apiKey,
      enabled: false,
      lastConnectionStatus: undefined,
      model_info: undefined,
    }));
  };

  // Save changes to backend
  const handleSave = async () => {
    let configToPersist = { ...editableApi };
    let testedImplicitly = false;
    let implicitTestSuccess = false;
    const providerConfig = PROVIDER_CONFIGS[configToPersist.provider];

    // If not enabled, but required fields are present, try to test and enable
    if (!configToPersist.enabled &&
      configToPersist.url &&
      (!providerConfig.requiresApiKey || configToPersist.apiKey) &&
      configToPersist.model // Assuming model selection is a prerequisite for a functional API
    ) {
      testedImplicitly = true;
      setIsLoading(true);
      setModelError(undefined);
      try {
        const response = await fetch('/api/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: configToPersist.url,
            apiKey: configToPersist.apiKey,
            provider: configToPersist.provider,
            model: configToPersist.model,
            templateId: configToPersist.templateId
          })
        });
        const data = await response.json();
        if (data.success) {
          configToPersist = {
            ...configToPersist,
            enabled: true,
            lastConnectionStatus: { connected: true, timestamp: Date.now() },
            ...(data.model && { model_info: data.model })
          };
          implicitTestSuccess = true;
        } else {
          configToPersist = {
            ...configToPersist,
            enabled: false,
            lastConnectionStatus: { connected: false, timestamp: Date.now(), error: data.message || 'Implicit test failed' }
          };
          implicitTestSuccess = false;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Implicit connection test failed';
        configToPersist = {
          ...configToPersist,
          enabled: false,
          lastConnectionStatus: { connected: false, timestamp: Date.now(), error: message }
        };
        setModelError(message);
        implicitTestSuccess = false;
      } finally {
        setIsLoading(false);
      }
      // Update local editableApi state to reflect the outcome of the implicit test.
      // This is crucial for hasChanges useEffect to correctly determine if changes are still pending.
      setEditableApi(configToPersist);
    }

    persistUpdate(apiId, configToPersist);
    // setHasChanges(false) is intentionally omitted here.
    // The useEffect hook that compares 'api' prop with 'editableApi' will correctly
    // set hasChanges to false if 'api' prop is updated to match 'editableApi' after persistence.

    if (testedImplicitly) {
      if (implicitTestSuccess) {
        toast.success(`API "${configToPersist.name || 'Unnamed API'}" connected and saved!`);
      } else {
        toast.info(`Connection test failed. API "${configToPersist.name || 'Unnamed API'}" saved but not enabled.`);
      }
    } else {
      toast.success(`API configuration "${configToPersist.name || 'Unnamed API'}" saved successfully!`);
    }
  };

  // Test connection
  const handleTest = async () => {
    setIsLoading(true);
    setModelError(undefined);
    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: editableApi.url,
          apiKey: editableApi.apiKey,
          provider: editableApi.provider,
          model: editableApi.model || undefined,
          templateId: editableApi.templateId || undefined
        })
      });

      const data = await response.json();

      if (data.success) {
        handleLocalUpdate({
          enabled: true,
          lastConnectionStatus: { connected: true, timestamp: Date.now() },
          ...(data.model && { model_info: data.model })
        });
        toast.success(`Successfully connected to ${editableApi.name || editableApi.provider}! Model: ${data.model?.name || editableApi.model || 'N/A'}.`);
      } else {
        throw new Error(data.message || 'Connection failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setModelError(message);
      toast.error(`Connection failed: ${message}`);
      handleLocalUpdate({
        enabled: false,
        lastConnectionStatus: { connected: false, timestamp: Date.now(), error: message }
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Disconnect (locally)
  const handleDisconnect = () => {
    handleLocalUpdate({
      enabled: false,
      lastConnectionStatus: undefined,
      model_info: undefined
    });
  };

  // Download KoboldCPP
  const handleDownloadKoboldCPP = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      // First check if KoboldCPP is running
      const statusCheck = await fetch('/api/koboldcpp/status');
      if (statusCheck.ok) {
        const statusData = await statusCheck.json();
        if (statusData.is_running) {
          toast.error('KoboldCPP is currently running. Please stop it before downloading/updating.', {
            description: 'You can stop KoboldCPP from the model selector or by closing the application.',
            duration: 6000
          });
          setIsDownloading(false);
          return;
        }
      }

      // Try streaming download first for better UX
      const response = await fetch('/api/koboldcpp/download', {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream, application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error_code === 'running') {
          toast.error('KoboldCPP is currently running', {
            description: 'Please stop KoboldCPP before downloading/updating.',
            duration: 6000
          });
        } else {
          throw new Error(errorData.message || 'Download failed');
        }
        return;
      }

      // Check if we got a streaming response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        // Handle streaming response with progress
        await handleStreamingDownload(response);
      } else {
        // Handle regular JSON response
        const data = await response.json();
        if (data.status === 'success') {
          toast.success('KoboldCPP downloaded successfully!');
          await checkKoboldStatus(); // Refresh status
        } else {
          throw new Error(data.message || 'Download failed');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed';
      toast.error(`Failed to download KoboldCPP: ${message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBrowserDownload = async () => {
    try {
      const response = await fetch('/api/koboldcpp/download-url');
      const data = await response.json();

      if (data.status === 'success') {
        window.open(data.download_url, '_blank');
        toast.success('Opening download in browser. Please save the file to your KoboldCPP directory.');
      } else if (data.error_code === 'running') {
        toast.error('KoboldCPP is currently running. Please stop it before downloading.');
      } else {
        toast.error(data.message || 'Failed to get download URL');
      }
    } catch (error) {
      console.error('Failed to get download URL:', error);
      // Fallback to GitHub releases page
      window.open('https://github.com/LostRuins/koboldcpp/releases/latest', '_blank');
      toast.info('Opened GitHub releases page as fallback.');
    }
  };

  const checkKoboldStatus = async () => {
    try {
      const response = await fetch('/api/koboldcpp/status');
      if (response.ok) {
        const data = await response.json();
        setKoboldStatus(data);
      }
    } catch (error) {
      console.error('Failed to check KoboldCPP status:', error);
    }
  };

  const handleStreamingDownload = async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Stream reader not available');

    const decoder = new TextDecoder();
    let downloadToast: string | number | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));

              if (data.error) {
                toast.error(`Download error: ${data.error}`);
                return;
              }

              if (data.status === 'completed') {
                if (downloadToast) {
                  toast.dismiss(downloadToast);
                }
                toast.success('KoboldCPP downloaded successfully!');
                await checkKoboldStatus(); // Refresh status
                return;
              }

              // Show progress toast
              if (data.percent !== undefined) {
                const message = `Downloading KoboldCPP... ${Math.round(data.percent)}%`;
                if (downloadToast) {
                  toast.dismiss(downloadToast);
                }
                downloadToast = toast.loading(message, {
                  duration: Infinity // Keep showing until dismissed
                });
              }
            } catch (e) {
              console.error('Error parsing download progress:', e);
            }
          }
        }
      }
    } finally {
      if (downloadToast) {
        toast.dismiss(downloadToast);
      }
    }
  };

  return (
    <div
      className={`space-y-4 ${isActive ? 'border-l-4 border-blue-500 pl-3 -ml-4' : 'border-l-4 border-transparent pl-3 -ml-4'} ${hasChanges ? 'border-yellow-500/50' : ''}`}
      data-api-id={apiId}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm
            ${editableApi.enabled ? 'bg-green-900/50 text-green-300' : 'bg-stone-800 text-gray-300'}`}
          >
            {editableApi.enabled ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            <span className="ml-1">{editableApi.enabled ? "Connected" : "Not Connected"}</span>
          </div>
          {isActive && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-blue-900/50 text-blue-300">
              <Star className="w-3 h-3" />
              <span className="ml-1">Active</span>
            </div>
          )}
          {hasChanges && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-yellow-900/50 text-yellow-300" title="Unsaved changes">
              <AlertTriangle className="w-3 h-3" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            icon={<Save size={16} />}
            onClick={handleSave}
            disabled={!hasChanges || isLoading}
            title={hasChanges ? "Save API configuration" : "No changes to save"}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="md"
            icon={<Trash2 size={18} />}
            onClick={onRemove}
            title="Remove API"
            className="hover:text-red-400"
          />
        </div>
      </div>

      {/* API Name */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">API Name</label>
        <input
          type="text"
          value={editableApi.name || ''}
          onChange={(e) => handleLocalUpdate({ name: e.target.value })}
          placeholder="Enter a friendly name for this API"
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">API Type</label>
        <select
          value={editableApi.provider}
          onChange={(e) => handleProviderChangeInternal(e.target.value as APIProvider)}
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
        >
          {Object.values(APIProvider).map((provider) => (
            <option key={provider} value={provider}>{provider}</option>
          ))}
        </select>
      </div>

      {/* URL Field */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4" /> API URL
          </div>
        </label>
        <input
          type="text"
          value={editableApi.url || ''}
          onChange={(e) => handleLocalUpdate({ url: e.target.value })}
          placeholder="Enter API URL"
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* KoboldCPP Download Button */}
      {editableApi.provider === APIProvider.KOBOLD && (
        <div className="p-3 bg-stone-900/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-300">KoboldCPP Status</div>
              <div className="text-xs text-gray-500">
                {koboldStatus ? (
                  koboldStatus.status === 'missing' ? (
                    'KoboldCPP not found'
                  ) : koboldStatus.status === 'present' ? (
                    `KoboldCPP installed${koboldStatus.version ? ` (${koboldStatus.version})` : ''}`
                  ) : koboldStatus.status === 'running' ? (
                    `KoboldCPP running${koboldStatus.version ? ` (${koboldStatus.version})` : ''}`
                  ) : (
                    'Status unknown'
                  )
                ) : (
                  'Checking status...'
                )}
              </div>
            </div>
            {koboldStatus?.status === 'missing' && (
              <div className="flex items-center gap-1">
                <Button
                  variant="primary"
                  size="md"
                  icon={<Download className="w-4 h-4" />}
                  onClick={handleDownloadKoboldCPP}
                  disabled={isDownloading}
                  title="Download the latest version of KoboldCPP from GitHub with progress tracking"
                >
                  {isDownloading ? 'Downloading...' : 'Download KoboldCPP'}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  icon={<Globe2 className="w-4 h-4" />}
                  onClick={handleBrowserDownload}
                  disabled={isDownloading}
                  title="Download KoboldCPP in browser (manual installation)"
                >
                  Browser
                </Button>
              </div>
            )}
            {(koboldStatus?.status === 'present' || koboldStatus?.status === 'running') && (
              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="md"
                  icon={<Download className="w-4 h-4" />}
                  onClick={handleDownloadKoboldCPP}
                  disabled={isDownloading}
                  title="Download the latest version of KoboldCPP from GitHub (will replace current version)"
                >
                  {isDownloading ? 'Downloading...' : 'Update'}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  icon={<Globe2 className="w-4 h-4" />}
                  onClick={handleBrowserDownload}
                  disabled={isDownloading}
                  title="Download KoboldCPP in browser (manual installation)"
                >
                  Browser
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* API Key Field */}
      {currentProviderConfig.requiresApiKey && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4" /> API Key
            </div>
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={editableApi.apiKey || ''}
              onChange={(e) => handleLocalUpdate({ apiKey: e.target.value })}
              placeholder="Enter API key"
              className="w-full px-3 py-2 pr-10 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
            />
            <Button
              type="button"
              variant="ghost"
              size="md"
              icon={showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              onClick={() => setShowApiKey(!showApiKey)}
              title={showApiKey ? "Hide API Key" : "Show API Key"}
              className="absolute inset-y-0 right-0 px-3"
            />
          </div>
        </div>
      )}

      {/* --- Model Selector Integration --- */}
      {(editableApi.provider === APIProvider.KOBOLD || editableApi.provider === APIProvider.OLLAMA || editableApi.provider === APIProvider.OPENROUTER || editableApi.provider === APIProvider.FEATHERLESS) ? (
        <ModelSelector
          apiUrl={editableApi.url || ''}
          provider={editableApi.provider as APIProvider} // Use the imported ModelSelector
          modelsDirectory={settings.models_directory || settings.model_directory || ''}
          selectedModel={editableApi.model}
          onChange={(model) => handleLocalUpdate({ model })}
          apiKey={editableApi.apiKey}
        />
      ) : currentProviderConfig.availableModels ? ( // Fallback basic selector
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
          <select
            value={editableApi.model || ''}
            onChange={(e) => handleLocalUpdate({ model: e.target.value })}
            className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
          >
            {!editableApi.model && <option value="" disabled>-- Select Model --</option>}
            {currentProviderConfig.availableModels.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
          <input
            type="text"
            value={editableApi.model || ''}
            onChange={(e) => handleLocalUpdate({ model: e.target.value })}
            placeholder="Enter model name"
            className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Template Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Chat Template</label>
        <select
          value={editableApi.templateId || ''}
          onChange={(e) => handleLocalUpdate({ templateId: e.target.value })}
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
        >
          <option value="">-- Select Template --</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>{template.name}</option>
          ))}
        </select>
        <div className="mt-1 text-xs text-gray-500">
          {editableApi.templateId ? (
            templateService.getTemplateById(editableApi.templateId) ?
              `Using ${templateService.getTemplateById(editableApi.templateId)?.name} template` :
              `Template ID "${editableApi.templateId}" not found`
          ) : (
            "No template selected, will use default"
          )}
        </div>
      </div>

      {/* Model Loading/Connection Error Message */}
      {modelError && (
        <div className="p-3 text-sm text-red-500 bg-red-950/50 rounded-lg">
          {modelError}
        </div>
      )}

      {/* Connected Model Section */}
      <div className="p-3 bg-stone-900/50 rounded-lg space-y-1">
        <div className="text-sm font-medium">Connected Model</div>
        <div className="text-sm text-gray-400">
          {editableApi.model_info?.name || editableApi.model || "No model selected"}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-2">
        {!isActive && editableApi.enabled && (
          <Button
            variant="primary"
            size="lg"
            onClick={onSetActive}
            disabled={isLoading || hasChanges}
            title={hasChanges ? "Save changes before setting active" : (editableApi.enabled ? "Set as active API" : "You must connect the API first")}
            className="!bg-sky-600 hover:!bg-sky-700"
          >
            Set Active
          </Button>
        )}
        {editableApi.enabled ? (
          <Button
            variant="primary"
            size="lg"
            onClick={handleDisconnect}
            disabled={isLoading}
            className="!bg-orange-600 hover:!bg-orange-700"
          >
            Disconnect
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={handleTest}
            disabled={isLoading || !editableApi.url || (currentProviderConfig.requiresApiKey && !editableApi.apiKey)}
            title={(!editableApi.url || (currentProviderConfig.requiresApiKey && !editableApi.apiKey)) ? "URL and API Key (if required) must be set to test" : "Test Connection"}
            className="!bg-green-600 hover:!bg-green-700"
          >
            {isLoading ? 'Testing...' : 'Test Connection'}
          </Button>
        )}
      </div>

      {/* Last Tested Info */}
      {editableApi.lastConnectionStatus?.timestamp && (
        <div className="text-xs text-gray-500 text-right mt-2">
          Last tested: {new Date(editableApi.lastConnectionStatus.timestamp).toLocaleString()}
          {editableApi.lastConnectionStatus.error && <span className="text-red-400 ml-2">(Error: {editableApi.lastConnectionStatus.error})</span>}
        </div>
      )}
    </div>
  );
};

// --- Model Selector Components Removed (Now in ModelSelector.tsx) ---

export default APICard;