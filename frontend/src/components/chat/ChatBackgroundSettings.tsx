import React, { useState, useEffect } from 'react';
import { Image, RefreshCw, ImagePlus } from 'lucide-react';
import { UnifiedImageGallery, ImageSelection } from '../common/UnifiedImageGallery';

export interface Background {
  id: string;
  name: string;
  url: string;
  filename: string;
  isDefault?: boolean;
  isAnimated?: boolean;
  aspectRatio?: number;
}

export interface BackgroundSettings {
  background: Background | null;
  transparency: number; // 0-100
  fadeLevel: number; // 0-100
  disableAnimation?: boolean; // New option to disable animation for GIFs
  moodEnabled?: boolean; // Enable mood-based dynamic background
}

interface ChatBackgroundSettingsProps {
  settings: BackgroundSettings;
  onSettingsChange: (settings: BackgroundSettings) => void;
  onClose: () => void;
}

const ChatBackgroundSettings: React.FC<ChatBackgroundSettingsProps> = ({
  settings,
  onSettingsChange,
  onClose
}) => {
  const [localSettings, setLocalSettings] = useState<BackgroundSettings>({ ...settings, moodEnabled: false });
  const [showGallery, setShowGallery] = useState(false);
  
  // Update local settings when props change
  useEffect(() => {
    setLocalSettings({ ...settings, moodEnabled: false });
  }, [settings]);
  
  // Apply changes to local settings
  const updateSettings = (changes: Partial<BackgroundSettings>) => {
    const updated = { ...localSettings, ...changes };
    setLocalSettings(updated);
  };
  
  // Handle save changes
  const handleSaveChanges = () => {
    onSettingsChange(localSettings);
    onClose();
  };
  
  // Handle background selection
  const handleBackgroundSelect = (imageSelection: ImageSelection) => {
    const background: Background = {
      id: imageSelection.id,
      name: imageSelection.name,
      url: imageSelection.url,
      filename: imageSelection.filename,
      isAnimated: imageSelection.isAnimated,
      aspectRatio: imageSelection.aspectRatio,
      isDefault: false
    };
    updateSettings({ background });
  };
  
  // Reset to defaults
  const handleReset = () => {
    updateSettings({
      background: null,
      transparency: 85,
      fadeLevel: 30,
      disableAnimation: false,
      moodEnabled: false
    });
  };
  
  // Determine if current background is a GIF
  const isAnimatedGif = localSettings.background?.isAnimated || false;
  
  return (
    <div className="p-6 bg-stone-900 rounded-lg space-y-6 w-full max-w-2xl">
      <h2 className="text-lg font-medium flex items-center gap-2">
        <Image size={20} />
        Background Settings
      </h2>

      {/* Preview */}
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-medium">Preview</h3>

        <div className="mx-auto rounded-lg overflow-hidden border border-stone-700 w-full max-w-md">
          <div
            className="relative w-full"
            style={{
              aspectRatio: 16/9,
              backgroundColor: 'rgb(28, 25, 23)', // bg-stone-900
              backgroundImage: localSettings.background?.url ? `url(${localSettings.background.url})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              // If it's a GIF and animations are disabled, prevent animation
              animationPlayState: isAnimatedGif && localSettings.disableAnimation ? 'paused' : 'running'
            }}
          >
            {/* Chat UI preview with transparency */}
            <div 
              className="absolute inset-0 flex flex-col"
              style={{
                background: `rgba(28, 25, 23, ${1 - localSettings.transparency / 100})`,
                backdropFilter: `blur(${localSettings.fadeLevel / 3}px)`
              }}
            >
              <div className="flex-1"></div>
              <div className="p-4 border-t border-stone-800" style={{ opacity: 0.9 }}>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 bg-stone-800 rounded-lg"></div>
                  <div className="flex-1 h-12 bg-stone-950 rounded-lg"></div>
                  <div className="w-10 h-10 bg-stone-800 rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Background Selection */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Background Image</h3>

        {/* Current background preview */}
        {localSettings.background && (
          <div className="flex items-center gap-3 p-3 bg-stone-800 rounded-lg">
            <div className="w-20 h-12 bg-stone-700 rounded overflow-hidden flex-shrink-0">
              <img
                src={localSettings.background.url}
                alt={localSettings.background.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate" title={localSettings.background.name}>
                {localSettings.background.name}
              </p>
            </div>
            <button
              onClick={() => updateSettings({ background: null })}
              className="px-3 py-1.5 text-xs bg-stone-700 hover:bg-stone-600 rounded flex-shrink-0"
            >
              Clear
            </button>
          </div>
        )}

        {/* Action button */}
        <button
          onClick={() => setShowGallery(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
        >
          <ImagePlus size={18} />
          {localSettings.background ? 'Change Background' : 'Select Background'}
        </button>
      </div>
      
      {/* Transparency Slider */}
      <div className="space-y-2">
        <label className="flex justify-between">
          <span className="text-sm font-medium">UI Transparency</span>
          <span className="text-sm text-gray-400">{localSettings.transparency}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="95"
          value={localSettings.transparency}
          onChange={(e) => updateSettings({ transparency: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>Solid</span>
          <span>Transparent</span>
        </div>
      </div>
      
      {/* Fade Level Slider */}
      <div className="space-y-2">
        <label className="flex justify-between">
          <span className="text-sm font-medium">Background Blur</span>
          <span className="text-sm text-gray-400">{localSettings.fadeLevel}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={localSettings.fadeLevel}
          onChange={(e) => updateSettings({ fadeLevel: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>None</span>
          <span>Maximum</span>
        </div>
      </div>
      
      {/* Animation Control for GIFs */}
      {isAnimatedGif && (
        <div className="pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!localSettings.disableAnimation}
              onChange={(e) => updateSettings({ disableAnimation: e.target.checked })}
              className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm">Pause GIF animation</span>
          </label>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="flex justify-between pt-2 border-t border-stone-800">
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-3 py-2 bg-stone-800 hover:bg-stone-700 rounded"
        >
          <RefreshCw size={16} />
          <span>Reset</span>
        </button>
        
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 bg-stone-800 hover:bg-stone-700 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveChanges}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            Apply Changes
          </button>
        </div>
      </div>

      {/* Unified Gallery Modal */}
      <UnifiedImageGallery
        isOpen={showGallery}
        onClose={() => setShowGallery(false)}
        onSelect={handleBackgroundSelect}
        mode="background"
        showGallery={true}
        showUserLibrary={true}
      />
    </div>
  );
};

export default ChatBackgroundSettings;