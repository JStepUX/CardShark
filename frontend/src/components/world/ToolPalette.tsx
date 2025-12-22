import { useState } from 'react';
import { Edit3, Link2, Trash2, Move, ChevronLeft, ChevronRight } from 'lucide-react';

// Define Tool type - simplified to 4 tools
type Tool = 'edit' | 'move' | 'connection' | 'eraser';

interface ToolPaletteProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const tools: { id: Tool; icon: typeof Edit3; label: string; shortcut: string; description: string }[] = [
  { id: 'edit', icon: Edit3, label: 'Edit', shortcut: 'E', description: 'Select rooms to edit properties' },
  { id: 'move', icon: Move, label: 'Move', shortcut: 'M', description: 'Drag and drop rooms to rearrange' },
  { id: 'connection', icon: Link2, label: 'Connect', shortcut: 'C', description: 'Link rooms together' },
  { id: 'eraser', icon: Trash2, label: 'Delete', shortcut: 'D', description: 'Remove rooms' },
];

export function ToolPalette({ activeTool, onToolChange, isCollapsed = false, onToggleCollapse }: ToolPaletteProps) {
  const [hoveredTool, setHoveredTool] = useState<Tool | null>(null);

  // Collapsed view for small screens
  if (isCollapsed) {
    return (
      <div className="bg-[#141414] border-r border-[#2a2a2a] flex flex-col w-14 transition-all duration-200">
        <div className="p-2 border-b border-[#2a2a2a] flex justify-center">
          <button
            onClick={onToggleCollapse}
            className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
            title="Expand tools"
          >
            <ChevronRight size={16} className="text-gray-400" />
          </button>
        </div>
        <div className="p-2 space-y-1">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;

            return (
              <button
                key={tool.id}
                onClick={() => onToolChange(tool.id)}
                onMouseEnter={() => setHoveredTool(tool.id)}
                onMouseLeave={() => setHoveredTool(null)}
                className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white border border-transparent'
                  }`}
                title={tool.label}
              >
                <Icon size={18} />
                {/* Tooltip */}
                {hoveredTool === tool.id && (
                  <div className="absolute left-12 top-1/2 -translate-y-1/2 z-50 bg-[#2a2a2a] text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {tool.label} ({tool.shortcut})
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div className="w-56 lg:w-64 bg-[#141414] border-r border-[#2a2a2a] flex flex-col transition-all duration-200">
      <div className="p-3 lg:p-4 border-b border-[#2a2a2a] flex items-center justify-between">
        <h3 className="text-sm font-medium">Tools</h3>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-[#2a2a2a] rounded-lg transition-colors lg:hidden"
            title="Collapse tools"
          >
            <ChevronLeft size={14} className="text-gray-400" />
          </button>
        )}
      </div>

      <div className="p-3 lg:p-4 border-b border-[#2a2a2a]">
        <div className="space-y-1">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;

            return (
              <button
                key={tool.id}
                onClick={() => onToolChange(tool.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white border border-transparent'
                  }`}
              >
                <Icon size={18} />
                <div className="flex-1 text-left">
                  <span className="text-sm">{tool.label}</span>
                </div>
                <span className="text-xs text-gray-600">{tool.shortcut}</span>
              </button>
            );
          })}
        </div>

        {/* Active tool description */}
        <div className="mt-3 p-2 bg-[#1a1a1a] rounded-lg">
          <p className="text-xs text-gray-500">
            {tools.find(t => t.id === activeTool)?.description}
          </p>
        </div>
      </div>

      <div className="p-3 lg:p-4 border-b border-[#2a2a2a]">
        <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-3">Templates</h3>
        <div className="space-y-1">
          {['Empty Room', 'Tavern', 'Forest', 'Dungeon', 'Shop'].map((template) => (
            <button
              key={template}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-[#1a1a1a] hover:text-white transition-colors"
            >
              {template}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-3 lg:p-4">
        <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Keyboard Shortcuts</h3>
        <div className="text-xs text-gray-600 space-y-1">
          {tools.map(tool => (
            <div key={tool.id} className="flex justify-between">
              <span>{tool.label}</span>
              <kbd className="px-1.5 py-0.5 bg-[#1a1a1a] rounded text-gray-400">{tool.shortcut}</kbd>
            </div>
          ))}
          <div className="flex justify-between mt-2 pt-2 border-t border-[#2a2a2a]">
            <span>Deselect</span>
            <kbd className="px-1.5 py-0.5 bg-[#1a1a1a] rounded text-gray-400">Esc</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { Tool };
