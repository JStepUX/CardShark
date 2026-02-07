/**
 * @file OrganizationToolbar.tsx
 * @description Sticky toolbar shown when organization mode is active in the gallery.
 */
import React, { useState, useRef, useEffect } from 'react';
import { CheckSquare, Square, FolderInput, X, ChevronDown } from 'lucide-react';
import { FolderDefinition } from '../../types/gallery';

interface OrganizationToolbarProps {
  selectedCount: number;
  folders: FolderDefinition[];
  currentFolder: string | null;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onMoveToFolder: (folderName: string | null) => void;
  onExit: () => void;
}

const OrganizationToolbar: React.FC<OrganizationToolbarProps> = ({
  selectedCount,
  folders,
  currentFolder,
  onSelectAll,
  onDeselectAll,
  onMoveToFolder,
  onExit,
}) => {
  const [isMoveDropdownOpen, setIsMoveDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMoveDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-900/30 border border-blue-700/40 rounded-lg transition-all animate-in slide-in-from-top duration-300">
      {/* Selection count */}
      <span className="text-sm font-medium text-blue-200">
        {selectedCount > 0 ? (
          <span className="flex items-center gap-1.5">
            <CheckSquare size={14} />
            {selectedCount} selected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-slate-400">
            <Square size={14} />
            None selected
          </span>
        )}
      </span>

      <div className="h-4 w-px bg-stone-600" />

      {/* Select / Deselect */}
      <button
        onClick={onSelectAll}
        className="text-xs text-slate-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-stone-700"
      >
        Select All
      </button>
      <button
        onClick={onDeselectAll}
        className="text-xs text-slate-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-stone-700"
        disabled={selectedCount === 0}
      >
        Deselect
      </button>

      <div className="h-4 w-px bg-stone-600" />

      {/* Move to dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsMoveDropdownOpen(!isMoveDropdownOpen)}
          disabled={selectedCount === 0}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-stone-700 hover:bg-stone-600 border border-stone-600 rounded-lg text-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FolderInput size={14} />
          Move to
          <ChevronDown size={12} />
        </button>

        {isMoveDropdownOpen && (
          <div className="absolute left-0 mt-1 w-48 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="py-1">
              {/* Unfiled option */}
              {currentFolder !== null && (
                <button
                  onClick={() => {
                    onMoveToFolder(null);
                    setIsMoveDropdownOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-stone-700 flex items-center gap-2"
                >
                  <span className="text-slate-500">--</span> Unfiled
                </button>
              )}
              {/* Folder options (exclude current) */}
              {folders
                .filter(f => f.name !== currentFolder)
                .map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => {
                      onMoveToFolder(folder.name);
                      setIsMoveDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-stone-700 flex items-center gap-2"
                  >
                    <FolderInput size={14} className="text-slate-500" />
                    {folder.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-grow" />

      {/* Exit org mode */}
      <button
        onClick={onExit}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-stone-700 hover:bg-stone-600 border border-stone-600 rounded-lg text-slate-300 hover:text-white transition-colors"
      >
        <X size={14} />
        Done
      </button>
    </div>
  );
};

export default OrganizationToolbar;
