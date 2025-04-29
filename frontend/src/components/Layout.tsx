// frontend/src/components/Layout.tsx (Modified)
import React, { useRef, useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom"; // Added useLocation for routing transitions
import { useCharacter } from "../contexts/CharacterContext";
import { useSettings } from "../contexts/SettingsContext";
import { useComparison } from "../contexts/ComparisonContext";
// Remove direct view imports if they are only rendered via routes now
// import LoreView from "./LoreView";
// import MessagesView from "./MessagesView";
// import CharacterInfoView from "./CharacterInfoView";
// import APISettingsView from "./APISettingsView";
import { BackyardImportDialog } from "./BackyardImportDialog";
import { AboutDialog } from "./AboutDialog";
// import CharacterGallery from "./CharacterGallery"; // Rendered via Outlet
import ComparisonPanel from "./ComparisonPanel";
// import ChatView from "./ChatView"; // Rendered via Outlet
import SideNav from "./SideNav";
// import WorldCardsView from '../views/WorldCardsView'; // Rendered via Outlet
// import WorldCardsPlayView from '../views/WorldCardsPlayView'; // Rendered via Outlet

// Remove View type if no longer needed
// import { View } from '../types/navigation';
const Layout: React.FC = () => {
  // File handling refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State management
  // Remove currentView state, router handles the view
  // const [currentView, setCurrentView] = useState<View>("gallery");
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
    setError 
  } = useCharacter();

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
      
      const response = await fetch("/api/upload-png", {
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
  const handleImageChange = (newImageData: File | string) => {
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
    if (!characterData) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Settings are already available from context
      
      // Prepare the file
      let fileToSave: File;
      
      if (newImage) {
        // Use the new image from state
        if (typeof newImage === 'string') {
          // Convert data URL to Blob/File
          const response = await fetch(newImage);
          const blob = await response.blob();
          fileToSave = new File([blob], "character.png", { type: "image/png" });
        } else {
          // It's already a File object
          fileToSave = newImage;
        }
      } else if (imageUrl) {
        // Fall back to current imageUrl
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        fileToSave = new File([blob], "character.png", { type: "image/png" });
      } else {
        throw new Error("No image available to save");
      }
      
      // Create form data
      const formData = new FormData();
      formData.append("file", fileToSave);
      formData.append("metadata", JSON.stringify(characterData));
      
      // Add save directory if enabled
      const usingSaveDirectory = Boolean(settings.save_to_character_directory) &&
                               settings.character_directory;
      if (usingSaveDirectory && settings.character_directory) {
        formData.append("save_directory", settings.character_directory);
      }
      
      // Save the file
      const saveResponse = await fetch("/api/save-png", {
        method: "POST",
        body: formData,
      });
      
      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        throw new Error(`Save failed: ${errorText}`);
      }
      
      // Handle the saved file
      const savedBlob = await saveResponse.blob();
      const newImageUrl = URL.createObjectURL(savedBlob);
      setImageUrl(newImageUrl);
      
      // Reset newImage state after successful save
      setNewImage(null);
      
      // Trigger download if not saving to directory
      if (!usingSaveDirectory) {
        const sanitizedName = (characterData.data?.name || "character")
          .replace(/[^a-zA-Z0-9]/g, "_")
          .replace(/_+/g, "_")
          .toLowerCase();
          
        const link = document.createElement("a");
        link.href = newImageUrl;
        link.download = `${sanitizedName}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
    } catch (error) {
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
  
      const response = await fetch("/api/import-backyard", {
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
      if (data.success && data.metadata) {
        setCharacterData(data.metadata);
        if (data.imageUrl) {
          setImageUrl(data.imageUrl);
        }
      } else {
        throw new Error(data.message || "Failed to process character data");
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

  // Remove renderContent function, Outlet handles rendering
  // const renderContent = () => { ... };

  return (
    <div className="h-screen w-screen flex bg-stone-950 text-gray-100 overflow-hidden">
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
      
      {/* Main Content Area */}
      <div className={`flex flex-1 ${isCompareMode ? 'min-w-0' : 'min-w-[600px]'} bg-stone-900`}>
        {/* Main content column */}
        <div className={`flex flex-col ${isCompareMode ? 'w-1/2' : 'flex-1'}`}>
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