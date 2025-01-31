// src/handlers/importHandlers.ts
import { LoreItem, LorePosition } from '../types/loreTypes';

// TSV Import - **ONLY 2 COLUMN TSV FILES ARE SUPPORTED** KEY/CONTENT ONLY
export async function importTsv(file: File, currentMaxOrder: number): Promise<LoreItem[]> {
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());

  return lines
    .map((line, index) => {
      const [key, value] = line.split('\t');
      if (!key?.trim() || !value?.trim()) return null;

      return {
        uid: Date.now() + index,
        keys: [key.trim()],
        content: convertTextFields(value.trim()),
        order: currentMaxOrder + index + 1,
        displayIndex: currentMaxOrder + index + 1,
        // Let type system handle defaults for all other fields
      } as LoreItem;
    })
    .filter((item): item is LoreItem => item !== null);
}

// JSON Import
export async function importJson(file: File, currentMaxOrder: number): Promise<LoreItem[]> {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Get entries from the file - handle both formats
    let importedEntries = [];
    if (data.entries) {
      importedEntries = typeof data.entries === 'object' ? 
        Object.values(data.entries) : data.entries;
    } else if (data.originalData?.entries) {
      importedEntries = data.originalData.entries;
    }
  
    if (!importedEntries?.length) {
      throw new Error('No entries found in JSON file');
    }
  
    console.log('Importing entries:', importedEntries); // Debug log
  
    return importedEntries.map((item: any, index: number): LoreItem => {
      // Ensure order is properly handled
      const order = typeof item.order === 'number' ? item.order : 
                   typeof item.insertion_order === 'number' ? item.insertion_order : 
                   currentMaxOrder + index + 1;
  
      return {
        uid: Date.now() + index,
        keys: Array.isArray(item.key) ? item.key : 
              Array.isArray(item.keys) ? item.keys : [],
        keysecondary: item.keysecondary ?? [],
        comment: item.comment ?? '',
        content: convertTextFields(item.content || ''),
        constant: item.constant ?? false,
        vectorized: item.vectorized ?? false,
        selective: item.selective ?? true,
        selectiveLogic: item.selectiveLogic ?? 0,
        order: order,  // Using calculated order
        position: item.position ?? LorePosition.AfterCharacter,
        disable: item.disable ?? false,
        excludeRecursion: item.excludeRecursion ?? false,
        preventRecursion: item.preventRecursion ?? false,
        delayUntilRecursion: item.delayUntilRecursion ?? false,
        probability: item.probability ?? 100,
        useProbability: item.useProbability ?? true,
        depth: item.depth ?? 4,
        group: item.group ?? '',
        groupOverride: item.groupOverride ?? false,
        groupWeight: item.groupWeight ?? 100,
        scanDepth: item.scanDepth ?? null,
        caseSensitive: item.caseSensitive ?? null,
        matchWholeWords: item.matchWholeWords ?? null,
        useGroupScoring: item.useGroupScoring ?? null,
        displayIndex: currentMaxOrder + index + 1,
        automationId: item.automationId ?? '',
        role: item.role ?? null,
        sticky: item.sticky ?? null,    // Changed to use null as default
        cooldown: item.cooldown ?? null, // Changed to use null as default
        delay: item.delay ?? null,       // Changed to use null as default
        extensions: item.extensions ?? {}
      };
    });
  }
  
  // PNG Import
  export async function importPng(file: File): Promise<LoreItem[]> {
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
    
    if (!data.success || !data.loreItems) {
      throw new Error('No lore items found in PNG');
    }
  
    return data.loreItems.map((item: any, index: number): LoreItem => {
      // Ensure order is properly handled
      const order = typeof item.order === 'number' ? item.order : 
                   typeof item.insertion_order === 'number' ? item.insertion_order : 
                   index;
                   
      return {
        uid: Date.now() + index,
        keys: Array.isArray(item.keys) ? item.keys : item.key || [],
        keysecondary: item.keysecondary ?? [],
        comment: item.comment ?? '',
        content: convertTextFields(item.content || ''),
        constant: item.constant ?? false,
        vectorized: item.vectorized ?? false,
        selective: item.selective ?? true,
        selectiveLogic: item.selectiveLogic ?? 0,
        order: order,  // Using calculated order
        position: item.position ?? LorePosition.AfterCharacter,
        disable: !item.enabled,
        excludeRecursion: item.excludeRecursion ?? false,
        preventRecursion: item.preventRecursion ?? false,
        delayUntilRecursion: item.delayUntilRecursion ?? false,
        probability: item.probability ?? 100,
        useProbability: item.useProbability ?? true,
        depth: item.depth ?? 4,
        group: item.group ?? '',
        groupOverride: item.groupOverride ?? false,
        groupWeight: item.groupWeight ?? 100,
        scanDepth: item.scanDepth ?? null,
        caseSensitive: item.caseSensitive ?? null,
        matchWholeWords: item.matchWholeWords ?? null,
        useGroupScoring: item.useGroupScoring ?? null,
        displayIndex: index,
        automationId: item.automationId ?? '',
        role: item.role ?? null,
        sticky: item.sticky ?? null,    // Changed to use null as default
        cooldown: item.cooldown ?? null, // Changed to use null as default
        delay: item.delay ?? null,       // Changed to use null as default
        extensions: item.extensions ?? {}
      };
    });
  }
  
  // Helper function for character conversion
  function convertTextFields(text: string): string {
    if (!text) return text;
    return text.replace(/{character}/g, "{{char}}");
  }