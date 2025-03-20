import React, { useRef, useState, useEffect } from "react";
import { useCharacter } from "../contexts/CharacterContext";
import LoreView from "./LoreView";
import MessagesView from "./MessagesView";
import CharacterInfoView from "./CharacterInfoView";
import APISettingsView from "./APISettingsView";
import { BackyardImportDialog } from "./BackyardImportDialog";
import { AboutDialog } from "./AboutDialog";
import CharacterGallery from "./CharacterGallery";
import { Settings, DEFAULT_SETTINGS } from "../types/settings";
import ChatView from "./ChatView";
import SideNav from "./SideNav";

import { View } from '../types/navigation';

const Layout: React.FC = () => {
  // File handling refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State management
  const [currentView, setCurrentView] = useState<View>("gallery");
  const [showBackyardDialog, setShowBackyardDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [settingsChangeCount, setSettingsChangeCount] = useState(0);
  const [backendStatus, setBackendStatus] = useState<"running" | "disconnected">("disconnected");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
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

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (!response.ok) throw new Error("Failed to load settings");
        const data = await response.json();
        if (data.success) {
          setSettings(data.settings);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    loadSettings();
  }, []);

  // Backend status check
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch("/api/health");
        setBackendStatus(response.ok ? "running" : "disconnected");
      } catch {
        setBackendStatus("disconnected");
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 90000);
    return () => clearInterval(interval);
  }, []);

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
      
      // Get current settings
      const settingsResponse = await fetch("/api/settings");
      const settingsData = await settingsResponse.json();
      const settings = settingsData.settings;
      
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
      if (usingSaveDirectory) {
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

  // Settings update handler
  const handleSettingsUpdate = async (updates: Partial<Settings>) => {
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) throw new Error("Failed to save settings");
      
      const data = await response.json();
      if (data.success) {
        setSettings((prev) => ({ ...prev, ...updates }));
        setSettingsChangeCount((prev) => prev + 1);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  // Render content based on current view
  const renderContent = () => {
    switch (currentView) {
      case "lore":
        return <LoreView />;
      case "messages":
        return <MessagesView />;
      case "chat":
        return <ChatView />;
      case "gallery":
        return <CharacterGallery settingsChangeCount={settingsChangeCount} />;
      case "settings":
        return (
          <APISettingsView
            settings={settings}
            onUpdate={handleSettingsUpdate}
          />
        );
      default:
        return <CharacterInfoView />;
    }
  };

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
      <SideNav
        currentView={currentView}
        onViewChange={setCurrentView}
        onFileUpload={() => fileInputRef.current?.click()}
        onUrlImport={() => setShowBackyardDialog(true)}
        onSave={handleSave}
        onShowAbout={() => setShowAboutDialog(true)}
        backendStatus={backendStatus}
        onImageChange={handleImageChange}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-[600px] bg-stone-900">
        {error && (
          <div className="px-8 py-4 bg-red-900/50 text-red-200">{error}</div>
        )}
        {isLoading && (
          <div className="px-8 py-4 bg-blue-900/50 text-blue-200">
            Loading character data...
          </div>
        )}
        {renderContent()}
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