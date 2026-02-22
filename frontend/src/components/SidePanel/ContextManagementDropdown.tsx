import { ChevronUp, Edit3 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { CompressionLevel } from '../../services/chat/chatTypes';
import Button from '../common/Button';

interface ContextManagementDropdownProps {
  compressionLevel: CompressionLevel;
  onLevelChange: (level: CompressionLevel) => void;
  disabled?: boolean;
}

interface CompressionOption {
  level: CompressionLevel;
  label: string;
  shortLabel: string; // Shorter label for compact display
  description: string;
  color: string;
}

const COMPRESSION_OPTIONS: CompressionOption[] = [
  {
    level: 'none',
    label: 'No Compression',
    shortLabel: 'No Compression',
    description: 'Full context, no compression',
    color: 'text-cyan-400'
  },
  {
    level: 'chat_only',
    label: 'Chat Only',
    shortLabel: 'Chat Only',
    description: 'Summarize old messages',
    color: 'text-blue-400'
  },
  {
    level: 'chat_dialogue',
    label: 'Chat + Dialogue',
    shortLabel: 'Chat + Dialogue',
    description: 'Chat + expire example dialogue',
    color: 'text-yellow-400'
  },
  {
    level: 'aggressive',
    label: 'Aggressive',
    shortLabel: 'Aggressive',
    description: 'Maximum compression',
    color: 'text-orange-400'
  }
];

export function ContextManagementDropdown({ compressionLevel, onLevelChange, disabled = false }: ContextManagementDropdownProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const currentOption = COMPRESSION_OPTIONS.find(opt => opt.level === compressionLevel) || COMPRESSION_OPTIONS[0];

  const handleSelect = (level: CompressionLevel) => {
    if (!disabled) {
      onLevelChange(level);
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Compact Button - Similar to Token Counter */}
      <Button
        variant="outline"
        fullWidth
        onClick={() => !disabled && setShowDropdown(!showDropdown)}
        disabled={disabled}
        title="Click to change context management level"
        className="justify-between px-3 py-2 bg-stone-900/50 hover:bg-stone-800/50 border-gray-700 rounded"
      >
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">Context Mgt.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${currentOption.color}`}>
            {currentOption.shortLabel}
          </span>
          <ChevronUp className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </div>
      </Button>

      {/* Drop-UP Menu */}
      {showDropdown && !disabled && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#0a0a0a] border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {COMPRESSION_OPTIONS.map((option) => (
            <Button
              key={option.level}
              variant="ghost"
              fullWidth
              onClick={() => handleSelect(option.level)}
              className={`px-4 py-3 text-left border-b border-gray-800 last:border-b-0 ${option.level === compressionLevel ? 'bg-stone-800/50' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-medium text-sm ${option.color}`}>
                  {option.label}
                </span>
                {option.level === compressionLevel && (
                  <span className="text-xs text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded">
                    Active
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {option.description}
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
