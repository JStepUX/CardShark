/**
 * @file OrganizationToolbar.tsx
 * @description Sticky toolbar shown when organization mode is active in the gallery.
 */
import React, { useState, useRef, useEffect } from 'react';
import { CheckSquare, Square, FolderInput, X, ChevronDown } from 'lucide-react';
import { FolderDefinition } from '../../types/gallery';
import Button from '../common/Button';

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
      <Button
        variant="ghost"
        size="sm"
        onClick={onSelectAll}
      >
        Select All
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDeselectAll}
        disabled={selectedCount === 0}
      >
        Deselect
      </Button>

      <div className="h-4 w-px bg-stone-600" />

      {/* Move to dropdown */}
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMoveDropdownOpen(!isMoveDropdownOpen)}
          disabled={selectedCount === 0}
          icon={<FolderInput size={14} />}
        >
          Move to <ChevronDown size={12} />
        </Button>

        {isMoveDropdownOpen && (
          <div className="absolute left-0 mt-1 w-48 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="py-1">
              {/* Unfiled option */}
              {currentFolder !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    onMoveToFolder(null);
                    setIsMoveDropdownOpen(false);
                  }}
                  icon={<span className="text-slate-500">--</span>}
                  className="justify-start px-4"
                >
                  Unfiled
                </Button>
              )}
              {/* Folder options (exclude current) */}
              {folders
                .filter(f => f.name !== currentFolder)
                .map(folder => (
                  <Button
                    key={folder.id}
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      onMoveToFolder(folder.name);
                      setIsMoveDropdownOpen(false);
                    }}
                    icon={<FolderInput size={14} className="text-slate-500" />}
                    className="justify-start px-4"
                  >
                    {folder.name}
                  </Button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-grow" />

      {/* Exit org mode */}
      <Button
        variant="outline"
        size="sm"
        icon={<X size={14} />}
        onClick={onExit}
      >
        Done
      </Button>
    </div>
  );
};

export default OrganizationToolbar;
