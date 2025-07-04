// frontend/src/components/Layout.tsx (Modified)
import React, { useRef, useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom"; // Added useLocation for routing transitions
import { useCharacter } from "../contexts/CharacterContext";
import { useSettings } from "../contexts/SettingsContext";
import { useComparison } from "../contexts/ComparisonContext";
import { BackyardImportDialog } from "./BackyardImportDialog";
import { AboutDialog } from "./AboutDialog";
import ComparisonPanel from "./ComparisonPanel";
import SideNav from "./SideNav";
import { BottomBanner } from "./BottomBanner";

const Layout: React.FC = () => {
  // File handling refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State management
  const [showBackyardDialog, setShowBackyardDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [settingsChangeCount, setSettingsChangeCount] = useState(0);
  const [backendStatus, setBackendStatus] = useState<"running" | "disconnected">("disconnected");
  const [lastHealthCheck, setLastHealthCheck] = useState<number>(0);
  const location = useLocation(); // Track route changes
  
  const { settings } = useSettings();
  const [newImage, setNewImage] = useState<File | string | null>(null);
  
  // Character context
  const { 
    characterData, 
    setCharacterData, 
    imageUrl, 
    setImageUrl, 
    isLoading, 
    setIsLoading, 
    error, 
    setError,
    invalidateCharacterCache
  } = useCharacter();

  // Detect if we're in the WorldView by checking the URL path
  const isWorldView = location.pathname.includes('/worldcards/') && location.pathname.includes('/view');
  const worldName = isWorldView ? location.pathname.split('/').pop() : null;

  // Comparison context
  const { isCompareMode } = useComparison();

  // We no longer need to load settings here as it's handled by the SettingsContext

  // Backend status check - optimized to reduce API calls
  useEffect(() => {
    // Health check function with caching
    const checkBackend = async (force = false) => {
      const now = Date.now();
      // Skip check if last check was less than 5 minutes ago (300000ms) and not forced
      const CACHE_DURATION = 300000; // 5 minutes
      
      // Try to get cached status first
      const cachedStatus = localStorage.getItem('backendStatus');
      const cachedTimestamp = Number(localStorage.getItem('backendStatusTimestamp') || '0');
      
      if (!force && cachedStatus && now - cachedTimestamp < CACHE_DURATION) {
        setBackendStatus(cachedStatus as "running" | "disconnected");
        setLastHealthCheck(cachedTimestamp);
        return;
      }
      
      try {
        const response = await fetch("/api/health");
        const status = response.ok ? "running" : "disconnected";
        setBackendStatus(status);
        setLastHealthCheck(now);
        
        // Cache the result
        localStorage.setItem('backendStatus', status);
        localStorage.setItem('backendStatusTimestamp', now.toString());
      } catch {
        setBackendStatus("disconnected");
        setLastHealthCheck(now);
        localStorage.setItem('backendStatus', "disconnected");
        localStorage.setItem('backendStatusTimestamp', now.toString());
      }
    };
    
    // Check immediately on first mount
    checkBackend();
    
    // Set up a longer interval for periodic checks (5 minutes)
    const interval = setInterval(() => checkBackend(), 300000);
    
    // Add visibility change listener to check when user returns to the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Only force a check if it's been more than 2 minutes since last check
        if (Date.now() - lastHealthCheck > 120000) {
          checkBackend(true);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [lastHealthCheck]);
  
  // Check health on major route changes
  useEffect(() => {
    // Only check health on route change if it's been more than 2 minutes
    if (Date.now() - lastHealthCheck > 120000) {
      const checkBackendOnRouteChange = async () => {
        try {
          const response = await fetch("/api/health");
          const status = response.ok ? "running" : "disconnected";
          setBackendStatus(status);
          setLastHealthCheck(Date.now());
          localStorage.setItem('backendStatus', status);
          localStorage.setItem('backendStatusTimestamp', Date.now().toString());
        } catch {
          setBackendStatus("disconnected");
          setLastHealthCheck(Date.now());
          localStorage.setItem('backendStatus', "disconnected");
          localStorage.setItem('backendStatusTimestamp', Date.now().toString());
        }
      };
      checkBackendOnRouteChange();
    }
  }, [location.pathname, lastHealthCheck]);

  // File upload handler
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/characters/extract-metadata", { // Changed endpoint URL
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.success && data.metadata) {
        setCharacterData(data.metadata);
        setImageUrl(URL.createObjectURL(file));
        setNewImage(file); // Store the original file for saving later
      } else {
        throw new Error(data.message || "Failed to process character data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load character");
      setCharacterData(null);
      setImageUrl(undefined);
      setNewImage(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle image change from ImagePreview component
  const handleImageChange = async (newImageData: File | string) => {
    if (isWorldView && worldName) {
      // Handle world image update
      try {
        // Prepare FormData with the new image
        const formData = new FormData();
        
        if (newImageData instanceof File) {
          // If it's a File object, use it directly
          formData.append('file', newImageData);
        } else if (typeof newImageData === 'string' && newImageData.startsWith('data:image/')) {
          // Convert data URL to File if it's a valid image data URL
          const response = await fetch(newImageData);
          const blob = await response.blob();
          const file = new File([blob], "world_card.png", { type: "image/png" });
          formData.append('file', file);
        } else {
          throw new Error("Invalid image format");
        }
        
        // Upload the image to the backend
        const uploadResponse = await fetch(`/api/worlds/${encodeURIComponent(worldName)}/upload-png`, {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}));
          throw new Error(errorData.detail || errorData.message || "Failed to upload world image");
        }
        
        // Refresh the image by updating the URL with a cache-busting parameter
        const refreshedUrl = `/api/worlds/${encodeURIComponent(worldName)}/card?t=${Date.now()}`;
        setImageUrl(refreshedUrl);
      } catch (error) {
        console.error("Error updating world image:", error);
        setError(error instanceof Error ? error.message : "Failed to update world image");
      }
      return;
    }

    // Default character image handling
    if (newImageData) {
      // Update the new image state
      setNewImage(newImageData);
      
      // If it's a File object, create an object URL for display
      if (newImageData instanceof File) {
        const objectUrl = URL.createObjectURL(newImageData);
        setImageUrl(objectUrl);
      } else {
        // It's a string (data URL from cropping)
        setImageUrl(newImageData);
      }
    }
  };

  // Save handler
  const handleSave = async () => {
    if (!characterData) {
      setError("No character data available to save");
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Prepare the file - simplified approach that preserves the original image
      let fileToSave: File | null = null;
      
      if (newImage instanceof File) {
        // If we have a valid File object, use it directly
        fileToSave = newImage;
      } else if (newImage && typeof newImage === 'string' && newImage.startsWith('data:image/')) {
        // Convert data URL to File if it's a valid image data URL
        try {
          const response = await fetch(newImage);
          const blob = await response.blob();
          fileToSave = new File([blob], "character.png", { type: "image/png" });
        } catch (error) {
          console.error("Error converting data URL to File:", error);
          throw new Error("Failed to process the image data");
        }
      } else if (imageUrl) {
        // Fall back to the current imageUrl if newImage is not available or valid
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          fileToSave = new File([blob], "character.png", { type: "image/png" });
        } catch (error) {
          console.error("Error fetching current image:", error);
          throw new Error("Failed to access the current image");
        }
      }
      
      // Final check - if we still don't have a valid image, throw an error
      if (!fileToSave) {
        throw new Error("No valid image available to save");
      }
      
      // Create form data
      const formData = new FormData();
      formData.append("file", fileToSave);
      formData.append("metadata_json", JSON.stringify(characterData));
      
      // Save the file
      const saveResponse = await fetch("/api/characters/save-card", {
        method: "POST",
        body: formData,
      });
      
      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        throw new Error(`Save failed: ${errorText}`);
      }
      
      // Handle successful save
      const saveResult = await saveResponse.json();
      
      // Update the UI - preserve our reference to the image
      if (saveResult.success) {
        // Don't reset newImage state - keep our reference to the original file
        // setNewImage(null);
        console.log("Character saved successfully:", saveResult);
        
        // IMPORTANT: Invalidate character gallery cache to ensure immediate refresh
        invalidateCharacterCache();
      } else {
        throw new Error(saveResult.message || "Unknown error during save");
      }
      
    } catch (error) {
      console.error("Save error:", error);
      setError(error instanceof Error ? error.message : "Failed to save character");
    } finally {
      setIsLoading(false);
    }
  };

  // Backyard import handler
  const handleBackyardImport = async (url: string) => {
    try {
      setIsLoading(true);
      setError(null);
  
      const response = await fetch("/api/characters/import-backyard", { // Changed endpoint URL
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
  
      if (!response.ok) {
        throw new Error(`Import failed: ${response.statusText}`);
      }
  
      const data = await response.json();
      if (data.success && data.data && data.data.character) {
        // Extract character data from the API response
        const characterData = data.data.character;
        setCharacterData(characterData);
        
        // For imported characters, use the character UUID to construct image URL
        if (characterData.character_uuid) {
          setImageUrl(`/api/character-image/${characterData.character_uuid}.png`);
        }
        
        // Show success message
        console.log("Backyard character imported successfully:", characterData.name || 'Unknown Character');
      } else {
        throw new Error(data.message || data.data?.message || "Failed to process character data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import character");
      setCharacterData(null);
      setImageUrl(undefined);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Settings change tracking
  const incrementSettingsChangeCount = () => {
    setSettingsChangeCount((prev) => prev + 1);
  };
  
  // Track settings changes
  useEffect(() => {
    incrementSettingsChangeCount();
  }, [settings]);

  return (
    <div className="h-screen w-screen flex bg-stone-950 text-gray-100 overflow-hidden">
      {/* Add Bottom Banner at the top level */}
      <BottomBanner />
      <input
        ref={fileInputRef}
        type="file"
        accept=".png"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Side Navigation */}
      {/* Props currentView and onViewChange are removed from SideNavProps */}
      <SideNav
        onFileUpload={() => fileInputRef.current?.click()}
        onUrlImport={() => setShowBackyardDialog(true)}
        onSave={handleSave}
        onShowAbout={() => setShowAboutDialog(true)}
        backendStatus={backendStatus}
        onImageChange={handleImageChange}
      />
      
      {/* Main Content Area - added pb-8 to account for bottom banner */}
      <div className={`flex flex-1 ${isCompareMode ? 'min-w-0' : 'min-w-[600px]'} bg-stone-900`}>
        {/* Main content column */}
        <div className={`flex flex-col ${isCompareMode ? 'w-1/2' : 'flex-1'} mb-8`}>
          {error && (
            <div className="px-8 py-4 bg-red-900/50 text-red-200">{error}</div>
          )}
          {isLoading && (
            <div className="px-8 py-4 bg-blue-900/50 text-blue-200">
              Loading character data...
            </div>
          )}
          {/* Render the matched nested route component here */}
          <Outlet />
        </div>
        
        {/* Comparison panel (conditional) */}
        {isCompareMode && (
          <div className="w-1/2 border-l border-stone-800">
            <ComparisonPanel settingsChangeCount={settingsChangeCount} />
          </div>
        )}
      </div>
      
      {/* Dialogs */}
      <BackyardImportDialog
        isOpen={showBackyardDialog}
        onClose={() => setShowBackyardDialog(false)}
        onImport={handleBackyardImport}
      />
      <AboutDialog
        isOpen={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
      />
    </div>
  );
};

export default Layout;