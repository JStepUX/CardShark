// frontend/src/views/WorldCardsView.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom"; // Import useNavigate
import WorldCardsNewModal from "./WorldCardsNewModal";
import GalleryGrid from "../components/GalleryGrid";
// Remove WorldBuilderView import, it's rendered via route now
// import WorldBuilderView from "./WorldBuilderView";

// Interface matching the data from /api/worlds/list
interface WorldCardData {
  id: string; // Directory name used as ID
  name: string;
  description: string;
  cardImageUrl: string | null; // URL provided by the backend
}

const WorldCardsView: React.FC = () => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [worlds, setWorlds] = useState<WorldCardData[]>([]);
  // Remove activeWorld state, navigation is handled by router
  // const [activeWorld, setActiveWorld] = useState<WorldCardData | null>(null);
  const navigate = useNavigate(); // Add navigate hook
  const [isLoading, setIsLoading] = useState<boolean>(true); // Add loading state
  const [error, setError] = useState<string | null>(null); // Add error state

  // Remove handleCreateWorld - worlds are fetched from API now
  // const handleCreateWorld = (world: WorldStub) => {
  //   setWorlds((prev) => [...prev, world]);
  // };

  // Remove handleWorldClick and handleExitBuilder, they are replaced by direct navigation
  // const handleWorldClick = (world: WorldCardData) => { ... };
  // const handleExitBuilder = () => { ... };
  
  // Define fetchWorlds using useCallback
  const fetchWorlds = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/worlds/list");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: WorldCardData[] = await response.json();
      setWorlds(data);
    } catch (err: any) {
      console.error("Failed to fetch worlds:", err);
      setError(`Failed to load worlds: ${err.message || 'Unknown error'}`);
      setWorlds([]);
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array for useCallback as it doesn't depend on props/state
  
  // Function to handle world creation
  const handleWorldCreated = async (worldData: {
    name: string;
    description: string;
    image: File | null
  }) => {
    try {
      setIsLoading(true);
      
      // 1. Create a unique ID for the world (using a simple slug from the name)
      const worldId = worldData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
        '-' + Date.now().toString().slice(-6); // Add timestamp suffix for uniqueness
      
      // 2. Create the world state object
      const worldState = {
        name: worldData.name,
        description: worldData.description,
        uuid: `world-${worldId}`,
        created_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
        last_modified: new Date().toISOString().split('T')[0],
        // Add other default world state properties as needed
        grid: {
          dimensions: [3, 3],
          current_position: "A1",
          visited_positions: ["A1"],
          locations: {
            "A1": {
              name: "Starting Location",
              description: "The beginning of your adventure.",
              background: null,
              npcs: [],
              exits: ["A2", "B1"],
              events: [],
              coordinates: "A1",
              x: 0,
              y: 0
            }
          }
        }
      };
      
      // 3. Save the world state
      const stateResponse = await fetch(`/api/world-state/save?world=${worldId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(worldState),
      });
      
      if (!stateResponse.ok) {
        throw new Error(`Failed to save world state: ${stateResponse.statusText}`);
      }
      
      // 4. Upload the world card image if provided
      if (worldData.image) {
        const formData = new FormData();
        formData.append('file', worldData.image);
        
        const imageResponse = await fetch(`/api/worlds/${worldId}/upload-card`, {
          method: 'POST',
          body: formData,
        });
        
        if (!imageResponse.ok) {
          console.error(`Warning: Failed to upload world card image: ${imageResponse.statusText}`);
          // Continue even if image upload fails
        }
      }
      
      // 5. Refresh the worlds list
      await fetchWorlds();
      
    } catch (err: any) {
      console.error("Error creating world:", err);
      setError(`Failed to create world: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch worlds on initial mount
useEffect(() => {
  fetchWorlds();
}, [fetchWorlds]); // Depend on fetchWorlds (stable due to useCallback)

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
            renderItem={(world) => ( // No need for idx if using world.id as key
              <div
                key={world.id} // Use unique world ID from backend
                className="relative rounded-xl overflow-hidden aspect-[3/5] shadow-lg bg-stone-900 cursor-pointer group transition-transform hover:scale-105"
                // Navigate to the builder route on click
                onClick={() => navigate(`/worldcards/${world.id}/builder`)}
                tabIndex={0}
                role="button"
                aria-label={`Open builder for ${world.name}`}
                onKeyPress={(e) => {
                  // Navigate on Enter/Space key press
                  if (e.key === "Enter" || e.key === " ") navigate(`/worldcards/${world.id}/builder`);
                }}
              >
                {world.cardImageUrl ? (
                  <img
                    src={world.cardImageUrl} // Use the URL from the backend
                    alt={world.name}
                    className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-110 bg-stone-800"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-stone-800 text-stone-400">
                    No Image
                  </div>
                )}
                <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-3">
                  <div className="font-semibold text-lg text-white truncate drop-shadow">
                    {world.name}
                  </div>
                  <div className="text-slate-300 text-sm line-clamp-2 drop-shadow">
                    {world.description || <span className="italic">No description provided</span>}
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </div>
      <WorldCardsNewModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleWorldCreated} // Pass the refresh function
      />
    </div>
  );
};

export default WorldCardsView;
