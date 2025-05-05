// frontend/src/views/WorldCardsView.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom"; // Import useNavigate
import WorldCreationModal from "../components/WorldCreationModal";
import GalleryGrid from "../components/GalleryGrid";
import WorldCardImage from "../components/WorldCardImage";
import DeleteConfirmationDialog from "../components/DeleteConfirmationDialog";
import { worldStateApi } from "../utils/worldStateApi";
import { WorldMetadata } from "../types/world";
import { formatWorldName } from "../utils/formatters"; // Import our formatter function
import { Trash2, AlertTriangle, X } from 'lucide-react'; // Added AlertTriangle and X icons
import { useCharacter } from '../contexts/CharacterContext'; // Import character context


const WorldCardsView: React.FC = () => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
  // Remove activeWorld state, navigation is handled by router
  // const [activeWorld, setActiveWorld] = useState<WorldCardData | null>(null);
  const navigate = useNavigate(); // Add navigate hook
  const [isLoading, setIsLoading] = useState<boolean>(true); // Add loading state
  const [error, setError] = useState<string | null>(null); // Add error state
  const [deleteError, setDeleteError] = useState<string | null>(null); // Add delete error state
  const { setCharacterData, setImageUrl } = useCharacter(); // Get access to both character context functions

  // Add new state for image loading errors
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  // New state for delete confirmation dialog
  const [worldToDelete, setWorldToDelete] = useState<WorldMetadata | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Clear character data when component mounts to ensure we're viewing World Cards and not Character data
  useEffect(() => {
    // Clear character data to ensure it doesn't override world images
    setCharacterData(null);
    
    // Reset the image URL state without clearing existing images
    // This allows world card images to appear when navigating from characters
  }, [setCharacterData]);

  // Update the world image in the side nav when the component mounts
  useEffect(() => {
    // After worlds are loaded, set the first world's image if available
    if (!isLoading && worlds.length > 0) {
      const firstWorld = worlds[0];
      const worldCardImageUrl = `/api/worlds/${encodeURIComponent(firstWorld.name)}/card`;
      setImageUrl(worldCardImageUrl);
    }
  }, [isLoading, worlds, setImageUrl]);

  // Define handleWorldClick for better event handling
  const handleWorldClick = useCallback((world: WorldMetadata, e: React.MouseEvent) => {
    // Log the navigation attempt
    console.log(`Navigating to builder for world: ${world.name}`);
    
    // Set the world card image in the side navigation before navigation
    const worldCardImageUrl = `/api/worlds/${encodeURIComponent(world.name)}/card`;
    setImageUrl(worldCardImageUrl);
    
    // Stop event propagation to prevent parent elements from capturing the click
    e.stopPropagation();
    
    // Navigate to the world builder
    navigate(`/worldcards/${encodeURIComponent(world.name)}/builder`);
  }, [navigate, setImageUrl]);

  // Update image preview directly when user clicks on a world card image
  const handleCardImageClick = useCallback((worldName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking directly on the image
    
    const worldCardImageUrl = `/api/worlds/${encodeURIComponent(worldName)}/card`;
    
    // Clear any character data to ensure world image displays properly
    setCharacterData(null);
    setImageUrl(worldCardImageUrl);
    
    console.log(`Updated preview image to world card: ${worldName}`);
  }, [setImageUrl, setCharacterData]);
  
  // Define fetchWorlds using useCallback
  const fetchWorlds = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const worlds = await worldStateApi.listWorlds();
      setWorlds(worlds);
    } catch (err: any) {
      console.error("Failed to fetch worlds:", err);
      setError(`Failed to load worlds: ${err.message || 'Unknown error'}`);
      setWorlds([]);
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array for useCallback as it doesn't depend on props/state
  
  // Function to handle world creation success
  const handleWorldCreated = async (_worldName: string) => {
    // Refresh the worlds list
    await fetchWorlds();
    // Navigate to the new world if needed
    // navigate(`/worldcards/${worldName}/builder`);
  };
  
  // Fetch worlds on initial mount
useEffect(() => {
  fetchWorlds();
}, [fetchWorlds]); // Depend on fetchWorlds (stable due to useCallback)

  // Reset error state when page loads
  useEffect(() => {
    setDeleteError(null);
    setImageErrors({});
  }, []);

  // Handler for clicking the trash icon
  const handleTrashIconClick = (event: React.MouseEvent, world: WorldMetadata) => {
    event.stopPropagation(); // Prevent the card click event
    setDeleteError(null); // Clear any previous error
    setWorldToDelete(world);
    setIsDeleteConfirmOpen(true);
  };
  
  // Handle the actual API call to delete the world
  const handleConfirmDelete = async () => {
    if (!worldToDelete) return;
    
    setIsDeleting(true);
    
    try {
      console.log(`Performing API delete for world: ${worldToDelete.name}`);
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldToDelete.name)}`, {
        method: 'DELETE',
      });
      
      // Parse the JSON response if possible
      const result = await response.json().catch(() => ({ message: `Server error (${response.status})` }));
      
      // Check for success
      if (!response.ok) {
        throw new Error(result.detail || result.message || `Failed (${response.status})`);
      }
      
      console.log(`Successfully deleted world via API: ${worldToDelete.name}`);
      
      // Remove world from state AFTER successful API call
      setWorlds(prevWorlds => prevWorlds.filter(world => world.name !== worldToDelete.name));
      
    } catch (err) {
      console.error(`API Deletion failed for world ${worldToDelete.name}:`, err);
      setDeleteError(err instanceof Error ? err.message : 'Unknown deletion error.');
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
      setWorldToDelete(null);
    }
  };
  
  // Cancel deletion
  const handleCancelDelete = () => {
    setIsDeleteConfirmOpen(false);
    setWorldToDelete(null);
  };

  // Function to dismiss the delete error message
  const dismissDeleteError = () => {
    setDeleteError(null);
  };

  // Function to handle image load errors
  const handleImageError = (worldName: string) => {
    setImageErrors(prev => ({
      ...prev,
      [worldName]: true
    }));
  };

// Remove conditional rendering based on activeWorld
// if (activeWorld) { ... }
  return (
    <div className="flex flex-col h-full w-full p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
          World Cards
        </h1>
        <button
          className="btn btn-primary bg-blue-700 text-white hover:bg-blue-800 px-6 py-2 rounded-lg shadow"
          onClick={() => setShowNewModal(true)}
        >
          + New World
        </button>
      </div>
      <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
             <p className="text-slate-500 dark:text-slate-400">Loading worlds...</p>
           </div>
        ) : error ? (
           <div className="flex-1 flex items-center justify-center text-red-500">
             <p>Error: {error}</p>
           </div>
        ) : worlds.length === 0 ? (
           <div className="flex-1 flex flex-col items-center justify-center">
             <img
               src="/worldcards_emptystate.png"
               alt="No worlds illustration"
               className="mb-4" style={{ width: 240, opacity: 0.6 }}
               draggable={false}
             />
             <p className="text-lg text-slate-600 dark:text-slate-300 mb-2">
               No worlds found.
             </p>
             <p className="text-slate-500 dark:text-slate-400">
               Click "+ New World" to create one.
             </p>
           </div>
        ) : (
          <GalleryGrid
            items={worlds}
            emptyMessage="No worlds created yet."
            renderItem={(world) => {
              const isDeleting = worldToDelete?.name === world.name;
              return (
                <div
                  key={world.name} // Use world name as key
                  className={`
                    relative group cursor-pointer rounded-xl overflow-hidden aspect-[3/5] shadow-lg bg-stone-900
                    transition-all duration-200 ease-in-out
                    ${isDeleting ? 'scale-0 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'}
                    hover:shadow-xl
                  `}
                  // Use dedicated click handler for better control
                  onClick={(e) => {
                    // Always update the image URL when clicking on the card
                    const worldCardImageUrl = `/api/worlds/${encodeURIComponent(world.name)}/card`;
                    setImageUrl(worldCardImageUrl);
                    
                    // Then handle navigation
                    handleWorldClick(world, e);
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open builder for ${world.name}`}
                  onKeyPress={(e) => {
                    // Navigate on Enter/Space key press (only if not deleting)
                    if (!isDeleting && (e.key === "Enter" || e.key === " ")) {
                      // Also update the image URL when using keyboard navigation
                      const worldCardImageUrl = `/api/worlds/${encodeURIComponent(world.name)}/card`;
                      setImageUrl(worldCardImageUrl);
                      
                      navigate(`/worldcards/${encodeURIComponent(world.name)}/builder`);
                    }
                  }}
                >
                  {/* Delete Button (Hide if animating out) */}
                  {!isDeleting && (
                    <button
                      title="Delete world card"
                      onClick={(e) => handleTrashIconClick(e, world)}
                      className={`absolute top-2 left-2 z-10 p-1 rounded-full backdrop-blur-sm
                                  bg-black/40 text-white opacity-0 group-hover:opacity-100
                                  transition-all duration-200 ease-in-out
                                  hover:bg-red-700/70 hover:scale-110 focus:outline-none
                                  focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-stone-800
                                `}
                      aria-label={`Delete ${world.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  {/* Image container using our new WorldCardImage component */}
                  <div className="absolute inset-0">
                    <WorldCardImage
                      worldName={world.name}
                      className={`object-cover w-full h-full transition-transform duration-300 ${isDeleting ? '' : 'group-hover:scale-110'}`}
                      alt={`${world.name} world card`}
                      onError={() => handleImageError(world.name)}
                      onClick={(e) => handleCardImageClick(world.name, e)} // Add onClick handler to update the side nav image
                    />
                    {imageErrors[world.name] && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <AlertTriangle size={48} className="text-red-500" />
                        <p className="text-white mt-2">Image failed to load</p>
                      </div>
                    )}
                  </div>
                  {/* Overlay for text */}
                  <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4">
                    <h3 className="text-xl font-bold text-white truncate drop-shadow">
                      {formatWorldName(world.name)}
                    </h3>
                    {/* Metadata section */}
                    <div className="text-sm text-stone-200 drop-shadow">
                      <div className="flex justify-between mb-1">
                        <span>Locations:</span>
                        <span>{world.location_count}</span>
                      </div>
                      {world.unconnected_location_count > 0 && (
                        <div className="flex justify-between mb-1">
                          <span>Unconnected:</span>
                          <span>{world.unconnected_location_count}</span>
                        </div>
                      )}
                      {world.base_character_name && (
                        <div className="mt-2 text-xs text-stone-300">
                          Based on: {world.base_character_name}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-stone-400">
                        Last modified: {new Date(world.last_modified_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>
      <WorldCreationModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSuccess={handleWorldCreated} // Pass the success handler
      />
      {deleteError && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg flex items-center space-x-2">
          <AlertTriangle size={24} />
          <span>{deleteError}</span>
          <button onClick={dismissDeleteError} className="ml-auto">
            <X size={16} />
          </button>
        </div>
      )}
      {/* New Delete confirmation dialog */}
      <DeleteConfirmationDialog
        isOpen={isDeleteConfirmOpen}
        title="Delete World"
        description="Are you sure you want to delete the world"
        itemName={worldToDelete?.name}
        isDeleting={isDeleting}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default WorldCardsView;
