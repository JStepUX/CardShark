import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Loader2, ImageIcon } from 'lucide-react';
import { CharacterImageService, CharacterImage } from '../../services/characterImageService';
import ImageCropperModal from '../ImageCropperModal';
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';
import Button from '../common/Button';

interface CharacterImageGalleryProps {
  characterUuid: string | undefined;
  onImageSelect?: (image: CharacterImage) => void;
}

const CharacterImageGallery: React.FC<CharacterImageGalleryProps> = ({
  characterUuid,
  onImageSelect
}) => {
  const [images, setImages] = useState<CharacterImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<CharacterImage | null>(null);
  const [hoveredImageId, setHoveredImageId] = useState<number | null>(null);

  // Upload state
  const [showCropper, setShowCropper] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<CharacterImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load images when character changes
  useEffect(() => {
    if (characterUuid) {
      loadImages();
    } else {
      setImages([]);
    }
  }, [characterUuid]);

  const loadImages = async () => {
    if (!characterUuid) return;

    setIsLoading(true);
    try {
      const fetchedImages = await CharacterImageService.listImages(characterUuid);
      setImages(fetchedImages);
    } catch (error) {
      console.error('Error loading character images:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value so the same file can be selected again
    event.target.value = '';

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setSelectedFile(file);
    setTempImageUrl(URL.createObjectURL(file));
    setShowCropper(true);
  };

  const handleCropperSave = async (croppedImageData: string) => {
    if (!characterUuid || !selectedFile) return;

    setShowCropper(false);
    setIsUploading(true);

    try {
      // Convert base64 to blob
      const response = await fetch(croppedImageData);
      const blob = await response.blob();
      const croppedFile = new File([blob], selectedFile.name, { type: selectedFile.type });

      // Upload the cropped image
      const uploadedImage = await CharacterImageService.uploadImage(characterUuid, croppedFile);

      if (uploadedImage) {
        // Refresh the image list
        await loadImages();
      } else {
        alert('Failed to upload image');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Error uploading image');
    } finally {
      setIsUploading(false);
      cleanupTempImage();
    }
  };

  const handleCropperClose = () => {
    setShowCropper(false);
    cleanupTempImage();
  };

  const cleanupTempImage = () => {
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl(null);
    }
    setSelectedFile(null);
  };

  const handleImageClick = (image: CharacterImage) => {
    setSelectedImage(image);
    onImageSelect?.(image);
  };

  const handleDeleteClick = (image: CharacterImage, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering image selection
    setDeleteTarget(image);
  };

  const confirmDelete = async () => {
    if (!characterUuid || !deleteTarget) return;

    setIsDeleting(true);
    try {
      const success = await CharacterImageService.deleteImage(characterUuid, deleteTarget.filename);

      if (success) {
        // Remove from local state
        setImages(prev => prev.filter(img => img.id !== deleteTarget.id));

        // Clear selection if deleted image was selected
        if (selectedImage?.id === deleteTarget.id) {
          setSelectedImage(null);
        }
      } else {
        alert('Failed to delete image');
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('Error deleting image');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
  };

  // Don't render if no character is selected
  if (!characterUuid) {
    return null;
  }

  return (
    <>
      <div className="w-full">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Horizontal scrollable gallery */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-stone-600 scrollbar-track-stone-800">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center w-20 h-20 bg-stone-800 rounded-lg border border-stone-700">
              <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
            </div>
          )}

          {/* Image thumbnails */}
          {!isLoading && images.map((image) => (
            <div
              key={image.id}
              className="relative flex-shrink-0 group"
              onMouseEnter={() => setHoveredImageId(image.id)}
              onMouseLeave={() => setHoveredImageId(null)}
            >
              <button
                onClick={() => handleImageClick(image)}
                className={`
                  w-20 h-20 rounded-lg overflow-hidden border-2 transition-all
                  ${selectedImage?.id === image.id
                    ? 'border-blue-500 ring-2 ring-blue-500/50'
                    : 'border-stone-700 hover:border-stone-500'
                  }
                `}
              >
                <img
                  src={CharacterImageService.getImageUrl(characterUuid, image.filename)}
                  alt={image.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>

              {/* Delete button on hover */}
              {hoveredImageId === image.id && (
                <Button
                  variant="destructive"
                  size="sm"
                  pill
                  icon={<X className="w-4 h-4" />}
                  onClick={(e) => handleDeleteClick(image, e)}
                  title="Delete image"
                  className="absolute -top-2 -right-2 w-6 h-6 shadow-lg z-10"
                />
              )}
            </div>
          ))}

          {/* Upload button */}
          {!isLoading && (
            <button
              onClick={handleAddClick}
              disabled={isUploading}
              className={`
                flex-shrink-0 w-20 h-20 rounded-lg border-2 border-dashed
                flex items-center justify-center transition-all
                ${isUploading
                  ? 'border-stone-700 bg-stone-800 cursor-not-allowed'
                  : 'border-stone-600 hover:border-stone-500 hover:bg-stone-800/50'
                }
              `}
              title="Add image"
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
              ) : (
                <Plus className="w-6 h-6 text-stone-400" />
              )}
            </button>
          )}

          {/* Empty state */}
          {!isLoading && images.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-2 text-sm text-stone-500">
              <ImageIcon className="w-4 h-4" />
              <span>No images yet. Click + to add.</span>
            </div>
          )}
        </div>

        {/* Image count */}
        {!isLoading && images.length > 0 && (
          <div className="mt-2 text-xs text-stone-500">
            {images.length} image{images.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Image Cropper Modal */}
      {showCropper && tempImageUrl && (
        <ImageCropperModal
          isOpen={showCropper}
          onClose={handleCropperClose}
          imageUrl={tempImageUrl}
          onSaveCropped={handleCropperSave}
          aspectRatio={3/4} // Portrait aspect ratio matching character images
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={!!deleteTarget}
        title="Delete Image"
        description="Are you sure you want to delete this image? This action cannot be undone."
        itemName={deleteTarget?.filename}
        isDeleting={isDeleting}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
      />
    </>
  );
};

export default CharacterImageGallery;
