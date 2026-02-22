/**
 * @file ChatHeader.tsx
 * @description Header component for the chat view containing controls and character name.
 * @dependencies lucide-react
 * @consumers ChatView.tsx
 */
import React from 'react';
import { Eye, Wallpaper, MessageSquare, Plus, SlidersHorizontal } from 'lucide-react';
import Button from '../common/Button';
// CharacterCard import removed

interface ChatHeaderProps {
  characterName: string;
  onShowContextWindow: () => void;
  onShowBackgroundSettings: () => void;
  onShowChatSelector: () => void;
  onNewChat: () => void;
  onToggleSamplerPanel?: () => void;
  isSamplerPanelActive?: boolean;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  characterName,
  onShowContextWindow,
  onShowBackgroundSettings,
  onShowChatSelector,
  onNewChat,
  onToggleSamplerPanel,
  isSamplerPanelActive,
}) => {
  return (
    <div className="flex-none p-4 border-b border-stone-800 relative z-10 flex justify-between items-center">
      <h2 className="text-xl font-semibold">{characterName}</h2>
      <div className="flex items-center gap-2">
        {/* Reasoning Toggle - HIDDEN: Not supporting thinking models yet */}
        {/* <label className="flex items-center gap-2 cursor-pointer">
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
        )} */}
        {/* End Reasoning Toggle */}
        {onToggleSamplerPanel && (
          <Button
            variant="toolbar"
            size="md"
            icon={<SlidersHorizontal size={18} />}
            active={isSamplerPanelActive}
            onClick={onToggleSamplerPanel}
            title="Generation Settings"
          />
        )}
        <Button
          variant="ghost"
          size="md"
          icon={<Eye size={18} />}
          onClick={onShowContextWindow}
          title="View Context Window"
        />
        <Button
          variant="ghost"
          size="md"
          icon={<Wallpaper size={18} />}
          onClick={onShowBackgroundSettings}
          title="Background Settings"
        />
        <Button
          variant="ghost"
          size="md"
          icon={<MessageSquare size={18} />}
          onClick={onShowChatSelector}
          title="Select Chat"
        />
        <Button
          variant="ghost"
          size="md"
          icon={<Plus size={18} />}
          onClick={onNewChat}
          title="New Chat"
        />
      </div>
    </div>
  );
};

export default ChatHeader;
