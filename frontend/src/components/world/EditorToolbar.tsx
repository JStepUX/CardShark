// frontend/src/components/world/EditorToolbar.tsx
// Mode-adaptive toolbar: world tools (Edit/Move/Delete) or room tools (NPC/Tile/Eraser) + zoom.

import { useState, useRef, useEffect } from 'react';
import { Edit3, Move, Trash2, Hand, Users, Paintbrush, Eraser, ZoomIn, ZoomOut, ChevronDown, Droplets, Square, AlertTriangle, Ban } from 'lucide-react';
import type { Tool } from './WorldGridView';
import type { RoomEditorTool } from '../../types/editorGrid';
import type { ZoneType } from '../../types/localMap';
import { ZONE_TYPE_CONFIG } from '../../types/editorGrid';
import type { GridViewportState, GridViewportHandlers } from '../../hooks/useGridViewport';

// Icon map for zone types
const ZONE_ICON_MAP: Record<string, typeof Droplets> = {
    Droplets, Square, AlertTriangle, Ban,
};

interface EditorToolbarProps {
    editorView: 'world' | 'room';
    // World mode
    activeTool: Tool;
    onToolChange: (tool: Tool) => void;
    // Room mode
    activeRoomTool: RoomEditorTool;
    onRoomToolChange: (tool: RoomEditorTool) => void;
    selectedZoneType: ZoneType;
    onZoneTypeChange: (type: ZoneType) => void;
    // Viewport
    viewport: GridViewportState;
    viewportHandlers: GridViewportHandlers;
}

const worldTools: { id: Tool; icon: typeof Edit3; label: string; shortcut: string }[] = [
    { id: 'edit', icon: Edit3, label: 'Edit', shortcut: 'E' },
    { id: 'move', icon: Move, label: 'Move', shortcut: 'M' },
    { id: 'eraser', icon: Trash2, label: 'Delete', shortcut: 'D' },
];

export function EditorToolbar({
    editorView,
    activeTool,
    onToolChange,
    activeRoomTool,
    onRoomToolChange,
    selectedZoneType,
    onZoneTypeChange,
    viewport,
    viewportHandlers,
}: EditorToolbarProps) {
    const [showZoneDropdown, setShowZoneDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowZoneDropdown(false);
            }
        };
        if (showZoneDropdown) {
            document.addEventListener('mousedown', handleClick);
            return () => document.removeEventListener('mousedown', handleClick);
        }
    }, [showZoneDropdown]);

    const selectedZoneConfig = ZONE_TYPE_CONFIG.find(z => z.type === selectedZoneType);

    return (
        <div className="bg-[#141414] border-b border-[#2a2a2a] px-4 py-2 flex items-center justify-between">
            {/* Left side: Tool buttons */}
            <div className="flex items-center gap-1">
                {editorView === 'world' ? (
                    // World tools
                    worldTools.map((tool) => {
                        const Icon = tool.icon;
                        const isActive = activeTool === tool.id;
                        return (
                            <button
                                key={tool.id}
                                onClick={() => onToolChange(tool.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm ${
                                    isActive
                                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                        : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white border border-transparent'
                                }`}
                                title={`${tool.label} (${tool.shortcut})`}
                            >
                                <Icon size={16} />
                                <span className="hidden sm:inline">{tool.label}</span>
                            </button>
                        );
                    })
                ) : (
                    // Room tools
                    <>
                        {/* Pan */}
                        <button
                            onClick={() => onRoomToolChange('pan')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm ${
                                activeRoomTool === 'pan'
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                    : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white border border-transparent'
                            }`}
                            title="Pan (Esc)"
                        >
                            <Hand size={16} />
                            <span className="hidden sm:inline">Pan</span>
                        </button>

                        {/* NPC Place */}
                        <button
                            onClick={() => onRoomToolChange('npc-place')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm ${
                                activeRoomTool === 'npc-place'
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                    : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white border border-transparent'
                            }`}
                            title="NPC Place"
                        >
                            <Users size={16} />
                            <span className="hidden sm:inline">NPC</span>
                        </button>

                        {/* Tile Painter with dropdown */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => {
                                    onRoomToolChange('tile-paint');
                                    setShowZoneDropdown(prev => !prev);
                                }}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm ${
                                    activeRoomTool === 'tile-paint'
                                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                        : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white border border-transparent'
                                }`}
                                title="Tile Painter"
                            >
                                <Paintbrush size={16} />
                                <span className="hidden sm:inline">
                                    {selectedZoneConfig?.label || 'Tile'}
                                </span>
                                <ChevronDown size={12} />
                            </button>

                            {showZoneDropdown && (
                                <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 min-w-[180px]">
                                    {ZONE_TYPE_CONFIG.map(zone => {
                                        const Icon = ZONE_ICON_MAP[zone.iconName] || Square;
                                        const isSelected = selectedZoneType === zone.type;
                                        return (
                                            <button
                                                key={zone.type}
                                                onClick={() => {
                                                    onZoneTypeChange(zone.type);
                                                    onRoomToolChange('tile-paint');
                                                    setShowZoneDropdown(false);
                                                }}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                                                    isSelected
                                                        ? 'bg-[#2a2a2a] text-white'
                                                        : 'text-gray-400 hover:bg-[#222] hover:text-white'
                                                }`}
                                                title={zone.description}
                                            >
                                                <div className={`w-3 h-3 rounded ${zone.colorClass}`} />
                                                <Icon size={14} />
                                                <span>{zone.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Eraser */}
                        <button
                            onClick={() => onRoomToolChange('eraser')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm ${
                                activeRoomTool === 'eraser'
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                    : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white border border-transparent'
                            }`}
                            title="Eraser"
                        >
                            <Eraser size={16} />
                            <span className="hidden sm:inline">Erase</span>
                        </button>
                    </>
                )}
            </div>

            {/* Right side: Zoom controls */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 hidden sm:inline">
                    Zoom: {Math.round(viewport.zoom * 100)}%
                </span>
                <button
                    onClick={viewportHandlers.zoomOut}
                    className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
                    title="Zoom Out"
                >
                    <ZoomOut size={16} className="text-gray-400" />
                </button>
                <button
                    onClick={viewportHandlers.zoomIn}
                    className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
                    title="Zoom In"
                >
                    <ZoomIn size={16} className="text-gray-400" />
                </button>
                <button
                    onClick={viewportHandlers.resetView}
                    className="px-3 py-1.5 text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition-colors"
                >
                    Reset View
                </button>
            </div>
        </div>
    );
}
