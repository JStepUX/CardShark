import React, { useState, useMemo, useCallback } from 'react';
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
  updateCharacterBookEntries,
} from '../handlers/loreHandlers';

const LoreView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Get lore items from character data
  const loreItems = useMemo(() => {
    if (!characterData) return [];
    return characterData.data?.character_book?.entries || [];
  }, [characterData]);

  // Filter items based on search
  const filterLoreItemsMemoized = useCallback(
    (items: LoreItem[], term: string) => {
      if (!term) return items;

      const searchWords = term.toLowerCase().trim().split(/\s+/);

      return items.filter((item) => {
        const keyTerms = Array.isArray(item.key)
          ? item.key.map((k) => k.toLowerCase())
          : (typeof item.key === 'string' ? item.key : '').toLowerCase().split(',').map((k) => k.trim());

        const content = item.content?.toLowerCase() || '';

        return (
          searchWords.some((word) => keyTerms.some((term) => term.includes(word))) ||
          content.includes(term.toLowerCase())
        );
      });
    },
    []
  );

  const filteredItems = useMemo(() => {
    return filterLoreItemsMemoized(loreItems, searchTerm);
  }, [loreItems, searchTerm, filterLoreItemsMemoized]);

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

    console.log('LoreView handleUpdateItem:', {
      receivedUid: uid,
      typeofUid: typeof uid,
      updates,
      updateKeys: Object.keys(updates),
      itemsCount: loreItems.length,
    });

    if (typeof uid === 'undefined') {
      console.error('LoreView Error: Received undefined uid!', {
        updates,
        loreItemsCount: loreItems.length,
        firstItemUid: loreItems[0]?.uid,
      });
      return;
    }

    const updatedEntries = updateLoreItem(loreItems, uid, updates);

    // Verify the update only changed the target item
    const changedItems = updatedEntries.filter(
      (item, index) => JSON.stringify(item) !== JSON.stringify(loreItems[index])
    );

    console.log('LoreView update verification:', {
      targetUid: uid,
      changedItemsCount: changedItems.length,
      changedItems: changedItems.map((item) => ({
        uid: item.uid,
        position: item.position,
      })),
    });

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
        setError(error instanceof Error ? error.message : 'Failed to import PNG file');
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
        // Validate file type
        if (!file.name.toLowerCase().endsWith('.json')) {
          throw new Error('Please select a JSON file');
        }

        // Read and parse file content
        const fileContent = await file.text();
        let parsedContent;

        try {
          parsedContent = JSON.parse(fileContent);
          console.log('Parsed content structure:', {
            hasEntries: !!parsedContent?.entries,
            hasOriginalData: !!parsedContent?.originalData,
            entriesType: typeof parsedContent?.entries,
          });
        } catch (parseError) {
          throw new Error('Invalid JSON format. Please check the file content.');
        }

        // Get current max order
        const currentMaxOrder = Math.max(-1, ...loreItems.map((item: { order: any; }) => item.order || 0));

        // Import and validate items
        const newItems = await importJson(parsedContent, currentMaxOrder);

        if (!newItems || newItems.length === 0) {
          throw new Error('No valid lore items found in the file');
        }

        console.log(`Successfully imported ${newItems.length} lore items`);

        // Update character data
        const updatedEntries = [...loreItems, ...newItems];
        const updatedData = updateCharacterBookEntries(characterData, updatedEntries);
        setCharacterData(updatedData);
      } catch (error) {
        console.error('Import error:', error);
        setError(error instanceof Error ? error.message : 'Failed to import JSON file');
      } finally {
        // Clear the input so the same file can be selected again
        input.value = '';
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
        const currentMaxOrder = Math.max(-1, ...loreItems.map((item: LoreItem) => item.order || 0));
        const newItems = await importTsv(file, currentMaxOrder);
        const updatedEntries = [...loreItems, ...newItems];
        const updatedData = updateCharacterBookEntries(characterData, updatedEntries);
        setCharacterData(updatedData);
      } catch (error) {
        console.error('Error importing TSV:', error);
        setError(error instanceof Error ? error.message : 'Failed to import TSV file');
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
      {/* Error Display */}
      {error && (
        <div className="bg-red-500 text-white p-4 mb-4 rounded-lg">
          <p>{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg"
          >
            Close
          </button>
        </div>
      )}

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
                { icon: ImagePlus, label: 'Import from PNG', onClick: handleImportPng },
                { icon: Table2, label: 'Import from TSV', onClick: handleImportTsv },
                { icon: FileJson, label: 'Import from JSON', onClick: handleImportJson },
              ]}
              buttonClassName="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            />
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              <FileJson size={18} />
              Export Lore
            </button>
            <button
              onClick={handleAddItem}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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