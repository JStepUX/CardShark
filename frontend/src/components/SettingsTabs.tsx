import React, { useState } from 'react';

export type TabId = 'general' | 'api' | 'prompts';

interface Tab {
  id: TabId;
  label: string;
}

interface SettingsTabsProps {
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: Tab[] = [
  { id: 'general', label: 'General' },
  { id: 'api', label: 'API' },
  { id: 'prompts', label: 'Prompts' }
];

const SettingsTabs: React.FC<SettingsTabsProps> = ({ 
  currentTab,
  onTabChange
}) => {
  return (
    <div className="border-b border-stone-800">
      <div className="flex space-x-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 -mb-px font-medium transition-colors
              ${currentTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-300'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SettingsTabs;