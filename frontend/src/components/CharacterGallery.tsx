// frontend/src/components/CharacterGallery.tsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { useComparison } from '../contexts/ComparisonContext';
import { Trash2 } from 'lucide-react';

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
}

// --- Animation Duration (milliseconds) ---
// Make sure this matches the duration used in Tailwind classes (e.g., duration-300)
const DELETE_ANIMATION_DURATION = 300;

const CharacterGallery: React.FC<CharacterGalleryProps> = ({
  settingsChangeCount = 0,
  isSecondarySelector = false,
  onCharacterSelected
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

  // --- NEW State: Track which card is currently animating out ---
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  // Context hooks
  const { setCharacterData, setImageUrl, setIsLoading: setPrimaryLoading } = useCharacter();
  const { setSecondaryCharacterData, setSecondaryImageUrl, setSecondaryIsLoading } = useComparison();

  // Ref for the scrollable container div
  const containerRef = useRef<HTMLDivElement>(null);

  // Memoized filtering
  const filteredCharacters = useMemo(() => {
     const searchLower = searchTerm.toLowerCase().trim();
     if (!searchLower) return characters;
     return characters.filter(char =>
       char.name.toLowerCase().includes(searchLower)
     );
  }, [characters, searchTerm]);

  // --- loadFromDirectory definition (useCallback) ---
  const loadFromDirectory = useCallback(async (directory: string) => {
    //isLoading check removed from here, handled in useEffect logic primarily
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
  }, []); // Empty dependency array for useCallback unless it depends on props/state outside its scope

  // --- useEffect for loading settings ---
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
  }, [settingsChangeCount, loadFromDirectory]); // Include loadFromDirectory

  // --- loadMore (useCallback) ---
  const loadMore = useCallback(() => {
    if (isLoading || displayedCount >= filteredCharacters.length) return;
    setDisplayedCount(prev => Math.min(prev + 20, filteredCharacters.length));
  }, [isLoading, displayedCount, filteredCharacters.length]);

  // --- handleScroll (useCallback) ---
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollBottom = container.scrollTop + container.clientHeight;
    const threshold = container.scrollHeight - 300;
    if (scrollBottom >= threshold && !isLoading && displayedCount < filteredCharacters.length) {
      loadMore();
    }
  }, [loadMore, isLoading, displayedCount, filteredCharacters.length]);

  // --- handleCharacterClick (select character) ---
  const handleCharacterClick = async (character: CharacterFile) => {
    // Prevent selection if card is animating out
    if (deletingPath === character.path) return;

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

  // --- Handler for clicking the trash icon ---
  const handleTrashIconClick = (event: React.MouseEvent, path: string) => {
    event.stopPropagation();
    setDeleteError(null); // Clear previous delete error

    if (confirmDeletePath === path) {
      // === Second click: Initiate Deletion Animation ===
      setConfirmDeletePath(null); // Clear confirmation state
      initiateDeleteAnimation(path); // Start animation + delayed API call
    } else {
      // First click: Set confirmation state
      setConfirmDeletePath(path);
      setDeletingPath(null); // Ensure not trying to animate if user changes mind
    }
  };

  // --- NEW: Start animation and schedule API call ---
  const initiateDeleteAnimation = (path: string) => {
     console.log(`Initiating delete animation for: ${path}`);
     setDeletingPath(path); // Trigger animation styles

     // After the animation duration, make the API call
     setTimeout(() => {
       handleConfirmDeleteApiCall(path);
     }, DELETE_ANIMATION_DURATION);
  };

  // --- NEW: Handle the actual API call after animation delay ---
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

      // --- Remove character from state AFTER successful API call ---
      setCharacters(prevCharacters => prevCharacters.filter(char => char.path !== path));
      // Keep deletingPath set until the component re-renders without this item


    } catch (err) {
      console.error(`API Deletion failed for ${path}:`, err);
      setDeleteError(err instanceof Error ? err.message : 'Unknown deletion error.');
      // --- IMPORTANT: Reset deletingPath on failure so the card reappears ---
      setDeletingPath(null);
    }
     // Note: We don't reset deletingPath on success here.
     // It implicitly gets cleared because the item is removed from the 'characters' array,
     // causing the component to re-render without the element where deletingPath would be checked.
  };


  // --- JSX Rendering ---
  return (
    <div className="h-full flex flex-col bg-stone-900 text-white">
      {/* Header Section */}
      <div className="flex-none border-b border-stone-700 shadow-md">
         {/* ... Header content (Title, Directory, Search) ... */}
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

      {/* Error Display Areas */}
      {deleteError && (
        <div className="flex-none p-3 m-4 bg-red-900 border border-red-700 text-white rounded-md text-sm flex justify-between items-center shadow-lg">
          {/* ... Delete Error Display ... */}
           <span className="break-words"><strong>Deletion Error:</strong> {deleteError}</span>
           <button onClick={() => setDeleteError(null)} className="ml-4 flex-shrink-0 px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded text-xs focus:outline-none focus:ring-1 focus:ring-white" aria-label="Dismiss error">Dismiss</button>
        </div>
      )}
       {!deleteError && error && (
         <div className="flex-none p-3 m-4 bg-yellow-900 border border-yellow-700 text-yellow-100 rounded-md text-sm flex justify-between items-center shadow-lg">
           {/* ... General Error Display ... */}
            <span className="break-words"><strong>Notice:</strong> {error}</span>
            <button onClick={() => setError(null)} className="ml-4 flex-shrink-0 px-2 py-0.5 bg-yellow-700 hover:bg-yellow-600 rounded text-xs focus:outline-none focus:ring-1 focus:ring-white" aria-label="Dismiss notice">Dismiss</button>
         </div>
       )}

      {/* Scrollable Content Area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {/* Loading / No Characters States */}
        {isLoading && characters.length === 0 && ( <div className="p-8 text-center text-gray-400">Loading characters...</div> )}
        {!isLoading && !error && characters.length === 0 && currentDirectory && ( <div className="p-8 text-center text-gray-400">No PNG characters found in the selected directory.</div> )}
        {!isLoading && !error && characters.length === 0 && !currentDirectory && ( <div className="p-8 text-center text-gray-400">Set your character directory in Settings.</div> )}

        {/* Character Grid */}
        {characters.length > 0 ? (
          <div className="p-4">
            <div className={`grid ${isSecondarySelector ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'} gap-4`}>
              {filteredCharacters.slice(0, displayedCount).map((character) => {
                const isConfirmingDelete = confirmDeletePath === character.path;
                // --- Check if this card is the one animating out ---
                const isDeleting = deletingPath === character.path;

                return (
                  // --- Individual Card Container ---
                  <div
                    key={character.path}
                    // --- Add base transition and conditional animation classes ---
                    className={`
                      relative group cursor-pointer rounded-lg overflow-hidden shadow-lg bg-stone-800 aspect-[3/5]
                      transition-all ${isDeleting ? `duration-${DELETE_ANIMATION_DURATION} ease-out` : 'duration-200 ease-in-out'}
                      ${isDeleting ? 'scale-0 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'}
                      hover:shadow-xl 
                    `}
                    // --- END Animation Classes ---
                    onClick={() => handleCharacterClick(character)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select character ${character.name}`}
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
                        // --- Adjust image transition slightly if desired ---
                        className={`w-full h-full object-cover object-center transition-transform duration-300 ${isDeleting ? '' : 'group-hover:scale-105'}`}
                        loading="lazy"
                        onError={() => { /* ... Error handling ... */ }}
                      />
                    </div>

                    {/* Character Name Overlay */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6 text-white text-sm font-medium truncate rounded-b-lg">
                      {character.name}
                    </div>
                  </div> // End Individual Card
                );
              })} {/* End map */}
            </div> {/* End of grid */}

            {/* Loading Indicator / Scroll Trigger */}
            {isLoading && displayedCount > 0 && characters.length > 0 && ( <div className="h-20 flex items-center justify-center text-gray-400">Loading...</div> )}
            {!isLoading && displayedCount < filteredCharacters.length && ( <div className="h-10" /> )}

          </div> // End of padding container
        ) : null} {/* End character grid conditional */}

      </div> {/* End scrollable area */}
    </div> // End main component container
  );
};

export default CharacterGallery;