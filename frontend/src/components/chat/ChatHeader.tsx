/**
 * @file ChatHeader.tsx
 * @description Header component for the chat view containing controls and character name.
 * @dependencies lucide-react
 * @consumers ChatView.tsx
 */
import React from 'react';
import { Eye, Wallpaper, MessageSquare, Plus } from 'lucide-react';
// CharacterCard import removed

interface ReasoningSettings {
  enabled: boolean;
  visible: boolean;
}

interface ChatHeaderProps {
  characterName: string;
  reasoningSettings: ReasoningSettings;
  onReasoningSettingsChange: (settings: ReasoningSettings) => void;
  onShowContextWindow: () => void;
  onShowBackgroundSettings: () => void;
  onShowChatSelector: () => void;
  onNewChat: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  characterName,
  reasoningSettings,
  onReasoningSettingsChange,
  onShowContextWindow,
  onShowBackgroundSettings,
  onShowChatSelector,
  onNewChat,
}) => {
  return (
    <div className="flex-none p-4 border-b border-stone-800 relative z-10 flex justify-between items-center">
      <h2 className="text-xl font-semibold">{characterName}</h2>
      <div className="flex items-center gap-2">
        {/* Reasoning Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={reasoningSettings.enabled}
            onChange={(e) => {
              onReasoningSettingsChange({ ...reasoningSettings, enabled: e.target.checked });
            }}
            className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-xs text-gray-300">Show Reasoning</span>
        </label>
        {reasoningSettings.enabled && (
          <label className="flex items-center gap-2 cursor-pointer ml-4">
            <input
              type="checkbox"
              checked={reasoningSettings.visible}
              onChange={(e) => {
                onReasoningSettingsChange({ ...reasoningSettings, visible: e.target.checked });
              }}
              className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-xs text-gray-300">Visible</span>
          </label>
        )}
        {/* End Reasoning Toggle */}
        <button onClick={onShowContextWindow} className="p-1 text-gray-400 hover:text-white" title="View Context Window">
          <Eye size={18} />
        </button>
        <button onClick={onShowBackgroundSettings} className="p-1 text-gray-400 hover:text-white" title="Background Settings">
          <Wallpaper size={18} />
        </button>
        <button onClick={onShowChatSelector} className="p-1 text-gray-400 hover:text-white" title="Select Chat">
          <MessageSquare size={18} />
        </button>
        <button onClick={onNewChat} className="p-1 text-gray-400 hover:text-white" title="New Chat">
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
