import React, { useState, useMemo } from 'react';
import { Plus, BookOpen, FileJson, FileText, Image } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import { LoreCard } from './LoreComponents';
import DropdownMenu from './DropDownMenu';
import { LoreEntry, createEmptyLoreEntry, CharacterCard } from '../types/schema';
import { importJson, importTsv, importPng } from '../handlers/importHandlers';

// Type guard to validate LoreEntry
function isLoreEntry(value: unknown): value is LoreEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LoreEntry>;

  // Check required fields
  if (!Array.isArray(entry.keys)) return false;
  if (typeof entry.content !== 'string') return false;
  if (typeof entry.insertion_order !== 'number') return false;

  return true;
}

const LoreView: React.FC = () => {
  const characterContext = useCharacter(); // Use characterContext directly
  const { characterData, setCharacterData } = characterContext;
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Existing entries and filtering logic (unchanged)
  const entries = useMemo(() => {
    if (!characterData?.data?.character_book?.entries) return [];

    const rawEntries = characterData.data.character_book.entries;

    let entriesArray: LoreEntry[] = [];
    if (Array.isArray(rawEntries)) {
      entriesArray = rawEntries;
    } else if (typeof rawEntries === 'object' && rawEntries !== null) {
      entriesArray = Object.entries(rawEntries)
        .map(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            const entryValue = value as Partial<LoreEntry>;
            return {
              ...entryValue,
              insertion_order: typeof entryValue.insertion_order === 'number' ? entryValue.insertion_order : parseInt(key)
            } as LoreEntry;
          }
          return null;
        })
        .filter((entry): entry is LoreEntry => entry !== null);
    }

    return entriesArray
      .filter(isLoreEntry)
      .map((entry, index) => ({
        ...entry,
        insertion_order: entry.insertion_order ?? index
      }))
      .sort((a, b) => a.insertion_order - b.insertion_order);
  }, [characterData]);

  // Filter entries based on search
  const filteredEntries = useMemo(() => {
    if (!searchTerm) return entries;
    const term = searchTerm.toLowerCase();

    return entries.filter((entry: LoreEntry) => {
      const keys = Array.isArray(entry.keys) ? entry.keys : [];
      return keys.some(key => key.toLowerCase().includes(term));
    });
  }, [entries, searchTerm]);

  // Helper function to update character data
  const updateCharacterData = (updatedEntries: LoreEntry[]): void => {
    if (!characterData) return;

    const updatedCharacterData: CharacterCard = {
      ...characterData,
      data: {
        ...characterData.data,
        character_book: {
          ...characterData.data.character_book,
          entries: updatedEntries,
        },
      },
    };

    setCharacterData(updatedCharacterData);
  };

  // Factory function to create specific import handlers
  const createImportHandler = (
    importLogicCallback: (file: File) => Promise<LoreEntry[]>,
    acceptTypes: string,
    fileTypeNameForError: string // e.g., 'JSON', 'TSV', 'PNG'
  ) => {
    return async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = acceptTypes;

      input.onchange = async (event: Event) => {
        const targetElement = event.target as HTMLInputElement;
        const selectedFile = targetElement.files?.[0];

        if (!selectedFile || !characterData) {
          setError(selectedFile ? 'Character data is not loaded.' : 'No file selected.');
          return;
        }

        try {
          const importedNewEntries = await importLogicCallback(selectedFile);

          // For PNG, JSON, and TSV, the respective import handlers (importPng, importJson, importTsv)
          // already update characterData via setCharacterData.
          // We don't need manual merging here for these types anymore.
          if (fileTypeNameForError !== 'PNG' && fileTypeNameForError !== 'JSON' && fileTypeNameForError !== 'TSV') {
            const currentBookEntries = characterData.data?.character_book?.entries || [];
            // Ensure currentBookEntries is an array of LoreEntry and filter out invalid items
            const validCurrentEntries = Array.isArray(currentBookEntries)
              ? currentBookEntries.filter(isLoreEntry)
              : [];

            const combinedEntries = [
              ...validCurrentEntries,
              ...importedNewEntries.map((entry, idx) => ({
                ...entry,
                id: validCurrentEntries.length + idx + 1, // Assign new local ID
                // Use insertion_order from entry if valid, otherwise append
                insertion_order: typeof entry.insertion_order === 'number'
                  ? entry.insertion_order
                  : validCurrentEntries.length + idx,
              })),
            ];
            updateCharacterData(combinedEntries);
          }
          // If it was a supported import type, characterData was updated by the handler,
          // and 'entries' (derived from useMemo) will reflect this.
          setError(null); // Clear any previous error
        } catch (importError) {
          setError(importError instanceof Error ? importError.message : `Failed to import ${fileTypeNameForError} file.`);
        }
      };
      input.click();
    };
  };

  // Define the actual import logic functions to be passed to createImportHandler
  const jsonFileImportLogic = async (file: File): Promise<LoreEntry[]> => {
    // importJson now expects the file object and characterContext
    return importJson(file, characterContext);
  };

  const tsvFileImportLogic = (file: File): Promise<LoreEntry[]> => {
    // importTsv now expects the file object and characterContext, similar to importJson
    return importTsv(file, characterContext);
  };

  const pngFileImportLogic = (file: File): Promise<LoreEntry[]> => {
    // importPng needs the characterContext, which is available in the LoreView component's scope
    return importPng(file, characterContext); // importPng is from '../handlers/importHandlers'
  };

  // Create specific import handlers
  const handleImportJson = createImportHandler(jsonFileImportLogic, '.json', 'JSON');
  const handleImportTsv = createImportHandler(tsvFileImportLogic, '.tsv,.txt', 'TSV');
  const handleImportPng = createImportHandler(pngFileImportLogic, '.png', 'PNG');

  // Basic entry management handlers
  const handleAddEntry = () => {
    if (!characterData) return;
    const newEntry = createEmptyLoreEntry(entries.length);
    updateCharacterData([...entries, newEntry]);
  };

  const handleDeleteEntry = (id: number) => {
    if (!characterData) return;
    const updatedEntries = entries
      .filter(entry => entry.id !== id)
      .map((entry, index) => ({
        ...entry,
        id: index + 1
      }));
    updateCharacterData(updatedEntries);
  };

  const handleUpdateEntry = (id: number, updates: Partial<LoreEntry>) => {
    if (!characterData) return;
    const updatedEntries = entries.map(entry =>
      entry.id === id ? { ...entry, ...updates } : entry
    );
    updateCharacterData(updatedEntries);
  };

  const handleMoveEntry = (id: number, direction: 'up' | 'down') => {
    if (!characterData) return;

    const index = entries.findIndex(e => e.id === id);
    if (index === -1) return;

    const updatedEntries = [...entries];

    if (direction === 'up' && index > 0) {
      [updatedEntries[index], updatedEntries[index - 1]] =
        [updatedEntries[index - 1], updatedEntries[index]];
    } else if (direction === 'down' && index < updatedEntries.length - 1) {
      [updatedEntries[index], updatedEntries[index + 1]] =
        [updatedEntries[index + 1], updatedEntries[index]];
    }

    const reorderedEntries = updatedEntries.map((entry, idx) => ({
      ...entry,
      id: idx + 1
    }));

    updateCharacterData(reorderedEntries);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-8 pb-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            Lore Manager ({entries.length} items)
          </h2>
          <div className="flex items-center gap-2">
            <DropdownMenu
              icon={BookOpen}
              label="Import Lore"
              items={[
                { icon: FileJson, label: 'Import from JSON', onClick: handleImportJson },
                { icon: FileText, label: 'Import from TSV', onClick: handleImportTsv },
                { icon: Image, label: 'Import from PNG', onClick: handleImportPng }
              ]}
              buttonClassName="p-2 hover:bg-stone-700 rounded-lg transition-colors"
            />
            <button
              onClick={handleAddEntry}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              New
            </button>
          </div>
        </div>

        <input
          type="text"
          placeholder="Search keys..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 bg-stone-950 rounded-lg border-stone-700"
        />

        {error && (
          <div className="px-4 py-2 bg-red-900/50 text-red-200 rounded-lg">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="space-y-4">
          {filteredEntries.map((entry: LoreEntry, index: number) => (
            <LoreCard
              key={entry.id}
              item={entry}
              onDelete={handleDeleteEntry}
              onUpdate={handleUpdateEntry}
              onMoveUp={(id) => handleMoveEntry(id, 'up')}
              onMoveDown={(id) => handleMoveEntry(id, 'down')}
              isFirst={index === 0}
              isLast={index === filteredEntries.length - 1}
            />
          ))}

          {filteredEntries.length === 0 && (
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