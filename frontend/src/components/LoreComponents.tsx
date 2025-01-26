import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Settings, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { LoreItem, LorePosition } from '../types/loreTypes';

interface LoreCardProps {
  item: LoreItem;
  onDelete: (uid: number) => void;
  onUpdate: (uid: number, updatedItem: Partial<LoreItem>) => void;
  onMoveUp: (uid: number) => void;
  onMoveDown: (uid: number) => void;
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleBlur = () => {
    const keys = rawInput
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    onUpdate(item.uid, { keys });
  };

  return (
    <div className={`bg-gradient-to-b from-zinc-900 to-stone-950 rounded-lg p-4 mb-4 shadow-lg 
      ${item.disable ? 'opacity-60' : ''}`}>
      
      {/* Top Controls Row */}
      <div className="flex items-center justify-between gap-4 mb-4">
        {/* Left side controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate(item.uid, { disable: !item.disable })}
            className="text-gray-400 hover:text-blue-400 transition-colors"
            title={item.disable ? 'Enable' : 'Disable'}
          >
            {item.disable ? <ToggleLeft size={20} /> : <ToggleRight size={20} />}
          </button>
          
          <select
            value={`${item.position}${item.position === LorePosition.AtDepth ? '-' + (item.role ?? 0) : ''}`}
            onChange={(e) => {
              const value = e.target.value;
              if (value.startsWith(`${LorePosition.AtDepth}-`)) {
                // Handle @Depth options
                const role = Number(value.split('-')[1]);
                onUpdate(item.uid, { 
                  position: LorePosition.AtDepth,
                  role: role 
                });
              } else {
                // Handle regular options
                onUpdate(item.uid, { 
                  position: Number(value),
                  role: null 
                });
              }
            }}
            className="bg-zinc-950 text-white rounded px-2 py-1 text-sm border border-zinc-800"
          >
            <option value={LorePosition.BeforeCharacter}>Before Character</option>
            <option value={LorePosition.AfterCharacter}>After Character</option>
            <option value={LorePosition.AuthorsNoteTop}>Author's Note Top</option>
            <option value={LorePosition.AuthorsNoteBottom}>Author's Note Bottom</option>
            <option value={`${LorePosition.AtDepth}-0`}>@Depth as System</option>
            <option value={`${LorePosition.AtDepth}-1`}>@Depth as User</option>
            <option value={`${LorePosition.AtDepth}-2`}>@Depth as Character</option>
            <option value={LorePosition.BeforeExampleMsgs}>Before Example Messages</option>
            <option value={LorePosition.AfterExampleMsgs}>After Example Messages</option>
          </select>

          {/* Show depth input only when any @Depth option is selected */}
          {item.position === LorePosition.AtDepth && (
            <input
              type="number"
              value={item.depth}
              onChange={(e) => onUpdate(item.uid, { depth: Number(e.target.value) })}
              className="w-20 bg-zinc-950 text-white rounded px-2 py-1 text-sm border border-zinc-800"
              placeholder="Depth"
              min="0"
            />
          )}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMoveUp(item.uid)}
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
            onClick={() => onMoveDown(item.uid)}
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
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded"
            title="Advanced settings"
          >
            <Settings size={18} />
          </button>
          
          <button 
            onClick={() => onDelete(item.uid)}
            className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"
            title="Delete lore item"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        {/* Keys Input */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Trigger Key(s)</label>
          <input
            type="text"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            onBlur={handleBlur}
            className="w-full bg-zinc-950 text-white rounded px-3 py-2 border border-zinc-800"
            placeholder="Enter comma-separated keywords"
          />
        </div>

        {/* Content Input */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Content</label>
          <textarea
            value={item.content}
            onChange={(e) => onUpdate(item.uid, { content: e.target.value })}
            rows={4}
            className="w-full bg-zinc-950 text-white rounded px-3 py-2 border border-zinc-800 resize-y"
            placeholder="Enter lore content"
          />
        </div>

        {/* Advanced Settings Panel */}
        {showAdvanced && (
          <div className="mt-4 p-4 bg-zinc-950 rounded-lg border border-zinc-800">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Advanced Settings</h4>
            
            {/* Basic toggles row */}
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.constant}
                  onChange={(e) => onUpdate(item.uid, { constant: e.target.checked })}
                  className="form-checkbox"
                />
                <span className="text-sm text-gray-400">Constant</span>
              </label>
              
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.selective}
                  onChange={(e) => onUpdate(item.uid, { selective: e.target.checked })}
                  className="form-checkbox"
                />
                <span className="text-sm text-gray-400">Selective</span>
              </label>
            </div>

            {/* Probability Controls */}
            <div className="mb-4">
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={item.useProbability}
                  onChange={(e) => onUpdate(item.uid, { useProbability: e.target.checked })}
                  className="form-checkbox"
                />
                <span className="text-sm text-gray-400">Use Probability</span>
              </label>
              
              {item.useProbability && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={item.probability}
                    onChange={(e) => onUpdate(item.uid, { probability: Number(e.target.value) })}
                    min="0"
                    max="100"
                    className="w-20 bg-zinc-950 text-white rounded px-2 py-1 border border-zinc-800"
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              )}
            </div>

            {/* Depth & Order Controls */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Depth</label>
                <input
                  type="number"
                  value={item.depth}
                  onChange={(e) => onUpdate(item.uid, { depth: Number(e.target.value) })}
                  className="w-full bg-zinc-950 text-white rounded px-2 py-1 border border-zinc-800"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Order</label>
                <input
                  type="number"
                  value={item.order}
                  onChange={(e) => onUpdate(item.uid, { order: Number(e.target.value) })}
                  className="w-full bg-zinc-950 text-white rounded px-2 py-1 border border-zinc-800"
                />
              </div>
            </div>
          </div>
        )}
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