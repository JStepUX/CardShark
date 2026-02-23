/**
 * @file ChatHeader.tsx
 * @description Header component for the chat view containing controls and an inline-editable session name.
 * @dependencies lucide-react
 * @consumers ChatView.tsx
 */
import React, { useState, useEffect, useRef } from 'react';
import { Eye, Wallpaper, MessageSquare, Plus, SlidersHorizontal, Pencil, PanelRight } from 'lucide-react';
import Button from '../common/Button';

interface ChatHeaderProps {
  characterName: string;
  sessionName: string;
  setSessionName: (name: string) => void;
  saveSessionNameNow: (nameOverride?: string) => Promise<void>;
  mode: 'character' | 'assistant' | 'world';
  onShowContextWindow: () => void;
  onShowBackgroundSettings: () => void;
  onShowChatSelector: () => void;
  onNewChat: () => void;
  onToggleSamplerPanel?: () => void;
  isSamplerPanelActive?: boolean;
  onToggleSidePanel?: () => void;
  isSidePanelExpanded?: boolean;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  characterName,
  sessionName,
  setSessionName,
  saveSessionNameNow,
  mode,
  onShowContextWindow,
  onShowBackgroundSettings,
  onShowChatSelector,
  onNewChat,
  onToggleSamplerPanel,
  isSamplerPanelActive,
  onToggleSidePanel,
  isSidePanelExpanded,
}) => {
  const [localName, setLocalName] = useState(sessionName);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync local state when sessionName changes externally (new chat loaded, etc.)
  useEffect(() => {
    setLocalName(sessionName);
  }, [sessionName]);

  const placeholder =
    mode === 'character' ? `Chat with ${characterName}` :
    mode === 'assistant' ? 'Session' :
    'Untitled Chat';

  const handleSave = async () => {
    if (localName === sessionName) return;
    setSessionName(localName);
    try {
      await saveSessionNameNow(localName);
      window.dispatchEvent(new Event('sessionNameUpdated'));
    } catch (error) {
      console.error('Failed to save session name:', error);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    handleSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      setLocalName(sessionName); // revert
      inputRef.current?.blur();
    }
  };

  return (
    <div className="flex-none p-4 border-b border-stone-800 relative z-10 flex justify-between items-center">
      {/* Editable session name */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-4">
        <input
          ref={inputRef}
          type="text"
          value={localName || ''}
          onChange={(e) => setLocalName(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="bg-transparent text-white text-lg font-semibold outline-none border border-transparent focus:border-stone-600 focus:ring-1 focus:ring-stone-600 rounded px-2 py-0.5 truncate min-w-0 flex-1 placeholder:text-stone-500"
          title="Click to rename this chat"
        />
        {!isFocused && (
          <Pencil
            size={14}
            className="text-stone-500 flex-shrink-0 cursor-pointer"
            onClick={() => inputRef.current?.focus()}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
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

        {/* Separator between chat tools and panel tools */}
        {(onToggleSamplerPanel || onToggleSidePanel) && (
          <div className="w-px h-5 bg-stone-700" />
        )}

        {onToggleSamplerPanel && (
          <Button
            variant="ghost"
            size="md"
            icon={<SlidersHorizontal size={18} />}
            onClick={onToggleSamplerPanel}
            className={isSamplerPanelActive ? 'bg-stone-700 text-white' : ''}
            title="Generation Settings"
          />
        )}
        {onToggleSidePanel && (
          <Button
            variant="ghost"
            size="md"
            icon={<PanelRight size={18} />}
            onClick={onToggleSidePanel}
            className={isSidePanelExpanded ? 'bg-stone-700 text-white' : ''}
            title={isSidePanelExpanded ? "Hide Side Panel" : "Show Side Panel"}
          />
        )}
      </div>
    </div>
  );
};

export default ChatHeader;
