// frontend/src/components/api/ApiSelectDropdown.tsx
import React from 'react';
import { useAPIConfig } from '../../contexts/APIConfigContext';
import { useSettings } from '../../contexts/SettingsContext';
import { APIConfig } from '../../types/api';
import { ChevronDown } from 'lucide-react';

export const ApiSelectDropdown: React.FC = () => {
  const { allAPIConfigs, activeApiId, setActiveApiId: setActiveApiIdInContext } = useAPIConfig();
  const { updateSettings } = useSettings();

  const enabledApis = React.useMemo(() => {
    return Object.entries(allAPIConfigs || {})
      .filter(([, config]) => config.enabled)
      .map(([id, config]) => ({ id, ...config }));
  }, [allAPIConfigs]);

  const handleApiChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newActiveId = event.target.value;
    if (newActiveId && newActiveId !== activeApiId) {
      try {
        // Persist to settings
        await updateSettings({ activeApiId: newActiveId });
        // Update context (which will re-fetch and update apiConfig)
        setActiveApiIdInContext(newActiveId);
        console.log(`Active API switched to: ${newActiveId}`);
      } catch (error) {
        console.error("Error switching active API:", error);
        // Potentially show a toast error to the user
      }
    }
  };

  if (enabledApis.length === 0) {
    return (
      <div className="px-2 py-1 text-xs text-gray-400 bg-stone-800 rounded">
        No enabled APIs.
      </div>
    );
  }

  if (enabledApis.length === 1 && activeApiId && enabledApis[0].id === activeApiId) {
     const singleApi = enabledApis[0];
     return (
        <div className="px-2 py-1 text-xs text-gray-300 bg-stone-800 rounded truncate" title={singleApi.name || singleApi.id}>
            Active API: {singleApi.name || singleApi.id}
        </div>
     );
  }

  return (
    <div className="relative w-full">
      <select
        value={activeApiId || ''}
        onChange={handleApiChange}
        className="w-full appearance-none bg-stone-800 border border-stone-700 text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 truncate"
        title="Select Active API"
      >
        <option value="" disabled hidden>
          {activeApiId ? 'Switch API...' : 'Select Active API...'}
        </option>
        {enabledApis.map((api: APIConfig & { id: string }) => (
          <option key={api.id} value={api.id}>
            {api.name || api.id} ({api.provider} - {api.model || 'Default'})
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
        <ChevronDown size={16} />
      </div>
    </div>
  );
};

export default ApiSelectDropdown;