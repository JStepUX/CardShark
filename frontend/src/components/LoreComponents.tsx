import React from 'react';
import { Trash2 } from 'lucide-react';

// Type definitions
export interface LoreItem {
  keys: string[];
  content: string;
  enabled: boolean;
  insertion_order: number;
  case_sensitive: boolean;
  priority: number;
  id: number;
  comment: string;
  name: string;
  selective: boolean;
  constant: boolean;
  position: 'before_char' | 'after_char';
}

interface LoreCardProps {
  item: LoreItem;
  onDelete: (id: number) => void;
  onUpdate: (id: number, updatedItem: Partial<LoreItem>) => void;
}

export const LoreCard: React.FC<LoreCardProps> = ({ item, onDelete, onUpdate }) => {
  // Simple string-array conversion
  const keyString = item.keys.join(',');

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Just split on commas, nothing fancy
    const newKeys = e.target.value.split(',');
    onUpdate(item.id, { keys: newKeys });
  };

  return (
    <div className="bg-gradient-to-b from-zinc-900 to-stone-950 rounded-lg p-4 mb-4 shadow-lg">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16">
          <label className="block text-sm text-gray-400 mb-1">Order</label>
          <input
            type="text"
            value={item.insertion_order + 1}
            readOnly
            className="w-full bg-zinc-950 text-white rounded px-2 py-1 text-center"
          />
        </div>
        
        <div className="flex-1 relative">
          <label className="block text-sm text-gray-400 mb-1">Key(s)</label>
          <div className="flex items-center">
            <input
              type="text"
              value={keyString}
              onChange={handleKeyChange}
              className="flex-1 bg-zinc-950 text-white rounded px-3 py-1"
              placeholder="Enter comma-separated keywords"
            />
            <button 
              onClick={() => onDelete(item.id)}
              className="ml-2 p-2 text-gray-400 hover:text-red-400 transition-colors"
              title="Delete lore item"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content section unchanged */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Content</label>
        <textarea
          value={item.content}
          onChange={(e) => onUpdate(item.id, { content: e.target.value })}
          rows={4}
          className="w-full bg-zinc-950 text-white rounded px-3 py-2 resize-y"
          placeholder="Enter lore content"
        />
      </div>
    </div>
  );
};

// SearchBar component for filtering lore items
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
  value, 
  onChange, 
  onSelectAll, 
  allSelected 
}) => {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search key and value"
          className="w-full bg-gray-950 text-white rounded-lg pl-10 pr-4 py-2"
        />
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg 
            className="w-5 h-5 text-gray-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
            />
          </svg>
        </div>
      </div>
      
      <button
        onClick={onSelectAll}
        className={`px-4 py-2 rounded-lg transition-colors ${
          allSelected 
            ? 'bg-blue-600 text-white' 
            : 'bg-slate-700 text-gray-300 hover:text-white'
        }`}
      >
        Select All
      </button>
    </div>
  );
};