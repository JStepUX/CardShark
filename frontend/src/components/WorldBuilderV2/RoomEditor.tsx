import React, { useState, useEffect } from 'react';
import { Room, RoomConnection } from '../../types/worldV2';
import { Upload, Save, Trash2, Plus, X, Image as ImageIcon } from 'lucide-react';

interface RoomEditorProps {
    room: Room;
    worldId: string;
    onSave: (updatedRoom: Room) => void;
    onCancel: () => void;
    onDelete?: () => void;
}

const RoomEditor: React.FC<RoomEditorProps> = ({ room, worldId, onSave, onCancel, onDelete }) => {
    const [editedRoom, setEditedRoom] = useState<Room>({ ...room });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        setEditedRoom({ ...room });
    }, [room]);

    const handleChange = (field: keyof Room, value: any) => {
        setEditedRoom(prev => ({ ...prev, [field]: value }));
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

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
                // Store relative path returned by backend
                handleChange('image_path', data.data.path);
            }
        } catch (error) {
            console.error('Error uploading room image:', error);
            alert('Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    const addConnection = () => {
        const newConnection: RoomConnection = {
            target_room_id: '',
            direction: 'north',
            is_locked: false
        };
        setEditedRoom(prev => ({
            ...prev,
            connections: [...prev.connections, newConnection]
        }));
    };

    const updateConnection = (index: number, field: keyof RoomConnection, value: any) => {
        setEditedRoom(prev => {
            const newConnections = [...prev.connections];
            newConnections[index] = { ...newConnections[index], [field]: value };
            return { ...prev, connections: newConnections };
        });
    };

    const removeConnection = (index: number) => {
        setEditedRoom(prev => ({
            ...prev,
            connections: prev.connections.filter((_, i) => i !== index)
        }));
    };

    return (
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-stone-800 pb-4">
                <h3 className="text-xl font-bold text-stone-200">Edit Room</h3>
                <div className="flex gap-2">
                    {onDelete && (
                        <button
                            onClick={onDelete}
                            className="p-2 text-red-400 hover:bg-red-900/20 rounded transition-colors"
                            title="Delete Room"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                    <button
                        onClick={onCancel}
                        className="p-2 text-stone-400 hover:bg-stone-800 rounded transition-colors"
                        title="Cancel"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-stone-400 mb-1">Room Name</label>
                    <input
                        type="text"
                        value={editedRoom.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                        placeholder="e.g. The Grand Hall"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-stone-400 mb-1">Description</label>
                    <textarea
                        value={editedRoom.description}
                        onChange={(e) => handleChange('description', e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2 text-white h-32 focus:outline-none focus:border-emerald-500"
                        placeholder="Describe the room..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-stone-400 mb-1">Background Image</label>
                    <div className="flex items-start gap-4">
                        <div className="w-32 h-32 bg-stone-950 border border-stone-800 rounded overflow-hidden flex items-center justify-center relative group">
                            {editedRoom.image_path ? (
                                <img
                                    src={`/api/world-assets/${worldId}/${editedRoom.image_path.split('/').pop()}`}
                                    alt="Room background"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <ImageIcon className="text-stone-700" size={32} />
                            )}
                            {uploading && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded transition-colors border border-stone-700">
                                <Upload size={16} className="mr-2" />
                                {uploading ? 'Uploading...' : 'Upload Image'}
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                    disabled={uploading}
                                />
                            </label>
                            <p className="text-xs text-stone-500 mt-2">
                                Recommended size: 1920x1080. PNG, JPG or WebP.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="border-t border-stone-800 pt-4">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-sm font-medium text-stone-400">Connections</label>
                        <button
                            onClick={addConnection}
                            className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center"
                        >
                            <Plus size={14} className="mr-1" /> Add Connection
                        </button>
                    </div>

                    <div className="space-y-3">
                        {editedRoom.connections.map((conn, idx) => (
                            <div key={idx} className="flex gap-2 items-start bg-stone-950 p-2 rounded border border-stone-800">
                                <div className="flex-1 space-y-2">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={conn.direction}
                                            onChange={(e) => updateConnection(idx, 'direction', e.target.value)}
                                            placeholder="Direction (e.g. north)"
                                            className="w-1/3 bg-stone-900 border border-stone-800 rounded px-2 py-1 text-sm text-white"
                                        />
                                        <input
                                            type="text"
                                            value={conn.target_room_id}
                                            onChange={(e) => updateConnection(idx, 'target_room_id', e.target.value)}
                                            placeholder="Target Room ID"
                                            className="flex-1 bg-stone-900 border border-stone-800 rounded px-2 py-1 text-sm text-white"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeConnection(idx)}
                                    className="text-stone-500 hover:text-red-400 p-1"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                        {editedRoom.connections.length === 0 && (
                            <p className="text-stone-600 text-sm italic">No connections defined.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-stone-800">
                <button
                    onClick={() => onSave(editedRoom)}
                    className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors shadow-lg shadow-emerald-900/20"
                >
                    <Save size={18} className="mr-2" /> Save Room
                </button>
            </div>
        </div>
    );
};

export default RoomEditor;









