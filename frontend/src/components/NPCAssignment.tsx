/**
 * NPC Assignment Component
 * Manages NPC assignments for room cards
 * @dependencies roomApi, character API
 */
import React, { useState, useEffect } from 'react';
import { Plus, X, Shield, User, Search } from 'lucide-react';
import { RoomNPC } from '../types/room';

interface Character {
  id: string;
  name: string;
  imageUrl: string;
  tags: string[];
}

interface NPCAssignmentProps {
  npcs: RoomNPC[];
  onChange: (npcs: RoomNPC[]) => void;
}

interface NPCPickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (characterId: string) => void;
  availableCharacters: Character[];
  excludeIds: string[];
}

function NPCPickerDrawer({ isOpen, onClose, onSelect, availableCharacters, excludeIds }: NPCPickerDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredCharacters = availableCharacters
    .filter(char => !excludeIds.includes(char.id))
    .filter(char => char.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
      <div className="bg-stone-900 border border-stone-700 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-stone-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Add NPC to Room</h2>
            <p className="text-sm text-stone-400">Select a character to assign as an NPC</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-stone-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-stone-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={18} />
            <input
              type="text"
              placeholder="Search characters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* Character Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-4 gap-4">
            {filteredCharacters.map((char) => (
              <button
                key={char.id}
                onClick={() => {
                  onSelect(char.id);
                  onClose();
                }}
                className="group rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-blue-500"
              >
                <div className="aspect-square bg-stone-800 relative">
                  <img
                    src={char.imageUrl}
                    alt={char.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                    <div className="p-3 w-full">
                      <div className="flex items-center justify-center gap-2 text-white">
                        <Plus size={16} />
                        <span className="text-sm font-medium">Add NPC</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-2 bg-stone-800 border-t border-stone-700">
                  <p className="text-xs truncate text-white">{char.name}</p>
                </div>
              </button>
            ))}
          </div>

          {filteredCharacters.length === 0 && (
            <div className="text-center py-12 text-stone-500">
              No characters found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const NPCAssignment: React.FC<NPCAssignmentProps> = ({ npcs, onChange }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>([]);
  const [characterNames, setCharacterNames] = useState<Map<string, string>>(new Map());

  // Load available characters
  useEffect(() => {
    const loadCharacters = async () => {
      try {
        const response = await fetch('/api/characters');
        if (response.ok) {
          const data = await response.json();
          const charList = data.characters || data.data || data || [];
          const characters = charList
            .filter((c: any) => {
              const cardType = c.extensions_json?.card_type || c.card_type;
              return cardType !== 'world' && cardType !== 'room';
            })
            .map((c: any) => {
              const uuid = c.character_uuid;
              const timestamp = c.updated_at ? new Date(c.updated_at).getTime() : Date.now();
              return {
                id: uuid,
                name: c.name,
                imageUrl: uuid ? `/api/character-image/${uuid}?t=${timestamp}` : '/pngPlaceholder.png',
                tags: c.tags || [],
              };
            });
          setAvailableCharacters(characters);

          // Build name map
          const nameMap = new Map<string, string>();
          characters.forEach((char: Character) => {
            nameMap.set(char.id, char.name);
          });
          setCharacterNames(nameMap);
        }
      } catch (err) {
        console.error('Failed to load characters:', err);
      }
    };

    loadCharacters();
  }, []);

  const handleAddNPC = (characterId: string) => {
    const newNPC: RoomNPC = {
      character_uuid: characterId,
      role: undefined,
      hostile: false,
    };
    onChange([...npcs, newNPC]);
  };

  const handleRemoveNPC = (index: number) => {
    onChange(npcs.filter((_, i) => i !== index));
  };

  const handleUpdateRole = (index: number, role: string) => {
    const updated = [...npcs];
    updated[index] = {
      ...updated[index],
      role: role.trim() || undefined,
    };
    onChange(updated);
  };

  const handleToggleHostile = (index: number) => {
    const updated = [...npcs];
    updated[index] = {
      ...updated[index],
      hostile: !updated[index].hostile,
    };
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-stone-300">NPCs in Room</label>
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add NPC
        </button>
      </div>

      {npcs.length === 0 ? (
        <div className="text-center py-8 bg-stone-800 border border-stone-700 rounded-lg">
          <User className="w-12 h-12 text-stone-600 mx-auto mb-3" />
          <p className="text-stone-400 text-sm">No NPCs assigned to this room</p>
          <p className="text-stone-500 text-xs mt-1">Click "Add NPC" to assign characters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {npcs.map((npc, index) => (
            <div
              key={`${npc.character_uuid}-${index}`}
              className="bg-stone-800 border border-stone-700 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <User size={16} className="text-stone-400" />
                    <span className="font-medium text-white">
                      {characterNames.get(npc.character_uuid) || npc.character_uuid}
                    </span>
                  </div>

                  {/* Role input */}
                  <div className="mb-2">
                    <label className="block text-xs text-stone-400 mb-1">Role (optional)</label>
                    <input
                      type="text"
                      value={npc.role || ''}
                      onChange={(e) => handleUpdateRole(index, e.target.value)}
                      placeholder="e.g., Innkeeper, Guard, Merchant"
                      className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-sm text-white placeholder-stone-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Hostile toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={npc.hostile || false}
                      onChange={() => handleToggleHostile(index)}
                      className="w-4 h-4 rounded border-stone-700 bg-stone-900 text-red-600 focus:ring-red-500"
                    />
                    <Shield
                      size={14}
                      className={npc.hostile ? 'text-red-500' : 'text-stone-500'}
                    />
                    <span className="text-xs text-stone-400">Hostile</span>
                  </label>
                </div>

                <button
                  onClick={() => handleRemoveNPC(index)}
                  className="p-1.5 hover:bg-stone-700 rounded transition-colors shrink-0"
                  title="Remove NPC"
                >
                  <X size={16} className="text-stone-500 hover:text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NPCPickerDrawer
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleAddNPC}
        availableCharacters={availableCharacters}
        excludeIds={npcs.map(npc => npc.character_uuid)}
      />
    </div>
  );
};

export default NPCAssignment;
