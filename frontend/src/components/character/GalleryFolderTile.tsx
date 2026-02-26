/**
 * @file GalleryFolderTile.tsx
 * @description Folder tile component for the gallery. Same 3/5 aspect ratio as character cards.
 */
import React, { useState, useRef } from 'react';
import { Folder, Users, Map as MapIcon, DoorOpen, Swords, Plus, Trash2, Loader2 } from 'lucide-react';
import { FolderDefinition, DEFAULT_FOLDER_IDS } from '../../types/gallery';

interface GalleryFolderTileProps {
  folder: FolderDefinition;
  cardCount: number;
  onClick: () => void;
  onDelete?: () => void;
  organizationMode?: boolean;
  onDrop?: (e: React.DragEvent) => void;
}

const FOLDER_ICON_MAP: Record<string, React.ReactNode> = {
  [DEFAULT_FOLDER_IDS.CHARACTERS]: <Users size={32} />,
  [DEFAULT_FOLDER_IDS.WORLDS]: <MapIcon size={32} />,
  [DEFAULT_FOLDER_IDS.ROOMS]: <DoorOpen size={32} />,
  [DEFAULT_FOLDER_IDS.NPCS]: <Swords size={32} />,
};

const COLOR_MAP: Record<string, { border: string; bg: string; text: string; glow: string; badge: string }> = {
  stone: { border: 'border-stone-600', bg: 'bg-stone-700/30', text: 'text-stone-300', glow: 'hover:shadow-stone-500/20', badge: 'bg-stone-600' },
  emerald: { border: 'border-emerald-600/50', bg: 'bg-emerald-900/20', text: 'text-emerald-300', glow: 'hover:shadow-emerald-500/20', badge: 'bg-emerald-600' },
  purple: { border: 'border-purple-600/50', bg: 'bg-purple-900/20', text: 'text-purple-300', glow: 'hover:shadow-purple-500/20', badge: 'bg-purple-600' },
  blue: { border: 'border-blue-600/50', bg: 'bg-blue-900/20', text: 'text-blue-300', glow: 'hover:shadow-blue-500/20', badge: 'bg-blue-600' },
  amber: { border: 'border-amber-600/50', bg: 'bg-amber-900/20', text: 'text-amber-300', glow: 'hover:shadow-amber-500/20', badge: 'bg-amber-600' },
  rose: { border: 'border-rose-600/50', bg: 'bg-rose-900/20', text: 'text-rose-300', glow: 'hover:shadow-rose-500/20', badge: 'bg-rose-600' },
};

export const GalleryFolderTile: React.FC<GalleryFolderTileProps> = React.memo(({
  folder,
  cardCount,
  onClick,
  onDelete,
  organizationMode = false,
  onDrop,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const colors = COLOR_MAP[folder.color] || COLOR_MAP.blue;
  const folderIcon = FOLDER_ICON_MAP[folder.id] || <Folder size={32} />;

  const handleDragOver = (e: React.DragEvent) => {
    if (!organizationMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!organizationMode) return;
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    onDrop?.(e);
  };

  return (
    <button
      onClick={onClick}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative group flex flex-col items-center justify-center gap-3
        rounded-lg overflow-hidden shadow-lg aspect-[3/5]
        border-2 transition-all duration-300
        ${colors.bg} ${colors.border} ${colors.glow}
        hover:scale-[1.05] hover:shadow-xl
        ${isDragOver ? 'ring-2 ring-blue-400 animate-pulse border-blue-400' : ''}
      `}
    >
      {/* Delete button for non-default folders */}
      {!folder.isDefault && onDelete && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 z-10 p-1.5 bg-black/50 text-white rounded-full
                     opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 cursor-pointer"
        >
          <Trash2 size={14} />
        </div>
      )}

      {/* Folder Icon */}
      <div className={`${colors.text} transition-transform duration-300 group-hover:scale-110`}>
        {folderIcon}
      </div>

      {/* Folder Name */}
      <span className="text-sm font-semibold text-slate-200 group-hover:text-white truncate w-full text-center px-2">
        {folder.name}
      </span>

      {/* Card Count Badge */}
      <span className={`absolute bottom-3 right-3 text-[10px] font-bold text-white ${colors.badge} px-2 py-0.5 rounded-full shadow-sm`}>
        {cardCount}
      </span>

      {/* Drag-over overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
          <span className="text-xs font-bold text-blue-200">Drop here</span>
        </div>
      )}
    </button>
  );
});

interface NewFolderTileProps {
  onClick: () => void;
}

export const NewFolderTile: React.FC<NewFolderTileProps> = React.memo(({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="
        flex flex-col items-center justify-center gap-3
        rounded-lg overflow-hidden shadow-lg aspect-[3/5]
        border-2 border-dashed border-stone-600 bg-stone-800/30
        transition-all duration-300
        hover:scale-[1.05] hover:border-blue-500/50 hover:bg-stone-800/50 hover:shadow-xl
      "
    >
      <Plus size={32} className="text-stone-500 group-hover:text-blue-400 transition-colors" />
      <span className="text-sm font-medium text-stone-500">New Folder</span>
    </button>
  );
});

interface NewCardTileProps {
  label: string;
  onClick: () => void;
  color?: string;
  isCreating?: boolean;
}

const CARD_COLOR_MAP: Record<string, { border: string; borderHover: string; bg: string; bgHover: string; text: string; icon: string }> = {
  stone: {
    border: 'border-stone-600',
    borderHover: 'hover:border-stone-400',
    bg: 'bg-stone-800/30',
    bgHover: 'hover:bg-stone-800/50',
    text: 'text-stone-400',
    icon: 'text-stone-500',
  },
  emerald: {
    border: 'border-emerald-700/50',
    borderHover: 'hover:border-emerald-500/60',
    bg: 'bg-emerald-900/20',
    bgHover: 'hover:bg-emerald-900/30',
    text: 'text-emerald-400',
    icon: 'text-emerald-500',
  },
};

export const NewCardTile: React.FC<NewCardTileProps> = React.memo(({ label, onClick, color = 'stone', isCreating = false }) => {
  const colors = CARD_COLOR_MAP[color] || CARD_COLOR_MAP.stone;

  return (
    <button
      onClick={onClick}
      disabled={isCreating}
      className={`
        flex flex-col items-center justify-center gap-3
        rounded-lg overflow-hidden shadow-lg aspect-[3/5]
        border-2 border-dashed transition-all duration-300
        ${colors.border} ${colors.bg}
        ${isCreating ? 'opacity-60 cursor-wait' : `${colors.borderHover} ${colors.bgHover} hover:scale-[1.05] hover:shadow-xl`}
      `}
    >
      {isCreating ? (
        <Loader2 size={32} className={`${colors.icon} animate-spin`} />
      ) : (
        <Plus size={32} className={colors.icon} />
      )}
      <span className={`text-sm font-medium ${colors.text}`}>{label}</span>
    </button>
  );
});
