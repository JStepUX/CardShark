import { X, Plus, Image as ImageIcon, Users, Upload, Maximize2, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { GridRoom } from '../../utils/worldStateApi';
import { RoomNPC } from '../../types/room';
import { NPCSettingsModal } from '../NPCSettingsModal';
import { RoomImageGalleryModal } from './RoomImageGalleryModal';

// Simple Modal for full content editing
function TextEditorModal({
  title,
  value,
  onSave,
  onClose
}: {
  title: string;
  value: string;
  onSave: (val: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 p-4 min-h-[300px]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-full min-h-[400px] bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 text-white font-mono text-sm focus:outline-none focus:border-purple-500 resize-none"
            placeholder={`Enter ${title.toLowerCase()}...`}
            autoFocus
          />
        </div>
        <div className="p-4 border-t border-[#2a2a2a] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 hover:bg-[#2a2a2a] rounded-lg text-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(text); onClose(); }}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}

interface RoomPropertiesPanelProps {
  room: GridRoom | null;
  worldId: string;
  availableCharacters: any[];
  onUpdate: (room: GridRoom) => void;
  onClose: () => void;
  onOpenNPCPicker?: () => void;
  onRemoveFromCell?: () => void;
  isVisible?: boolean;
}

export function RoomPropertiesPanel({ room, worldId, availableCharacters, onUpdate, onClose, onOpenNPCPicker, onRemoveFromCell, isVisible = true }: RoomPropertiesPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [editingField, setEditingField] = useState<{
    field: 'description' | 'introduction_text';
    title: string;
    value: string;
  } | null>(null);
  const [editingNPC, setEditingNPC] = useState<RoomNPC | null>(null);
  const [showGalleryModal, setShowGalleryModal] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!room || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const response = await fetch(`/api/world-assets/${worldId}`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      if (data.success && data.data) {
        onUpdate({ ...room, image_path: data.data.path });
      }
    } catch (error) {
      console.error('Error uploading room image:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const getNpcName = (character_uuid: string) => {
    const char = availableCharacters.find((c: any) => c.id === character_uuid);
    return char ? char.name : character_uuid;
  };
  const handleRemoveNPC = (character_uuid: string) => {
    if (!room) return;
    onUpdate({
      ...room,
      npcs: room.npcs.filter(npc => npc.character_uuid !== character_uuid),
    });
  };

  const handleNPCSettingsSave = (updatedNpc: RoomNPC) => {
    if (!room) return;
    onUpdate({
      ...room,
      npcs: room.npcs.map(npc =>
        npc.character_uuid === updatedNpc.character_uuid ? updatedNpc : npc
      ),
    });
  };

  const handleSelectGalleryImage = async (galleryUrl: string) => {
    if (!room) return;

    try {
      setUploading(true);

      // Fetch the gallery image
      const response = await fetch(galleryUrl);
      if (!response.ok) throw new Error('Failed to fetch gallery image');

      const blob = await response.blob();

      // Convert to File and upload to world assets
      const filename = galleryUrl.split('/').pop() || 'gallery_image.png';
      const file = new File([blob], filename, { type: blob.type });

      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(`/api/world-assets/${worldId}`, {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) throw new Error('Upload failed');

      const data = await uploadResponse.json();
      if (data.success && data.data) {
        onUpdate({ ...room, image_path: data.data.path });
      }
    } catch (error) {
      console.error('Error setting gallery image:', error);
      alert('Failed to set gallery image');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadCustom = () => {
    // Trigger existing file input
    const input = document.getElementById('room-image-upload') as HTMLInputElement;
    if (input) input.click();
  };

  // Overlay panel - slides in from right
  return (
    <>
      {/* Modal for Full Text Editing */}
      {editingField && (
        <TextEditorModal
          title={editingField.title}
          value={editingField.value}
          onSave={(newValue) => {
            if (room) {
              onUpdate({ ...room, [editingField.field]: newValue });
            }
          }}
          onClose={() => setEditingField(null)}
        />
      )}

      {/* Modal for NPC Settings */}
      {editingNPC && (
        <NPCSettingsModal
          isOpen={true}
          onClose={() => setEditingNPC(null)}
          npc={editingNPC}
          npcName={getNpcName(editingNPC.character_uuid)}
          onSave={handleNPCSettingsSave}
        />
      )}

      {/* Gallery Modal */}
      <RoomImageGalleryModal
        isOpen={showGalleryModal}
        onClose={() => setShowGalleryModal(false)}
        onSelectGalleryImage={handleSelectGalleryImage}
        onUploadCustom={handleUploadCustom}
      />

      {/* Panel */}
      <div
        className={`
          absolute top-0 bottom-0 right-0 w-[500px] max-w-[90vw] bg-[#141414] border-l border-[#2a2a2a] 
          flex flex-col z-20 shadow-2xl transform transition-transform duration-300 ease-out
          ${isVisible && room ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Room Properties</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#2a2a2a] rounded transition-colors"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {!room ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div className="text-gray-500 text-sm">
              <p className="mb-2">No room selected</p>
              <p className="text-xs text-gray-600">Click a room to edit it, or click an empty cell to create one</p>
            </div>
          </div>
        ) : (
          /* Properties */
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Room Name */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Room Name</label>
                <input
                  type="text"
                  value={room.name}
                  onChange={(e) => onUpdate({ ...room, name: e.target.value })}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors"
                  placeholder="Enter room name..."
                />
              </div>

              {/* Room Description */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Description</label>
                  <button
                    onClick={() => room && setEditingField({
                      field: 'description',
                      title: 'Room Description',
                      value: room.description
                    })}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Maximize2 size={12} />
                    Expand
                  </button>
                </div>
                <textarea
                  value={room.description}
                  onChange={(e) => onUpdate({ ...room, description: e.target.value })}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none mb-1"
                  rows={5}
                  placeholder="Describe this room..."
                />
              </div>

              {/* Introduction Text */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Introduction Text</label>
                  <button
                    onClick={() => room && setEditingField({
                      field: 'introduction_text',
                      title: 'Introduction Text',
                      value: room.introduction_text
                    })}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Maximize2 size={12} />
                    Expand
                  </button>
                </div>
                <textarea
                  value={room.introduction_text}
                  onChange={(e) => onUpdate({ ...room, introduction_text: e.target.value })}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none"
                  rows={5}
                  placeholder="Text shown when entering room..."
                />
              </div>

              {/* Cover Image */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Cover Image</label>

                {/* Current Image Preview */}
                {room.image_path && (
                  <div className="w-full aspect-video bg-[#0a0a0a] rounded-lg overflow-hidden border border-[#2a2a2a] mb-2">
                    <img
                      src={`/api/world-assets/${worldId}/${room.image_path.split('/').pop()}`}
                      alt="Room"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/pngPlaceholder.png';
                      }}
                    />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowGalleryModal(true)}
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
                  >
                    <ImageIcon size={16} />
                    {uploading ? 'Uploading...' : 'Choose from Gallery'}
                  </button>

                  <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] cursor-pointer rounded-lg text-sm transition-colors">
                    <Upload size={16} />
                    Upload Custom
                    <input
                      id="room-image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              {/* NPCs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">NPCs</label>
                  <button className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors" onClick={onOpenNPCPicker}>
                    <Plus size={14} />
                    <span>Add NPC</span>
                  </button>
                </div>
                {room.npcs.length === 0 ? (
                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-6 text-center text-xs text-gray-500">
                    No NPCs in this room
                  </div>
                ) : (
                  <div className="space-y-2">
                    {room.npcs.map((npc) => (
                      <div
                        key={npc.character_uuid}
                        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Users size={14} className="text-gray-500 shrink-0" />
                          <span className="text-sm text-white truncate">{getNpcName(npc.character_uuid)}</span>
                          {npc.hostile && (
                            <span className="text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded shrink-0">
                              Hostile {npc.monster_level ? `Lv.${npc.monster_level}` : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            className="p-1 text-gray-500 hover:text-blue-400 transition-colors"
                            onClick={() => setEditingNPC(npc)}
                            title="NPC Settings"
                          >
                            <Settings size={14} />
                          </button>
                          <button
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                            onClick={() => handleRemoveNPC(npc.character_uuid)}
                            title="Remove NPC"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Position Info */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Position</label>
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-gray-400">
                  ({room.position.x}, {room.position.y})
                </div>
              </div>

              {/* Remove from Cell */}
              {onRemoveFromCell && (
                <div className="pt-4 border-t border-[#2a2a2a]">
                  <button
                    onClick={onRemoveFromCell}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 hover:border-red-700 rounded-lg text-red-400 hover:text-red-300 transition-colors text-sm"
                  >
                    <Trash2 size={16} />
                    Remove from Cell
                  </button>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Unlinks the room from this cell. The room card is preserved.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}