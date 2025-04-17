// frontend/src/components/CharacterGallery.tsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { useComparison } from '../contexts/ComparisonContext';
import { Trash2 } from 'lucide-react';
import GalleryGrid from './GalleryGrid'; // DRY, shared grid for all galleries

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

// --- Animation Duration (milliseconds) ---
// Make sure this matches the duration used in Tailwind classes (e.g., duration-300)
const DELETE_ANIMATION_DURATION = 300;

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

  // State for infinite scrolling
  const [displayedCount, setDisplayedCount] = useState(25);

  // State for the currently loaded directory and search term
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // State to track which card is pending initial delete confirmation
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);

  // State to track which card is currently animating out
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  // Context hooks
  const { setCharacterData, setImageUrl, setIsLoading: setPrimaryLoading } = useCharacter();
  const { setSecondaryCharacterData, setSecondaryImageUrl, setSecondaryIsLoading } = useComparison();

  // Ref for the scrollable container div
  const containerRef = useRef<HTMLDivElement>(null);
  // Use external ref if provided
  const activeContainerRef = scrollContainerRef || containerRef;

  // Memoized filtering - MOVED UP before it's used
  const filteredCharacters = useMemo(() => {
     const searchLower = searchTerm.toLowerCase().trim();
     if (!searchLower) return characters;
     return characters.filter(char =>
       char.name.toLowerCase().includes(searchLower)
     );
  }, [characters, searchTerm]);

  // loadMore function definition
  const loadMore = useCallback(() => {
    if (isLoading || displayedCount >= filteredCharacters.length) return;
    setDisplayedCount(prev => Math.min(prev + 20, filteredCharacters.length));
  }, [isLoading, displayedCount, filteredCharacters.length]);

  // handleScroll for infinite scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollBottom = container.scrollTop + container.clientHeight;
    const threshold = container.scrollHeight - 300;
    if (scrollBottom >= threshold && !isLoading && displayedCount < filteredCharacters.length) {
      loadMore();
    }
  }, [loadMore, isLoading, displayedCount, filteredCharacters.length]);

  // Load from directory function
  const loadFromDirectory = useCallback(async (directory: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setDeleteError(null);
      setConfirmDeletePath(null);
      setDeletingPath(null); // Reset animation on reload
      setDisplayedCount(25);

      const response = await fetch(`/api/characters?directory=${encodeURIComponent(directory)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Server error (${response.status})` }));
        throw new Error(errorData.message || `Failed to load characters. Status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success === false || data.exists === false) {
         setError(data.message || "Directory not found or inaccessible.");
         setCharacters([]);
         setCurrentDirectory(data.directory || directory);
      } else if (data.exists) {
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

  // Attach scroll handler for lazy loading (external or internal)
  useEffect(() => {
    if ((lazyLoad || scrollContainerRef) && activeContainerRef.current) {
      const el = activeContainerRef.current;
      const handler = (e: Event) => {
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
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setDeleteError(null);
        setConfirmDeletePath(null);
        setDeletingPath(null);
        setCurrentDirectory(null);
        setCharacters([]);

        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to load settings from server.');
        const data = await response.json();
        if (data.success && data.settings.character_directory) {
          await loadFromDirectory(data.settings.character_directory);
        } else if (data.success && !data.settings.character_directory) {
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

  // Handle character selection
  const handleCharacterClick = async (character: CharacterFile) => {
    // Prevent selection if card is animating out
    if (deletingPath === character.path) return;

    // If a custom click handler is provided, use it for selection (e.g., NPC selection)
    if (typeof onCharacterClick === 'function') {
      onCharacterClick(character);
      return;
    }

    setConfirmDeletePath(null); // Reset delete confirm if main card clicked
    setDeleteError(null);
    const setLoading = isSecondarySelector ? setSecondaryIsLoading : setPrimaryLoading;
    setLoading(true);
    setError(null);
    try {
      const imageResponse = await fetch(`/api/character-image/${encodeURIComponent(character.path)}`);
      if (!imageResponse.ok) throw new Error(`Failed to load image (${imageResponse.status})`);
      const blob = await imageResponse.blob();
      const formData = new FormData();
      formData.append('file', blob, character.name + '.png');
      const uploadResponse = await fetch('/api/upload-png', { method: 'POST', body: formData });
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Metadata processing failed (${uploadResponse.status})`);
      }
      const data = await uploadResponse.json();
      if (data.success && data.metadata) {
        const newImageUrl = URL.createObjectURL(blob);
        if (isSecondarySelector) {
          setSecondaryCharacterData(data.metadata);
          setSecondaryImageUrl(newImageUrl);
          if (onCharacterSelected) onCharacterSelected();
        } else {
          setCharacterData(data.metadata);
          setImageUrl(newImageUrl);
        }
      } else {
        throw new Error(data.error || 'Failed to get metadata.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error selecting character.');
    } finally {
      setLoading(false);
    }
  };

  // Handler for clicking the trash icon
  const handleTrashIconClick = (event: React.MouseEvent, path: string) => {
    event.stopPropagation();
    setDeleteError(null); // Clear previous delete error

    if (confirmDeletePath === path) {
      // Second click: Initiate Deletion Animation
      setConfirmDeletePath(null); // Clear confirmation state
      initiateDeleteAnimation(path); // Start animation + delayed API call
    } else {
      // First click: Set confirmation state
      setConfirmDeletePath(path);
      setDeletingPath(null); // Ensure not trying to animate if user changes mind
    }
  };

  // Start animation and schedule API call
  const initiateDeleteAnimation = (path: string) => {
    console.log(`Initiating delete animation for: ${path}`);
    setDeletingPath(path); // Trigger animation styles

    // After the animation duration, make the API call
    setTimeout(() => {
      handleConfirmDeleteApiCall(path);
    }, DELETE_ANIMATION_DURATION);
  };

  // Handle the actual API call after animation delay
  const handleConfirmDeleteApiCall = async (path: string) => {
    console.log(`Performing API delete for: ${path}`);
    try {
      const response = await fetch(`/api/character/${encodeURIComponent(path)}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || result.message || `Failed (${response.status})`);
      }

      console.log(`Successfully deleted via API: ${path}`);
      setDeleteError(null);

      // Remove character from state AFTER successful API call
      setCharacters(prevCharacters => prevCharacters.filter(char => char.path !== path));
      // Keep deletingPath set until the component re-renders without this item

    } catch (err) {
      console.error(`API Deletion failed for ${path}:`, err);
      setDeleteError(err instanceof Error ? err.message : 'Unknown deletion error.');
      // Reset deletingPath on failure so the card reappears
      setDeletingPath(null);
    }
    // Note: We don't reset deletingPath on success here.
    // It implicitly gets cleared because the item is removed from the 'characters' array,
    // causing the component to re-render without the element where deletingPath would be checked.
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
          <span className="break-words"><strong>Deletion Error:</strong> {deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="ml-4 flex-shrink-0 px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded text-xs focus:outline-none focus:ring-1 focus:ring-white" aria-label="Dismiss error">Dismiss</button>
        </div>
      )}

      {/* Main Content Area */}
      <div
        ref={activeContainerRef}
        className="character-gallery flex flex-col gap-4 w-full h-full overflow-y-auto"
        style={{ maxHeight: '100%', minHeight: 0 }}
        onScroll={scrollContainerRef ? undefined : handleScroll}
      >
        {/* Error/Loading States */}
        {isLoading && characters.length === 0 && (
          <div className="p-8 text-center text-gray-400">Loading characters...</div>
        )}
        {!isLoading && !error && characters.length === 0 && currentDirectory && (
          <div className="p-8 text-center text-gray-400">No PNG character files found in the selected directory.</div>
        )}
        {!isLoading && !error && characters.length === 0 && !currentDirectory && (
          <div className="p-8 text-center text-gray-400">Set your character directory in Settings.</div>
        )}
        
        {/* Character Grid using GalleryGrid */}
        <GalleryGrid
          items={filteredCharacters.slice(0, displayedCount)}
          emptyMessage={error || "No characters found."}
          renderItem={(character) => {
            const isConfirmingDelete = confirmDeletePath === character.path;
            const isDeleting = deletingPath === character.path;
            return (
              <div
                key={character.path}
                className={`
                  relative group cursor-pointer rounded-lg overflow-hidden shadow-lg bg-stone-800 aspect-[3/5]
                  transition-all ${isDeleting ? `duration-${DELETE_ANIMATION_DURATION} ease-out` : 'duration-200 ease-in-out'}
                  ${isDeleting ? 'scale-0 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'}
                  hover:shadow-xl 
                `}
                onClick={() => handleCharacterClick(character)}
                role="button"
                tabIndex={0}
                aria-label={`Select character ${character.name}`}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleCharacterClick(character); }}
              >
                {/* Delete Button (Hide if animating out) */}
                {!isDeleting && (
                  <button
                    title={isConfirmingDelete ? "Confirm Delete" : "Move character to trash"}
                    onClick={(e) => handleTrashIconClick(e, character.path)}
                    className={`absolute top-1.5 left-1.5 z-10 p-1 rounded-full backdrop-blur-sm
                                bg-black/40 text-white opacity-0 group-hover:opacity-100
                                transition-all duration-200 ease-in-out
                                hover:bg-red-700/70 hover:scale-110 focus:outline-none
                                focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-stone-800
                                ${isConfirmingDelete ? '!opacity-100 !bg-red-600/80 scale-110' : ''}
                              `}
                    aria-label={isConfirmingDelete ? `Confirm delete ${character.name}` : `Delete ${character.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                
                {/* Character Image Container */}
                <div className="w-full h-full bg-stone-950">
                  <img
                    src={`/api/character-image/${encodeURIComponent(character.path)}`}
                    alt={character.name}
                    className={`w-full h-full object-cover object-center transition-transform duration-300 ${isDeleting ? '' : 'group-hover:scale-105'}`}
                    loading="lazy" // Ensures lazy loading for performance
                    onError={() => { /* Optionally handle image load errors here */ }}
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
        
        {/* Loading Indicator / Scroll Trigger */}
        {isLoading && displayedCount > 0 && characters.length > 0 && (
          <div className="h-20 flex items-center justify-center text-gray-400">Loading...</div>
        )}
        {!isLoading && displayedCount < filteredCharacters.length && (
          <div className="h-10" />
        )}
      </div>
    </div>
  );
};

export default CharacterGallery;