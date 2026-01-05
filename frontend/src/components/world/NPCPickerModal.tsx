import { useState } from 'react';
import { Search, Check } from 'lucide-react';
import { Dialog } from '../common/Dialog';
import { RoomNPC } from '../../types/room';

interface Character {
  id: string;
  name: string;
  imageUrl: string;
  tags: string[];
}

interface NPCPickerModalProps {
  availableCharacters: Character[];
  selectedNPCs: RoomNPC[]; // Full RoomNPC objects
  onConfirm: (npcs: RoomNPC[]) => void;
  onClose: () => void;
}

export function NPCPickerModal({
  availableCharacters,
  selectedNPCs,
  onConfirm,
  onClose
}: NPCPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  // Extract UUIDs for selection UI
  const selectedUuids = selectedNPCs.map(npc => npc.character_uuid);
  const [tempSelected, setTempSelected] = useState<string[]>(selectedUuids);

  const filteredCharacters = availableCharacters.filter(char =>
    char.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleCharacter = (charId: string) => {
    setTempSelected(prev =>
      prev.includes(charId)
        ? prev.filter(id => id !== charId)
        : [...prev, charId]
    );
  };

  const handleConfirm = () => {
    // Convert selected UUIDs to RoomNPC objects
    // Preserve existing RoomNPC data if already selected, create new objects for new selections
    const npcs: RoomNPC[] = tempSelected.map(uuid => {
      const existing = selectedNPCs.find(npc => npc.character_uuid === uuid);
      return existing || { character_uuid: uuid }; // Keep role/hostile if already set
    });
    onConfirm(npcs);
  };

  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      title="Add NPCs to Room"
      showHeaderCloseButton={true}
      className="max-w-4xl w-full"
      backgroundColor="bg-[#141414]"
      borderColor="border-[#2a2a2a]"
      backdropClassName="bg-black/80"
    >
      {/* Subtitle */}
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          {tempSelected.length} character{tempSelected.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search characters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#3a3a3a] transition-colors"
            />
          </div>
        </div>

      {/* Character Grid */}
      <div className="overflow-y-auto max-h-[400px] -mx-6 px-6">
          <div className="grid grid-cols-4 gap-4">
            {filteredCharacters.map((char) => {
              const isSelected = tempSelected.includes(char.id);
              
              return (
                <button
                  key={char.id}
                  onClick={() => toggleCharacter(char.id)}
                  className={`relative group rounded-lg overflow-hidden transition-all ${
                    isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#141414]'
                      : 'hover:ring-2 hover:ring-gray-600'
                  }`}
                >
                  <div className="aspect-square bg-[#1a1a1a] relative">
                    <img
                      src={char.imageUrl}
                      alt={char.name}
                      className="w-full h-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                          <Check size={24} className="text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-2 bg-[#1a1a1a] border-t border-[#2a2a2a]">
                    <p className="text-xs truncate">{char.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
      </div>

      {/* Footer */}
      <div className="pt-6 mt-6 border-t border-[#2a2a2a] -mx-6 px-6 flex items-center justify-between">
        <button
          onClick={() => setTempSelected([])}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Clear Selection
        </button>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm"
          >
            Add {tempSelected.length} NPC{tempSelected.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
