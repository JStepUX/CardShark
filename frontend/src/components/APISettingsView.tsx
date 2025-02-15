import React from 'react';
import { Plus } from 'lucide-react';
import DirectoryPicker from './DirectoryPicker';
import { APICard } from './APICard';
import { 
  APIProvider, 
  APIConfig, 
  createAPIConfig 
} from '../types/api';
import { Settings } from '../types/settings';

interface ViewProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
}

const APISettingsView: React.FC<ViewProps> = ({ settings, onUpdate }) => {
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

  const handleProviderChange = (id: string, provider: APIProvider) => {
    const newConfig = createAPIConfig(provider);
    newConfig.id = id;
    handleAPIUpdate(id, newConfig);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header Section */}
      <div className="p-8 pb-4 flex-shrink-0 bg-slate-900 border-b border-stone-800">
        <h2 className="text-lg font-semibold mb-6">Settings</h2>
        
        {/* Directory Settings */}
        <div className="mb-8">
          <h3 className="text-md font-medium mb-4">Character Directory</h3>
          <DirectoryPicker
            currentDirectory={settings.character_directory}
            onDirectoryChange={(directory) => onUpdate({ 
              character_directory: directory,
              save_to_character_directory: true 
            })}
          />
          
          {settings.character_directory && (
            <div className="mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.save_to_character_directory}
                  onChange={(e) => onUpdate({ save_to_character_directory: e.target.checked })}
                  className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">
                  Save characters to this directory
                </span>
              </label>
            </div>
          )}
        </div>

        {/* API Section Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">
            API Configuration ({Object.keys(settings.apis || {}).length} APIs)
          </h3>
          <button
            onClick={handleAddAPI}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Add API
          </button>
        </div>
      </div>

      {/* Scrollable Content Section */}
      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        {/* API Cards */}
        {Object.entries(settings.apis || {}).map(([id, api]) => (
          <div key={id} className="bg-gradient-to-b from-zinc-900 to-stone-950 rounded-lg p-4">
            <APICard
              api={api}
              onUpdate={(updates) => handleAPIUpdate(id, updates)}
              onRemove={() => handleRemoveAPI(id)}
              onProviderChange={(provider) => handleProviderChange(id, provider)}
            />
          </div>
        ))}

        {Object.keys(settings.apis || {}).length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No APIs configured. Click "Add API" to add one.
            <br />
            <br />
            (KoboldCPP at localhost:5001 works out of the box, no config necessary.)
          </div>
        )}

        {/* Bottom Padding for Scrolling */}
        <div className="h-8" />
      </div>
    </div>
  );
};

export default APISettingsView;