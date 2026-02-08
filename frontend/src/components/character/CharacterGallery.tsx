/**
 * @file CharacterGallery.tsx
 * @description Grid view for displaying and selecting character cards with folder management.
 * @dependencies useCharacter, GalleryGrid, useGalleryFolders, backend API
 * @consumers AppRoutes.tsx, WorldCreationModal.tsx
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCharacter } from '../../contexts/CharacterContext';
import { useComparison } from '../../contexts/ComparisonContext';
import { useSettings } from '../../contexts/SettingsContext';
import { CharacterFile } from '../../types/schema';
import { GalleryFolderSettings, DEFAULT_GALLERY_FOLDER_SETTINGS, getFolderForCard } from '../../types/gallery';
import { Trash2, AlertTriangle, X, ArrowUpDown, Calendar, ChevronDown, Map as MapIcon, Info, RefreshCw, DoorOpen, Download, ArrowLeft, Settings2, ImagePlus } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';
import GalleryGrid from '../GalleryGrid';
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';
import WorldDeleteConfirmationDialog from '../common/WorldDeleteConfirmationDialog';
import FolderDeleteConfirmationDialog from '../common/FolderDeleteConfirmationDialog';
import KoboldCPPDrawerManager from '../KoboldCPPDrawerManager';
import { GalleryFolderTile, NewFolderTile } from './GalleryFolderTile';
import NewFolderDialog from './NewFolderDialog';
import OrganizationToolbar from './OrganizationToolbar';
import { useCharacterSort } from '../../hooks/useCharacterSort';
import { useGalleryFolders } from '../../hooks/useGalleryFolders';
import { worldApi } from '../../api/worldApi';
import { roomApi } from '../../api/roomApi';
import { bulkUpdateFolder } from '../../api/galleryApi';

// Track API calls across component instances - simplified
const apiRequestCache = {
  pendingRequests: new Map<string, Promise<Response>>()
};


// Props for the CharacterGallery component
interface CharacterGalleryProps {
  settingsChangeCount?: number;
  isSecondarySelector?: boolean;
  onCharacterSelected?: () => void;
  onCharacterClick?: (character: CharacterFile) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  lazyLoad?: boolean;
}

const encodeFilePath = (path: string): string => {
  const normalizedPath = path.replace(/\\/g, '/');
  const fileNameMatch = normalizedPath.match(/[^/]+$/);
  const fileName = fileNameMatch ? fileNameMatch[0] : '';
  try {
    return encodeURIComponent(normalizedPath);
  } catch {
    return fileName ? encodeURIComponent(fileName) : 'unknown';
  }
};

const cachedFetch = (url: string, options?: RequestInit): Promise<Response> => {
  const existingRequest = apiRequestCache.pendingRequests.get(url);
  if (existingRequest) return existingRequest;
  const newRequest = fetch(url, options);
  apiRequestCache.pendingRequests.set(url, newRequest);
  newRequest.finally(() => { apiRequestCache.pendingRequests.delete(url); });
  return newRequest;
};

// Memoized card component - only re-renders when its own props change
interface GalleryCardProps {
  character: CharacterFile;
  isDeleting: boolean;
  isSelected: boolean;
  organizationMode: boolean;
  isSecondarySelector: boolean;
  onDragStart: (e: React.DragEvent, character: CharacterFile) => void;
  onClick: (character: CharacterFile) => void;
  onTrashClick: (e: React.MouseEvent, character: CharacterFile) => void;
  onInfoClick: (e: React.MouseEvent, character: CharacterFile) => void;
  onExportClick: (e: React.MouseEvent, character: CharacterFile) => void;
  getImageUrl: (character: CharacterFile) => string;
}

const GalleryCard = React.memo<GalleryCardProps>(({
  character,
  isDeleting: isCardDeleting,
  isSelected,
  organizationMode,
  isSecondarySelector,
  onDragStart,
  onClick,
  onTrashClick,
  onInfoClick,
  onExportClick,
  getImageUrl,
}) => {
  const cardType = character.card_type || character.extensions?.card_type;
  const isWorld = cardType === 'world';
  const isRoom = cardType === 'room';

  return (
    <div
      key={`${character.path}-${character.character_uuid || ''}`}
      draggable={organizationMode}
      onDragStart={(e) => onDragStart(e, character)}
      className={`
        relative group cursor-pointer rounded-lg overflow-hidden shadow-lg bg-stone-800 aspect-[3/5]
        transition-all ${isCardDeleting ? 'duration-300 ease-out' : 'duration-200 ease-in-out'}
        ${isCardDeleting ? 'scale-0 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'}
        ${character.is_incomplete ? 'ring-2 ring-amber-500/70' : ''}
        ${isSelected ? 'ring-2 ring-blue-500 shadow-blue-500/30' : ''}
        hover:shadow-xl
      `}
      onClick={() => onClick(character)}
      role="button"
      tabIndex={0}
      aria-label={`Select ${isWorld ? 'world' : isRoom ? 'room' : 'character'} ${character.name}`}
    >
      {/* Org mode selection checkbox */}
      {organizationMode && (
        <div className={`absolute top-2 left-2 z-20 w-5 h-5 rounded border-2 flex items-center justify-center transition-all
          ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-black/40 border-white/60'}`}>
          {isSelected && <span className="text-white text-xs font-bold">✓</span>}
        </div>
      )}

      {/* Incomplete indicator */}
      {character.is_incomplete && !organizationMode && (
        <div className="absolute top-2 left-2 z-10 p-1.5 bg-amber-500/90 text-white rounded-full shadow-lg" title="Needs setup">
          <AlertTriangle size={16} />
        </div>
      )}

      {/* World/Room badge */}
      {isWorld && !organizationMode && (
        <div className={`absolute top-2 ${character.is_incomplete ? 'left-11' : 'left-2'} z-10 p-1.5 bg-emerald-600/80 text-white rounded-full shadow-lg backdrop-blur-sm border border-emerald-500/30`} title="World Card">
          <MapIcon size={16} />
        </div>
      )}
      {isRoom && !organizationMode && (
        <div className={`absolute top-2 ${character.is_incomplete ? 'left-11' : 'left-2'} z-10 p-1.5 bg-purple-600/80 text-white rounded-full shadow-lg backdrop-blur-sm border border-purple-500/30`} title="Room Card">
          <DoorOpen size={16} />
        </div>
      )}

      {/* Action buttons - hidden in org mode */}
      {!isSecondarySelector && !organizationMode && (
        <>
          <button onClick={(e) => onTrashClick(e, character)}
            className="absolute top-2 right-2 z-10 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
            aria-label={`Delete ${character.name}`}><Trash2 size={16} /></button>
          {isWorld && (
            <button onClick={(e) => onExportClick(e, character)}
              className="absolute top-2 right-10 z-10 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-emerald-600"
              aria-label={`Export ${character.name}`} title="Export as .cardshark.zip"><Download size={16} /></button>
          )}
          <button onClick={(e) => onInfoClick(e, character)}
            className={`absolute top-2 ${isWorld ? 'right-[4.5rem]' : 'right-10'} z-10 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600`}
            aria-label={`Info for ${character.name}`} title={isWorld ? "World Builder" : isRoom ? "Room Editor" : "Basic Info"}><Info size={16} /></button>
        </>
      )}

      {/* Image */}
      <div className="w-full h-full bg-stone-950">
        <img src={getImageUrl(character)} alt={character.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy" decoding="async" onError={(e) => { (e.target as HTMLImageElement).src = '/pngPlaceholder.png'; }} />
      </div>

      {/* Name overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6 text-white text-sm font-medium truncate rounded-b-lg">
        {character.name}
      </div>
    </div>
  );
});

const CharacterGallery: React.FC<CharacterGalleryProps> = ({
  settingsChangeCount = 0,
  isSecondarySelector = false,
  onCharacterSelected,
  onCharacterClick,
  scrollContainerRef,
  lazyLoad = false,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings, updateSettings } = useSettings();

  // State for character list, loading status, and errors
  const [characters, setCharacters] = useState<CharacterFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Infinite scrolling
  const [displayedCount, setDisplayedCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Deletion state
  const [characterToDelete, setCharacterToDelete] = useState<CharacterFile | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [isWorldDeleteConfirmOpen, setIsWorldDeleteConfirmOpen] = useState(false);

  // Folder dialogs
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  const loadingRef = useRef<{ currentSettingsCount: number; isLoading: boolean }>({
    currentSettingsCount: -1, isLoading: false
  });

  const {
    setCharacterData, setImageUrl, setIsLoading: setPrimaryLoading,
    characterCache, setCharacterCache, invalidateCharacterCache
  } = useCharacter();
  const { setSecondaryCharacterData, setSecondaryImageUrl, setSecondaryIsLoading } = useComparison();

  const containerRef = useRef<HTMLDivElement>(null);
  const activeContainerRef = scrollContainerRef || containerRef;
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Gallery folders hook
  const folderSettings: GalleryFolderSettings = settings.gallery_folders ?? DEFAULT_GALLERY_FOLDER_SETTINGS;
  const galFolders = useGalleryFolders({
    settings: folderSettings,
    onSettingsUpdate: async (updates) => { await updateSettings(updates); },
    onCacheInvalidate: invalidateCharacterCache,
  });

  // Restore folder from URL param (e.g. back from CharacterDetailView)
  const folderFromUrl = searchParams.get('folder');
  useEffect(() => {
    if (folderFromUrl && galFolders.currentFolder !== folderFromUrl) {
      galFolders.navigateToFolder(folderFromUrl);
      // Clear the param so it doesn't persist on subsequent navigations
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('folder');
        return next;
      }, { replace: true });
    }
  }, [folderFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close sort dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Run migration on first load if needed
  const migrationRanRef = useRef(false);
  useEffect(() => {
    if (!galFolders.isMigrated && characters.length > 0 && !isLoading && !migrationRanRef.current) {
      migrationRanRef.current = true;
      galFolders.runMigration(characters).then(() => {
        invalidateCharacterCache();
        if (currentDirectory) loadFromDirectory(currentDirectory);
      });
    }
  }, [galFolders.isMigrated, characters.length, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtering: search only (no type filter - folders replace that)
  const filteredCharacters = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) return characters;
    return characters.filter(char => char.name.toLowerCase().includes(searchLower));
  }, [characters, searchTerm]);

  // Folder-scoped cards
  const displayCards = useMemo(() => {
    if (galFolders.currentFolder === null) {
      // Top-level: show unfiled cards only (folders shown as tiles above)
      if (searchTerm.trim()) {
        // When searching at top level, search all cards
        return filteredCharacters;
      }
      return filteredCharacters.filter(c => getFolderForCard(c) === null);
    }
    // Inside a folder: show cards in that folder
    const folderCards = filteredCharacters.filter(c => getFolderForCard(c) === galFolders.currentFolder);
    return folderCards;
  }, [filteredCharacters, galFolders.currentFolder, searchTerm]);

  // Sorting
  const {
    sortedItems: sortedDisplayCards,
    sortOption, setSortOption, sortLabel
  } = useCharacterSort(displayCards, { getName: (c) => c.name, getDate: (c) => c.modified }, 'name_asc');

  // Load more
  const loadMore = useCallback(() => {
    if (isLoadingMore || displayedCount >= sortedDisplayCards.length) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      const batchSize = Math.min(15, sortedDisplayCards.length - displayedCount);
      if (batchSize > 0) setDisplayedCount(prev => prev + batchSize);
      setIsLoadingMore(false);
    }, 100);
  }, [isLoadingMore, displayedCount, sortedDisplayCards.length]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loadMoreTriggerRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isLoading && sortedDisplayCards.length > displayedCount) loadMore();
    }, { root: activeContainerRef.current, rootMargin: '200px', threshold: 0.1 });
    observer.observe(loadMoreTriggerRef.current);
    return () => { if (loadMoreTriggerRef.current) observer.unobserve(loadMoreTriggerRef.current); };
  }, [loadMore, isLoading, sortedDisplayCards.length, displayedCount, activeContainerRef]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 300 &&
        !isLoading && !isLoadingMore && displayedCount < sortedDisplayCards.length) {
      loadMore();
    }
  }, [loadMore, isLoading, isLoadingMore, displayedCount, sortedDisplayCards.length]);

  // Load characters (database-first)
  const loadFromDirectory = useCallback(async (directory: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setDeleteError(null);
      setDeletingPath(null);
      setDisplayedCount(20);

      if (characterCache?.isValid && characterCache.directory === directory && characterCache.characters.length > 0) {
        setCharacters(characterCache.characters);
        setCurrentDirectory(directory);
        setIsLoading(false);
        return;
      }

      let response: Response;
      let data: Record<string, unknown>;

      try {
        response = await cachedFetch('/api/characters');
        if (response.ok) {
          data = await response.json();
          if ((data as Record<string, unknown>).success && Array.isArray((data as Record<string, unknown>).characters) && ((data as Record<string, unknown>).characters as unknown[]).length > 0) {
            const files = ((data as Record<string, unknown>).characters as Record<string, unknown>[]).map((char) => ({
              name: char.name as string,
              path: char.png_file_path as string,
              size: 0,
              modified: new Date(char.updated_at as string).getTime() / 1000,
              character_uuid: char.character_uuid as string,
              description: char.description as string | undefined,
              is_incomplete: (char.is_incomplete as boolean) || false,
              extensions: (char.extensions_json as Record<string, unknown>) || {},
              tags: (char.tags as string[]) || [],
            }));
            setCharacterCache({ characters: files, directory, timestamp: Date.now(), isValid: true });
            setCharacters(files);
            setCurrentDirectory(directory);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Fall through to directory scan
      }

      response = await cachedFetch(`/api/characters?directory=${encodeFilePath(directory)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Server error (${response.status})` }));
        throw new Error((errorData as Record<string, unknown>).message as string || `Failed to load characters. Status: ${response.status}`);
      }

      data = await response.json();
      if ((data as Record<string, unknown>).success === false || (data as Record<string, unknown>).exists === false) {
        setError(((data as Record<string, unknown>).message as string) || 'Directory not found.');
        setCharacters([]);
        setCurrentDirectory(((data as Record<string, unknown>).directory as string) || directory);
        setCharacterCache(null);
      } else {
        const charList = ((data as Record<string, unknown>).characters || (data as Record<string, unknown>).files || []) as Record<string, unknown>[];
        const mapped = charList.map((c) => ({
          name: c.name as string,
          path: (c.path || c.png_file_path) as string,
          size: (c.size as number) || 0,
          modified: (c.modified || c.updated_at || new Date().toISOString()) as string | number,
          character_uuid: c.character_uuid as string | undefined,
          description: c.description as string | undefined,
          is_incomplete: (c.is_incomplete as boolean) || false,
          extensions: (c.extensions_json as Record<string, unknown>) || {},
          tags: (c.tags as string[]) || [],
        }));
        if (mapped.length > 0) {
          setCharacterCache({ characters: mapped, directory: ((data as Record<string, unknown>).directory as string) || directory, timestamp: Date.now(), isValid: true });
        }
        setCharacters(mapped);
        setCurrentDirectory(((data as Record<string, unknown>).directory as string) || directory);
        if (mapped.length === 0) setError('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading characters.');
      setCharacters([]);
      setCurrentDirectory(directory);
      setCharacterCache(null);
    } finally {
      setIsLoading(false);
    }
  }, [characterCache, setCharacterCache]);

  // Attach scroll handler for lazy loading
  useEffect(() => {
    if ((lazyLoad || scrollContainerRef) && activeContainerRef.current) {
      const el = activeContainerRef.current;
      const handler = () => { if (el.offsetParent !== null) handleScroll({ currentTarget: el } as unknown as React.UIEvent<HTMLDivElement>); };
      el.addEventListener('scroll', handler);
      return () => el.removeEventListener('scroll', handler);
    }
  }, [activeContainerRef, lazyLoad, handleScroll]);

  // Load settings on mount / settings change
  useEffect(() => {
    if (loadingRef.current.isLoading && loadingRef.current.currentSettingsCount === settingsChangeCount) return;
    loadingRef.current.isLoading = true;
    loadingRef.current.currentSettingsCount = settingsChangeCount;

    const loadSettings = async () => {
      try {
        setIsLoading(true); setError(null); setDeleteError(null); setDeletingPath(null);
        setCurrentDirectory(null); setCharacters([]);
        if (settingsChangeCount > 0) invalidateCharacterCache();

        const response = await cachedFetch('/api/settings');
        if (!response.ok) throw new Error('Failed to load settings.');
        const data = await response.json();
        if (data.success && data.data?.settings?.character_directory) {
          await loadFromDirectory(data.data.settings.character_directory);
        } else if (data.success && data.data?.settings && !data.data.settings.character_directory) {
          setError('Character directory not set in Settings.');
          setIsLoading(false);
        } else {
          throw new Error(data.message || 'Failed to retrieve valid settings.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading settings.');
        setIsLoading(false);
      } finally {
        loadingRef.current.isLoading = false;
      }
    };
    loadSettings();
  }, [settingsChangeCount, loadFromDirectory, invalidateCharacterCache]);

  const handleManualRefresh = useCallback(async () => {
    if (isRefreshing || !currentDirectory) return;
    setIsRefreshing(true);
    try {
      invalidateCharacterCache();
      await loadFromDirectory(currentDirectory);
    } catch { /* ignore */ }
    finally { setIsRefreshing(false); }
  }, [isRefreshing, currentDirectory, invalidateCharacterCache, loadFromDirectory]);

  useEffect(() => { setDisplayedCount(20); }, [searchTerm, galFolders.currentFolder]);

  // Helpers
  const getCharacterImage = useCallback((char: CharacterFile) => {
    const timestamp = typeof char.modified === 'number' ? char.modified : new Date(char.modified).getTime();
    if (char.character_uuid) return `/api/character-image/${char.character_uuid}?t=${timestamp}`;
    if (char.path) return `/api/character-image/${encodeFilePath(char.path)}?t=${timestamp}`;
    return '';
  }, []);

  const selectCharacter = useCallback(async (character: CharacterFile, targetRoute?: string, isInfoRequest: boolean = false) => {
    if (deletingPath === character.path) return;
    if (!isInfoRequest && typeof onCharacterClick === 'function') { onCharacterClick(character); return; }

    setDeleteError(null);
    const setLoading = isSecondarySelector ? setSecondaryIsLoading : setPrimaryLoading;
    setLoading(true); setError(null);

    try {
      const imageResponse = await fetch(getCharacterImage(character));
      if (!imageResponse.ok) throw new Error(`Failed to load image (${imageResponse.status})`);
      const blob = await imageResponse.blob();
      const metadataResponse = await fetch(`/api/character-metadata/${encodeFilePath(character.path)}`);
      if (!metadataResponse.ok) throw new Error('Failed to load metadata.');
      const data = await metadataResponse.json();
      const metadata = data.success && data.data ? data.data : data;

      if (metadata) {
        const newImageUrl = URL.createObjectURL(blob);
        if (isSecondarySelector && !isInfoRequest) {
          setSecondaryCharacterData(metadata); setSecondaryImageUrl(newImageUrl);
          if (onCharacterSelected) onCharacterSelected();
        } else {
          setCharacterData(metadata); setImageUrl(newImageUrl);
          if (targetRoute) { navigate(targetRoute); }
          else {
            const cardType = character.card_type || character.extensions?.card_type;
            if (cardType === 'room' && character.character_uuid) navigate(`/room/${character.character_uuid}/edit`);
            else if (cardType === 'world' && character.character_uuid) navigate(`/world/${character.character_uuid}/launcher`);
            else if (character.character_uuid && character.is_incomplete) navigate(`/character/${character.character_uuid}?tab=info${galFolders.currentFolder ? `&folder=${encodeURIComponent(galFolders.currentFolder)}` : ''}`);
            else if (character.character_uuid) navigate(`/character/${character.character_uuid}${galFolders.currentFolder ? `?folder=${encodeURIComponent(galFolders.currentFolder)}` : ''}`);
            else navigate('/chat');
          }
        }
      } else { throw new Error('Invalid response format.'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Error selecting character.'); }
    finally { setLoading(false); }
  }, [deletingPath, onCharacterClick, isSecondarySelector, getCharacterImage, navigate,
      setCharacterData, setImageUrl, onCharacterSelected, setSecondaryCharacterData,
      setSecondaryImageUrl, setSecondaryIsLoading, setPrimaryLoading, galFolders.currentFolder]);

  const handleCharacterClick = useCallback((character: CharacterFile) => {
    if (galFolders.organizationMode) {
      if (character.character_uuid) galFolders.toggleCardSelection(character.character_uuid);
      return;
    }
    selectCharacter(character);
  }, [galFolders.organizationMode, galFolders.toggleCardSelection, selectCharacter]);

  const handleInfoIconClick = useCallback(async (event: React.MouseEvent, character: CharacterFile) => {
    event.stopPropagation();
    const folderParam = galFolders.currentFolder ? `&folder=${encodeURIComponent(galFolders.currentFolder)}` : '';
    if (character.extensions?.card_type === 'world' && character.character_uuid) {
      await selectCharacter(character, `/world/${character.character_uuid}/builder`, true);
    } else if (character.character_uuid) {
      await selectCharacter(character, `/character/${character.character_uuid}?tab=info${folderParam}`, true);
    } else {
      selectCharacter(character, '/info', true);
    }
  }, [selectCharacter, galFolders.currentFolder]);

  const handleTrashIconClick = useCallback((event: React.MouseEvent, character: CharacterFile) => {
    event.stopPropagation();
    setDeleteError(null);
    setCharacterToDelete(character);
    const cardType = character.card_type || character.extensions?.card_type;
    if (cardType === 'world' && character.character_uuid) setIsWorldDeleteConfirmOpen(true);
    else setIsDeleteConfirmOpen(true);
  }, []);

  const handleConfirmDelete = async () => {
    if (!characterToDelete) return;
    setIsDeleting(true); setDeletingPath(characterToDelete.path);
    try {
      const fileName = characterToDelete.path.split(/[/\\]/).pop() || characterToDelete.name;
      const deleteUrl = characterToDelete.character_uuid
        ? `/api/character/${encodeURIComponent(characterToDelete.character_uuid)}?delete_png=true`
        : `/api/character-by-path/${encodeFilePath(characterToDelete.path)}?delete_png=true`;
      const response = await fetch(deleteUrl, { method: 'DELETE' });
      let result: Record<string, unknown>;
      try { result = await response.json(); } catch { result = { message: response.ok ? 'Success' : `Failed (${response.status})` }; }
      if (!response.ok) {
        let errorMessage = (result.detail || result.message || `Failed (${response.status})`) as string;
        if (response.status === 404) { errorMessage = ''; }
        else if (response.status === 403) { errorMessage = `Permission denied: ${fileName}`; }
        else if (response.status >= 500) { errorMessage = `Server error deleting: ${fileName}`; }
        if (errorMessage) throw new Error(errorMessage);
      }
      setCharacters(prev => prev.filter(c => c.path !== characterToDelete.path));
      invalidateCharacterCache();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unknown deletion error.');
      setDeletingPath(null);
    } finally {
      setIsDeleting(false); setIsDeleteConfirmOpen(false);
      setTimeout(() => setCharacterToDelete(null), 300);
    }
  };

  const handleImportWorld = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.cardshark.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        setIsLoading(true);
        const result = await worldApi.importWorld(file);
        alert(`${result.message}\nWorld UUID: ${result.uuid}`);
        handleManualRefresh();
      } catch (err) { setError(err instanceof Error ? err.message : 'Failed to import world'); }
      finally { setIsLoading(false); }
    };
    input.click();
  };

  const handleExportWorld = useCallback(async (event: React.MouseEvent, character: CharacterFile) => {
    event.stopPropagation();
    if (!character.character_uuid) { alert('Cannot export: World UUID not found'); return; }
    try {
      const blob = await worldApi.exportWorld(character.character_uuid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${character.name}.cardshark.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to export world'); }
  }, []);

  const handleCleanupOrphanedRooms = async () => {
    try {
      const preview = await roomApi.listOrphanedRooms();
      if (preview.count === 0) { alert('No orphaned rooms found.'); return; }
      const confirmed = window.confirm(
        `Found ${preview.count} orphaned room(s).\n\n` +
        `Rooms to delete:\n${preview.orphaned_rooms.map((r: { name: string }) => `• ${r.name}`).join('\n')}\n\nDelete them?`
      );
      if (!confirmed) return;
      setIsLoading(true);
      const result = await roomApi.cleanupOrphanedRooms();
      if (result.success) {
        alert(`${result.message}\n\nDeleted: ${result.deleted_names.join(', ') || 'None'}`);
        handleManualRefresh();
      }
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to cleanup orphaned rooms'); }
    finally { setIsLoading(false); }
  };

  const handleCancelDelete = () => { setIsDeleteConfirmOpen(false); setCharacterToDelete(null); };
  const handleCancelWorldDelete = () => { setIsWorldDeleteConfirmOpen(false); setCharacterToDelete(null); };

  const handleConfirmWorldDelete = async (deleteRooms: boolean) => {
    if (!characterToDelete?.character_uuid) return;
    setIsDeleting(true); setDeletingPath(characterToDelete.path);
    try {
      const result = deleteRooms
        ? await worldApi.deleteWorldWithRooms(characterToDelete.character_uuid, true)
        : await worldApi.deleteWorld(characterToDelete.character_uuid);
      if (!result.success) throw new Error('Failed to delete world');
      setCharacters(prev => prev.filter(c => c.path !== characterToDelete.path));
      invalidateCharacterCache();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unknown deletion error.');
      setDeletingPath(null);
    } finally {
      setIsDeleting(false); setIsWorldDeleteConfirmOpen(false);
      setTimeout(() => setCharacterToDelete(null), 300);
    }
  };

  // Drag handlers for cards in org mode
  const handleCardDragStart = useCallback((e: React.DragEvent, character: CharacterFile) => {
    if (!galFolders.organizationMode || !character.character_uuid) { e.preventDefault(); return; }
    // Store the dragged card's UUID in dataTransfer — do NOT update selection
    // state here, as re-rendering the dragged element cancels the drag in Chromium.
    e.dataTransfer.setData('text/plain', character.character_uuid);
    e.dataTransfer.effectAllowed = 'move';
  }, [galFolders.organizationMode]);

  const handleFolderDrop = useCallback((folderName: string, e: React.DragEvent) => {
    const draggedUuid = e.dataTransfer.getData('text/plain');
    // Collect UUIDs to move: all currently selected + the dragged card
    const uuidsToMove = new Set(galFolders.selectedCards);
    if (draggedUuid) uuidsToMove.add(draggedUuid);
    if (uuidsToMove.size === 0) return;

    // Optimistic: update local state immediately
    setCharacters(prev => prev.map(c =>
      c.character_uuid && uuidsToMove.has(c.character_uuid)
        ? { ...c, extensions: { ...c.extensions, cardshark_folder: folderName } }
        : c
    ));
    galFolders.deselectAll();
    invalidateCharacterCache();

    // Fire API in background; reload on failure
    bulkUpdateFolder(Array.from(uuidsToMove), folderName).catch(() => {
      if (currentDirectory) loadFromDirectory(currentDirectory);
    });
  }, [galFolders.selectedCards, galFolders.deselectAll, invalidateCharacterCache, currentDirectory, loadFromDirectory]);

  // Pre-compute folder card counts once (instead of O(n) per folder per render)
  const folderCardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of characters) {
      const folder = getFolderForCard(c);
      if (folder) counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
    return counts;
  }, [characters]);

  // Determine context-specific info
  // isInWorldsFolder removed — world import now always in header
  const isInRoomsFolder = galFolders.currentFolder === 'Rooms';
  const itemCount = sortedDisplayCards.length;

  // Render a character card via memoized GalleryCard component
  const renderCharacterCard = useCallback((character: CharacterFile) => {
    const isCardDeleting = deletingPath === character.path;
    const isSelected = galFolders.organizationMode && character.character_uuid
      ? galFolders.selectedCards.has(character.character_uuid) : false;

    return (
      <GalleryCard
        key={`${character.path}-${character.character_uuid || ''}`}
        character={character}
        isDeleting={isCardDeleting}
        isSelected={isSelected}
        organizationMode={galFolders.organizationMode}
        isSecondarySelector={isSecondarySelector}
        onDragStart={handleCardDragStart}
        onClick={handleCharacterClick}
        onTrashClick={handleTrashIconClick}
        onInfoClick={handleInfoIconClick}
        onExportClick={handleExportWorld}
        getImageUrl={getCharacterImage}
      />
    );
  }, [deletingPath, galFolders.organizationMode, galFolders.selectedCards, isSecondarySelector, handleCardDragStart, handleCharacterClick, handleTrashIconClick, handleInfoIconClick, handleExportWorld, getCharacterImage]);

  // Calculate folder card count for folder delete dialog (uses pre-computed counts)
  const folderDeleteCardCount = folderToDelete
    ? (folderCardCounts.get(folderToDelete) ?? 0)
    : 0;

  // Stable callbacks for OrganizationToolbar
  const handleToolbarSelectAll = useCallback(() => {
    galFolders.selectAll(sortedDisplayCards);
  }, [galFolders.selectAll, sortedDisplayCards]);

  const handleToolbarMoveToFolder = useCallback(async (name: string | null) => {
    const uuids = Array.from(galFolders.selectedCards);
    if (uuids.length === 0) return;

    // Optimistic: update local state immediately
    setCharacters(prev => prev.map(c =>
      c.character_uuid && uuids.includes(c.character_uuid)
        ? { ...c, extensions: { ...c.extensions, cardshark_folder: name } }
        : c
    ));
    galFolders.deselectAll();
    invalidateCharacterCache();

    // Fire API in background; reload on failure
    bulkUpdateFolder(uuids, name).catch(() => {
      if (currentDirectory) loadFromDirectory(currentDirectory);
    });
  }, [galFolders.selectedCards, galFolders.deselectAll, invalidateCharacterCache, currentDirectory, loadFromDirectory]);

  return (
    <div className="h-full flex flex-col bg-stone-900 text-white">
      {/* Header */}
      <div className="flex-none border-b border-stone-700 shadow-md bg-stone-900 z-20">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {/* Back button when inside a folder */}
              {galFolders.currentFolder !== null && (
                <button onClick={galFolders.navigateBack}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-stone-700 transition-colors"
                  title="Back to gallery">
                  <ArrowLeft size={20} />
                </button>
              )}
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {isSecondarySelector
                    ? 'Select Character for Comparison'
                    : galFolders.currentFolder ?? 'Gallery'}
                  <span className="text-slate-500 text-sm font-normal">
                    ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                  </span>
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Import buttons */}
              {!isSecondarySelector && (
                <>
                  <button onClick={() => navigate('/import')}
                    className="p-2 rounded-lg border bg-orange-800 border-orange-600 text-orange-100 hover:text-white hover:bg-orange-700 transition-all"
                    title="Import Character PNG"><ImagePlus size={16} /></button>
                  <button onClick={handleImportWorld}
                    className="p-2 rounded-lg border bg-emerald-800 border-emerald-600 text-emerald-100 hover:text-white hover:bg-emerald-700 transition-all"
                    title="Import World"><MapIcon size={16} /></button>
                </>
              )}

              {/* Context-specific buttons */}
              {isInRoomsFolder && (
                <button onClick={handleCleanupOrphanedRooms}
                  className="p-2 rounded-lg border bg-red-900 border-red-700 text-red-200 hover:text-white hover:bg-red-800 transition-all"
                  title="Cleanup orphaned rooms"><Trash2 size={16} /></button>
              )}

              {/* Org mode toggle - hidden in comparison selector */}
              {!isSecondarySelector && (
                <button onClick={galFolders.toggleOrganizationMode}
                  className={`p-2 rounded-lg border transition-all ${galFolders.organizationMode
                    ? 'bg-blue-700 border-blue-500 text-white'
                    : 'bg-stone-800 border-stone-600 text-slate-400 hover:text-slate-200 hover:bg-stone-700'}`}
                  title="Organization mode">
                  <Settings2 size={16} />
                </button>
              )}

              {/* Refresh */}
              <button onClick={handleManualRefresh} disabled={isRefreshing || !currentDirectory}
                className={`p-2 rounded-lg border transition-all ${isRefreshing
                  ? 'bg-stone-700 border-stone-600 text-slate-500 cursor-wait'
                  : 'bg-stone-800 border-stone-600 text-slate-400 hover:text-slate-200 hover:bg-stone-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Refresh gallery"><RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} /></button>

              {/* Sort */}
              <div className="relative" ref={sortDropdownRef}>
                <button onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                  className="flex items-center space-x-2 px-3 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-600 rounded-lg text-sm text-slate-200 transition-colors">
                  <ArrowUpDown size={16} className="text-slate-400" />
                  <span>{sortLabel}</span>
                  <ChevronDown size={14} className="text-slate-500" />
                </button>
                {isSortDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="py-1">
                      {(['name_asc', 'name_desc', 'date_newest', 'date_oldest'] as const).map(opt => (
                        <button key={opt} onClick={() => { setSortOption(opt); setIsSortDropdownOpen(false); }}
                          className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-stone-700 ${sortOption === opt ? 'text-blue-400 bg-stone-700/50' : 'text-slate-300'}`}>
                          {opt === 'name_asc' && <><span className="w-5 mr-2 text-center">A</span> Name (A-Z)</>}
                          {opt === 'name_desc' && <><span className="w-5 mr-2 text-center">Z</span> Name (Z-A)</>}
                          {opt === 'date_newest' && <><Calendar size={14} className="mr-2" /> Newest First</>}
                          {opt === 'date_oldest' && <><Calendar size={14} className="mr-2" /> Oldest First</>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Organization toolbar */}
          {galFolders.organizationMode && (
            <OrganizationToolbar
              selectedCount={galFolders.selectedCards.size}
              folders={galFolders.folders}
              currentFolder={galFolders.currentFolder}
              onSelectAll={handleToolbarSelectAll}
              onDeselectAll={galFolders.deselectAll}
              onMoveToFolder={handleToolbarMoveToFolder}
              onExit={galFolders.toggleOrganizationMode}
            />
          )}

          {/* Search */}
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={galFolders.currentFolder ? `Search in ${galFolders.currentFolder}...` : 'Search all cards...'}
            className="w-full px-4 py-2 bg-stone-800 border border-stone-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Error Display */}
      {deleteError && (
        <div className="flex-none p-3 m-4 bg-red-900 border border-red-700 text-white rounded-md text-sm flex justify-between items-center shadow-lg">
          <div className="flex items-start">
            <AlertTriangle className="flex-shrink-0 w-5 h-5 mr-2 mt-0.5" />
            <span className="break-words"><strong>Deletion Error:</strong> {deleteError}</span>
          </div>
          <button onClick={() => setDeleteError(null)} className="ml-4 flex-shrink-0 p-1 bg-red-800 hover:bg-red-700 rounded text-xs"><X size={16} /></button>
        </div>
      )}

      {/* Main Content */}
      <div ref={activeContainerRef} className="character-gallery flex flex-col gap-4 w-full h-full overflow-y-auto"
        style={{ maxHeight: '100%', minHeight: 0 }} onScroll={scrollContainerRef ? undefined : handleScroll}>

        {/* Loading/error/empty states */}
        {isLoading && characters.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <LoadingSpinner size="lg" text="Loading characters..." className="text-blue-400 mb-4" />
            <p className="text-sm text-slate-400 mt-2">Give it a moment to build up your database on first run.</p>
          </div>
        )}
        {!isLoading && error && error.length > 0 && (
          <div className="p-8 text-center text-amber-400"><p className="font-medium">{error}</p></div>
        )}
        {!isLoading && !error && characters.length === 0 && currentDirectory && (
          <div className="p-8 text-center">
            <p className="text-gray-400">No PNG character files found.</p>
            <p className="mt-2 text-sm text-gray-500">Try adding some character files or selecting a different directory in Settings.</p>
          </div>
        )}
        {!isLoading && !error && characters.length === 0 && !currentDirectory && (
          <div className="p-8 text-center">
            <p className="text-gray-400">No character directory configured.</p>
            <p className="mt-2 text-sm text-gray-500">Set your character directory in Settings.</p>
          </div>
        )}

        {/* Folder tiles - only at top level, when not searching */}
        {!isLoading && galFolders.currentFolder === null && !searchTerm.trim() && characters.length > 0 && (
          <div className="px-6 pt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-6">
              {galFolders.folders.map(folder => (
                <GalleryFolderTile
                  key={folder.id}
                  folder={folder}
                  cardCount={folderCardCounts.get(folder.name) ?? 0}
                  onClick={() => galFolders.navigateToFolder(folder.name)}
                  onDelete={folder.isDefault ? undefined : () => setFolderToDelete(folder.name)}
                  organizationMode={galFolders.organizationMode}
                  onDrop={(e) => handleFolderDrop(folder.name, e)}
                />
              ))}
              {!isSecondarySelector && (
                <NewFolderTile onClick={() => setIsNewFolderDialogOpen(true)} />
              )}
            </div>

            {/* Unfiled section label */}
            {displayCards.length > 0 && (
              <div className="flex items-center gap-3 mt-8 mb-2 px-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Unfiled</span>
                <div className="flex-1 h-px bg-stone-700" />
              </div>
            )}
          </div>
        )}

        {/* Card grid */}
        {(sortedDisplayCards.length > 0 || (searchTerm && !isLoading)) && (
          <GalleryGrid
            items={sortedDisplayCards.slice(0, displayedCount)}
            emptyMessage={searchTerm ? 'No matching cards found.' : 'No cards in this folder.'}
            renderItem={renderCharacterCard}
          />
        )}

        {/* Load more trigger */}
        <div ref={loadMoreTriggerRef}
          className={`p-4 flex justify-center items-center transition-opacity duration-300
            ${(isLoadingMore || displayedCount < sortedDisplayCards.length) ? 'opacity-100 h-16' : 'opacity-0 h-0'}`}>
          {isLoadingMore && <LoadingSpinner size={20} className="mr-2" text="Loading more..." />}
          {!isLoadingMore && displayedCount < sortedDisplayCards.length && (
            <div className="p-1 text-sm text-slate-500">Scroll to load more</div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <DeleteConfirmationDialog isOpen={isDeleteConfirmOpen} title="Delete Character"
        description="Are you sure you want to delete the character" itemName={characterToDelete?.name}
        isDeleting={isDeleting} onCancel={handleCancelDelete} onConfirm={handleConfirmDelete} />

      <WorldDeleteConfirmationDialog isOpen={isWorldDeleteConfirmOpen}
        worldUuid={characterToDelete?.character_uuid || ''} worldName={characterToDelete?.name || ''}
        isDeleting={isDeleting} onCancel={handleCancelWorldDelete} onConfirm={handleConfirmWorldDelete} />

      <NewFolderDialog isOpen={isNewFolderDialogOpen}
        existingNames={galFolders.folders.map(f => f.name)}
        onClose={() => setIsNewFolderDialogOpen(false)}
        onCreate={async (name) => { await galFolders.createFolder(name); }} />

      <FolderDeleteConfirmationDialog isOpen={folderToDelete !== null}
        folderName={folderToDelete || ''} cardCount={folderDeleteCardCount}
        onClose={() => setFolderToDelete(null)}
        onDeleteContents={async () => {
          if (folderToDelete) {
            await galFolders.deleteFolder(folderToDelete, 'delete_all', characters);
            setFolderToDelete(null);
            if (currentDirectory) { invalidateCharacterCache(); await loadFromDirectory(currentDirectory); }
          }
        }}
        onDumpToGallery={async () => {
          if (folderToDelete) {
            await galFolders.deleteFolder(folderToDelete, 'dump_to_gallery', characters);
            setFolderToDelete(null);
            if (currentDirectory) { invalidateCharacterCache(); await loadFromDirectory(currentDirectory); }
          }
        }} />

      <KoboldCPPDrawerManager />
    </div>
  );
};

export default CharacterGallery;
