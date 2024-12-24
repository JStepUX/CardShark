import React, { useState, useEffect } from 'react'

// Define types for the character data structure
interface CharacterData {
  data?: {
    name?: string;
    description?: string;
    personality?: string;
    scenario?: string;
    first_mes?: string;
    character_book?: {
      entries?: Array<{
        keys: string[];
        content: string;
      }>;
    };
  };
  spec?: string;
  spec_version?: string;
}

// Define props interface
interface TabNavigationProps {
  characterData: CharacterData | null;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ characterData }) => {
  const [activeTab, setActiveTab] = useState('basic')

  useEffect(() => {
    if (characterData) {
      console.log('Character data updated:', characterData)
    }
  }, [characterData])

  const tabs = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'personality', label: 'Personality' },
    { id: 'messages', label: 'Messages' },
    { id: 'lore', label: 'Lore Items' },
    { id: 'worldbook', label: 'Worldbook' },
    { id: 'json', label: 'JSON' }
  ] as const

  return (
    <div className="w-full h-full flex flex-col">
      {/* Tab Buttons */}
      <div className="flex border-b">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 -mb-px font-medium ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-4">
        {activeTab === 'basic' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Basic Information</h2>
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input 
                type="text"
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Character name"
                value={characterData?.data?.name || ''}
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="w-full px-3 py-2 border rounded-md h-32"
                placeholder="Character description"
                value={characterData?.data?.description || ''}
                readOnly
              />
            </div>
          </div>
        )}

        {activeTab === 'personality' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Personality & Scenario</h2>
            <div>
              <label className="block text-sm font-medium mb-1">Personality</label>
              <textarea
                className="w-full px-3 py-2 border rounded-md h-32"
                placeholder="Character personality"
                value={characterData?.data?.personality || ''}
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Scenario</label>
              <textarea
                className="w-full px-3 py-2 border rounded-md h-32"
                placeholder="Character scenario"
                value={characterData?.data?.scenario || ''}
                readOnly
              />
            </div>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Messages</h2>
            <div>
              <label className="block text-sm font-medium mb-1">First Message</label>
              <textarea
                className="w-full px-3 py-2 border rounded-md h-32"
                placeholder="First message"
                value={characterData?.data?.first_mes || ''}
                readOnly
              />
            </div>
          </div>
        )}

        {activeTab === 'lore' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Lore Items</h2>
            <p className="text-gray-500">Lore items will be displayed here</p>
          </div>
        )}

        {activeTab === 'worldbook' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Worldbook Settings</h2>
            <p className="text-gray-500">Worldbook settings will be displayed here</p>
          </div>
        )}

        {activeTab === 'json' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">JSON View</h2>
            <pre className="bg-gray-50 p-4 rounded-md overflow-auto h-96">
              {JSON.stringify(characterData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default TabNavigation