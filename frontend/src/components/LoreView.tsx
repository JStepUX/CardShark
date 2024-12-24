import React, { useState, useMemo } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { LoreItem, LoreCard } from './LoreComponents';
import { Plus, BookOpen, ImagePlus, Table2, } from 'lucide-react';
import DropdownMenu from './DropDownMenu';

const LoreView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const [searchTerm, setSearchTerm] = useState('');

  // Log the full character data to debug
  console.log("LoreView - Full character data:", characterData);

  // Get lore items with more explicit path checking
  const loreItems = useMemo(() => {
    if (!characterData) {
      console.log("No character data available");
      return [];
    }

    // For V2 format
    if (characterData.data?.character_book?.entries) {
      console.log("Found V2 character book entries:", characterData.data.character_book.entries);
      return characterData.data.character_book.entries;
    }

    // For V2 format alternate path
    if (characterData.character_book?.entries) {
      console.log("Found V2 character book entries (alternate path):", characterData.character_book.entries);
      return characterData.character_book.entries;
    }

    // If no entries found
    console.log("No lore entries found in character data");
    return [];
  }, [characterData]);

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    console.log("Filtering items from:", loreItems);
    if (!searchTerm) return loreItems;

    const term = searchTerm.toLowerCase();
    return loreItems.filter((item: { keys: any[]; content: string; }) => {
      const keyMatch = item.keys.some(key =>
        key.toLowerCase().includes(term)
      );
      const contentMatch = item.content.toLowerCase().includes(term);
      return keyMatch || contentMatch;
    });
  }, [loreItems, searchTerm]);

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

    // Ensure the character_book structure exists
    const updatedData = {
      ...characterData,
      data: {
        ...characterData?.data,
        character_book: {
          ...(characterData.data?.character_book || {}),
          entries: [...(characterData.data?.character_book?.entries || []), newItem]
        }
      }
    };

    console.log("Adding new item, updated data:", updatedData);
    setCharacterData(updatedData);
  };

  // Delete lore item
  const handleDeleteItem = (id: number) => {
    if (!characterData) return;

    // Filter out deleted item and update orders
    const updatedEntries = loreItems
      .filter((item: { id: number; }) => item.id !== id)
      .map((item: any, index: any) => ({
        ...item,
        insertion_order: index
      }));

    // Update with proper structure
    const updatedData = {
      ...characterData,
      data: {
        ...characterData?.data,
        character_book: {
          ...(characterData.data?.character_book || {}),
          entries: updatedEntries
        }
      }
    };

    console.log("After deletion, updated data:", updatedData);
    setCharacterData(updatedData);
  };

  // Update lore item
  const handleUpdateItem = (id: number, updates: Partial<LoreItem>) => {
    if (!characterData) return;

    const updatedEntries = loreItems.map((item: { id: number; }) =>
      item.id === id ? { ...item, ...updates } : item
    );

    const updatedData = {
      ...characterData,
      data: {
        ...characterData.data,
        character_book: {
          ...(characterData.data?.character_book || {}),
          entries: updatedEntries
        }
      }
    };

    console.log("After update, updated data:", updatedData);
    setCharacterData(updatedData);
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

        // Get current highest order
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

        const updatedData = {
          ...characterData,
          data: {
            ...characterData.data,
            character_book: {
              ...(characterData.data?.character_book || {}),
              entries: [...(characterData.data?.character_book?.entries || []), ...newItems]
            }
          }
        };

        console.log("After TSV import, updated data:", updatedData);
        setCharacterData(updatedData);
      }
    };
    input.click();
  };

  const handleImportPngLore = () => {
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
          // Ensure we have character_book structure
          const currentCharacterBook = characterData.data?.character_book || {
            entries: [],
            name: "",
            description: "",
            scan_depth: 100,
            token_budget: 2048,
            recursive_scanning: false,
            extensions: {}
          };

          // Get current entries or empty array
          const currentEntries = currentCharacterBook.entries || [];

          // Get current highest order
          const currentMaxOrder = Math.max(-1, ...currentEntries.map((item: { insertion_order: any; }) => item.insertion_order));

          // Process new items
          const newItems = data.loreItems.map((item: any, index: number) => ({
            ...item,
            id: Date.now() + index,
            insertion_order: currentMaxOrder + index + 1,
            enabled: true // Ensure new items are enabled by default
          }));

          // Create updated character data with proper structure
          const updatedData = {
            ...characterData,
            data: {
              ...characterData.data,
              character_book: {
                ...currentCharacterBook,
                entries: [...currentEntries, ...newItems]
              }
            }
          };

          console.log("Merging lore items:", {
            current: currentEntries.length,
            new: newItems.length,
            total: updatedData.data.character_book.entries.length
          });

          setCharacterData(updatedData);
        }
      } catch (error) {
        console.error('Error importing lore:', error);
        // Here you could add a UI notification of the error
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
                { icon: ImagePlus, label: "Import from PNG", onClick: handleImportPngLore },
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
            {filteredItems.map((item: LoreItem, index: any) => (
              <LoreCard
                key={item.id}
                item={{
                  ...item,
                  insertion_order: index
                }}
                onDelete={handleDeleteItem}
                onUpdate={handleUpdateItem}
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