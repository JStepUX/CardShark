import React, { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { LocalLLMCard } from './LocalLLMCard';
import { ChatTemplate } from '../types/api';

interface APISettings {
  url: string;
  apiKey: string;
  template: ChatTemplate;
  lastConnectionResult?: {
    success: boolean;
    timestamp: number;
    error?: string;
  };
  model_info?: {
    id: string;
    owned_by?: string;
    created?: number;
  };
  character_directory: string;
  save_to_character_directory: boolean;
}

interface LocalLLMSettings {
  url: string;
  template: ChatTemplate;
  isConnected: boolean;
  lastTestedAt?: number;
  modelInfo?: {
    id: string;
    name?: string;
    provider?: string; // Make provider optional
  };
}

interface APISettingsViewProps {
  settings: APISettings;
  onUpdate: (updates: Partial<APISettings>) => void;
}

const APISettingsView: React.FC<APISettingsViewProps> = ({ settings }) => {
  const [localLLMSettings, setLocalLLMSettings] = useState<LocalLLMSettings>({
    url: settings.url,
    template: settings.template,
    isConnected: settings.lastConnectionResult?.success || false,
    lastTestedAt: settings.lastConnectionResult?.timestamp,
    modelInfo: settings.model_info ? {
      id: settings.model_info.id,
      name: settings.model_info.id, // Use ID as name for now
      provider: settings.model_info.owned_by
    } : undefined
  });

  // Handle updates from LocalLLM card
  const handleLocalLLMUpdate = (updates: Partial<LocalLLMSettings>) => {
    setLocalLLMSettings(prev => ({
      ...prev,
      ...updates,
      modelInfo: updates.modelInfo ? {
        id: updates.modelInfo.id,
        name: updates.modelInfo.name,
        provider: updates.modelInfo.provider, // Ensure provider is included
      } : prev.modelInfo,
    }));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-8 pb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Settings2 className="w-5 h-5" />
          API Configuration
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-8">
          <div className="space-y-8 max-w-2xl">
            <LocalLLMCard 
              settings={localLLMSettings}
              onUpdate={handleLocalLLMUpdate}
            />
            
            {/* Future API cards would go here */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default APISettingsView;