// src/handlers/importHandlers.ts
import { LoreItem } from '../types/loreTypes';
import { createLoreItem } from './loreHandlers';

function parseKey(key: string | string[] | undefined): string[] {
    if (Array.isArray(key)) {
        return key;
    }
    if (typeof key === 'string') {
        return key.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
    }
    return [];
}

export async function importJson(jsonData: string | object, currentMaxOrder: number): Promise<LoreItem[]> {
    let data;
    try {
        // Parse JSON if it's a string
        data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        if (!data) return [];

        // Detect format
        let entries: any[] = [];
        if (data.entries) {
            // Handle V2/CardShark format
            entries = Object.entries(data.entries).map(([key, value]: [string, any]) => ({
                ...value,
                uid: value.uid ?? parseInt(key)
            }));
        } else if (Array.isArray(data)) {
            // Handle array format
            entries = data;
        } else if (data.originalData?.entries) {
            // Handle SillyTavern format
            entries = data.originalData.entries;
        } else {
            console.error('Unknown lore format:', data);
            return [];
        }

        // Normalize entries
        return entries.map((entry: any, index: number) => {
            try {
                // Calculate new order value based on currentMaxOrder
                const newOrder = currentMaxOrder + index + 1;

                // Handle string keys vs array keys
                const keys = Array.isArray(entry.key) 
                    ? entry.key 
                    : (entry.keys || entry.key || '').split(',').map((k: string) => k.trim());

                return {
                    ...entry,
                    keys,
                    uid: entry.uid ?? entry.id ?? parseInt(entry.uid) ?? Date.now() + index,
                    position: entry.position ?? 1,
                    order: newOrder,
                    displayIndex: newOrder,
                    disable: entry.disable ?? !entry.enabled ?? false,
                    selective: entry.selective ?? false,
                    constant: entry.constant ?? false,
                    keysecondary: entry.keysecondary || [],
                    selectiveLogic: entry.selectiveLogic ?? 0
                };
            } catch (e) {
                console.error('Failed to normalize entry:', e, entry);
                return null;
            }
        }).filter((entry): entry is LoreItem => entry !== null);
    } catch (error) {
        console.error('Error importing JSON:', error);
        throw error;
    }
}

export async function importTsv(file: File, currentMaxOrder: number): Promise<LoreItem[]> {
    try {
        const text = await file.text();
        const lines = text.split('\n').filter((line: string) => line.trim());

        return lines
            .map((line: string, index: number) => {
                try {
                    const [key, value] = line.split('\t');
                    if (!key?.trim() || !value?.trim()) return null;

                    const newItem = createLoreItem(currentMaxOrder + index);
                    return {
                        ...newItem,
                        key: [key.trim()],
                        content: value.trim(),
                        order: currentMaxOrder + index + 1,
                        displayIndex: currentMaxOrder + index + 1
                    };
                } catch (error) {
                    console.error(`Error processing TSV line ${index + 1}:`, error);
                    return null;
                }
            })
            .filter((item): item is LoreItem => item !== null);
    } catch (error) {
        console.error('Error importing TSV file:', error);
        throw error;
    }
}

export async function importPng(file: File): Promise<LoreItem[]> {
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
        
        if (!data.success || !data.loreItems) {
            throw new Error('No lore items found in PNG');
        }

        return data.loreItems.map((item: any, index: number): LoreItem => {
            const newItem = createLoreItem(index);
            return {
                ...newItem,
                ...item,
                key: parseKey(item.key),
                displayIndex: index
            };
        });
    } catch (error) {
        console.error('Error importing PNG:', error);
        throw error;
    }
}