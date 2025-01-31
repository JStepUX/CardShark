import { LoreItem, validatePosition } from '../types/loreTypes';

interface ExportData {
  entries: Record<number, LoreItem>;
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
      position: number; // Always numeric
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
  return {
    entries: items.reduce((acc, item) => {
      // Ensure position is a valid number 0-6
      const position = validatePosition(item.position);

      acc[item.uid] = {
        key: item.keys,
        keysecondary: item.keysecondary || [],
        comment: item.comment || "",
        content: item.content || "",
        constant: item.constant || false,
        vectorized: false,
        selective: item.selective || false,
        selectiveLogic: item.selectiveLogic || 0,
        addMemo: true,
        order: item.order || 0,
        position: position,
        disable: item.disable || false,
        excludeRecursion: item.excludeRecursion || false,
        preventRecursion: item.preventRecursion || false,
        delayUntilRecursion: false,
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
        displayIndex: item.displayIndex || 0,
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
        position: validatePosition(item.position) // Ensure numeric position here too
      })),
      name: "",
      description: "",
      scan_depth: 100,
      token_budget: 2048,
      recursive_scanning: false,
      extensions: {}
    }
  };
}

function downloadJson(data: any, characterName?: string): void {
  const safeName = characterName?.replace(/[^a-z0-9]/gi, '_').trim();
  const filename = safeName ? `${safeName}-lorebook.json` : 'cardshark-lorebook.json';
  
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