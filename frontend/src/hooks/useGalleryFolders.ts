/**
 * @file useGalleryFolders.ts
 * @description Hook for managing gallery folder state, navigation, CRUD, org mode, and migration.
 */
import { useState, useCallback, useMemo } from 'react';
import { CharacterFile } from '../types/schema';
import {
  FolderDefinition,
  GalleryFolderSettings,
  DEFAULT_FOLDERS,
  getFolderForCard,
  getDefaultFolderForCardType,
} from '../types/gallery';
import { updateCardFolder, bulkUpdateFolder } from '../api/galleryApi';
import { generateUUID } from '../utils/generateUUID';

interface UseGalleryFoldersOptions {
  settings: GalleryFolderSettings | undefined;
  onSettingsUpdate: (updates: { gallery_folders: GalleryFolderSettings }) => Promise<void>;
  onCacheInvalidate: () => void;
}

export function useGalleryFolders({ settings, onSettingsUpdate, onCacheInvalidate }: UseGalleryFoldersOptions) {
  const folders = useMemo<FolderDefinition[]>(() => {
    return settings?.folders ?? DEFAULT_FOLDERS;
  }, [settings]);

  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [organizationMode, setOrganizationMode] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());

  // Navigation
  const navigateToFolder = useCallback((name: string) => {
    setCurrentFolder(name);
    setOrganizationMode(false);
    setSelectedCards(new Set());
  }, []);

  const navigateBack = useCallback(() => {
    setCurrentFolder(null);
    setOrganizationMode(false);
    setSelectedCards(new Set());
  }, []);

  // Folder CRUD
  const createFolder = useCallback(async (name: string) => {
    const newFolder: FolderDefinition = {
      id: `user-${generateUUID()}`,
      name,
      isDefault: false,
      color: 'blue',
      sortOrder: folders.length,
    };
    const updated: GalleryFolderSettings = {
      migrated: settings?.migrated ?? true,
      folders: [...folders, newFolder],
    };
    await onSettingsUpdate({ gallery_folders: updated });
  }, [folders, settings, onSettingsUpdate]);

  const deleteFolder = useCallback(async (
    name: string,
    mode: 'delete_all' | 'dump_to_gallery',
    allCards: CharacterFile[]
  ) => {
    const cardsInFolder = allCards.filter(c => getFolderForCard(c) === name);
    const uuids = cardsInFolder
      .map(c => c.character_uuid)
      .filter((u): u is string => !!u);

    if (mode === 'dump_to_gallery' && uuids.length > 0) {
      // Move cards to unfiled (null folder)
      await bulkUpdateFolder(uuids, null);
    } else if (mode === 'delete_all' && uuids.length > 0) {
      // Cards stay assigned to a folder that no longer exists -
      // they'll effectively be orphaned. The bulk-delete of the cards
      // themselves would need to happen separately via the gallery's
      // existing delete flow. For now we just unfile them.
      await bulkUpdateFolder(uuids, null);
    }

    // Remove folder from settings
    const updated: GalleryFolderSettings = {
      migrated: settings?.migrated ?? true,
      folders: folders.filter(f => f.name !== name),
    };
    await onSettingsUpdate({ gallery_folders: updated });
    onCacheInvalidate();

    if (currentFolder === name) {
      setCurrentFolder(null);
    }
  }, [folders, settings, currentFolder, onSettingsUpdate, onCacheInvalidate]);

  // Organization mode
  const toggleOrganizationMode = useCallback(() => {
    setOrganizationMode(prev => {
      if (prev) setSelectedCards(new Set());
      return !prev;
    });
  }, []);

  const toggleCardSelection = useCallback((uuid: string) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((cards: CharacterFile[]) => {
    const uuids = cards
      .map(c => c.character_uuid)
      .filter((u): u is string => !!u);
    setSelectedCards(new Set(uuids));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedCards(new Set());
  }, []);

  const moveSelectedToFolder = useCallback(async (targetFolder: string | null) => {
    const uuids = Array.from(selectedCards);
    if (uuids.length === 0) return;

    await bulkUpdateFolder(uuids, targetFolder);
    setSelectedCards(new Set());
    onCacheInvalidate();
  }, [selectedCards, onCacheInvalidate]);

  // Card filtering
  const getCardsInFolder = useCallback((name: string, allCards: CharacterFile[]) => {
    return allCards.filter(c => getFolderForCard(c) === name);
  }, []);

  const getUnfiledCards = useCallback((allCards: CharacterFile[]) => {
    return allCards.filter(c => getFolderForCard(c) === null);
  }, []);

  const getFolderCardCount = useCallback((name: string, allCards: CharacterFile[]) => {
    return allCards.filter(c => getFolderForCard(c) === name).length;
  }, []);

  // First-time migration
  const runMigration = useCallback(async (allCards: CharacterFile[]) => {
    if (settings?.migrated) return;

    // Group cards by type and build bulk update per folder
    const cardsByFolder = new Map<string, string[]>();

    for (const card of allCards) {
      if (!card.character_uuid) continue;
      const folderName = getDefaultFolderForCardType(card);
      if (!cardsByFolder.has(folderName)) {
        cardsByFolder.set(folderName, []);
      }
      cardsByFolder.get(folderName)!.push(card.character_uuid);
    }

    // Execute bulk updates
    for (const [folderName, uuids] of cardsByFolder) {
      if (uuids.length > 0) {
        await bulkUpdateFolder(uuids, folderName);
      }
    }

    // Mark migrated
    const updated: GalleryFolderSettings = {
      migrated: true,
      folders: settings?.folders ?? DEFAULT_FOLDERS,
    };
    await onSettingsUpdate({ gallery_folders: updated });
    onCacheInvalidate();
  }, [settings, onSettingsUpdate, onCacheInvalidate]);

  // Assign folder to a single card
  const assignFolderToCard = useCallback(async (uuid: string, folderName: string | null) => {
    await updateCardFolder(uuid, folderName);
    onCacheInvalidate();
  }, [onCacheInvalidate]);

  return {
    folders,
    currentFolder,
    organizationMode,
    selectedCards,
    isMigrated: settings?.migrated ?? false,
    navigateToFolder,
    navigateBack,
    createFolder,
    deleteFolder,
    toggleOrganizationMode,
    toggleCardSelection,
    selectAll,
    deselectAll,
    moveSelectedToFolder,
    getCardsInFolder,
    getUnfiledCards,
    getFolderCardCount,
    runMigration,
    assignFolderToCard,
  };
}
