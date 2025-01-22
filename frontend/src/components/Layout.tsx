import React, { useRef, useState, useEffect } from 'react';
import { ImagePlus, Link, Settings } from 'lucide-react';
import DropdownMenu from './DropDownMenu';
import ImagePreview from './ImagePreview';
import { useCharacter } from '../contexts/CharacterContext';
import LoreView from './LoreView';
import MessagesView from './MessagesView';
import CharacterInfoView from './CharacterInfoView';
import JsonViewer from './JsonViewer';
import logo from '../assets/cardshark_justfin.png';
import { BackyardImportDialog } from './BackyardImportDialog';
import { AboutDialog } from './AboutDialog';
import TokenCounter from './TokenCounter';
import CharacterGallery from './CharacterGallery';
import SettingsModal from './SettingsModal';

type View = 'gallery' | 'info' | 'lore' | 'json' | 'messages';

const Layout: React.FC = () => {
  // Existing state
  const [currentView, setCurrentView] = useState<View>('gallery'); // Changed back to gallery
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showBackyardDialog, setShowBackyardDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsChangeCount, setSettingsChangeCount] = useState(0);
  const [backendStatus, setBackendStatus] = useState<'running' | 'disconnected'>('disconnected');
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

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-png', {
        method: 'POST',
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
        throw new Error(data.message || 'Failed to process character data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load character');
      setCharacterData(null);
      setImageUrl(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Handle URL import (placeholder)
  const handleUrlImport = () => {
    setShowBackyardDialog(true);
  };

  // Render main content based on current view
  const renderContent = () => {
    switch (currentView) {
      case 'lore':
        return <LoreView />;
      
      case 'json':
        return <JsonViewer />;

      case 'messages':
        return <MessagesView />;
        
      case 'gallery':
        return <CharacterGallery settingsChangeCount={settingsChangeCount} />;
      
      case 'info':
      default:
        return <CharacterInfoView />;
    }
  };

  const handleSave = async () => {
    if (!characterData || !imageUrl) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Get and log settings
      const settingsResponse = await fetch('/api/settings');
      const settingsData = await settingsResponse.json();
      console.log('=== Save Process Started ===');
      console.log('Settings Response:', settingsData);
      console.log('Directory:', settingsData.settings?.character_directory);
      console.log('Save to Directory Flag:', Boolean(settingsData.settings?.save_to_character_directory));
      console.log('Full Settings:', settingsData.settings);
      
      const settings = settingsData.settings;
      
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'character.png', { type: 'image/png' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify(characterData));
      
      const usingSaveDirectory = Boolean(settings.save_to_character_directory) && settings.character_directory;
      
      // Add save directory if enabled and log what we're doing
      if (usingSaveDirectory) {
        console.log('=== Directory Save Attempt ===');
        console.log('Directory:', settings.character_directory);
        console.log('Save to Directory Flag:', Boolean(settings.save_to_character_directory));
        
        formData.append('save_directory', settings.character_directory);
      } else {
        console.log('=== Browser Save Attempt ===');
        console.log('Save to directory enabled:', Boolean(settings.save_to_character_directory));
        console.log('Has directory:', Boolean(settings.character_directory));
      }
      
      console.log('Sending save request...');
      const saveResponse = await fetch('/api/save-png', {
        method: 'POST',
        body: formData
      });
      
      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        throw new Error(`Failed to save PNG: ${saveResponse.status} ${saveResponse.statusText} - ${errorText}`);
      }
      
      const savedBlob = await saveResponse.blob();
      const newImageUrl = URL.createObjectURL(savedBlob);
      setImageUrl(newImageUrl);
      
      // Only trigger browser download if not saving to directory
      if (!usingSaveDirectory) {
        const link = document.createElement('a');
        link.href = newImageUrl;
        link.download = `${characterData?.data?.name || 'character'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
    } catch (error) {
      console.error('Save failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to save character');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackyardImport = async (url: string) => {
    try {
      setIsLoading(true);
      setError(null);
  
      const response = await fetch('/api/import-backyard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url })
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
        throw new Error(data.message || 'Failed to process character data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import character');
      setCharacterData(null);
      setImageUrl(undefined);
      throw err; // Re-throw to be caught by dialog
    } finally {
      setIsLoading(false);
    }
  };

  // Add health check effect
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('/api/health');
        setBackendStatus(response.ok ? 'running' : 'disconnected');
      } catch {
        setBackendStatus('disconnected');
      }
    };

    // Initial check
    checkBackend();
    
    // Poll every 30 seconds
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen w-screen flex bg-stone-950 text-gray-100 overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Left Sidebar - Column 1 */}
      <div className="w-96 min-w-[384px] bg-stone-950 shrink-0 flex flex-col">
        <div className="p-6 flex-1">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <img src={logo} alt="CardShark Logo" className="w-5 h-6" />
              <span className="text-orange-500 text-xl">CardShark</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                title="Settings"
              >
                <Settings size={20} />
              </button>
              <DropdownMenu 
                icon={ImagePlus}
                title="Import character from PNG or URL" 
                items={[
                  { icon: ImagePlus, label: "Load PNG", onClick: handleUploadClick },
                  { icon: Link, label: "Import by URL", onClick: handleUrlImport }
                ]}
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-2 mb-8">
          <button 
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors
              ${currentView === 'gallery' 
                ? 'bg-slate-700 text-white' 
                : 'text-gray-300 hover:text-white hover:bg-slate-700'}`}
            onClick={() => setCurrentView('gallery')}
          >
            Character Folder (Optional)
          </button>
            <button 
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === 'info' 
                  ? 'bg-slate-700 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-slate-700'}`}
              onClick={() => setCurrentView('info')}
            >
              Character Info
            </button>
            <button 
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === 'messages' 
                  ? 'bg-slate-700 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-slate-700'}`}
              onClick={() => setCurrentView('messages')}
            >
              First Message(s)
            </button>
            <button 
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === 'lore' 
                  ? 'bg-slate-700 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-slate-700'}`}
              onClick={() => setCurrentView('lore')}
            >
              Lore Manager
            </button>
            <button 
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors
                ${currentView === 'json' 
                  ? 'bg-slate-700 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-slate-700'}`}
              onClick={() => setCurrentView('json')}
            >
              JSON View
            </button>
          </nav>
          
          {/* Image Preview Area */}
          <div className="mt-auto flex flex-col h-[64vh]">
            <div className="flex-1 min-h-0">
              <ImagePreview imageUrl={imageUrl} />
            </div>
            <TokenCounter characterData={characterData} />
            <button
              onClick={handleSave}
              className="w-full mt-4 py-2 px-4 bg-orange-700 hover:bg-orange-500 text-white rounded-lg transition-colors"
              disabled={!imageUrl}
            >
              Save PNG
            </button>
          </div>
        </div>
        {/* Add status indicator at bottom */}
        <div className="p-4 text-xs text-gray-500 flex justify-between items-center">
        <div>Backend: {backendStatus === 'running' ? 'Connected' : 'Disconnected'}</div>
        <button 
          onClick={() => setShowAboutDialog(true)}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          About
        </button>
      </div>
      </div>

      {/* Main Content - Column 2 */}
      <div className="flex-1 flex flex-col min-w-[800px] bg-gray-900">
        {/* Status Messages */}
        {error && (
          <div className="px-8 py-4 bg-red-900/50 text-red-200">
            {error}
          </div>
        )}
        {isLoading && (
          <div className="px-8 py-4 bg-blue-900/50 text-blue-200">
            Loading character data...
          </div>
        )}

        {/* Main Content */}
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
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSettingsChange={() => setSettingsChangeCount(prev => prev + 1)}
      />
    </div>
  );
};

export default Layout;