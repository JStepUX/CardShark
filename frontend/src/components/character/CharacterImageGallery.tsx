import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Loader2, Star } from 'lucide-react';
import { CharacterImageService, CharacterImage } from '../../services/characterImageService';
import ImageCropperModal from '../ImageCropperModal';
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';
import Button from '../common/Button';

interface CharacterImageGalleryProps {
  characterUuid: string | undefined;
  portraitUrl?: string;
  onImageSelect?: (image: CharacterImage) => void;
  onSetAsPortrait?: (imageUrl: string) => void;
}

const CharacterImageGallery: React.FC<CharacterImageGalleryProps> = ({
  characterUuid,
  portraitUrl,
  onImageSelect,
  onSetAsPortrait
}) => {
  const [images, setImages] = useState<CharacterImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<CharacterImage | null>(null);
  const [starredImageId, setStarredImageId] = useState<number | null>(null);
  const [starringImageId, setStarringImageId] = useState<number | null>(null);

  // Upload state
  const [showCropper, setShowCropper] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<CharacterImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stable portrait URL: captures the original card image per-character.
  // Starring a secondary image changes imageUrl in context (for Save),
  // but the gallery tile must keep showing the original source file.
  const [stablePortraitUrl, setStablePortraitUrl] = useState<string | undefined>(undefined);
  const capturedForUuid = useRef<string | undefined>(undefined);

  useEffect(() => {
    capturedForUuid.current = undefined;
    setStablePortraitUrl(undefined);
  }, [characterUuid]);

  useEffect(() => {
    if (portraitUrl && capturedForUuid.current !== characterUuid) {
      capturedForUuid.current = characterUuid;
      setStablePortraitUrl(portraitUrl);
    }
  }, [portraitUrl, characterUuid]);

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
        // Auto-star if this is the first image in the gallery
        if (images.length === 0 && onSetAsPortrait) {
          onSetAsPortrait(URL.createObjectURL(blob));
          setStarredImageId(uploadedImage.id);
        }
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

  const handleSetAsPortrait = async (image: CharacterImage, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!characterUuid || !onSetAsPortrait) return;

    setStarringImageId(image.id);
    try {
      const url = CharacterImageService.getImageUrl(characterUuid, image.filename);
      const response = await fetch(url);
      const blob = await response.blob();
      onSetAsPortrait(URL.createObjectURL(blob));
      setStarredImageId(image.id);
    } catch (error) {
      console.error('Error setting portrait:', error);
    } finally {
      setStarringImageId(null);
    }
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
        <div className="flex items-start gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-stone-600 scrollbar-track-stone-800">
          {/* Loading state */}
          {isLoading && (
            <div className="flex-shrink-0 w-[120px] aspect-[3/5] rounded-lg overflow-hidden bg-stone-950 flex items-center justify-center shadow-lg">
              <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
            </div>
          )}

          {/* Current portrait */}
          {!isLoading && stablePortraitUrl && (
            <div className="relative flex-shrink-0 group w-[120px] aspect-[3/5] rounded-lg overflow-hidden shadow-lg">
              <div className="w-full h-full bg-stone-950">
                <img
                  src={stablePortraitUrl}
                  alt="Current portrait"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              {starredImageId === null && (
                <div className="absolute bottom-2 right-2 z-10 p-1.5 bg-black/60 rounded-full">
                  <Star size={16} className="text-amber-400" fill="currentColor" />
                </div>
              )}
            </div>
          )}

          {/* Secondary images */}
          {!isLoading && images.map((image) => {
            const isStarred = starredImageId === image.id;
            return (
              <div
                key={image.id}
                className="relative flex-shrink-0 group w-[120px] aspect-[3/5] rounded-lg overflow-hidden shadow-lg cursor-pointer"
                onClick={() => handleImageClick(image)}
              >
                {/* Image with zoom on hover */}
                <div className="w-full h-full bg-stone-950">
                  <img
                    src={CharacterImageService.getImageUrl(characterUuid, image.filename)}
                    alt={image.filename}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                    decoding="async"
                  />
                </div>

                {/* Delete button — fades in on hover (top-right) */}
                <Button
                  variant="ghost"
                  size="sm"
                  pill
                  icon={<X size={16} />}
                  onClick={(e) => handleDeleteClick(image, e)}
                  title="Delete image"
                  className="absolute top-2 right-2 z-10 !bg-black/50 !text-white opacity-0 group-hover:opacity-100 hover:!bg-red-600"
                />

                {/* Star button — fades in on hover (bottom-right), stays visible if starred */}
                {onSetAsPortrait && (
                  <Button
                    variant="ghost"
                    size="sm"
                    pill
                    icon={starringImageId === image.id
                      ? <Loader2 size={16} className="animate-spin" />
                      : <Star size={16} fill={isStarred ? 'currentColor' : 'none'} />
                    }
                    onClick={(e) => { e.stopPropagation(); handleSetAsPortrait(image, e); }}
                    disabled={starringImageId === image.id}
                    title="Set as portrait"
                    className={`absolute bottom-2 right-2 z-10 !text-amber-400 hover:!bg-amber-600 hover:!text-white
                      ${isStarred
                        ? '!bg-black/60 opacity-100'
                        : '!bg-black/50 opacity-0 group-hover:opacity-100'
                      }`}
                  />
                )}
              </div>
            );
          })}

          {/* Upload button */}
          {!isLoading && (
            <button
              onClick={handleAddClick}
              disabled={isUploading}
              className={`
                flex-shrink-0 w-[120px] aspect-[3/5] rounded-lg border-2 border-dashed
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
