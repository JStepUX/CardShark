import React, { useState, useEffect } from 'react';
import { Plus, Trash, Edit, Image } from 'lucide-react';
import LoadingSpinner from './common/LoadingSpinner'; // Changed
import { generateUUID } from '../utils/generateUUID';
import BackgroundCropper from './BackgroundCropper'; // Import the cropper component

// Add aspect ratio to the Background interface
export interface Background {
  id: string;
  name: string;
  url: string;
  filename: string;
  thumbnail?: string;
  isDefault?: boolean;
  isAnimated?: boolean; // New property to identify GIFs
  aspectRatio?: number; // Add this property
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

  // New state variables
  const [showCropper, setShowCropper] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [tempImageFile, setTempImageFile] = useState<File | null>(null);
  const [editingBackground, setEditingBackground] = useState<Background | null>(null);

  // Load backgrounds on component mount
  useEffect(() => {
    fetchBackgrounds();
  }, []);

  const fetchBackgrounds = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/backgrounds/');
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
            url: `/api/backgrounds/${encodeURIComponent(bg.filename)}`,
            isAnimated: bg.filename.toLowerCase().endsWith('.gif') // Check if it's a GIF
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

    // Validate file type - now including GIF
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // For GIFs, skip cropping and upload directly
    if (file.type === 'image/gif') {
      await uploadFile(file);
    } else {
      // For other image types, show the cropper
      setTempImageFile(file);
      setTempImageUrl(URL.createObjectURL(file));
      setEditingBackground(null); // This is a new upload, not an edit
      setShowCropper(true);
    }
    
    // Reset the input
    event.target.value = '';
  };

  // Modified upload function to include aspect ratio
  const uploadFile = async (file: File, croppedImageData?: string, aspectRatio?: number) => {
    try {
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      
      if (croppedImageData) {
        // Convert data URL to Blob
        const response = await fetch(croppedImageData);
        const blob = await response.blob();
        
        // Create a new file with the same name but from the cropped data
        const croppedFile = new File([blob], file.name, { type: 'image/png' });
        formData.append('file', croppedFile);
      } else {
        formData.append('file', file);
      }

      // Add aspect ratio to form data if provided
      if (aspectRatio) {
        formData.append('aspectRatio', aspectRatio.toString());
      }

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
        if (editingBackground) {
          // Editing existing background - update it
          // First delete the old one
          try {
            await fetch(`/api/backgrounds/${encodeURIComponent(editingBackground.filename)}`, {
              method: 'DELETE'
            });
          } catch (err) {
            console.warn('Could not delete old background:', err);
            // Continue anyway as we're replacing it
          }
          
          // Create an updated background object with the same ID
          const updatedBackground: Background = {
            id: editingBackground.id,
            name: data.background.name,
            filename: data.background.filename,
            url: `/api/backgrounds/${encodeURIComponent(data.background.filename)}`,
            isAnimated: data.background.filename.toLowerCase().endsWith('.gif'),
            aspectRatio: aspectRatio || editingBackground.aspectRatio // Preserve or update aspect ratio
          };
          
          // Update the backgrounds list
          setBackgrounds(prev => prev.map(bg => 
            bg.id === editingBackground.id ? updatedBackground : bg
          ));
          
          // Update selection if needed
          if (selected?.id === editingBackground.id) {
            onSelect(updatedBackground);
          }
          
          // Reset editing state
          setEditingBackground(null);
        } else {
          // Creating a new background
          const newBackground: Background = {
            id: generateUUID(),
            name: data.background.name,
            filename: data.background.filename,
            url: `/api/backgrounds/${encodeURIComponent(data.background.filename)}`,
            isAnimated: data.background.filename.toLowerCase().endsWith('.gif'),
            aspectRatio: aspectRatio || (data.background.isAnimated ? 16/9 : undefined) // Default for GIFs
          };

          // Add to backgrounds list
          setBackgrounds(prev => [...prev, newBackground]);
          
          // Automatically select the new background
          onSelect(newBackground);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      
      // Clean up temporary URL
      if (tempImageUrl) {
        URL.revokeObjectURL(tempImageUrl);
        setTempImageUrl(null);
      }
      
      setTempImageFile(null);
    }
  };
  
  // Modified handleCropSave to include aspect ratio
  const handleCropSave = (croppedImageData: string, aspectRatio: number) => {
    if (tempImageFile) {
      uploadFile(tempImageFile, croppedImageData, aspectRatio);
    }
    setShowCropper(false);
  };

  const handleEditBackground = (background: Background) => {
    setEditingBackground(background);
    setTempImageUrl(background.url);
    setShowCropper(true);
  };

  const handleCloseCropper = () => {
    setShowCropper(false);
    setTempImageUrl(null);
    setTempImageFile(null);
    setEditingBackground(null);
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
        <LoadingSpinner size={32} className="text-gray-400" />
      </div>
    );
  }

  // Render grid with aspect ratio-aware background items
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
            accept="image/jpeg,image/png,image/webp,image/gif" // Added image/gif
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
            {isUploading ? (
              <LoadingSpinner size={16} />
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
              // Use the background's aspect ratio if available, otherwise default to 16:9
              aspectRatio: background.aspectRatio 
                ? `${background.aspectRatio}` 
                : '16/9'
            }}
            onClick={() => onSelect(background)}
          >
            {background.url ? (
              <div 
                className="w-full h-full bg-cover bg-center"
                style={{ backgroundImage: `url(${background.url})` }}
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
              <div className="absolute top-2 right-2 flex flex-col items-center">
                <button
                  className="p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteBackground(background);
                  }}
                >
                  <Trash size={14} />
                </button>
                <button
                  className="p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600 mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditBackground(background);
                  }}
                >
                  <Edit size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Image Cropper Modal */}
      {showCropper && tempImageUrl && (
        <BackgroundCropper
          isOpen={showCropper}
          onClose={handleCloseCropper}
          imageUrl={tempImageUrl}
          onSaveCropped={handleCropSave}
        />
      )}
    </div>
  );
};

export default BackgroundSelector;