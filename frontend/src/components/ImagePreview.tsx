import { useEffect, useState, useRef } from 'react';
import { Upload, Crop } from 'lucide-react';
import ImageCropperModal from './ImageCropperModal';

interface ImagePreviewProps {
  imageUrl?: string;
  placeholderUrl?: string;
  onImageChange?: (newImageData: string | File) => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ 
    imageUrl = '', 
    placeholderUrl = './pngPlaceholder.png',  // Relative to dist folder
    onImageChange
}) => {
  const [imageError, setImageError] = useState(false);
  const [currentImage, setCurrentImage] = useState(imageUrl || placeholderUrl);
  const [isHovering, setIsHovering] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentImage(imageUrl || placeholderUrl);
    setImageError(false);
  }, [imageUrl, placeholderUrl]);

  const handleImageError = () => {
    setImageError(true);
    setCurrentImage(placeholderUrl);
  };

  const handleMouseEnter = () => {
    if (imageUrl) {
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
    const objectUrl = URL.createObjectURL(file);
    setTempImageUrl(objectUrl);
    setShowCropper(true);

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropSave = (croppedImageData: string) => {
    // Update the current image preview
    setCurrentImage(croppedImageData);
    
    // If an original file was selected, we need to convert the cropped image data
    // back to a File object to maintain the original file type
    if (selectedFile) {
      // Convert base64 to blob
      const base64Data = croppedImageData.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteArrays = [];
      
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArrays.push(byteCharacters.charCodeAt(i));
      }
      
      const byteArray = new Uint8Array(byteArrays);
      const blob = new Blob([byteArray], { type: selectedFile.type });
      
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
            src={currentImage}
            alt={imageError ? "Placeholder" : "Character"}
            onError={handleImageError}
            className="max-w-full max-h-full object-contain"
          />
          
          {/* Hover overlay with controls */}
          {isHovering && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 transition-opacity">
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Upload size={16} />
                  <span>Replace Image</span>
                </button>
                
                {imageUrl && (
                  <button
                    onClick={() => {
                      setTempImageUrl(currentImage);
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