// frontend/src/components/CharacterGallery.tsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { useComparison } from '../contexts/ComparisonContext';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import LoadingSpinner from './common/LoadingSpinner';
import GalleryGrid from './GalleryGrid'; // DRY, shared grid for all galleries
import DeleteConfirmationDialog from './DeleteConfirmationDialog';
import KoboldCPPDrawerManager from './KoboldCPPDrawerManager';

// Track API calls across component instances with enhanced caching
const apiRequestCache = {
  pendingRequests: new Map<string, Promise<any>>(),
  lastRequestTime: 0,
  characterListCache: new Map<string, { data: any; timestamp: number; ttl: number }>()
};

// Interface for character file data received from the backend
interface CharacterFile {
  name: string;
  path: string; // This should be the full, absolute path from the backend
  size: number;
  modified: number;
}

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
 * Creates a cached fetch request to prevent duplicate API calls with TTL support
 * @param url The URL to fetch
 * @param options Fetch options
 * @param ttl Time to live for cached responses (default: 30 seconds)
 * @returns Promise with the fetch response
 */
const cachedFetch = (url: string, options?: RequestInit, ttl: number = 30000): Promise<Response> => {
  const cacheKey = `${url}`;
  
  // Check for cached response (TTL-based caching for character lists)
  if (url.includes('/api/characters') && apiRequestCache.characterListCache) {
    const cached = apiRequestCache.characterListCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
      console.log(`[Cache] Using cached response for: ${url}`);
      return Promise.resolve(new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  }
  
  // If we have a pending request for this URL, return it
  const existingRequest = apiRequestCache.pendingRequests.get(cacheKey);
  if (existingRequest) {
    console.log(`Using cached request for: ${url}`);
    return existingRequest;
  }
  
  // If the last request was less than 300ms ago, add a small delay
  const now = Date.now();
  const timeSinceLastRequest = now - apiRequestCache.lastRequestTime;
  const delay = timeSinceLastRequest < 300 ? 300 - timeSinceLastRequest : 0;
  
  // Create a new request with optional delay
  const newRequest = new Promise<Response>((resolve) => {
    setTimeout(async () => {
      apiRequestCache.lastRequestTime = Date.now();
      const response = await fetch(url, options);
      
      // Cache successful character list responses
      if (response.ok && url.includes('/api/characters')) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          
          // Initialize cache if needed
          if (!apiRequestCache.characterListCache) {
            apiRequestCache.characterListCache = new Map();
          }
          
          apiRequestCache.characterListCache.set(cacheKey, {
            data,
            timestamp: Date.now(),
            ttl
          });
        } catch (cacheError) {
          console.warn('Failed to cache response:', cacheError);
        }
      }
      
      resolve(response);
    }, delay);
  }).finally(() => {
    // Clean up the cache after the request is completed
    setTimeout(() => {
      apiRequestCache.pendingRequests.delete(cacheKey);
    }, 500);
  });
  
  // Store the request in the cache
  apiRequestCache.pendingRequests.set(cacheKey, newRequest);
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

  // State for character deletion using DeleteConfirmationDialog
  const [characterToDelete, setCharacterToDelete] = useState<CharacterFile | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  
  // Track component instance
  const componentId = useRef(`gallery-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  const isFirstLoad = useRef(true);

  // Context hooks
  const { setCharacterData, setImageUrl, setIsLoading: setPrimaryLoading } = useCharacter();
  const { setSecondaryCharacterData, setSecondaryImageUrl, setSecondaryIsLoading } = useComparison();

  // Ref for the scrollable container div
  const containerRef = useRef<HTMLDivElement>(null);
  // Use external ref if provided
  const activeContainerRef = scrollContainerRef || containerRef;
  
  // Ref for the load more trigger element (for Intersection Observer)
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Memoized filtering - MOVED UP before it's used
  const filteredCharacters = useMemo(() => {
     const searchLower = searchTerm.toLowerCase().trim();
     if (!searchLower) return characters;
     return characters.filter(char =>
       char.name.toLowerCase().includes(searchLower)
     );
  }, [characters, searchTerm]);

  // loadMore function definition with improved loading behavior
  const loadMore = useCallback(() => {
    if (isLoadingMore || displayedCount >= filteredCharacters.length) return;
    
    setIsLoadingMore(true);
    
    // Use setTimeout to avoid blocking the main thread during loading
    setTimeout(() => {
      // Calculate how many more to load - aim for a batch size that balances performance
      const batchSize = Math.min(15, filteredCharacters.length - displayedCount);
      
      if (batchSize > 0) {
        setDisplayedCount(prev => prev + batchSize);
      }
      
      setIsLoadingMore(false);
    }, 100); // Small delay to allow UI to update
    
  }, [isLoadingMore, displayedCount, filteredCharacters.length]);

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
      if (entry.isIntersecting && !isLoading && filteredCharacters.length > displayedCount) {
        loadMore();
      }
    }, options);
    
    observer.observe(loadMoreTriggerRef.current);
    
    return () => {
      if (loadMoreTriggerRef.current) {
        observer.unobserve(loadMoreTriggerRef.current);
      }
    };
  }, [loadMore, isLoading, filteredCharacters.length, displayedCount, activeContainerRef]);

  // Legacy scroll handler for browsers that might not support Intersection Observer
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollBottom = container.scrollTop + container.clientHeight;
    const threshold = container.scrollHeight - 300;
    
    if (scrollBottom >= threshold && !isLoading && !isLoadingMore && displayedCount < filteredCharacters.length) {
      loadMore();
    }
  }, [loadMore, isLoading, isLoadingMore, displayedCount, filteredCharacters.length]);

  // Load characters with database-first optimization
  const loadFromDirectory = useCallback(async (directory: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setDeleteError(null);
      setDeletingPath(null); // Reset animation on reload
      setDisplayedCount(20); // Reset to initial batch size
      
      console.log(`[${componentId.current}] Loading characters (database-first approach)`);

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
              modified: new Date(char.updated_at).getTime() / 1000
            }));
            
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
      if (data.success === false || data.exists === false) {
         setError(data.message || "Directory not found or inaccessible.");
         setCharacters([]);
         setCurrentDirectory(data.directory || directory);
      } else if (data.exists) {
        console.log(`[${componentId.current}] Directory scan loaded ${data.files.length} characters`);
        setCharacters(data.files);
        setCurrentDirectory(data.directory);
        if (data.files.length === 0) {
          setError("No PNG character files found in this directory.");
        }
      } else {
        throw new Error("Received unexpected response from server.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading characters.');
      setCharacters([]);
      setCurrentDirectory(directory);
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array

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
    // Skip if this is not the first load (prevents duplicate API calls)
    if (!isFirstLoad.current && settingsChangeCount === 0) {
      console.log(`[${componentId.current}] Skipping initial load to prevent duplication`);
      return;
    }
    
    isFirstLoad.current = false;
    
    const loadSettings = async () => {
      try {
        console.log(`[${componentId.current}] Loading settings and characters`);
        setIsLoading(true);
        setError(null);
        setDeleteError(null);
        setDeletingPath(null);
        setCurrentDirectory(null);
        setCharacters([]);

        // Clear character cache when settings change (directory might have changed)
        if (settingsChangeCount > 0) {
          apiRequestCache.characterListCache.clear();
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
      }
    };
    
    loadSettings();
  }, [settingsChangeCount, loadFromDirectory]);

  // Reset displayedCount when search term changes
  useEffect(() => {
    // When the search term changes, reset to show the initial batch
    setDisplayedCount(20);
  }, [searchTerm]);

  // Handle character selection
  const handleCharacterClick = async (character: CharacterFile) => {
    // Prevent selection if card is animating out
    if (deletingPath === character.path) return;

    // If a custom click handler is provided, use it for selection (e.g., NPC selection)
    if (typeof onCharacterClick === 'function') {
      onCharacterClick(character);
      return;
    }

    setDeleteError(null);
    const setLoading = isSecondarySelector ? setSecondaryIsLoading : setPrimaryLoading;
    setLoading(true);
    setError(null);
    try {
      const imageResponse = await fetch(`/api/character-image/${encodeFilePath(character.path)}`);
      if (!imageResponse.ok) throw new Error(`Failed to load image (${imageResponse.status})`);
      const blob = await imageResponse.blob();
      
      // Fetch metadata separately using the new endpoint
      const metadataResponse = await fetch(`/api/character-metadata/${encodeFilePath(character.path)}`);
      if (!metadataResponse.ok) {
        const errorData = await metadataResponse.json().catch(() => ({ message: `Failed to load metadata (${metadataResponse.status})` }));
        throw new Error(errorData.message || `Failed to load metadata. Status: ${metadataResponse.status}`);
      }
      
      const data = await metadataResponse.json();
      // Handle both formats: either {success: true, data: {...}} or just the raw metadata object
      const metadata = data.success && data.data ? data.data : data;
      
      if (metadata) {
        const newImageUrl = URL.createObjectURL(blob);
        if (isSecondarySelector) {
          setSecondaryCharacterData(metadata);
          setSecondaryImageUrl(newImageUrl);
          if (onCharacterSelected) onCharacterSelected();
        } else {
          setCharacterData(metadata);
          setImageUrl(newImageUrl);
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
      
      // Use our improved path encoding function
      const encodedPath = encodeFilePath(characterToDelete.path);
      const response = await fetch(`/api/character/${encodedPath}`, {
        method: 'DELETE',
      });
      
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
          errorMessage = `File not found: ${fileName}. The file may have been moved or deleted already.`;
        } else if (response.status === 403) {
          errorMessage = `Permission denied when deleting: ${fileName}. Check file permissions.`;
        } else if (response.status >= 500) {
          errorMessage = `Server error while deleting: ${fileName}. Please try again later.`;
        }
        
        throw new Error(errorMessage);
      }
      
      console.log(`Successfully deleted via API: ${characterToDelete.path}`);
      
      // Remove character from state AFTER successful API call
      setCharacters(prevCharacters => prevCharacters.filter(char => char.path !== characterToDelete.path));
      
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

  // JSX Rendering
  return (
    <div className="h-full flex flex-col bg-stone-900 text-white">
      {/* Header Section */}
      <div className="flex-none border-b border-stone-700 shadow-md">
        <div className="p-4">
          <h2 className="text-lg font-semibold">
            {isSecondarySelector ? "Select Character for Comparison" : `Character Gallery ${filteredCharacters.length > 0 ? `(${filteredCharacters.length})` : ''}`}
          </h2>
          {currentDirectory && (
            <div className="mt-2 text-sm text-slate-400 truncate" title={currentDirectory}>
              Directory: {currentDirectory}
            </div>
          )}
        </div>
        <div className="px-4 pb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search characters by name..."
            className="w-full px-4 py-2 bg-stone-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
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
        
        {/* Character Grid using GalleryGrid - Only render when we have items or user is searching */}
        {(filteredCharacters.length > 0 || (searchTerm && !isLoading)) && (
          <GalleryGrid
            items={filteredCharacters.slice(0, displayedCount)}
            emptyMessage="No matching characters found."
            renderItem={(character) => {
              const isDeleting = deletingPath === character.path;
              return (
                <div
                  key={character.path}
                  className={`
                    relative group cursor-pointer rounded-lg overflow-hidden shadow-lg bg-stone-800 aspect-[3/5]
                    transition-all ${isDeleting ? 'duration-300 ease-out' : 'duration-200 ease-in-out'}
                    ${isDeleting ? 'scale-0 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'}
                    hover:shadow-xl 
                  `}
                  onClick={() => handleCharacterClick(character)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select character ${character.name}`}
                >
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
                  
                  {/* Character Image Container */}
                  <div className="w-full h-full bg-stone-950">
                    <img
                      src={`/api/character-image/${encodeFilePath(character.path)}`}
                      alt={character.name}
                      className={`w-full h-full object-cover object-center transition-transform duration-300 ${isDeleting ? '' : 'group-hover:scale-105'}`}
                      loading="lazy" // Ensures lazy loading for performance
                      onError={(e) => {
                        console.error(`Failed to load image for: ${character.name}`);
                        // Add visual feedback for failed images
                        (e.target as HTMLImageElement).style.opacity = '0.5';
                      }}
                    />
                  </div>
                  
                  {/* Character Name Overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6 text-white text-sm font-medium truncate rounded-b-lg">
                    {character.name}
                  </div>
                </div>
              );
            }}
          />
        )}
        
        {/* Loading Indicator / Intersection Observer Trigger */}
        <div 
          ref={loadMoreTriggerRef}
          className={`p-4 flex justify-center items-center transition-opacity duration-300
            ${(isLoadingMore || displayedCount < filteredCharacters.length) ? 'opacity-100 h-16' : 'opacity-0 h-0'}`}
        >
          {isLoadingMore && (
            <div className="flex items-center text-blue-400">
              <LoadingSpinner size={20} className="mr-2" text="Loading more characters..." />
            </div>
          )}
          {!isLoadingMore && displayedCount < filteredCharacters.length && (
            <div className="p-1 text-sm text-slate-500">
              Scroll to load more
            </div>
          )}
        </div>
        
        {/* Progress indicator */}
        {filteredCharacters.length > 0 && (
          <div className="sticky bottom-0 w-full flex justify-center py-1 bg-gradient-to-t from-stone-900 to-transparent pointer-events-none">
            <div className="text-xs text-slate-400 bg-stone-800/80 px-2 py-1 rounded-full backdrop-blur-sm">
              {displayedCount} of {filteredCharacters.length}
            </div>
          </div>
        )}
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