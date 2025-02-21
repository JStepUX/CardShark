import React from 'react';
import { Plus } from 'lucide-react';
import { APIConfig, APIProvider, createAPIConfig } from '../types/api';
import { Settings } from '../types/settings';
import APICard from './APICard';

interface APISettingsPanelProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
}

import APIConfigurationPanel from './APIConfigurationPanel';

const APISettingsPanel: React.FC<APISettingsPanelProps> = ({
  settings,
  onUpdate
}) => {
  const handleAPIUpdate = (id: string, updates: Partial<APIConfig>) => {
    onUpdate({
      apis: {
        ...settings.apis,
        [id]: {
          ...settings.apis[id],
          ...updates
        }
      }
    });
  };

  const handleAddAPI = () => {
    const newConfig = createAPIConfig(APIProvider.KOBOLD);
    onUpdate({
      apis: {
        ...settings.apis,
        [newConfig.id]: newConfig
      }
    });
  };

  const handleRemoveAPI = (id: string) => {
    const newApis = { ...settings.apis };
    delete newApis[id];
    onUpdate({ apis: newApis });
  };

  // In APISettingsPanel.tsx

  const handleProviderChange = (id: string, provider: APIProvider) => {
    const newConfig = createAPIConfig(provider);
    // Preserve the ID when changing provider
    newConfig.id = id;
    handleAPIUpdate(id, newConfig);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">
          API Configuration ({Object.keys(settings.apis || {}).length} APIs)
        </h2>
        <button
          onClick={handleAddAPI}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          Add API
        </button>
      </div>

      <div className="space-y-6">
        {Object.entries(settings.apis || {}).map(([id, api]) => (
          <div key={id} className="bg-gradient-to-b from-zinc-900 to-stone-950 rounded-lg p-6">
            <div className="space-y-6">
            <APICard
              api={api}
              onUpdate={(updates) => handleAPIUpdate(id, updates)}
              onRemove={() => handleRemoveAPI(id)}
              onProviderChange={(provider) => handleProviderChange(id, provider)}  // Add this line
            />
              
              {/* Only show configuration panel if API is enabled */}
              {api.enabled && (
                <APIConfigurationPanel
                  config={api}
                  onUpdate={(updates) => handleAPIUpdate(id, updates)}
                />
              )}
            </div>
          </div>
        ))}

        {Object.keys(settings.apis || {}).length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No APIs configured. Click "Add API" to add one.
          </div>
        )}
      </div>
    </div>
  );
};

export default APISettingsPanel;