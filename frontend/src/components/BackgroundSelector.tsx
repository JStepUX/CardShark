import React, { useState, useEffect } from 'react';
import { BackgroundService } from '../services/backgroundService'; // Use the service
import { MediaLibrary, MediaItem } from './media/MediaLibrary';
import { ImageUploader } from './media/ImageUploader';
import { ImageEditor } from './media/ImageEditor';
import { Dialog } from './common/Dialog';
import { Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export interface Background {
  id: string;
  name: string;
  url: string;
  filename: string;
  thumbnail?: string;
  isDefault?: boolean;
  isAnimated?: boolean;
  aspectRatio?: number;
}

export interface BackgroundSelectorProps {
  selected: Background | null;
  onSelect: (background: Background | null) => void;
}

const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  selected,
  onSelect
}) => {
  const [backgrounds, setBackgrounds] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Upload/Edit Flow State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Load backgrounds
  const fetchBackgrounds = async () => {
    setIsLoading(true);
    try {
      const data = await BackgroundService.getBackgrounds();

      const mappedBackgrounds: MediaItem[] = data.map((bg: any) => ({
        id: bg.filename, // Using filename as ID for uniqueness in service operations
        name: bg.name,
        filename: bg.filename,
        url: `/api/backgrounds/${encodeURIComponent(bg.filename)}`,
        isAnimated: bg.isAnimated || bg.filename.toLowerCase().endsWith('.gif'),
        aspectRatio: bg.aspectRatio,
        isDefault: false // Backend doesn't explicitly flag defaults in list, but we can infer or leave flexible
      }));

      setBackgrounds(mappedBackgrounds);
    } catch (error) {
      console.error('Failed to load backgrounds', error);
      toast.error('Failed to load backgrounds');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackgrounds();
  }, []);

  // Handlers
  const handleSelect = (item: MediaItem | null) => {
    if (!item) {
      onSelect(null);
      return;
    }

    // Convert MediaItem back to Background interface expected by parent
    const bg: Background = {
      id: item.id,
      name: item.name,
      url: item.url,
      filename: item.filename, // Stored in item
      isDefault: item.isDefault,
      isAnimated: item.isAnimated,
      aspectRatio: item.aspectRatio
    };
    onSelect(bg);
  };

  const handleDelete = async (item: MediaItem) => {
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
      const success = await BackgroundService.deleteBackground(item.filename); // using filename
      if (success) {
        toast.success('Background deleted');

        // Update local state
        setBackgrounds(prev => prev.filter(bg => bg.id !== item.id));

        // If selected was deleted, deselect
        if (selected?.filename === item.filename) {
          onSelect(null);
        }
      } else {
        toast.error('Failed to delete background');
      }
    }
  };

  const handleFileSelect = (file: File) => {
    // Check if GIF
    if (file.type === 'image/gif') {
      // GIFs skip editor
      performUpload(file);
    } else {
      // Images go to editor
      setSelectedFile(file);
      setTempImageUrl(URL.createObjectURL(file));
      setShowEditor(true);
    }
  };

  // Upload Logic
  const performUpload = async (file: File, aspectRatio?: number) => {
    setIsUploading(true);
    try {
      const result = await BackgroundService.uploadBackground(file, aspectRatio);

      if (result) {
        toast.success('Background uploaded');
        setShowUploadModal(false);
        closeEditor();

        // Refresh list
        await fetchBackgrounds();

        // Auto-select the new background
        // Ideally we find it in the new list, but for now we can infer
        // (fetchBackgrounds updates state async, so complex to selecting immediately without refetch logic tweak)
      } else {
        toast.error('Upload failed');
      }
    } catch (error) {
      toast.error('Upload error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditorSave = async (croppedImageData: string) => {
    if (!selectedFile) return;

    // Convert data URL to Blob
    try {
      const res = await fetch(croppedImageData);
      const blob = await res.blob();
      const file = new File([blob], selectedFile.name, { type: 'image/png' });

      // Calculate aspect ratio from the cropped image?
      // For now, simpler to just upload. The backend might recalculate or we pass it if we locked it.
      // We didn't lock aspect ratio in the editor, so let backend handle it?
      // Or we can get it from helper.

      await performUpload(file);
    } catch (e) {
      console.error(e);
      toast.error('Error processing cropped image');
    }
  };

  const closeEditor = () => {
    setShowEditor(false);
    setSelectedFile(null);
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl(null);
    }
  };

  const currentSelectedId = selected ? selected.filename : null; // Use filename as ID for matching

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium flex items-center gap-2 text-stone-300">
          <ImageIcon size={16} />
          <span>Background Images</span>
        </h3>
      </div>

      <MediaLibrary
        items={backgrounds}
        selectedId={currentSelectedId}
        onSelect={handleSelect}
        onDelete={handleDelete}
        onAdd={() => setShowUploadModal(true)}
        isLoading={isLoading}
        allowNone={true}
        aspectRatio={16 / 9}
        className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar"
      />

      {/* Upload/Edit Dialog */}
      <Dialog
        isOpen={showUploadModal}
        onClose={() => {
          if (!isUploading) {
            setShowUploadModal(false);
            closeEditor();
          }
        }}
        title="Upload Background"
        className="max-w-4xl"
      >
        <div className="p-1">
          {showEditor && tempImageUrl ? (
            <ImageEditor
              imageUrl={tempImageUrl}
              onSave={handleEditorSave}
              onCancel={closeEditor}
              aspectRatio={16 / 9} // Suggest landscape for backgrounds
            />
          ) : (
            <ImageUploader
              onFileSelect={handleFileSelect}
              acceptedTypes={['image/png', 'image/jpeg', 'image/webp', 'image/gif']}
              label="Click or drag to upload background"
              isLoading={isUploading}
            />
          )}
        </div>
      </Dialog>
    </div>
  );
};

export default BackgroundSelector;
