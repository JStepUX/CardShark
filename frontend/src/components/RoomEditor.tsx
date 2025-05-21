import React, { useState, useEffect } from 'react';
import { Room, NPC } from '../types/room'; // Import NPC type
import Button from './common/Button';
import { XCircle } from 'lucide-react'; // Import an icon for remove button

interface RoomEditorProps {
  room: Room;
  onUpdate: (updates: Partial<Room>) => void; // Re-added onUpdate prop
  onDelete: () => void;
  onPlayHere: () => void;
  onAddNpc: () => void;
  onRemoveNpc: (npcPath: string) => void;
}

const RoomEditor: React.FC<RoomEditorProps> = ({
  room,
  onUpdate, // Re-added onUpdate prop
  onDelete,
  onPlayHere,
  onAddNpc,
  onRemoveNpc,
}) => {
  const [roomName, setRoomName] = useState(room.name);
  const [roomDescription, setRoomDescription] = useState(room.description);
  const [roomIntroduction, setRoomIntroduction] = useState(room.introduction || '');

  // Update local state if the room prop changes (e.g., selecting a different room)
  useEffect(() => {
    setRoomName(room.name);
    setRoomDescription(room.description);
    setRoomIntroduction(room.introduction || '');
  }, [room.id, room.name, room.description, room.introduction]);

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRoomName(event.target.value);
  };

  const handleIntroductionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRoomIntroduction(event.target.value);
  };

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRoomDescription(event.target.value);
  };

  // Call onUpdate when the input field loses focus
  const handleNameBlur = () => {
    if (roomName !== room.name) {
      onUpdate({ name: roomName });
    }
  };

  const handleIntroductionBlur = () => {
    if (roomIntroduction !== room.introduction) {
      onUpdate({ introduction: roomIntroduction });
    }
  };

  const handleDescriptionBlur = () => {
    if (roomDescription !== room.description) {
      onUpdate({ description: roomDescription });
    }
  };

  return (
    <div className="p-4 flex flex-col h-full">
      <h3 className="font-bold text-lg mb-4 text-stone-800 dark:text-stone-200">Edit Room</h3>
      <div className="mb-4">
        <label htmlFor="room-name" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
          Room Name
        </label>
        <input
          type="text"
          id="room-name"
          value={roomName}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-stone-900 dark:text-stone-100"
          placeholder="Enter room name"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="room-introduction" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
          Introduction
        </label>
        <textarea
          id="room-introduction"
          value={roomIntroduction}
          onChange={handleIntroductionChange}
          onBlur={handleIntroductionBlur}
          rows={3}
          className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-stone-900 dark:text-stone-100"
          placeholder="Enter room introduction"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="room-description" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
          Description
        </label>
        <textarea
          id="room-description"
          value={roomDescription}
          onChange={handleDescriptionChange}
          onBlur={handleDescriptionBlur}
          rows={3}
          className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-stone-900 dark:text-stone-100"
          placeholder="Enter room description"
        />
      </div>

      <div className="mb-4">
        <h4 className="text-md font-semibold mb-2 text-stone-800 dark:text-stone-200">NPCs in Room ({room.npcs.length})</h4>
        <Button
          variant="primary"
          size="sm"
          onClick={onAddNpc}
          className="w-full mb-2 bg-green-600 hover:bg-green-700 text-sm rounded"
        >
          Add NPC
        </Button>
        <div className="max-h-48 overflow-y-auto border border-stone-200 dark:border-stone-700 rounded p-2 bg-stone-50 dark:bg-stone-800/50 space-y-1">
          {room.npcs.length > 0 ? (
            room.npcs.map((npc: NPC) => ( // Ensure npc is typed
              <div key={npc.path} className="flex items-center justify-between p-1.5 bg-white dark:bg-stone-700 rounded text-sm">
                <span className="truncate text-stone-800 dark:text-stone-200" title={npc.name}>{npc.name || 'Unnamed NPC'}</span>
                <Button
                  variant="ghost"
                  onClick={() => onRemoveNpc(npc.path)}
                  className="ml-2 p-0.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"
                  title={`Remove ${npc.name || 'NPC'}`}
                >
                  <XCircle size={16} />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-xs text-center text-stone-500 dark:text-stone-400 py-2">No NPCs added yet.</p>
          )}
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-stone-200 dark:border-stone-700 flex flex-wrap gap-2 justify-between">
        <Button
          variant="primary"
          size="sm"
          onClick={onPlayHere}
          className="bg-blue-600 hover:bg-blue-700 text-sm rounded"
        >
          Play Here
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          className="bg-red-600 hover:bg-red-700 text-sm rounded"
        >
          Delete Room
        </Button>
      </div>
       <p className="text-xs text-stone-500 dark:text-stone-400 mt-2">ID: {room.id}</p>
       <p className="text-xs text-stone-500 dark:text-stone-400">Coords: ({room.x}, {room.y})</p>
    </div>
  );
};

export default RoomEditor;
