// components/APICard.tsx
// This file contains the APICard component which is used to display and manage API configurations in the UI. The component allows users to configure API settings, test the connection, and disconnect from the API. It also displays information about the connected model and provides options for selecting templates and generation settings.
import React, { useState, useEffect, useCallback } from 'react';
import { Globe2, Key, CheckCircle2, XCircle, Trash2, Star, Save, AlertTriangle, Eye, EyeOff, Settings as SettingsIcon } from 'lucide-react'; // Removed Loader2, AlertCircleIcon as they are in ModelSelector
import { toast } from 'sonner';
import {
  APIProvider,
  APIConfig,
  PROVIDER_CONFIGS,
  createAPIConfig
} from '../types/api';
import { Template } from '../types/templateTypes';
import { templateService } from '../services/templateService';
import { useSettings } from '../contexts/SettingsContext';
import APIConfigurationPanel from './APIConfigurationPanel';
import { Dialog } from './Dialog';
import { ModelSelector } from './ModelSelector'; // Import the new ModelSelector

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
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false); // State for config dialog
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

    // Diagnostic log for models_directory in APICard
    if (api.provider === APIProvider.KOBOLD) {
      console.log(`[APICard - KoboldCPP ${apiId}] settings.models_directory from context:`, settings.models_directory);
      console.log(`[APICard - KoboldCPP ${apiId}] settings.model_directory from context:`, settings.model_directory);
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
      // Only show generic save success if no implicit test was attempted or needed (e.g. already enabled)
      // Use a safe comparison mechanism that avoids circular reference issues
      try {
        // Convert to string first to handle potential circular references
        const configString = JSON.stringify(configToPersist);
        const editableString = JSON.stringify(editableApi);
        if (configString === editableString) {
          toast.success(`API configuration "${configToPersist.name || 'Unnamed API'}" saved successfully!`);
        }
      } catch (error) {
        // If JSON.stringify fails due to circular references, fall back to a simpler comparison
        console.warn('Stringification failed during comparison, falling back to simple comparison:', error);
        if (
          configToPersist.name === editableApi.name &&
          configToPersist.url === editableApi.url &&
          configToPersist.apiKey === editableApi.apiKey &&
          configToPersist.provider === editableApi.provider &&
          configToPersist.model === editableApi.model
        ) {
          toast.success(`API configuration "${configToPersist.name || 'Unnamed API'}" saved successfully!`);
        }
      }
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
          <button
            onClick={handleSave}
            disabled={!hasChanges || isLoading}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors
              ${hasChanges && !isLoading
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-stone-700 text-stone-400 cursor-not-allowed'}`}
            title={hasChanges ? "Save API configuration" : "No changes to save"}
          >
            <Save size={16} />
            Save
          </button>
          <button
            onClick={() => setIsConfigDialogOpen(true)}
            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded"
            title="Configure API Settings"
          >
            <SettingsIcon size={18} />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"
            title="Remove API"
          >
            <Trash2 size={18} />
          </button>
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
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-200"
              title={showApiKey ? "Hide API Key" : "Show API Key"}
            >
              {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      )}
 
      {/* --- Model Selector Integration --- */}
      {(editableApi.provider === APIProvider.KOBOLD || editableApi.provider === APIProvider.OPENROUTER || editableApi.provider === APIProvider.FEATHERLESS) ? (
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
      ) : null }

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
            <button
              onClick={onSetActive}
              disabled={isLoading || hasChanges}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={hasChanges ? "Save changes before setting active" : (editableApi.enabled ? "Set as active API" : "You must connect the API first")}
            >
              Set Active
            </button>
          )}
          {editableApi.enabled ? (
            <button
              onClick={handleDisconnect}
              disabled={isLoading}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleTest}
              disabled={isLoading || !editableApi.url || (currentProviderConfig.requiresApiKey && !editableApi.apiKey)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={(!editableApi.url || (currentProviderConfig.requiresApiKey && !editableApi.apiKey)) ? "URL and API Key (if required) must be set to test" : "Test Connection"}
            >
              {isLoading ? 'Testing...' : 'Test Connection'}
            </button>
          )}
      </div>

      {/* Last Tested Info */}
      {editableApi.lastConnectionStatus?.timestamp && (
        <div className="text-xs text-gray-500 text-right mt-2">
          Last tested: {new Date(editableApi.lastConnectionStatus.timestamp).toLocaleString()}
          {editableApi.lastConnectionStatus.error && <span className="text-red-400 ml-2">(Error: {editableApi.lastConnectionStatus.error})</span>}
        </div>
      )}      <Dialog
        isOpen={isConfigDialogOpen}
        onClose={() => setIsConfigDialogOpen(false)}
        title={`Advanced Settings: ${editableApi.name || 'Unnamed API'}`}
        showCloseButton={false}
        className="max-w-3xl"
        buttons={[
          {
            label: 'Cancel',
            onClick: () => setIsConfigDialogOpen(false),
          },
          {
            label: 'Save',
            onClick: () => {
              handleSave(); // Save changes when clicking Save
              setIsConfigDialogOpen(false); // Close dialog after saving
            },
            variant: 'primary',
            disabled: !hasChanges || isLoading,
          },
        ]}
      >
        <APIConfigurationPanel
          config={editableApi}
          onUpdate={handleLocalUpdate}
        />
      </Dialog>
    </div>
  );
};

// --- Model Selector Components Removed (Now in ModelSelector.tsx) ---

export default APICard;