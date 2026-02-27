// src/components/SettingsTabs.tsx
import React, { useState, useEffect } from 'react';
import Button from './common/Button';

type Tab = 'general' | 'api' | 'templates' | 'prompts' | 'highlighting' | 'filtering';

interface SettingsTabsProps {
  defaultTab?: Tab;
  children: React.ReactNode;
  onTabChange?: (tab: Tab) => void;
}

interface SettingsTabProps {
  id: Tab;
  children: React.ReactNode;
}

export const SettingsTabs: React.FC<SettingsTabsProps> = ({ 
  defaultTab = 'general', 
  children,
  onTabChange
}) => {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  // Important: This effect ensures the component respects defaultTab changes
  // from parent components, while avoiding unnecessary state updates
  useEffect(() => {
    if (defaultTab !== activeTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Filter children to find tabs
  const tabs = React.Children.toArray(children).filter(
    (child) => React.isValidElement(child) && (child.type as any).displayName === 'SettingsTab'
  ) as React.ReactElement<SettingsTabProps>[];

  // Find the active tab content
  const activeTabContent = tabs.find((tab) => tab.props.id === activeTab)?.props.children;

  return (
    <div className="w-full h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="flex border-b border-stone-800">
        <Button
          variant="ghost"
          onClick={() => handleTabClick('general')}
          className={`px-6 py-3 font-medium rounded-none border-x-0 border-t-0 ${
            activeTab === 'general'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'hover:text-gray-200'
          }`}
        >
          General
        </Button>
        <Button
          variant="ghost"
          onClick={() => handleTabClick('api')}
          className={`px-6 py-3 font-medium rounded-none border-x-0 border-t-0 ${
            activeTab === 'api'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'hover:text-gray-200'
          }`}
        >
          API
        </Button>
        <Button
          variant="ghost"
          onClick={() => handleTabClick('templates')}
          className={`px-6 py-3 font-medium rounded-none border-x-0 border-t-0 ${
            activeTab === 'templates'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'hover:text-gray-200'
          }`}
        >
          Templates
        </Button>
        <Button
          variant="ghost"
          onClick={() => handleTabClick('prompts')}
          className={`px-6 py-3 font-medium rounded-none border-x-0 border-t-0 ${
            activeTab === 'prompts'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'hover:text-gray-200'
          }`}
        >
          Prompts
        </Button>
        <Button
          variant="ghost"
          onClick={() => handleTabClick('highlighting')}
          className={`px-6 py-3 font-medium rounded-none border-x-0 border-t-0 ${
            activeTab === 'highlighting'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'hover:text-gray-200'
          }`}
        >
          Highlighting
        </Button>
        <Button
          variant="ghost"
          onClick={() => handleTabClick('filtering')}
          className={`px-6 py-3 font-medium rounded-none border-x-0 border-t-0 ${
            activeTab === 'filtering'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'hover:text-gray-200'
          }`}
        >
          Chat
        </Button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTabContent}
      </div>
    </div>
  );
};

export const SettingsTab: React.FC<SettingsTabProps> = ({ children }) => {
  return <>{children}</>;
};

// Set display name for type checking in parent component
SettingsTab.displayName = 'SettingsTab';