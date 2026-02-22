// frontend/src/components/world/EditorToolbar.tsx
// Mode-adaptive toolbar: world tools (Edit/Move/Delete) or room tools (NPC/Tile/Eraser) + zoom.

import { useState, useRef, useEffect } from 'react';
import { Edit3, Move, Trash2, Hand, Users, Paintbrush, Eraser, ZoomIn, ZoomOut, ChevronDown, Droplets, Square, AlertTriangle, Ban } from 'lucide-react';
import type { Tool } from './WorldGridView';
import type { RoomEditorTool } from '../../types/editorGrid';
import type { ZoneType } from '../../types/localMap';
import { ZONE_TYPE_CONFIG } from '../../types/editorGrid';
import type { GridViewportState, GridViewportHandlers } from '../../hooks/useGridViewport';
import Button from '../common/Button';

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
                            <Button
                                key={tool.id}
                                variant="toolbar"
                                active={isActive}
                                size="sm"
                                icon={<Icon size={16} />}
                                onClick={() => onToolChange(tool.id)}
                                title={`${tool.label} (${tool.shortcut})`}
                            >
                                <span className="hidden sm:inline">{tool.label}</span>
                            </Button>
                        );
                    })
                ) : (
                    // Room tools
                    <>
                        {/* Pan */}
                        <Button
                            variant="toolbar"
                            active={activeRoomTool === 'pan'}
                            size="sm"
                            icon={<Hand size={16} />}
                            onClick={() => onRoomToolChange('pan')}
                            title="Pan (Esc)"
                        >
                            <span className="hidden sm:inline">Pan</span>
                        </Button>

                        {/* NPC Place */}
                        <Button
                            variant="toolbar"
                            active={activeRoomTool === 'npc-place'}
                            size="sm"
                            icon={<Users size={16} />}
                            onClick={() => onRoomToolChange('npc-place')}
                            title="NPC Place"
                        >
                            <span className="hidden sm:inline">NPC</span>
                        </Button>

                        {/* Tile Painter with dropdown */}
                        <div className="relative" ref={dropdownRef}>
                            <Button
                                variant="toolbar"
                                active={activeRoomTool === 'tile-paint'}
                                size="sm"
                                icon={<Paintbrush size={16} />}
                                onClick={() => {
                                    onRoomToolChange('tile-paint');
                                    setShowZoneDropdown(prev => !prev);
                                }}
                                title="Tile Painter"
                            >
                                <span className="hidden sm:inline">
                                    {selectedZoneConfig?.label || 'Tile'}
                                </span>
                                <ChevronDown size={12} />
                            </Button>

                            {showZoneDropdown && (
                                <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 min-w-[180px]">
                                    {ZONE_TYPE_CONFIG.map(zone => {
                                        const Icon = ZONE_ICON_MAP[zone.iconName] || Square;
                                        const isSelected = selectedZoneType === zone.type;
                                        return (
                                            <Button
                                                key={zone.type}
                                                variant="toolbar"
                                                active={isSelected}
                                                size="sm"
                                                fullWidth
                                                onClick={() => {
                                                    onZoneTypeChange(zone.type);
                                                    onRoomToolChange('tile-paint');
                                                    setShowZoneDropdown(false);
                                                }}
                                                title={zone.description}
                                            >
                                                <div className={`w-3 h-3 rounded ${zone.colorClass}`} />
                                                <Icon size={14} />
                                                <span>{zone.label}</span>
                                            </Button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Eraser */}
                        <Button
                            variant="toolbar"
                            active={activeRoomTool === 'eraser'}
                            size="sm"
                            icon={<Eraser size={16} />}
                            onClick={() => onRoomToolChange('eraser')}
                            title="Eraser"
                        >
                            <span className="hidden sm:inline">Erase</span>
                        </Button>
                    </>
                )}
            </div>

            {/* Right side: Zoom controls */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 hidden sm:inline">
                    Zoom: {Math.round(viewport.zoom * 100)}%
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    icon={<ZoomOut size={16} />}
                    onClick={viewportHandlers.zoomOut}
                    title="Zoom Out"
                />
                <Button
                    variant="ghost"
                    size="sm"
                    icon={<ZoomIn size={16} />}
                    onClick={viewportHandlers.zoomIn}
                    title="Zoom In"
                />
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={viewportHandlers.resetView}
                >
                    Reset View
                </Button>
            </div>
        </div>
    );
}
