import React, { useState } from 'react';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';

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
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

export const LoreCard: React.FC<LoreCardProps> = ({ 
  item, 
  onDelete, 
  onUpdate,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast 
}) => {
  const [rawInput, setRawInput] = useState(item.keys.join(', '));

  const handleBlur = () => {
    const keys = rawInput
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    onUpdate(item.id, { keys });
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
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              onBlur={handleBlur}
              className="flex-1 bg-zinc-950 text-white rounded px-3 py-1"
              placeholder="Enter comma-separated keywords"
            />
            <div className="flex items-center ml-2 space-x-1">
              <button
                onClick={() => onMoveUp(item.id)}
                disabled={isFirst}
                className={`p-1 rounded ${
                  isFirst 
                    ? 'text-gray-600 cursor-not-allowed' 
                    : 'text-gray-400 hover:text-blue-400 hover:bg-gray-800'
                }`}
                title="Move up"
              >
                <ChevronUp size={18} />
              </button>
              <button
                onClick={() => onMoveDown(item.id)}
                disabled={isLast}
                className={`p-1 rounded ${
                  isLast 
                    ? 'text-gray-600 cursor-not-allowed' 
                    : 'text-gray-400 hover:text-blue-400 hover:bg-gray-800'
                }`}
                title="Move down"
              >
                <ChevronDown size={18} />
              </button>
              <button 
                onClick={() => onDelete(item.id)}
                className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"
                title="Delete lore item"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content section */}
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

// SearchBar component unchanged
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
          placeholder="Search keys and content"
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