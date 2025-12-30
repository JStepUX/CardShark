/**
 * Room Editor Component
 * Similar to CharacterInfoView but for room cards
 * @dependencies RichTextEditor, MessagesView, LoreView, roomApi
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Loader2, AlertCircle, Check } from 'lucide-react';
import { RoomCard, UpdateRoomRequest } from '../types/room';
import { roomApi } from '../api/roomApi';
import RichTextEditor from './RichTextEditor';
import MessagesView from './MessagesView';
import LoreView from './LoreView';
import { CharacterCard } from '../types/schema';

interface Message {
  id: string;
  isFirst: boolean;
  content: string;
}

export const RoomEditor: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const roomUuid = uuid || '';

  // Callback for when room is saved (optional)
  const onSaved = undefined;
  const [roomCard, setRoomCard] = useState<RoomCard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'basic' | 'messages' | 'lore'>('basic');

  // Load room card on mount
  useEffect(() => {
    const loadRoom = async () => {
      try {
        setIsLoading(true);
        const card = await roomApi.getRoom(roomUuid);
        setRoomCard(card);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load room');
      } finally {
        setIsLoading(false);
      }
    };

    loadRoom();
  }, [roomUuid]);

  // Track unsaved changes (debounced)
  useEffect(() => {
    if (!roomCard) return;

    const timer = setTimeout(() => {
      setHasUnsavedChanges(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [roomCard]);

  // Field change handler
  const handleFieldChange = useCallback((field: keyof RoomCard['data'], value: string) => {
    setRoomCard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          [field]: value,
        },
      };
    });
  }, []);

  // Lore sync handler
  const handleLoreSync = useCallback((updatedLore: any[]) => {
    setRoomCard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          character_book: {
            ...(prev.data.character_book || {}),
            entries: updatedLore,
            name: prev.data.name + ' Lore',
          },
        },
      };
    });
  }, []);

  // Messages sync handler
  const handleMessagesSync = useCallback((messages: Message[]) => {
    setRoomCard((prev) => {
      if (!prev) return prev;

      const firstMessage = messages.find((m) => m.isFirst);
      const alternateGreetings = messages.filter((m) => !m.isFirst).map((m) => m.content);

      return {
        ...prev,
        data: {
          ...prev.data,
          first_mes: firstMessage?.content,
          alternate_greetings: alternateGreetings.length > 0 ? alternateGreetings : undefined,
        },
      };
    });
  }, []);

  // Save handler
  const handleSave = async () => {
    if (!roomCard) return;

    try {
      setIsSaving(true);
      setSaveStatus('idle');
      setError(null);

      const updateRequest: UpdateRoomRequest = {
        name: roomCard.data.name,
        description: roomCard.data.description,
        first_mes: roomCard.data.first_mes,
        system_prompt: roomCard.data.system_prompt,
        character_book: roomCard.data.character_book,
        tags: roomCard.data.tags,
      };

      await roomApi.updateRoom(roomUuid, updateRequest);

      setSaveStatus('success');
      setHasUnsavedChanges(false);
      onSaved?.();

      // Reset success message after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to save room');
    } finally {
      setIsSaving(false);
    }
  };

  // Convert RoomCard to CharacterCard for MessagesView compatibility
  const characterDataForMessages = useMemo<CharacterCard | null>(() => {
    if (!roomCard) return null;

    return {
      spec: roomCard.spec,
      spec_version: roomCard.spec_version,
      data: {
        ...roomCard.data,
        // Ensure alternate_greetings is an array
        alternate_greetings: roomCard.data.alternate_greetings || [],
      },
    } as unknown as CharacterCard;
  }, [roomCard]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error && !roomCard) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!roomCard) return null;

  return (
    <div className="h-full flex flex-col bg-stone-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-stone-800 border-b border-stone-700">
        <div>
          <h2 className="text-xl font-bold text-white">Room Editor</h2>
          <p className="text-sm text-stone-400">{roomCard.data.name}</p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving || !hasUnsavedChanges}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            hasUnsavedChanges
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-stone-700 text-stone-400 cursor-not-allowed'
          }`}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : saveStatus === 'success' ? (
            <>
              <Check className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-700 bg-stone-800">
        <button
          onClick={() => setActiveTab('basic')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'basic'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-stone-400 hover:text-white'
          }`}
        >
          Basic Info
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'messages'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-stone-400 hover:text-white'
          }`}
        >
          Introduction
        </button>
        <button
          onClick={() => setActiveTab('lore')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'lore'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-stone-400 hover:text-white'
          }`}
        >
          Lore
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'basic' && (
          <div className="max-w-4xl space-y-6">
            {/* Room Name */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">Room Name</label>
              <input
                type="text"
                value={roomCard.data.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tavern Common Room"
              />
            </div>

            {/* Room Description */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">Description</label>
              <RichTextEditor
                content={roomCard.data.description}
                onChange={(html) => handleFieldChange('description', html)}
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
                content={roomCard.data.system_prompt || ''}
                onChange={(html) => handleFieldChange('system_prompt', html)}
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
                value={roomCard.data.tags?.join(', ') || ''}
                onChange={(e) =>
                  handleFieldChange('tags', e.target.value.split(',').map((t) => t.trim()) as any)
                }
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="tavern, safe, social"
              />
            </div>
          </div>
        )}

        {activeTab === 'messages' && characterDataForMessages && (
          <div className="max-w-4xl">
            <p className="text-stone-400 mb-4">
              These are the introduction texts players see when entering this room.
            </p>
            <MessagesView
              characterData={characterDataForMessages}
              setCharacterData={(updater) => {
                if (typeof updater === 'function') {
                  const updated = updater(characterDataForMessages);
                  if (updated) {
                    const messages: Message[] = [
                      { id: '0', isFirst: true, content: updated.data.first_mes || '' },
                      ...(updated.data.alternate_greetings || []).map((msg: string, idx: number) => ({
                        id: String(idx + 1),
                        isFirst: false,
                        content: msg,
                      })),
                    ];
                    handleMessagesSync(messages);
                  }
                }
              }}
            />
          </div>
        )}

        {activeTab === 'lore' && characterDataForMessages && (
          <div className="max-w-6xl">
            <p className="text-stone-400 mb-4">
              Lore entries provide context-specific knowledge about this room.
            </p>
            <LoreView
              characterData={characterDataForMessages}
              setCharacterData={(updater) => {
                if (typeof updater === 'function') {
                  const updated = updater(characterDataForMessages);
                  if (updated && updated.data.character_book) {
                    handleLoreSync(updated.data.character_book.entries || []);
                  }
                }
              }}
            />
          </div>
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
};

export default RoomEditor;
