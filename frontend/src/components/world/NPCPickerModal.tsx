import { useState } from 'react';
import { X, Search, Check } from 'lucide-react';

interface Character {
  id: string;
  name: string;
  imageUrl: string;
  tags: string[];
}

interface NPCPickerModalProps {
  availableCharacters: Character[];
  selectedNPCs: string[];
  onConfirm: (npcIds: string[]) => void;
  onClose: () => void;
}

export function NPCPickerModal({ 
  availableCharacters, 
  selectedNPCs, 
  onConfirm, 
  onClose 
}: NPCPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [tempSelected, setTempSelected] = useState<string[]>(selectedNPCs);

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
    onConfirm(tempSelected);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#2a2a2a] flex items-center justify-between">
          <div>
            <h2 className="mb-1">Add NPCs to Room</h2>
            <p className="text-sm text-gray-500">
              {tempSelected.length} character{tempSelected.length !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-[#2a2a2a]">
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
        <div className="flex-1 overflow-y-auto p-6">
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
        <div className="p-6 border-t border-[#2a2a2a] flex items-center justify-between">
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
      </div>
    </div>
  );
}
