/**
 * @file CharacterGallery.tsx
 * @description Grid view for displaying and selecting character cards.
 * @dependencies useCharacter, GalleryGrid, backend API
 * @consumers AppRoutes.tsx, WorldCreationModal.tsx
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacter } from '../../contexts/CharacterContext';
import { useComparison } from '../../contexts/ComparisonContext';
import { CharacterFile } from '../../types/schema';
import { Trash2, AlertTriangle, X, ArrowUpDown, Calendar, ChevronDown, Map as MapIcon, Users, Info, LayoutGrid, Folder } from 'lucide-react';
import CharacterFolderView from './CharacterFolderView';
import LoadingSpinner from '../common/LoadingSpinner';
import GalleryGrid from '../GalleryGrid'; // DRY, shared grid for all galleries
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';
import KoboldCPPDrawerManager from '../KoboldCPPDrawerManager';
import { useCharacterSort } from '../../hooks/useCharacterSort';

// Track API calls across component instances - simplified
const apiRequestCache = {
  pendingRequests: new Map<string, Promise<any>>()
};


// Props for the CharacterGallery component
interface CharacterGalleryProps {
  settingsChangeCount?: number; // Trigger reload when settings change
  isSecondarySelector?: boolean; // Mode for comparison selection
  onCharacterSelected?: () => void; // Callback when selection is made (in comparison mode)
  onCharacterClick?: (character: CharacterFile) => void; // Custom click handler for selection contexts
  scrollContainerRef?: React.RefObject<HTMLDivElement>; // For external scroll containers
  lazyLoad?: boolean; // Force lazy load mode (for modal)
}

/**
 * Helper function to properly encode file paths for API requests
 * This handles Windows backslashes and special characters that can cause issues
 */
const encodeFilePath = (path: string): string => {
  // Windows-specific handling: convert backslashes to forward slashes
  const normalizedPath = path.replace(/\\/g, '/');

  // Identify the filename portion for better error handling
  const fileNameMatch = normalizedPath.match(/[^/]+$/);
  const fileName = fileNameMatch ? fileNameMatch[0] : '';

  try {
    return encodeURIComponent(normalizedPath);
  } catch (error) {
    console.error(`Failed to encode path: ${path}`, error);
    // Fallback to just encoding the filename if full path encoding fails
    return fileName ? encodeURIComponent(fileName) : 'unknown';
  }
};

/**
 * Simple fetch wrapper to prevent rapid duplicate requests
 * @param url The URL to fetch
 * @param options Fetch options 
 * @returns Promise with the fetch response
 */
const cachedFetch = (url: string, options?: RequestInit): Promise<Response> => {
  const cacheKey = `${url}`;

  // If we have a pending request for this URL, return it
  const existingRequest = apiRequestCache.pendingRequests.get(cacheKey);
  if (existingRequest) {
    console.log(`Using existing request for: ${url}`);
    return existingRequest;
  }

  // Create a new request
  const newRequest = fetch(url, options);

  // Store it as pending
  apiRequestCache.pendingRequests.set(cacheKey, newRequest);

  // Clean up when done
  newRequest.finally(() => {
    apiRequestCache.pendingRequests.delete(cacheKey);
  });

  return newRequest;
};

const CharacterGallery: React.FC<CharacterGalleryProps> = ({
  settingsChangeCount = 0,
  isSecondarySelector = false,
  onCharacterSelected,
  onCharacterClick,
  scrollContainerRef,
  lazyLoad = false,
}) => {
  const navigate = useNavigate();

  // State for character list, loading status, and errors
  const [characters, setCharacters] = useState<CharacterFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // State for infinite scrolling with a more reasonable initial batch size
  const [displayedCount, setDisplayedCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // State for the currently loaded directory and search term
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter state for World/Character cards
  const [filterType, setFilterType] = useState<'all' | 'character' | 'world'>('all');

  // View mode state (Grid vs Folders)
  const [viewMode, setViewMode] = useState<'grid' | 'folder'>('grid');

  // State for character deletion using DeleteConfirmationDialog
  const [characterToDelete, setCharacterToDelete] = useState<CharacterFile | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  // Track component instance
  const componentId = useRef(`gallery-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

  // Simple duplicate prevention for StrictMode
  const loadingRef = useRef<{
    currentSettingsCount: number;
    isLoading: boolean;
  }>({
    currentSettingsCount: -1,
    isLoading: false
  });

  // Context hooks
  const {
    setCharacterData,
    setImageUrl,
    setIsLoading: setPrimaryLoading,
    characterCache,
    setCharacterCache,
    invalidateCharacterCache
  } = useCharacter();
  const { setSecondaryCharacterData, setSecondaryImageUrl, setSecondaryIsLoading } = useComparison();

  // Ref for the scrollable container div
  const containerRef = useRef<HTMLDivElement>(null);
  // Use external ref if provided
  const activeContainerRef = scrollContainerRef || containerRef;

  // Ref for the load more trigger element (for Intersection Observer)
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // State for sort dropdown
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Memoized filtering - MOVED UP before it's used
  const filteredCharacters = useMemo(() => {
    let result = characters;

    // Type Filter
    if (filterType !== 'all') {
      result = result.filter(char => {
        const type = char.extensions?.card_type || 'character';
        return type === filterType;
      });
    }

    // Search Filter
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) return result;
    return result.filter(char =>
      char.name.toLowerCase().includes(searchLower)
    );
  }, [characters, searchTerm, filterType]);

  // Apply sorting hook
  const {
    sortedItems: sortedAndFilteredCharacters,
    sortOption,
    setSortOption,
    sortLabel
  } = useCharacterSort(
    filteredCharacters,
    {
      getName: (c) => c.name,
      getDate: (c) => c.modified
    },
    'name_asc' // Default to A-Z
  );

  // loadMore function definition with improved loading behavior
  const loadMore = useCallback(() => {
    if (isLoadingMore || displayedCount >= sortedAndFilteredCharacters.length) return;

    setIsLoadingMore(true);

    // Use setTimeout to avoid blocking the main thread during loading
    setTimeout(() => {
      // Calculate how many more to load - aim for a batch size that balances performance
      const batchSize = Math.min(15, sortedAndFilteredCharacters.length - displayedCount);

      if (batchSize > 0) {
        setDisplayedCount(prev => prev + batchSize);
      }

      setIsLoadingMore(false);
    }, 100); // Small delay to allow UI to update

  }, [isLoadingMore, displayedCount, sortedAndFilteredCharacters.length]);

  // Set up Intersection Observer for infinite scrolling
  useEffect(() => {
    if (!loadMoreTriggerRef.current) return;

    const options = {
      root: activeContainerRef.current,
      rootMargin: '200px', // Load more before user reaches the end
      threshold: 0.1 // Trigger when 10% of the element is visible
    };

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && !isLoading && sortedAndFilteredCharacters.length > displayedCount) {
        loadMore();
      }
    }, options);

    observer.observe(loadMoreTriggerRef.current);

    return () => {
      if (loadMoreTriggerRef.current) {
        observer.unobserve(loadMoreTriggerRef.current);
      }
    };
  }, [loadMore, isLoading, sortedAndFilteredCharacters.length, displayedCount, activeContainerRef]);

  // Legacy scroll handler for browsers that might not support Intersection Observer
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollBottom = container.scrollTop + container.clientHeight;
    const threshold = container.scrollHeight - 300;

    if (scrollBottom >= threshold && !isLoading && !isLoadingMore && displayedCount < sortedAndFilteredCharacters.length) {
      loadMore();
    }
  }, [loadMore, isLoading, isLoadingMore, displayedCount, sortedAndFilteredCharacters.length]);

  // Load characters with database-first optimization and persistent cache
  const loadFromDirectory = useCallback(async (directory: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setDeleteError(null);
      setDeletingPath(null); // Reset animation on reload
      setDisplayedCount(20); // Reset to initial batch size

      console.log(`[${componentId.current}] Loading characters (database-first approach)`);

      // OPTIMIZATION 1: Check persistent cache first
      if (characterCache &&
        characterCache.isValid &&
        characterCache.directory === directory &&
        characterCache.characters.length > 0) {
        console.log(`[${componentId.current}] ✓ Using persistent cache: ${characterCache.characters.length} characters`);
        setCharacters(characterCache.characters);
        setCurrentDirectory(directory);
        setIsLoading(false);
        return; // Instant load from persistent cache!
      }

      // OPTIMIZATION: Try database-first approach for better performance
      let response: Response;
      let data: any;

      try {
        // First attempt: Load from database (much faster)
        const dbUrl = `/api/characters`;
        console.log(`[${componentId.current}] Attempting database-first load...`);
        response = await cachedFetch(dbUrl);

        if (response.ok) {
          data = await response.json();

          // If we got characters from database, use them
          if (data.success && data.characters && data.characters.length > 0) {
            console.log(`[${componentId.current}] ✓ Database-first load successful: ${data.characters.length} characters`);

            // Convert database format to file format for compatibility
            const files = data.characters.map((char: any) => ({
              name: char.name,
              path: char.png_file_path,
              size: 0, // Size not critical for display
              modified: new Date(char.updated_at).getTime() / 1000,
              character_uuid: char.character_uuid,
              description: char.description,
              is_incomplete: char.is_incomplete || false,
              extensions: char.extensions_json || {},
              tags: char.tags || []
            }));

            // OPTIMIZATION 2: Update persistent cache
            setCharacterCache({
              characters: files,
              directory: directory,
              timestamp: Date.now(),
              isValid: true
            });

            setCharacters(files);
            setCurrentDirectory(directory);
            setIsLoading(false);
            return; // Success! No need for directory scanning
          }
        }
      } catch (dbError) {
        console.log(`[${componentId.current}] Database load failed, falling back to directory scan:`, dbError);
      }

      // Fallback: Use directory scanning if database is empty or failed
      console.log(`[${componentId.current}] Falling back to directory scanning: ${directory}`);
      const dirUrl = `/api/characters?directory=${encodeFilePath(directory)}`;
      response = await cachedFetch(dirUrl);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Server error (${response.status})` }));
        throw new Error(errorData.message || `Failed to load characters. Status: ${response.status}`);
      }

      data = await response.json();

      // Support both old directory-scan response shapes (exists/files) and new API shape (success/characters)
      if (data.success === false || data.exists === false) {
        setError(data.message || "Directory not found or inaccessible.");
        setCharacters([]);
        setCurrentDirectory(data.directory || directory);
        // Clear cache on error
        setCharacterCache(null);
      } else if (Array.isArray(data.characters) || Array.isArray(data.files)) {
        const charList = data.characters || data.files || [];
        console.log(`[${componentId.current}] Directory scan loaded ${charList.length} characters`);

        // OPTIMIZATION 3: Update persistent cache with directory scan results
        // Check for standardized response (data.characters) or legacy response (data.files)
        const characters = charList;
        const hasCharacters = characters.length > 0;

        // Use normalized directory from response if available, or the requested one
        const currentDir = data.directory || directory;

        if (hasCharacters) {
          // Map API characters to internal CharacterFile format if needed
          // If it's the new API, 'characters' are CharacterAPIBase, verify compatibility with CharacterFile
          // CharacterFile expects: { name, path, size, modified, ... }
          // CharacterAPIBase has: { name, png_file_path, ... }
          // We might need to map it if the interfaces differ significantly, but let's assume standard mapping for now
          // or reuse the mapping logic if it exists.

          // Actually, let's map it safely
          const mappedCharacters = characters.map((c: any) => ({
            name: c.name,
            // Handle both 'path' (legacy) and 'png_file_path' (standard)
            path: c.path || c.png_file_path,
            size: c.size || 0,
            modified: c.modified || c.updated_at || new Date().toISOString(),
            // Add other fields as needed
            character_uuid: c.character_uuid,
            description: c.description,
            is_incomplete: c.is_incomplete || false,
            extensions: c.extensions_json || {},
            tags: c.tags || []
          }));

          setCharacterCache({
            characters: mappedCharacters,
            directory: currentDir,
            timestamp: Date.now(),
            isValid: true
          });

          setCharacters(mappedCharacters);
        } else {
          setCharacters([]);
        }

        setCurrentDirectory(currentDir);

        if (!hasCharacters) {
          // It's not necessarily an error if no characters are found, just empty
          // But if we want to warn:
          // setError("No PNG character files found in this directory.");
          // The original code set error on empty.
          setError(""); // clear error if directory exists but is empty
        }

      } else {
        // If data is completely missing expected fields
        if (!data.characters && !data.files && !data.success) {
          throw new Error("Received unexpected response from server.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading characters.');
      setCharacters([]);
      setCurrentDirectory(directory);
      // Clear cache on error
      setCharacterCache(null);
    } finally {
      setIsLoading(false);
    }
  }, [characterCache, setCharacterCache]); // Dependencies for cache access

  // Attach scroll handler for lazy loading (external or internal) as fallback
  useEffect(() => {
    if ((lazyLoad || scrollContainerRef) && activeContainerRef.current) {
      const el = activeContainerRef.current;
      const handler = () => {
        // Only fire if visible
        if (el.offsetParent !== null) {
          handleScroll({ currentTarget: el } as unknown as React.UIEvent<HTMLDivElement>);
        }
      };
      el.addEventListener('scroll', handler);
      return () => el.removeEventListener('scroll', handler);
    }
  }, [activeContainerRef, lazyLoad, handleScroll]);

  // useEffect for loading settings
  useEffect(() => {
    // Simple duplicate prevention - skip if already loading this settings change
    if (loadingRef.current.isLoading &&
      loadingRef.current.currentSettingsCount === settingsChangeCount) {
      console.log(`[${componentId.current}] Skipping duplicate load (already in progress)`);
      return;
    }

    // Mark as loading this settings change
    loadingRef.current.isLoading = true;
    loadingRef.current.currentSettingsCount = settingsChangeCount;

    const loadSettings = async () => {
      try {
        console.log(`[${componentId.current}] Loading settings and characters (count: ${settingsChangeCount})`);

        setIsLoading(true);
        setError(null);
        setDeleteError(null);
        setDeletingPath(null);
        setCurrentDirectory(null);
        setCharacters([]);

        // Clear character cache when settings change (directory might have changed)
        if (settingsChangeCount > 0) {
          invalidateCharacterCache(); // Also clear persistent cache
          console.log(`[${componentId.current}] Cleared character cache due to settings change`);
        }

        // Use cached fetch for settings to prevent duplicate calls
        const response = await cachedFetch('/api/settings');

        if (!response.ok) throw new Error('Failed to load settings from server.');
        const data = await response.json();
        if (data.success && data.data && data.data.settings && data.data.settings.character_directory) {
          await loadFromDirectory(data.data.settings.character_directory);
        } else if (data.success && data.data && data.data.settings && !data.data.settings.character_directory) {
          setError("Character directory not set in Settings.");
          setIsLoading(false);
        } else {
          throw new Error(data.message || 'Failed to retrieve valid settings.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading settings.');
        setIsLoading(false);
      } finally {
        // Clear loading state
        loadingRef.current.isLoading = false;
      }
    };

    loadSettings();
  }, [settingsChangeCount, loadFromDirectory, invalidateCharacterCache]);

  // Reset displayedCount when search term changes
  useEffect(() => {
    // When the search term changes, reset to show the initial batch
    setDisplayedCount(20);
  }, [searchTerm]);

  // Helper to get image URL with proper encoding
  const getCharacterImage = (char: CharacterFile) => {
    const timestamp = typeof char.modified === 'number'
      ? char.modified
      : new Date(char.modified).getTime();

    // Priority 1: Use UUID if available (most robust, works for DB characters)
    if (char.character_uuid) {
      return `/api/character-image/${char.character_uuid}?t=${timestamp}`;
    }

    // Priority 2: Use file path (legacy/fallback for non-indexed files)
    if (char.path) {
      return `/api/character-image/${encodeFilePath(char.path)}?t=${timestamp}`;
    }

    return '';
  };
  // Common function to load character data and navigate
  const selectCharacter = async (character: CharacterFile, targetRoute?: string, isInfoRequest: boolean = false) => {
    // Prevent selection if card is animating out
    if (deletingPath === character.path) return;

    // If a custom click handler is provided (e.g. valid for standard clicks only), use it
    // But skipped for info requests
    if (!isInfoRequest && typeof onCharacterClick === 'function') {
      onCharacterClick(character);
      return;
    }

    setDeleteError(null);
    const setLoading = isSecondarySelector ? setSecondaryIsLoading : setPrimaryLoading;
    setLoading(true);
    setError(null);

    try {
      const imageResponse = await fetch(getCharacterImage(character));
      if (!imageResponse.ok) throw new Error(`Failed to load image (${imageResponse.status})`);
      const blob = await imageResponse.blob();

      const metadataResponse = await fetch(`/api/character-metadata/${encodeFilePath(character.path)}`);
      if (!metadataResponse.ok) {
        const errorData = await metadataResponse.json().catch(() => ({ message: `Failed to load metadata (${metadataResponse.status})` }));
        throw new Error(errorData.message || `Failed to load metadata. Status: ${metadataResponse.status}`);
      }

      const data = await metadataResponse.json();
      const metadata = data.success && data.data ? data.data : data;

      if (metadata) {
        const newImageUrl = URL.createObjectURL(blob);
        if (isSecondarySelector && !isInfoRequest) {
          setSecondaryCharacterData(metadata);
          setSecondaryImageUrl(newImageUrl);
          if (onCharacterSelected) onCharacterSelected();
        } else {
          // Always load character data into context before navigation
          setCharacterData(metadata);
          setImageUrl(newImageUrl);

          // Navigation Logic
          if (targetRoute) {
            // If explicit target route is provided, use it
            navigate(targetRoute);
          } else {
            // Default navigation based on card type and state
            const isWorldCard = character.extensions?.card_type === 'world';

            if (isWorldCard && character.character_uuid) {
              // World cards navigate to World Play view
              navigate(`/world/${character.character_uuid}/play`);
            } else if (character.is_incomplete) {
              // Incomplete characters go to info/setup
              navigate('/info');
            } else {
              // Regular characters go to chat
              navigate('/chat');
            }
          }
        }
      } else {
        throw new Error('Failed to get metadata. Invalid response format.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error selecting character.');
    } finally {
      setLoading(false);
    }
  };

  // Handle character selection (Main Click)
  const handleCharacterClick = (character: CharacterFile) => {
    // Routing is now handled intelligently in selectCharacter:
    // - World Cards -> /world/{uuid}/play (WorldPlayView with WorldSidePanel)
    // - Regular Characters -> /chat (ChatView)
    selectCharacter(character);
  };

  // Handle info button click
  const handleInfoIconClick = async (event: React.MouseEvent, character: CharacterFile) => {
    event.stopPropagation();

    // Logic:
    // World Card -> Launcher (Splash) - Load data first, then navigate
    // Character -> Info View
    if (character.extensions?.card_type === 'world' && character.character_uuid) {
      // Load character data into context before navigating to launcher
      // This ensures the World Launcher has access to the card metadata
      await selectCharacter(character, `/world/${character.character_uuid}/launcher`, true);
    } else {
      selectCharacter(character, '/info', true);
    }
  };

  // Handler for clicking the trash icon - now opens the confirmation dialog
  const handleTrashIconClick = (event: React.MouseEvent, character: CharacterFile) => {
    event.stopPropagation(); // Prevent card click
    setDeleteError(null); // Clear previous delete error
    setCharacterToDelete(character);
    setIsDeleteConfirmOpen(true);
  };

  // Handle the actual API call to delete the character after confirmation
  const handleConfirmDelete = async () => {
    if (!characterToDelete) return;

    setIsDeleting(true);
    setDeletingPath(characterToDelete.path);

    try {
      // Extract filename from path as a fallback for error reporting
      const fileName = characterToDelete.path.split(/[\/\\]/).pop() || characterToDelete.name;

      console.log(`Performing API delete for: ${characterToDelete.path}`);

      // Prefer UUID deletion (DB-backed), fall back to path deletion for legacy/non-indexed entries
      const deleteUrl = characterToDelete.character_uuid
        ? `/api/character/${encodeURIComponent(characterToDelete.character_uuid)}?delete_png=true`
        : `/api/character-by-path/${encodeFilePath(characterToDelete.path)}?delete_png=true`;

      const response = await fetch(deleteUrl, { method: 'DELETE' });

      // Improved error handling
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        // Handle case where response is not valid JSON
        result = { message: response.ok ? 'Success' : `Failed to parse server response (${response.status})` };
      }

      // Check for success
      if (!response.ok) {
        // Create more informative error message
        let errorMessage = result.detail || result.message || `Failed (${response.status})`;

        // Add more context for specific error codes
        if (response.status === 404) {
          // Treat as idempotent success from the UI perspective (file/row may already be gone)
          console.warn(`Delete returned 404 for ${fileName}; treating as already deleted.`);
          errorMessage = '';
        } else if (response.status === 403) {
          errorMessage = `Permission denied when deleting: ${fileName}. Check file permissions.`;
        } else if (response.status >= 500) {
          errorMessage = `Server error while deleting: ${fileName}. Please try again later.`;
        }

        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      console.log(`Successfully deleted via API: ${characterToDelete.path}`);

      // Remove character from state AFTER successful API call
      setCharacters(prevCharacters => prevCharacters.filter(char => char.path !== characterToDelete.path));

      // OPTIMIZATION 4: Invalidate persistent cache when character is deleted
      invalidateCharacterCache();

    } catch (err) {
      console.error(`API Deletion failed for ${characterToDelete.path}:`, err);
      setDeleteError(err instanceof Error ? err.message : 'Unknown deletion error.');
      // Reset deletingPath on failure so the card reappears
      setDeletingPath(null);
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
      // Keep characterToDelete set until animation completes
      setTimeout(() => {
        setCharacterToDelete(null);
      }, 300); // Match animation duration
    }
  };

  // Cancel deletion
  const handleCancelDelete = () => {
    setIsDeleteConfirmOpen(false);
    setCharacterToDelete(null);
  };

  // Function to dismiss the delete error message
  const dismissDeleteError = () => {
    setDeleteError(null);
  };

  // Function to render a single character card
  const renderCharacterCard = (character: CharacterFile) => {
    const isDeleting = deletingPath === character.path;
    const isWorld = character.extensions?.card_type === 'world';

    return (
      <div
        key={`${character.path}-${character.character_uuid || ''}`}
        className={`
          relative group cursor-pointer rounded-lg overflow-hidden shadow-lg bg-stone-800 aspect-[3/5]
          transition-all ${isDeleting ? 'duration-300 ease-out' : 'duration-200 ease-in-out'}
          ${isDeleting ? 'scale-0 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'}
          ${character.is_incomplete ? 'ring-2 ring-amber-500/70' : ''}
          hover:shadow-xl 
        `}
        onClick={() => handleCharacterClick(character)}
        role="button"
        tabIndex={0}
        aria-label={`Select ${isWorld ? 'world' : 'character'} ${character.name}${character.is_incomplete ? ' (needs setup)' : ''}`}
      >
        {/* Incomplete Character Indicator */}
        {character.is_incomplete && (
          <div
            className="absolute top-2 left-2 z-10 p-1.5 bg-amber-500/90 text-white rounded-full shadow-lg"
            title="New character - needs basic info setup"
          >
            <AlertTriangle size={16} />
          </div>
        )}

        {/* World Badge */}
        {isWorld && (
          <div
            className={`absolute top-2 ${character.is_incomplete ? 'left-11' : 'left-2'} z-10 p-1.5 bg-emerald-600/80 text-white rounded-full shadow-lg backdrop-blur-sm border border-emerald-500/30`}
            title="World Card"
          >
            <MapIcon size={16} />
          </div>
        )}

        {/* Delete Button - Only show if not in comparison selection mode */}
        {!isSecondarySelector && (
          <button
            onClick={(e) => handleTrashIconClick(e, character)}
            className="absolute top-2 right-2 z-10 p-1.5 bg-black/50 text-white rounded-full 
                       opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600
                       focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-stone-800"
            aria-label={`Delete ${character.name}`}
          >
            <Trash2 size={16} />
          </button>
        )}

        {/* Info Button - Always show */}
        <button
          onClick={(e) => handleInfoIconClick(e, character)}
          className={`absolute top-2 ${!isSecondarySelector ? 'right-10' : 'right-2'} z-10 p-1.5 bg-black/50 text-white rounded-full 
                     opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600
                     focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-stone-800`}
          aria-label={`Info for ${character.name}`}
          title={character.extensions?.card_type === 'world' ? "World Splash Screen" : "Basic Info & Greetings"}
        >
          <Info size={16} />
        </button>

        {/* Character Image Container */}
        <div className="w-full h-full bg-stone-950">
          <img
            src={getCharacterImage(character)}
            alt={character.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/pngPlaceholder.png';
            }}
          />
        </div>

        {/* Character Name Overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6 text-white text-sm font-medium truncate rounded-b-lg">
          {character.name}
        </div>
      </div>
    );
  };

  // JSX Rendering
  return (
    <div className="h-full flex flex-col bg-stone-900 text-white">
      {/* Header Section */}
      <div className="flex-none border-b border-stone-700 shadow-md bg-stone-900 z-20">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {isSecondarySelector ? "Select Character for Comparison" : `Character Gallery`}
                <span className="text-slate-500 text-sm font-normal">
                  ({sortedAndFilteredCharacters.length} {sortedAndFilteredCharacters.length === 1 ? 'item' : 'items'})
                </span>
              </h2>
              {currentDirectory && (
                <div className="mt-2 text-sm text-slate-400 truncate" title={currentDirectory}>
                  Directory: {currentDirectory}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex bg-stone-800 border border-slate-600 rounded-lg p-1 mr-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  title="Grid View"
                  aria-label="Grid View"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('folder')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'folder' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  title="Folder View"
                  aria-label="Folder View"
                >
                  <Folder size={16} />
                </button>
              </div>

              {/* Sort Dropdown */}
              <div className="relative" ref={sortDropdownRef}>
                <button
                  onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                  className="flex items-center space-x-2 px-3 py-2 bg-stone-800 hover:bg-stone-700 border border-slate-600 rounded-lg text-sm text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Sort characters"
                >
                  <ArrowUpDown size={16} className="text-slate-400" />
                  <span>{sortLabel}</span>
                  <ChevronDown size={14} className="text-slate-500" />
                </button>

                {isSortDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="py-1">
                      <button
                        onClick={() => { setSortOption('name_asc'); setIsSortDropdownOpen(false); }}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-stone-700 ${sortOption === 'name_asc' ? 'text-blue-400 bg-stone-700/50' : 'text-slate-300'}`}
                      >
                        <span className="w-5 mr-2 text-center">A</span> Name (A-Z)
                      </button>
                      <button
                        onClick={() => { setSortOption('name_desc'); setIsSortDropdownOpen(false); }}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-stone-700 ${sortOption === 'name_desc' ? 'text-blue-400 bg-stone-700/50' : 'text-slate-300'}`}
                      >
                        <span className="w-5 mr-2 text-center">Z</span> Name (Z-A)
                      </button>
                      <button
                        onClick={() => { setSortOption('date_newest'); setIsSortDropdownOpen(false); }}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-stone-700 ${sortOption === 'date_newest' ? 'text-blue-400 bg-stone-700/50' : 'text-slate-300'}`}
                      >
                        <Calendar size={14} className="mr-2" /> Newest First
                      </button>
                      <button
                        onClick={() => { setSortOption('date_oldest'); setIsSortDropdownOpen(false); }}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-stone-700 ${sortOption === 'date_oldest' ? 'text-blue-400 bg-stone-700/50' : 'text-slate-300'}`}
                      >
                        <Calendar size={14} className="mr-2" /> Oldest First
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            {/* Type Filter Buttons */}
            <div className="flex rounded-lg bg-stone-800 p-1 border border-stone-700 flex-shrink-0">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filterType === 'all'
                  ? 'bg-stone-600 text-white shadow-sm'
                  : 'text-stone-400 hover:text-white hover:bg-stone-700'
                  }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('character')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${filterType === 'character'
                  ? 'bg-stone-600 text-white shadow-sm'
                  : 'text-stone-400 hover:text-white hover:bg-stone-700'
                  }`}
              >
                <Users size={14} /> Characters
              </button>
              <button
                onClick={() => setFilterType('world')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${filterType === 'world'
                  ? 'bg-emerald-600/80 text-white shadow-sm'
                  : 'text-stone-400 hover:text-white hover:bg-stone-700'
                  }`}
              >
                <MapIcon size={14} /> Worlds
              </button>
            </div>

            {/* Search Bar */}
            <div className="flex-grow">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search characters by name..."
                className="w-full px-4 py-2 bg-stone-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error Display Area */}
      {deleteError && (
        <div className="flex-none p-3 m-4 bg-red-900 border border-red-700 text-white rounded-md text-sm flex justify-between items-center shadow-lg">
          <div className="flex items-start">
            <AlertTriangle className="flex-shrink-0 w-5 h-5 mr-2 mt-0.5" />
            <span className="break-words"><strong>Deletion Error:</strong> {deleteError}</span>
          </div>
          <button
            onClick={dismissDeleteError}
            className="ml-4 flex-shrink-0 p-1 bg-red-800 hover:bg-red-700 rounded text-xs focus:outline-none focus:ring-1 focus:ring-white"
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div
        ref={activeContainerRef}
        className="character-gallery flex flex-col gap-4 w-full h-full overflow-y-auto"
        style={{ maxHeight: '100%', minHeight: 0 }}
        onScroll={scrollContainerRef ? undefined : handleScroll}
      >
        {/* Loading/Empty/Error States - More clearly separated conditions */}
        {isLoading && characters.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <LoadingSpinner size="lg" text="Loading characters..." className="text-blue-400 mb-4" />
            <p className="text-sm text-slate-400 mt-2">If character directory is set, but characters aren't loading: Try restarting CardShark</p>
          </div>
        )}
        {!isLoading && error && (
          <div className="p-8 text-center text-amber-400">
            <p className="font-medium">{error}</p>
          </div>
        )}
        {!isLoading && !error && characters.length === 0 && currentDirectory && (
          <div className="p-8 text-center">
            <p className="text-gray-400">No PNG character files found in the selected directory.</p>
            <p className="mt-2 text-sm text-gray-500">Try adding some character files or selecting a different directory in Settings.</p>
          </div>
        )}
        {!isLoading && !error && characters.length === 0 && !currentDirectory && (
          <div className="p-8 text-center">
            <p className="text-gray-400">No character directory configured.</p>
            <p className="mt-2 text-sm text-gray-500">Set your character directory in Settings.</p>
          </div>
        )}

        {/* Character View - Grid or Folder */}
        {(sortedAndFilteredCharacters.length > 0 || (searchTerm && !isLoading)) && (
          viewMode === 'folder' ? (
            <CharacterFolderView
              characters={sortedAndFilteredCharacters.slice(0, displayedCount)}
              emptyMessage="No matching characters found."
              renderCharacterCard={renderCharacterCard}
              isSearching={!!searchTerm}
            />
          ) : (
            <GalleryGrid
              items={sortedAndFilteredCharacters.slice(0, displayedCount)}
              emptyMessage="No matching characters found."
              renderItem={renderCharacterCard}
            />
          )
        )}

        {/* Load more trigger for intersection observer */}
        <div
          ref={loadMoreTriggerRef}
          className={`p-4 flex justify-center items-center transition-opacity duration-300
            ${(isLoadingMore || displayedCount < sortedAndFilteredCharacters.length) ? 'opacity-100 h-16' : 'opacity-0 h-0'}`}
        >
          {isLoadingMore && (
            <div className="flex items-center text-blue-400">
              <LoadingSpinner size={20} className="mr-2" text="Loading more characters..." />
            </div>
          )}
          {!isLoadingMore && displayedCount < sortedAndFilteredCharacters.length && (
            <div className="p-1 text-sm text-slate-500">
              Scroll to load more
            </div>
          )}
        </div>

        {/* Progress indicator removed - keeping lazy loading but hiding count */}
      </div>

      {/* Delete confirmation dialog using our reusable component */}
      <DeleteConfirmationDialog
        isOpen={isDeleteConfirmOpen}
        title="Delete Character"
        description="Are you sure you want to delete the character"
        itemName={characterToDelete?.name}
        isDeleting={isDeleting}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />

      {/* KoboldCPP Drawer Manager - will conditionally show the bottom drawer */}
      <KoboldCPPDrawerManager />
    </div>
  );
};

export default CharacterGallery;
