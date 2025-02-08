// src/handlers/exportHandlers.ts
import { LoreItem, LorePosition } from '../types/loreTypes';

interface ExportData {
  entries: Record<string, LoreItem & { uid: number }>;
  originalData: {
    entries: Array<{
      keys: string[];
      content: string;
      enabled: boolean;
      insertion_order: number;
      case_sensitive: boolean;
      priority: number;
      id: number;
      comment: string;
      selective: boolean;
      constant: boolean;
      position: LorePosition;
      secondary_keys: string[];
      selectiveLogic: number;
      extensions: {
        group: string;
        group_override: boolean;
        group_weight: number;
        sticky: number;
        cooldown: number;
        delay: number;
        depth: number;
        probability: number;
        role: number;
        vectorized: boolean;
        exclude_recursion: boolean;
        prevent_recursion: boolean;
        delay_until_recursion: boolean;
        scan_depth: number | null;
        case_sensitive: boolean | null;
        match_whole_words: boolean | null;
        use_group_scoring: boolean | null;
        automation_id: string;
        display_index: number;
      };
    }>;
    name: string;
    description: string;
    scan_depth: number;
    token_budget: number;
    recursive_scanning: boolean;
    extensions: Record<string, unknown>;
  };
}

export function createLoreExport(items: LoreItem[], characterName?: string): void {
  try {
    if (!items.length) {
      console.warn('No items to export');
      return;
    }

    const exportData = formatExportData(items);
    downloadJson(exportData, characterName);
  } catch (error) {
    console.error('Export failed:', error);
  }
}

function formatExportData(items: LoreItem[]): ExportData {
  const entries: Record<string, LoreItem & { uid: number }> = {};
  const originalEntries: ExportData['originalData']['entries'] = [];

  items.forEach((item, index) => {
    // Ensure uid exists
    const uid = item.uid ?? index;
    
    // Format main entries object
    entries[index.toString()] = {
      ...item,
      uid,
      key: Array.isArray(item.key) ? item.key : [item.key].filter(Boolean),
      keysecondary: item.keysecondary || [],
      comment: item.comment || '',
      content: item.content || '',
      constant: item.constant || false,
      vectorized: item.vectorized || false,
      selective: item.selective || false,
      selectiveLogic: item.selectiveLogic || 0,
      addMemo: true,
      order: item.order || 100,
      position: item.position || LorePosition.AfterCharacter,
      disable: item.disable || false,
      excludeRecursion: item.excludeRecursion || false,
      preventRecursion: item.preventRecursion || false,
      delayUntilRecursion: item.delayUntilRecursion || false,
      probability: item.probability || 100,
      useProbability: item.useProbability ?? true,
      depth: item.depth || 0,
      group: item.group || '',
      groupOverride: item.groupOverride || false,
      groupWeight: item.groupWeight || 100,
      scanDepth: item.scanDepth || null,
      caseSensitive: item.caseSensitive || null,
      matchWholeWords: item.matchWholeWords || null,
      useGroupScoring: item.useGroupScoring || null,
      automationId: item.automationId || '',
      role: item.role || 0,
      sticky: item.sticky || 0,
      cooldown: item.cooldown || 0,
      delay: item.delay || 0,
      displayIndex: item.displayIndex || index
    };

    // Format original entries array
    originalEntries.push({
      keys: Array.isArray(item.key) ? item.key : [item.key].filter(Boolean),
      content: item.content || '',
      enabled: !item.disable,
      insertion_order: item.order || index,
      case_sensitive: item.caseSensitive || false,
      priority: 10, // Default priority
      id: uid,
      comment: item.comment || '',
      selective: item.selective || false,
      constant: item.constant || false,
      position: item.position || LorePosition.AfterCharacter,
      secondary_keys: item.keysecondary || [],
      selectiveLogic: item.selectiveLogic || 0,
      extensions: {
        group: item.group || '',
        group_override: item.groupOverride || false,
        group_weight: item.groupWeight || 100,
        sticky: item.sticky || 0,
        cooldown: item.cooldown || 0,
        delay: item.delay || 0,
        depth: item.depth || 0,
        probability: item.probability || 100,
        role: item.role || 0,
        vectorized: item.vectorized || false,
        exclude_recursion: item.excludeRecursion || false,
        prevent_recursion: item.preventRecursion || false,
        delay_until_recursion: item.delayUntilRecursion || false,
        scan_depth: item.scanDepth || null,
        case_sensitive: item.caseSensitive || null,
        match_whole_words: item.matchWholeWords || null,
        use_group_scoring: item.useGroupScoring || null,
        automation_id: item.automationId || '',
        display_index: item.displayIndex || index
      }
    });
  });

  return {
    entries,
    originalData: {
      entries: originalEntries,
      name: '',
      description: '',
      scan_depth: 100,
      token_budget: 2048,
      recursive_scanning: false,
      extensions: {}
    }
  };
}

function downloadJson(data: ExportData, characterName?: string): void {
  const safeName = characterName?.replace(/[^a-z0-9]/gi, '_').trim();
  const filename = safeName ? `${safeName}-lorebook.json` : 'cardshark-lorebook.json';
  
  // Add debug logging
  console.log('Exporting lore data:', {
    itemCount: Object.keys(data.entries).length,
    originalEntriesCount: data.originalData.entries.length,
    firstEntry: data.entries['0']
  });
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
}