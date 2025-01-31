import React, { useState, useMemo } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { LoreCard } from './LoreComponents';
import { Plus, BookOpen, ImagePlus, Table2, FileJson } from 'lucide-react';
import DropdownMenu from './DropDownMenu';
import { LoreItem, LorePosition } from '../types/loreTypes';

interface ExportData {
  entries: Record<number, {
    key: string[];
    keysecondary: string[];
    // ...other fields
  }>;
  originalData: {
    entries: Array<{
      keys: string[];
      content: string;
      // ...other fields
    }>;
    name: string;
    description: string;
    scan_depth: number;
    token_budget: number;
    recursive_scanning: boolean;
    extensions: Record<string, unknown>;
  };
}

const LoreView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const [searchTerm, setSearchTerm] = useState('');

  const createExportData = (items: LoreItem[]): ExportData => ({
    entries: items.reduce((acc, item, index) => {
      acc[item.uid] = {
        key: item.keys,
        keysecondary: item.keysecondary || [],
        comment: item.comment || "",
        content: item.content || "",
        constant: item.constant || false,
        vectorized: item.vectorized || false,
        selective: item.selective || false,
        selectiveLogic: item.selectiveLogic || 0,
        addMemo: true,
        order: item.order || index,
        position: item.position || 1,
        disable: item.disable || false,
        excludeRecursion: item.excludeRecursion || false,
        preventRecursion: item.preventRecursion || false,
        delayUntilRecursion: item.delayUntilRecursion || false,
        probability: item.probability || 100,
        useProbability: item.useProbability ?? true,
        depth: item.depth || 4,
        group: item.group || "",
        groupOverride: item.groupOverride || false,
        groupWeight: item.groupWeight || 100,
        scanDepth: item.scanDepth || null,
        caseSensitive: item.caseSensitive || null,
        matchWholeWords: item.matchWholeWords || null,
        useGroupScoring: item.useGroupScoring || null,
        automationId: item.automationId || "",
        role: item.role || null,
        sticky: item.sticky || 0,
        cooldown: item.cooldown || 0,
        delay: item.delay || 0,
        uid: item.uid,
        displayIndex: item.displayIndex || index,
        extensions: {}
      };
      return acc;
    }, {} as Record<number, any>),
    originalData: {
      entries: items.map((item, index) => ({
        keys: item.keys,
        content: item.content || "",
        enabled: !item.disable,
        insertion_order: index,
        case_sensitive: item.caseSensitive || false,
        priority: 10,
        id: item.uid,
        comment: item.comment || "",
        selective: item.selective || false,
        constant: item.constant || false,
        position: "after_char"
      })),
      name: "",
      description: "",
      scan_depth: 100,
      token_budget: 2048,
      recursive_scanning: false,
      extensions: {}
    }
  });

  const handleExportJson = () => {
    try {
      if (!characterData || !loreItems.length) {
        console.warn('No data to export');
        return;
      }

      const exportData = createExportData(loreItems);
      const safeName = characterData?.data?.name?.replace(/[^a-z0-9]/gi, '_').trim();
      const filename = safeName ? `${safeName}-lorebook.json` : 'cardshark-lorebook.json';

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      try {
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
      } finally {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Normalize position helper
  const normalizePosition = (pos: any): LorePosition => {
    if (pos === 0 || pos === 1 || pos === 2 || pos === 3 || pos === 4 || pos === 5 || pos === 6) {
      return pos;
    }
    return LorePosition.AfterCharacter;
  };

  // Get and normalize lore items
  const loreItems: LoreItem[] = useMemo(() => {
    if (!characterData) return [];

    const entries = characterData.data?.character_book?.entries || 
                   characterData.character_book?.entries || 
                   [];

    return entries.map((entry: any): LoreItem => ({
      uid: entry.uid ?? entry.id ?? Date.now(),
      keys: entry.keys ?? [],
      keysecondary: entry.keysecondary ?? [],
      comment: entry.comment ?? '',
      content: entry.content ?? '',
      constant: entry.constant ?? false,
      vectorized: entry.vectorized ?? false,
      selective: entry.selective ?? false,
      selectiveLogic: entry.selectiveLogic ?? 0,
      order: entry.order ?? 100,
      position: normalizePosition(entry.position),
      disable: entry.disable ?? !entry.enabled ?? false,
      excludeRecursion: entry.excludeRecursion ?? false,
      preventRecursion: entry.preventRecursion ?? false,
      delayUntilRecursion: entry.delayUntilRecursion ?? false,
      displayIndex: entry.displayIndex ?? entry.uid,
      probability: entry.probability ?? 100,
      useProbability: entry.useProbability ?? true,
      depth: entry.depth ?? 4,
      group: entry.group ?? '',
      groupOverride: entry.groupOverride ?? false,
      groupWeight: entry.groupWeight ?? 100,
      scanDepth: entry.scanDepth ?? null,
      caseSensitive: entry.caseSensitive ?? null,
      matchWholeWords: entry.matchWholeWords ?? null,
      useGroupScoring: entry.useGroupScoring ?? null,
      automationId: entry.automationId ?? '',
      role: entry.role ?? null,
      sticky: entry.sticky ?? null,
      cooldown: entry.cooldown ?? null,
      delay: entry.delay ?? null
    }));
  }, [characterData]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!searchTerm) return loreItems;

    const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);
    
    return loreItems.filter((item: LoreItem) => {
      const keyTerms = item.keys
        .join(',')
        .toLowerCase()
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
        
      return searchWords.some(word => 
        keyTerms.some(term => term.includes(word)) ||
        item.content.toLowerCase().includes(word)
      );
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

  // Helper function to convert legacy character format
const convertTextFields = (text: string): string => {
  if (!text) return text;
  return text.replace(/{character}/g, "{{char}}");
};

// Handler functions
const handleImportJson = async () => {
  if (!characterData) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Use originalData.entries if available, otherwise try entries directly
      const entries = data.originalData?.entries || data.entries;
      
      if (!entries) {
        throw new Error('No valid entries found in JSON file');
      }

      const currentMaxOrder = Math.max(-1, ...loreItems.map(item => item.order));
      
      const newItems = entries.map((item: any, index: number): LoreItem => ({
        uid: Date.now() + index,
        keys: Array.isArray(item.keys) ? item.keys : item.key || [],
        keysecondary: item.keysecondary || [],
        comment: item.comment || '',
        content: convertTextFields(item.content || ''),
        constant: item.constant || false,
        vectorized: item.vectorized || false,
        selective: item.selective ?? true,
        selectiveLogic: item.selectiveLogic || 0,
        order: currentMaxOrder + index + 1,
        position: item.position || LorePosition.AfterCharacter,
        disable: !item.enabled,
        excludeRecursion: item.excludeRecursion || false,
        preventRecursion: item.preventRecursion || false,
        delayUntilRecursion: item.delayUntilRecursion || false,
        displayIndex: currentMaxOrder + index + 1,
        probability: item.probability || 100,
        useProbability: item.useProbability ?? true,
        depth: item.depth || 4,
        group: item.group || '',
        groupOverride: item.groupOverride || false,
        groupWeight: item.groupWeight || 100,
        scanDepth: item.scanDepth || null,
        caseSensitive: item.caseSensitive || null,
        matchWholeWords: item.matchWholeWords || null,
        useGroupScoring: item.useGroupScoring || null,
        automationId: item.automationId || '',
        role: item.role || null,
        sticky: item.sticky || null,
        cooldown: item.cooldown || null,
        delay: item.delay || null
      }));

      const updatedEntries = [...loreItems, ...newItems];
      updateCharacterBookEntries(updatedEntries);
    } catch (error) {
      console.error('Error importing JSON:', error);
    }
  };
  input.click();
};

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

      const currentMaxOrder = Math.max(-1, ...loreItems.map(item => item.order));

      const newItems = lines
        .map((line, index) => {
          const [key, value] = line.split('\t');
          if (!key?.trim() || !value?.trim()) return null;

          return {
            uid: Date.now() + index,
            keys: [key.trim()],
            keysecondary: [],
            comment: '',
            content: convertTextFields(value.trim()),
            constant: false,
            vectorized: false,
            selective: true,
            selectiveLogic: 0,
            order: currentMaxOrder + index + 1,
            position: LorePosition.AfterCharacter,
            disable: false,
            excludeRecursion: false,
            preventRecursion: false,
            delayUntilRecursion: false,
            displayIndex: currentMaxOrder + index + 1,
            probability: 100,
            useProbability: true,
            depth: 4,
            group: '',
            groupOverride: false,
            groupWeight: 100,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            useGroupScoring: null,
            automationId: '',
            role: null,
            sticky: null,
            cooldown: null,
            delay: null
          } as LoreItem;
        })
        .filter((item): item is LoreItem => item !== null);

      const updatedEntries = [...loreItems, ...newItems];
      updateCharacterBookEntries(updatedEntries);
    }
  };
  input.click();
};

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
        const currentMaxOrder = Math.max(-1, ...loreItems.map(item => item.order));
        
        const newItems = data.loreItems.map((item: any, index: number): LoreItem => ({
          uid: Date.now() + index,
          keys: Array.isArray(item.keys) ? item.keys : item.key || [],
          keysecondary: item.keysecondary || [],
          comment: item.comment || '',
          content: convertTextFields(item.content || ''),
          constant: item.constant || false,
          vectorized: item.vectorized || false,
          selective: item.selective ?? true,
          selectiveLogic: item.selectiveLogic || 0,
          order: currentMaxOrder + index + 1,
          position: item.position || LorePosition.AfterCharacter,
          disable: !item.enabled,
          excludeRecursion: item.excludeRecursion || false,
          preventRecursion: item.preventRecursion || false,
          delayUntilRecursion: item.delayUntilRecursion || false,
          displayIndex: currentMaxOrder + index + 1,
          probability: item.probability || 100,
          useProbability: item.useProbability ?? true,
          depth: item.depth || 4,
          group: item.group || '',
          groupOverride: item.groupOverride || false,
          groupWeight: item.groupWeight || 100,
          scanDepth: item.scanDepth || null,
          caseSensitive: item.caseSensitive || null,
          matchWholeWords: item.matchWholeWords || null,
          useGroupScoring: item.useGroupScoring || null,
          automationId: item.automationId || '',
          role: item.role || null,
          sticky: item.sticky || null,
          cooldown: item.cooldown || null,
          delay: item.delay || null
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

  // Add new lore item
  const handleAddItem = () => {
    if (!characterData) return;

    const newItem: LoreItem = {
      uid: Date.now(),
      keys: [],
      keysecondary: [],
      comment: '',
      content: '',
      constant: false,
      vectorized: false,
      selective: true,
      selectiveLogic: 0,
      order: loreItems.length,
      position: LorePosition.AfterCharacter,
      disable: false,
      excludeRecursion: false,
      preventRecursion: false,
      delayUntilRecursion: false,
      displayIndex: loreItems.length,
      probability: 100,
      useProbability: true,
      depth: 4,
      group: '',
      groupOverride: false,
      groupWeight: 100,
      scanDepth: null,
      caseSensitive: null,
      matchWholeWords: null,
      useGroupScoring: null,
      automationId: '',
      role: null,
      sticky: null,
      cooldown: null,
      delay: null
    };

    const updatedEntries = [...loreItems, newItem];
    updateCharacterBookEntries(updatedEntries);
  };

  // Delete lore item
  const handleDeleteItem = (uid: number) => {
    if (!characterData) return;

    const updatedEntries = loreItems
      .filter(item => item.uid !== uid)
      .map((item, index) => ({
        ...item,
        order: index,
        displayIndex: index
      }));

    updateCharacterBookEntries(updatedEntries);
  };

  // Update lore item
  const handleUpdateItem = (uid: number, updates: Partial<LoreItem>) => {
    if (!characterData) return;

    const updatedEntries = loreItems.map(item =>
      item.uid === uid ? { ...item, ...updates } : item
    );

    updateCharacterBookEntries(updatedEntries);
  };

  // Move item up
  const handleMoveUp = (uid: number) => {
    if (!characterData) return;

    const index = loreItems.findIndex(item => item.uid === uid);
    if (index <= 0) return;

    const newEntries = [...loreItems];
    const temp = newEntries[index];
    newEntries[index] = newEntries[index - 1];
    newEntries[index - 1] = temp;

    // Update order and displayIndex
    newEntries.forEach((item, idx) => {
      item.order = idx;
      item.displayIndex = idx;
    });

    updateCharacterBookEntries(newEntries);
  };

  // Move item down
  const handleMoveDown = (uid: number) => {
    if (!characterData) return;

    const index = loreItems.findIndex(item => item.uid === uid);
    if (index === -1 || index >= loreItems.length - 1) return;

    const newEntries = [...loreItems];
    const temp = newEntries[index];
    newEntries[index] = newEntries[index + 1];
    newEntries[index + 1] = temp;

    // Update order and displayIndex
    newEntries.forEach((item, idx) => {
      item.order = idx;
      item.displayIndex = idx;
    });

    updateCharacterBookEntries(newEntries);
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
              onClick={handleExportJson}
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