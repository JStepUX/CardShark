import React, { useState, useMemo } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { LoreItem, LoreCard } from './LoreComponents';
import { Plus, BookOpen, ImagePlus, Table2 } from 'lucide-react';
import DropdownMenu from './DropDownMenu';

const LoreView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const [searchTerm, setSearchTerm] = useState('');

  // Get lore items with more explicit path checking
  const loreItems = useMemo(() => {
    if (!characterData) return [];

    // For V2 format
    if (characterData.data?.character_book?.entries) {
      return characterData.data.character_book.entries;
    }

    // For V2 format alternate path
    if (characterData.character_book?.entries) {
      return characterData.character_book.entries;
    }

    return [];
  }, [characterData]);

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    if (!searchTerm) return loreItems;

    const term = searchTerm.toLowerCase();
    return loreItems.filter((item: LoreItem) => {
      const keyMatch = item.keys.some(key =>
        key.toLowerCase().includes(term)
      );
      const contentMatch = item.content.toLowerCase().includes(term);
      return keyMatch || contentMatch;
    });
  }, [loreItems, searchTerm]);

  // Helper to update character data with new entries
  const updateCharacterBookEntries = (newEntries: LoreItem[]) => {
    if (!characterData) return;

    const updatedData = {
      ...characterData,
      data: {
        ...characterData.data,
        character_book: {
          ...(characterData.data?.character_book || {}),
          entries: newEntries
        }
      }
    };

    setCharacterData(updatedData);
  };

  // Add new lore item
  const handleAddItem = () => {
    if (!characterData) return;

    const newItem: LoreItem = {
      keys: [],
      content: '',
      enabled: true,
      insertion_order: loreItems.length,
      case_sensitive: false,
      priority: 10,
      id: Date.now(),
      comment: '',
      name: '',
      selective: false,
      constant: false,
      position: 'after_char'
    };

    const updatedEntries = [...loreItems, newItem];
    updateCharacterBookEntries(updatedEntries);
  };

  // Delete lore item
  const handleDeleteItem = (id: number) => {
    if (!characterData) return;

    const updatedEntries = loreItems
      .filter((item: { id: number; }) => item.id !== id)
      .map((item: any, index: any) => ({
        ...item,
        insertion_order: index
      }));

    updateCharacterBookEntries(updatedEntries);
  };

  // Update lore item
  const handleUpdateItem = (id: number, updates: Partial<LoreItem>) => {
    if (!characterData) return;

    const updatedEntries = loreItems.map((item: { id: number; }) =>
      item.id === id ? { ...item, ...updates } : item
    );

    updateCharacterBookEntries(updatedEntries);
  };

  // Move item up
  const handleMoveUp = (id: number) => {
    if (!characterData) return;

    const currentIndex = loreItems.findIndex((item: LoreItem) => item.id === id);
    if (currentIndex <= 0) return;

    const newEntries = [...loreItems];
    const temp = newEntries[currentIndex];
    newEntries[currentIndex] = newEntries[currentIndex - 1];
    newEntries[currentIndex - 1] = temp;

    // Update insertion_order values
    const updatedEntries = newEntries.map((item, index) => ({
      ...item,
      insertion_order: index
    }));

    updateCharacterBookEntries(updatedEntries);
  };

  // Move item down
  const handleMoveDown = (id: number) => {
    if (!characterData) return;

    const currentIndex = loreItems.findIndex((item: { id: number; }) => item.id === id);
    if (currentIndex === -1 || currentIndex >= loreItems.length - 1) return;

    const newEntries = [...loreItems];
    const temp = newEntries[currentIndex];
    newEntries[currentIndex] = newEntries[currentIndex + 1];
    newEntries[currentIndex + 1] = temp;

    // Update insertion_order values
    const updatedEntries = newEntries.map((item, index) => ({
      ...item,
      insertion_order: index
    }));

    updateCharacterBookEntries(updatedEntries);
  };

  // Handle TSV import
  const handleImportTsv = () => {
    if (!characterData) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tsv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());

        const currentMaxOrder = Math.max(-1, ...loreItems.map((item: { insertion_order: any; }) => item.insertion_order));

        const newItems = lines
          .map((line, index) => {
            const [key, value] = line.split('\t');
            if (!key?.trim() || !value?.trim()) return null;

            return {
              keys: [key.trim()],
              content: value.trim(),
              enabled: true,
              insertion_order: currentMaxOrder + index + 1,
              case_sensitive: false,
              priority: 10,
              id: Date.now() + index,
              comment: '',
              name: '',
              selective: false,
              constant: false,
              position: 'after_char'
            } as LoreItem;
          })
          .filter((item): item is LoreItem => item !== null);

        const updatedEntries = [...loreItems, ...newItems];
        updateCharacterBookEntries(updatedEntries);
      }
    };
    input.click();
  };

  // Handle PNG import
  const handleImportPng = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !characterData) return;

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/extract-lore', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Failed to extract lore');
        }

        const data = await response.json();
        
        if (data.success && data.loreItems) {
          const currentMaxOrder = Math.max(-1, ...loreItems.map((item: { insertion_order: any; }) => item.insertion_order));
          
          const newItems = data.loreItems.map((item: any, index: number) => ({
            ...item,
            id: Date.now() + index,
            insertion_order: currentMaxOrder + index + 1,
            enabled: true
          }));

          const updatedEntries = [...loreItems, ...newItems];
          updateCharacterBookEntries(updatedEntries);
        }
      } catch (error) {
        console.error('Error importing lore:', error);
      }
    };
    input.click();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-8 pb-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Lore Manager ({loreItems.length} items)</h2>
          <div className="flex items-center gap-2">
            <DropdownMenu
              icon={BookOpen}
              items={[
                { icon: ImagePlus, label: "Import from PNG", onClick: handleImportPng },
                { icon: Table2, label: "Import from TSV", onClick: handleImportTsv },
              ]}
              buttonClassName="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            />
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
            placeholder="Search items..."
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
                key={item.id}
                item={{
                  ...item,
                  insertion_order: index
                }}
                onDelete={handleDeleteItem}
                onUpdate={handleUpdateItem}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
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