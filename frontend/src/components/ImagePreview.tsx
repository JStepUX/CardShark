import { useEffect, useState, useRef } from 'react';
import { Upload, Crop, ChevronLeft, ChevronRight } from 'lucide-react'; // Added Chevrons
import ImageCropperModal from './ImageCropperModal';
import { AvailablePreviewImage } from '../handlers/loreHandler'; // Import type

interface ImagePreviewProps {
  imageUrl?: string; // Fallback if availableImages is not provided
  placeholderUrl?: string;
  onImageChange?: (newImageData: string | File) => void;
  availableImages?: AvailablePreviewImage[];
  currentIndex?: number;
  onNavigate?: (newIndex: number) => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
    imageUrl, // Keep for fallback
    placeholderUrl = './pngPlaceholder.png',
    onImageChange,
    availableImages,
    currentIndex,
    onNavigate
}) => {
  const [imageError, setImageError] = useState(false);
  
  // Determine the source for the current image
  const currentImageSrc =
    availableImages && typeof currentIndex === 'number' && availableImages[currentIndex]
    ? availableImages[currentIndex].src
    : imageUrl || placeholderUrl;

  const [currentImage, setCurrentImage] = useState(currentImageSrc);
  const [isHovering, setIsHovering] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newSrc =
      availableImages && typeof currentIndex === 'number' && availableImages[currentIndex]
      ? availableImages[currentIndex].src
      : imageUrl || placeholderUrl;
    setCurrentImage(newSrc);
    setImageError(false); // Reset error when image source changes
  }, [imageUrl, placeholderUrl, availableImages, currentIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent navigation if a modal (like cropper) is active
      // or if an input/textarea/contentEditable element has focus, to avoid interfering with typing.
      if (showCropper ||
          (document.activeElement &&
            (document.activeElement.tagName === 'INPUT' ||
             document.activeElement.tagName === 'TEXTAREA' ||
             (document.activeElement as HTMLElement).isContentEditable))) {
        return;
      }

      if (!availableImages || availableImages.length <= 1 || typeof currentIndex !== 'number' || !onNavigate) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault(); // Prevent browser back navigation or other defaults
        onNavigate((currentIndex - 1 + availableImages.length) % availableImages.length);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault(); // Prevent default scroll or other actions
        onNavigate((currentIndex + 1) % availableImages.length);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [availableImages, currentIndex, onNavigate, showCropper]); // Added showCropper to dependencies

  const handleImageError = () => {
    setImageError(true);
    setCurrentImage(placeholderUrl);
  };

const handleMouseEnter = () => {
  if (onImageChange) {            // show overlay whenever image is user-modifiable
    setIsHovering(true);
  }
};

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file is an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Store the selected file
    setSelectedFile(file);

    // Create a URL for the selected file
    // Clean-up any earlier blob URL to prevent leaks
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setTempImageUrl(objectUrl);
    setShowCropper(true);

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropSave = async (croppedImageData: string) => {
    // Update the current image preview
    setCurrentImage(croppedImageData);
    
    // If an original file was selected, we need to convert the cropped image data
    // back to a File object to maintain the original file type
    if (selectedFile) {
      // Convert base64 to blob
      let blob: Blob;
      try {
        blob = await fetch(croppedImageData).then(r => r.blob());
      } catch (error) {
        console.error('Error fetching blob from data URL:', error);
        // Clean up temporary URL and close cropper on error
        if (tempImageUrl) {
          URL.revokeObjectURL(tempImageUrl);
          setTempImageUrl(null);
        }
        setShowCropper(false);
        setSelectedFile(null); // Also reset selected file
        return; // Exit if blob creation failed
      }
      
      // Create a new File object
      const newFile = new File([blob], selectedFile.name, { 
        type: selectedFile.type,
        lastModified: new Date().getTime()
      });
      
      // Pass the new file to the parent component
      if (onImageChange) {
        onImageChange(newFile);
      }
    } else {
      // If no original file (just cropping), pass the image data
      if (onImageChange) {
        onImageChange(croppedImageData);
      }
    }
    
    // Clean up the temporary image URL
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl(null);
    }
    
    // Reset selected file
    setSelectedFile(null);
  };

  return (
    <>
      <div 
        className="w-full h-full flex items-center justify-center bg-stone-950 rounded-lg overflow-hidden relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <img
            id="image-preview-content"
            src={currentImage}
            alt={imageError ? "Placeholder" : "Character"}
            onError={handleImageError}
            className="max-w-full max-h-full object-contain"
          />

          {/* Navigation Controls */}
          {availableImages && availableImages.length > 1 && onNavigate && typeof currentIndex === 'number' && (
            <>
              <button
                onClick={() => onNavigate((currentIndex - 1 + availableImages.length) % availableImages.length)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    onNavigate((currentIndex - 1 + availableImages.length) % availableImages.length);
                  }
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-75 transition-opacity"
                aria-label="Previous Image"
                role="button"
                aria-controls="image-preview-content"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={() => onNavigate((currentIndex + 1) % availableImages.length)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    onNavigate((currentIndex + 1) % availableImages.length);
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-75 transition-opacity"
                aria-label="Next Image"
                role="button"
                aria-controls="image-preview-content"
              >
                <ChevronRight size={24} />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black bg-opacity-60 text-white text-xs rounded">
                {currentIndex + 1} / {availableImages.length}
              </div>
            </>
          )}
          
          {/* Hover overlay with controls - Conditionally show based on image type or if onImageChange is provided */}
          {isHovering
  && onImageChange
  && (
       !availableImages
       || (typeof currentIndex === 'number'
           && availableImages[currentIndex]?.type === 'character')
     ) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 transition-opacity">
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Upload size={16} />
                  <span>Replace Image</span>
                </button>
                
                {currentImageSrc !== placeholderUrl && ( // Only show adjust if not placeholder
                  <button
                    onClick={() => {
                      setTempImageUrl(currentImage); // Use currentImage which reflects the displayed one
                      setShowCropper(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-stone-700 hover:bg-stone-600 text-white rounded-lg transition-colors"
                  >
                    <Crop size={16} />
                    <span>Adjust Image</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      {/* Image Cropper Modal */}
      {showCropper && tempImageUrl && (
        <ImageCropperModal
          isOpen={showCropper}
          onClose={() => {
            setShowCropper(false);
            if (tempImageUrl) {
              URL.revokeObjectURL(tempImageUrl);
              setTempImageUrl(null);
            }
          }}
          imageUrl={tempImageUrl}
          onSaveCropped={handleCropSave}
          aspectRatio={2/3} // Character images have 2:3 aspect ratio
        />
      )}
    </>
  );
};

export default ImagePreview;