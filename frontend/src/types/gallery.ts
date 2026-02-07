/**
 * @file gallery.ts
 * @description Types and helpers for the gallery folder management system.
 */
import { CharacterFile } from './schema';

export interface FolderDefinition {
  id: string;
  name: string;
  isDefault: boolean;
  color: string;
  sortOrder?: number;
}

export interface GalleryFolderSettings {
  migrated: boolean;
  folders: FolderDefinition[];
}

export const DEFAULT_FOLDER_IDS = {
  CHARACTERS: 'default-characters',
  WORLDS: 'default-worlds',
  ROOMS: 'default-rooms',
} as const;

export const DEFAULT_FOLDERS: FolderDefinition[] = [
  { id: DEFAULT_FOLDER_IDS.CHARACTERS, name: 'Characters', isDefault: true, color: 'stone', sortOrder: 0 },
  { id: DEFAULT_FOLDER_IDS.WORLDS, name: 'Worlds', isDefault: true, color: 'emerald', sortOrder: 1 },
  { id: DEFAULT_FOLDER_IDS.ROOMS, name: 'Rooms', isDefault: true, color: 'purple', sortOrder: 2 },
];

export const DEFAULT_GALLERY_FOLDER_SETTINGS: GalleryFolderSettings = {
  migrated: false,
  folders: DEFAULT_FOLDERS,
};

/**
 * Get the folder name a card belongs to based on its extensions.
 * Returns null if the card is unfiled.
 */
export function getFolderForCard(card: CharacterFile): string | null {
  return card.extensions?.cardshark_folder ?? null;
}

/**
 * Get the default folder name for a card based on its card_type.
 * Used during first-time migration.
 */
export function getDefaultFolderForCardType(card: CharacterFile): string {
  const cardType = card.card_type || card.extensions?.card_type || 'character';
  switch (cardType) {
    case 'world': return 'Worlds';
    case 'room': return 'Rooms';
    default: return 'Characters';
  }
}
