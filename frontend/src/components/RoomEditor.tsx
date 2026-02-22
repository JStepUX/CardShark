/**
 * Room Editor Component
 * Uses RoomContext for state management and RoomAsCharacterContext
 * to enable reuse of MessagesView and LoreView components.
 * @dependencies RichTextEditor, roomApi, NPCAssignment, RoomContext, MessagesView, LoreView
 */
import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2, AlertCircle, Check } from 'lucide-react';
import { RoomNPC } from '../types/room';
import RichTextEditor from './RichTextEditor';
import NPCAssignment from './NPCAssignment';
import { RoomProvider, useRoom } from '../contexts/RoomContext';
import { RoomAsCharacterProvider } from '../contexts/RoomAsCharacterContext';
import MessagesView from './MessagesView';
import LoreView from './LoreView';
import { htmlToPlainText } from '../utils/contentUtils';
import Button from './common/Button';


/**
 * Inner component that consumes RoomContext
 */
function RoomEditorContent() {
  const {
    roomData,
    setRoomData,
    isLoading,
    error,
    isSaving,
    saveRoom,
    hasUnsavedChanges,
    saveStatus,
  } = useRoom();

  // Tab state
  const [activeTab, setActiveTab] = useState<'basic' | 'messages' | 'lore'>('basic');

  // Field change handler
  const handleFieldChange = useCallback((field: string, value: string | string[]) => {
    setRoomData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          [field]: value,
        },
      };
    });
  }, [setRoomData]);

  // NPC sync handler
  const handleNPCsSync = useCallback((npcs: RoomNPC[]) => {
    setRoomData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          extensions: {
            ...prev.data.extensions,
            room_data: {
              ...prev.data.extensions.room_data,
              npcs,
            },
          },
        },
      };
    });
  }, [setRoomData]);

  // Save handler
  const handleSave = async () => {
    await saveRoom();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error && !roomData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!roomData) return null;

  return (
    <div className="h-full flex flex-col bg-stone-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-stone-800 border-b border-stone-700">
        <div>
          <h2 className="text-xl font-bold text-white">Room Editor</h2>
          <p className="text-sm text-stone-400">{roomData.data.name}</p>
        </div>

        <Button
          variant={hasUnsavedChanges ? 'primary' : 'secondary'}
          size="lg"
          icon={
            isSaving ? <Loader2 className="w-4 h-4 animate-spin" />
            : saveStatus === 'success' ? <Check className="w-4 h-4" />
            : <Save className="w-4 h-4" />
          }
          onClick={handleSave}
          disabled={isSaving || !hasUnsavedChanges}
        >
          {isSaving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-700 bg-stone-800">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setActiveTab('basic')}
          className={`font-medium rounded-none ${activeTab === 'basic'
            ? 'text-blue-400 border-b-2 border-blue-400'
            : 'text-stone-400 hover:text-white'
            }`}
        >
          Basic Info
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setActiveTab('messages')}
          className={`font-medium rounded-none ${activeTab === 'messages'
            ? 'text-blue-400 border-b-2 border-blue-400'
            : 'text-stone-400 hover:text-white'
            }`}
        >
          Introduction
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setActiveTab('lore')}
          className={`font-medium rounded-none ${activeTab === 'lore'
            ? 'text-blue-400 border-b-2 border-blue-400'
            : 'text-stone-400 hover:text-white'
            }`}
        >
          Lore
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'basic' && (
          <div className="p-6 max-w-4xl space-y-6">
            {/* Room Name */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">Room Name</label>
              <input
                type="text"
                value={roomData.data.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tavern Common Room"
              />
            </div>

            {/* Room Description */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">Description</label>
              <RichTextEditor
                content={roomData.data.description}
                onChange={(html) => handleFieldChange('description', htmlToPlainText(html))}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg h-48"
                placeholder="Describe this room..."
                preserveWhitespace={true}
              />
            </div>

            {/* System Prompt (Room Atmosphere) */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Room Atmosphere / System Prompt
              </label>
              <RichTextEditor
                content={roomData.data.system_prompt || ''}
                onChange={(html) => handleFieldChange('system_prompt', htmlToPlainText(html))}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg h-32"
                placeholder="This is a cozy tavern where adventurers gather..."
                preserveWhitespace={true}
              />
              <p className="text-xs text-stone-500 mt-1">
                Sets the mood and context for AI-generated content in this room
              </p>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={roomData.data.tags?.join(', ') || ''}
                onChange={(e) =>
                  handleFieldChange('tags', e.target.value.split(',').map((t) => t.trim()))
                }
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="tavern, safe, social"
              />
            </div>

            {/* NPCs */}
            <div>
              <NPCAssignment
                npcs={roomData.data.extensions.room_data.npcs}
                onChange={handleNPCsSync}
              />
            </div>
          </div>
        )}

        {activeTab === 'messages' && (
          <RoomAsCharacterProvider>
            <MessagesView />
          </RoomAsCharacterProvider>
        )}

        {activeTab === 'lore' && (
          <RoomAsCharacterProvider>
            <LoreView />
          </RoomAsCharacterProvider>
        )}
      </div>

      {/* Error banner */}
      {saveStatus === 'error' && error && (
        <div className="bg-red-900/50 border-t border-red-700 p-4">
          <p className="text-red-200 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        </div>
      )}
    </div>
  );
}


/**
 * Main RoomEditor component - wraps content in RoomProvider
 */
export const RoomEditor: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const roomUuid = uuid || '';

  return (
    <RoomProvider roomUuid={roomUuid}>
      <RoomEditorContent />
    </RoomProvider>
  );
};

export default RoomEditor;
