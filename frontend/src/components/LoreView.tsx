// src/components/LoreView.tsx
import React, { useState, useMemo } from 'react';
import { Plus, BookOpen, ImagePlus, Table2, FileJson } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import { LoreCard } from './LoreComponents';
import DropdownMenu from './DropDownMenu';
import { LoreItem } from '../types/loreTypes';
import { importPng, importTsv, importJson } from '../handlers/importHandlers';
import { createLoreExport } from '../handlers/exportHandlers';
import { 
  createLoreItem, 
  updateLoreItem, 
  deleteLoreItem, 
  moveLoreItem,
  filterLoreItems,
  updateCharacterBookEntries 
} from '../handlers/loreHandlers';

const LoreView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const [searchTerm, setSearchTerm] = useState('');

  // Get lore items from character data
  const loreItems = useMemo(() => {
    if (!characterData) return [];
    return characterData.data?.character_book?.entries || [];
  }, [characterData]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    return filterLoreItems(loreItems, searchTerm);
  }, [loreItems, searchTerm]);

  // Handlers for item operations
  const handleAddItem = () => {
    if (!characterData) return;
    const newItem = createLoreItem(loreItems.length);
    const updatedEntries = [...loreItems, newItem];
    const updatedData = updateCharacterBookEntries(characterData, updatedEntries);
    setCharacterData(updatedData);
  };

  const handleDeleteItem = (uid: number) => {
    if (!characterData) return;
    const updatedEntries = deleteLoreItem(loreItems, uid);
    const updatedData = updateCharacterBookEntries(characterData, updatedEntries);
    setCharacterData(updatedData);
  };

  const handleUpdateItem = (uid: number, updates: Partial<LoreItem>) => {
    if (!characterData) return;
    const updatedEntries = updateLoreItem(loreItems, uid, updates);
    const updatedData = updateCharacterBookEntries(characterData, updatedEntries);
    setCharacterData(updatedData);
  };

  const handleMoveItem = (uid: number, direction: 'up' | 'down') => {
    if (!characterData) return;
    const updatedEntries = moveLoreItem(loreItems, uid, direction);
    const updatedData = updateCharacterBookEntries(characterData, updatedEntries);
    setCharacterData(updatedData);
  };

  // Import handlers
  const handleImportPng = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !characterData) return;

      try {
        const newItems = await importPng(file);
        const updatedEntries = [...loreItems, ...newItems];
        const updatedData = updateCharacterBookEntries(characterData, updatedEntries);
        setCharacterData(updatedData);
      } catch (error) {
        console.error('Error importing PNG:', error);
      }
    };
    input.click();
  };

  const handleImportJson = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !characterData) return;

      try {
        const currentMaxOrder = Math.max(-1, ...loreItems.map((item: { order: any; }) => item.order));
        const newItems = await importJson(file, currentMaxOrder);
        const updatedEntries = [...loreItems, ...newItems];
        const updatedData = updateCharacterBookEntries(characterData, updatedEntries);
        setCharacterData(updatedData);
      } catch (error) {
        console.error('Error importing JSON:', error);
      }
    };
    input.click();
  };

  const handleImportTsv = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tsv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !characterData) return;

      try {
        const currentMaxOrder = Math.max(-1, ...loreItems.map((item: { order: any; }) => item.order));
        const newItems = await importTsv(file, currentMaxOrder);
        const updatedEntries = [...loreItems, ...newItems];
        const updatedData = updateCharacterBookEntries(characterData, updatedEntries);
        setCharacterData(updatedData);
      } catch (error) {
        console.error('Error importing TSV:', error);
      }
    };
    input.click();
  };

  // Export handler
  const handleExport = () => {
    if (!characterData?.data?.name || !loreItems.length) return;
    createLoreExport(loreItems, characterData.data.name);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-8 pb-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            Lore Manager ({loreItems.length} items)
          </h2>
          <div className="flex items-center gap-2">
            <DropdownMenu
              icon={BookOpen}
              label="Import Lore"
              items={[
                { icon: ImagePlus, label: "Import from PNG", onClick: handleImportPng },
                { icon: Table2, label: "Import from TSV", onClick: handleImportTsv },
                { icon: FileJson, label: "Import from JSON", onClick: handleImportJson },
              ]}
              buttonClassName="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            />
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2  
                       text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              <FileJson size={18} />
              Export Lore
            </button>
            <button
              onClick={handleAddItem}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 
                       text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              Add Item
            </button>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <input
            type="text"
            placeholder="Search keys and content..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 bg-stone-950 rounded-lg border-slate-700"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-8">
          <div className="space-y-4">
            {filteredItems.map((item: LoreItem, index: number) => (
              <LoreCard
                key={item.uid}
                item={item}
                onDelete={handleDeleteItem}
                onUpdate={handleUpdateItem}
                onMoveUp={(uid) => handleMoveItem(uid, 'up')}
                onMoveDown={(uid) => handleMoveItem(uid, 'down')}
                isFirst={index === 0}
                isLast={index === filteredItems.length - 1}
              />
            ))}
          </div>

          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              {searchTerm
                ? 'No items match your search'
                : 'No lore items yet. Click "Add Item" to create one.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoreView;