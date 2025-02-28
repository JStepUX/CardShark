import React, { useState, useEffect } from 'react';
import { Plus, Trash, Image, Loader2 } from 'lucide-react';
import { generateUUID } from '../utils/generateUUID';

export interface Background {
    id: string;
    name: string;
    url: string;
    filename: string;
    thumbnail?: string;
    isDefault?: boolean;
  }
  
  export interface BackgroundSelectorProps {
    selected: Background | null;
    onSelect: (background: Background | null) => void;
  }

const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  selected,
  onSelect
}) => {
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load backgrounds on component mount
  useEffect(() => {
    fetchBackgrounds();
  }, []);

  // Add debugging useEffect
  useEffect(() => {
    if (backgrounds.length > 0) {
      console.log('Background URLs:', backgrounds.map(bg => ({
        id: bg.id,
        name: bg.name,
        url: bg.url
      })));
    }
  }, [backgrounds]);

  const fetchBackgrounds = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/backgrounds');
      if (!response.ok) {
        throw new Error('Failed to load backgrounds');
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.backgrounds)) {
        // Add a "None" option and map server data to our Background interface
        const mappedBackgrounds: Background[] = [
          {
            id: 'none',
            name: 'None',
            filename: '',
            url: '',
            isDefault: true
          },
          ...data.backgrounds.map((bg: any) => ({
            id: generateUUID(),
            name: bg.name,
            filename: bg.filename,
            url: `/api/backgrounds/${encodeURIComponent(bg.filename)}`
          }))
        ];
        
        setBackgrounds(mappedBackgrounds);
      } else {
        throw new Error(data.message || 'Failed to load backgrounds');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backgrounds');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }

      const data = await response.json();
      if (data.success && data.background) {
        // Create a new background object
        const newBackground: Background = {
          id: generateUUID(),
          name: data.background.name,
          filename: data.background.filename,
          url: `/api/backgrounds/${encodeURIComponent(data.background.filename)}`
        };

        // Add to backgrounds list
        setBackgrounds(prev => [...prev, newBackground]);
        
        // Automatically select the new background
        onSelect(newBackground);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      // Reset the input
      event.target.value = '';
    }
  };

  const handleDeleteBackground = async (background: Background) => {
    // Cannot delete the "None" option
    if (background.isDefault) return;
    
    try {
      setError(null);
      
      const response = await fetch(`/api/backgrounds/${encodeURIComponent(background.filename)}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Delete failed');
      }
      
      // Remove from backgrounds list
      setBackgrounds(prev => prev.filter(bg => bg.id !== background.id));
      
      // If the deleted background was selected, select "None"
      if (selected?.id === background.id) {
        onSelect(backgrounds.find(bg => bg.id === 'none') || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Image size={16} />
          <span>Background Images</span>
        </h3>
        
        {/* Upload button */}
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            <span>Add Background</span>
          </div>
        </label>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-900/30 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-2">
        {backgrounds.map(background => (
          <div
            key={background.id}
            className={`relative group cursor-pointer rounded-lg overflow-hidden ${
              background.id === selected?.id
                ? 'ring-2 ring-blue-500'
                : 'hover:ring-1 hover:ring-gray-400'
            }`}
            style={{
              aspectRatio: '16/9'
            }}
            onClick={() => onSelect(background)}
          >
            {background.url ? (
              <div 
                className="w-full h-full bg-cover bg-center"
                style={{ 
                  backgroundImage: `url(${background.url})`,
                  // Add debug border
                  border: '1px solid red' 
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-stone-800">
                <span className="text-gray-400">None</span>
              </div>
            )}
            
            <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2">
              <div className="text-white text-sm truncate">{background.name}</div>
            </div>
            
            {/* Delete button - not for default/None */}
            {!background.isDefault && (
              <button
                className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteBackground(background);
                }}
              >
                <Trash size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BackgroundSelector;