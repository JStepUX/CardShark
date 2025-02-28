import React, { useState, useEffect } from 'react';
import { Image, RefreshCw } from 'lucide-react';
import BackgroundSelector, { Background } from './BackgroundSelector';

export interface BackgroundSettings {
  background: Background | null;
  transparency: number; // 0-100
  fadeLevel: number; // 0-100
  disableAnimation?: boolean; // New option to disable animation for GIFs
}

interface ChatBackgroundSettingsProps {
  settings: BackgroundSettings;
  onSettingsChange: (settings: BackgroundSettings) => void;
  onClose: () => void;
}

// Aspect ratio options for preview
const ASPECT_RATIOS = [
  { name: 'Desktop (16:9)', value: 16/9 },
  { name: 'Square (1:1)', value: 1 },
  { name: 'Mobile (9:20)', value: 9/20 },
];

const ChatBackgroundSettings: React.FC<ChatBackgroundSettingsProps> = ({
  settings,
  onSettingsChange,
  onClose
}) => {
  const [localSettings, setLocalSettings] = useState<BackgroundSettings>({ ...settings });
  const [previewRatio, setPreviewRatio] = useState<number>(16/9);
  
  // Update local settings when props change
  useEffect(() => {
    setLocalSettings({ ...settings });
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
  const handleBackgroundSelect = (background: Background | null) => {
    updateSettings({ background });
  };
  
  // Reset to defaults
  const handleReset = () => {
    updateSettings({
      background: null,
      transparency: 85,
      fadeLevel: 30,
      disableAnimation: false
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
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium">Preview</h3>
          <div className="flex gap-2">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio.name}
                onClick={() => setPreviewRatio(ratio.value)}
                className={`px-2 py-1 text-xs rounded ${
                  previewRatio === ratio.value 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-stone-800 text-gray-300'
                }`}
              >
                {ratio.name}
              </button>
            ))}
          </div>
        </div>
        
        <div className="rounded-lg overflow-hidden border border-stone-700" 
             style={{ aspectRatio: `${previewRatio}` }}>
          <div 
            className="relative w-full h-full"
            style={{
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
      <BackgroundSelector
        selected={localSettings.background}
        onSelect={handleBackgroundSelect}
      />
      
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
    </div>
  );
};

export default ChatBackgroundSettings;