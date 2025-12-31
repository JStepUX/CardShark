// frontend/src/components/Layout.tsx (Modified)
import React, { useRef, useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom"; // Added useLocation for routing transitions
import { useCharacter } from "../contexts/CharacterContext";
import { useSettings } from "../contexts/SettingsContext";
import { useComparison } from "../contexts/ComparisonContext";
import { AboutDialog } from "./AboutDialog";
import ComparisonPanel from "./ComparisonPanel";
import WorkshopPanel from "./WorkshopPanel";
import SideNav from "./SideNav";
import { BottomBanner } from "./BottomBanner";
import { ChatProvider } from "../contexts/ChatContext";

const Layout: React.FC = () => {
  // File handling refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State management
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

  // Comparison and workshop context
  const { isCompareMode, isWorkshopMode, setWorkshopMode } = useComparison();

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
    // Only check health on route change if it's because more than 2 minute
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

    // Auto-close workshop mode on route change as it should only be active in Info/Greetings
    setWorkshopMode(false);
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

  // World import handler
  const handleWorldImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setIsLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('conflict_policy', 'skip');

        const response = await fetch('/api/world-cards/import', {
          method: 'POST',
          body: formData,
        });

        if (response.status === 409) {
          // Conflict - ask user
          const shouldOverwrite = window.confirm('World already exists. Overwrite?');
          if (shouldOverwrite) {
            formData.set('conflict_policy', 'overwrite');
            const retryResponse = await fetch('/api/world-cards/import', {
              method: 'POST',
              body: formData,
            });
            const retryResult = await retryResponse.json();
            if (retryResult.success && retryResult.data) {
              alert(`World "${retryResult.data.world_name}" imported successfully!\nNPCs: ${retryResult.data.imported_npcs} imported, ${retryResult.data.skipped_npcs} skipped`);
              invalidateCharacterCache(); // Refresh gallery
            } else {
              throw new Error(retryResult.message || 'Failed to import world');
            }
          }
          return;
        }

        const result = await response.json();
        if (result.success && result.data) {
          alert(`World "${result.data.world_name}" imported successfully!\nNPCs: ${result.data.imported_npcs} imported, ${result.data.skipped_npcs} skipped`);
          invalidateCharacterCache(); // Refresh gallery
        } else {
          throw new Error(result.message || 'Failed to import world');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import world');
      } finally {
        setIsLoading(false);
      }
    };
    input.click();
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
        onWorldImport={handleWorldImport}
        onSave={handleSave}
        onShowAbout={() => setShowAboutDialog(true)}
        backendStatus={backendStatus}
        onImageChange={handleImageChange}
      />

      {/* Main Content Area - added pb-8 to account for bottom banner */}
      <div className={`flex flex-1 ${(isCompareMode || isWorkshopMode) ? 'min-w-0' : 'min-w-[600px]'} bg-stone-900`}>
        {/* Main content column */}
        <div className={`flex flex-col ${(isCompareMode || isWorkshopMode) ? 'w-1/2' : 'flex-1'} mb-8 relative z-0`}>
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

        {/* Panel slot - supports both comparison and workshop panels */}
        {(isCompareMode || isWorkshopMode) && (
          <div className="w-1/2 border-l border-stone-800 relative z-20 mb-8">
            {isCompareMode && <ComparisonPanel settingsChangeCount={settingsChangeCount} />}
            {isWorkshopMode && (
              <ChatProvider>
                <WorkshopPanel onClose={() => setWorkshopMode(false)} />
              </ChatProvider>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AboutDialog
        isOpen={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
      />
    </div>
  );
};

export default Layout;