import React, { useRef, useState, useEffect } from "react";
import { ImagePlus, Link, Save } from "lucide-react";
import DropdownMenu from "./DropDownMenu";
import ImagePreview from "./ImagePreview";
import { useCharacter } from "../contexts/CharacterContext";
import LoreView from "./LoreView";
import MessagesView from "./MessagesView";
import CharacterInfoView from "./CharacterInfoView";
import JsonViewer from "./JsonViewer";
import APISettingsView from "./APISettingsView";
import logo from "../assets/cardshark_justfin.png";
import { BackyardImportDialog } from "./BackyardImportDialog";
import { AboutDialog } from "./AboutDialog";
import TokenCounter from "./TokenCounter";
import CharacterGallery from "./CharacterGallery";
import { Settings, DEFAULT_SETTINGS } from "../types/settings";

type View = "gallery" | "settings" | "info" | "lore" | "json" | "messages";

const Layout: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>("gallery");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showBackyardDialog, setShowBackyardDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [settingsChangeCount, setSettingsChangeCount] = useState(0);
  const [backendStatus, setBackendStatus] = useState<"running" | "disconnected">("disconnected");
  const { characterData, setCharacterData, imageUrl, setImageUrl, isLoading, setIsLoading, error, setError } = useCharacter();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

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
      } else {
        throw new Error(data.message || "Failed to process character data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load character");
      setCharacterData(null);
      setImageUrl(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUrlImport = () => {
    setShowBackyardDialog(true);
  };

  const renderContent = () => {
    switch (currentView) {
      case "lore":
        return <LoreView />;
      case "json":
        return <JsonViewer />;
      case "messages":
        return <MessagesView />;
      case "gallery":
        return <CharacterGallery settingsChangeCount={settingsChangeCount} />;
      case "settings":
        return (
          <APISettingsView
            settings={settings}
            onUpdate={(updates) => {
              handleSettingsUpdate(updates);
            }}
          />
        );
      default:
        return <CharacterInfoView />;
    }
  };

  const handleSave = async () => {
    if (!characterData || !imageUrl) return;
    try {
      setIsLoading(true);
      setError(null);
      const settingsResponse = await fetch("/api/settings");
      const settingsData = await settingsResponse.json();
      const settings = settingsData.settings;
      console.log("=== Save Process Started ===");
      console.log("Character Name:", characterData.data?.name);
      console.log("Settings:", settings);
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], "character.png", { type: "image/png" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("metadata", JSON.stringify(characterData));
      const usingSaveDirectory = Boolean(settings.save_to_character_directory) && settings.character_directory;
      if (usingSaveDirectory) {
        console.log("=== Directory Save Mode ===");
        console.log("Target Directory:", settings.character_directory);
        formData.append("save_directory", settings.character_directory);
      } else {
        console.log("=== Browser Save Mode ===");
      }
      console.log("Sending save request...");
      const saveResponse = await fetch("/api/save-png", {
        method: "POST",
        body: formData,
      });
      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        throw new Error(`Save failed: ${errorText}`);
      }
      const savedBlob = await saveResponse.blob();
      const newImageUrl = URL.createObjectURL(savedBlob);
      setImageUrl(newImageUrl);
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
      if (usingSaveDirectory && settings.character_directory) {
        const characterName = characterData.data?.name || "character";
        const filePath = `${settings.character_directory}/${characterName}.png`;
        console.log("Verifying save at:", filePath);
        const verified = await verifySave(filePath);
        console.log("Save verified:", verified);
      }
      console.log("Save completed successfully");
    } catch (error) {
      console.error("Save failed:", error);
      setError(error instanceof Error ? error.message : "Failed to save character");
    } finally {
      setIsLoading(false);
    }
  };

  const verifySave = async (path: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const verifyResponse = await fetch(
        `/api/character-image/${encodeURIComponent(path)}`
      );
      console.log("=== Save Verification ===");
      console.log("Verification response:", verifyResponse.status);
      if (verifyResponse.ok) {
        const verifyBlob = await verifyResponse.blob();
        console.log("Verification file size:", verifyBlob.size);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Verification failed:", err);
      return false;
    }
  };

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
      setError(
        err instanceof Error ? err.message : "Failed to import character"
      );
      setCharacterData(null);
      setImageUrl(undefined);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

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
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen w-screen flex bg-stone-950 text-gray-100 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".png"
        onChange={handleFileUpload}
        className="hidden"
      />
      <div className="w-96 min-w-[384px] bg-stone-950 shrink-0 flex flex-col">
        <div className="p-6 flex-1">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <img src={logo} alt="CardShark Logo" className="w-5 h-6" />
              <span className="text-orange-500 text-xl">CardShark</span>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu
                icon={ImagePlus}
                title="Import character from PNG or URL"
                items={[
                  {
                    icon: ImagePlus,
                    label: "Load PNG",
                    onClick: handleUploadClick,
                  },
                  {
                    icon: Link,
                    label: "Import by URL",
                    onClick: handleUrlImport,
                  },
                ]}
              />
              <button
                onClick={handleSave}
                className="w-10 h-10 bg-purple-700 rounded-full flex items-center justify-center hover:bg-purple-500 transition-colors"
                title="Save PNG"
              >
                <Save size={20} />
              </button>
            </div>
          </div>
          <nav className="space-y-2 mb-8">
            <button
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === "gallery" ? "bg-slate-700 text-white" : "text-gray-300 hover:text-white hover:bg-slate-700"}`}
              onClick={() => setCurrentView("gallery")}
            >
              Character Folder
            </button>
            <button
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === "info" ? "bg-slate-700 text-white" : "text-gray-300 hover:text-white hover:bg-slate-700"}`}
              onClick={() => setCurrentView("info")}
            >
              Basic Info
            </button>
            <button
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === "messages" ? "bg-slate-700 text-white" : "text-gray-300 hover:text-white hover:bg-slate-700"}`}
              onClick={() => setCurrentView("messages")}
            >
              First Message(s)
            </button>
            <button
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === "lore" ? "bg-slate-700 text-white" : "text-gray-300 hover:text-white hover:bg-slate-700"}`}
              onClick={() => setCurrentView("lore")}
            >
              Lore Manager
            </button>
            <button
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === "json" ? "bg-slate-700 text-white" : "text-gray-300 hover:text-white hover:bg-slate-700"}`}
              onClick={() => setCurrentView("json")}
            >
              JSON View
            </button>
            <button
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === "settings" ? "bg-slate-700 text-white" : "text-gray-300 hover:text-white hover:bg-slate-700"}`}
              onClick={() => setCurrentView("settings")}
            >
              Settings
            </button>
          </nav>
          <div className="mt-auto flex flex-col h-[64vh]">
            <div className="flex-1 min-h-0">
              <ImagePreview imageUrl={imageUrl} />
            </div>
            <TokenCounter characterData={characterData} />
          </div>
        </div>
        <div className="p-4 text-xs text-gray-500 flex justify-between items-center">
          <div>
            Backend: {backendStatus === "running" ? "Connected" : "Disconnected"}
          </div>
          <button
            onClick={() => setShowAboutDialog(true)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            About
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-[800px] bg-gray-900">
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