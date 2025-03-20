import React, { useState, useRef, useEffect } from 'react';
import { Dialog } from './Dialog';
import { Save, X } from 'lucide-react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';

interface ImageCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onSaveCropped: (croppedImageData: string) => void;
  aspectRatio: number;
}

const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  onSaveCropped,
  aspectRatio
}) => {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(500);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Handle image load error
  const handleImageError = () => {
    console.error('Failed to load image for cropping');
    setLoading(false);
    // Show a user-friendly error message
  };

  // Adjust container height based on viewport and aspect ratio
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        // Get the width of the container
        const containerWidth = containerRef.current.clientWidth;
        
        // Calculate max height based on viewport
        const viewportHeight = window.innerHeight;
        const maxHeight = Math.min(viewportHeight * 0.7, 600); // 70% of viewport height, but max 600px
        
        let calculatedHeight: number;
        
        // For landscape orientation (aspectRatio > 1)
        if (aspectRatio > 1) {
          calculatedHeight = containerWidth / aspectRatio;
        } 
        // For portrait orientation (aspectRatio < 1)
        else if (aspectRatio < 1) {
          // For portrait, don't let it get too tall
          calculatedHeight = Math.min(containerWidth / aspectRatio, maxHeight);
        }
        // For square (aspectRatio = 1)
        else {
          calculatedHeight = Math.min(containerWidth, maxHeight);
        }
        
        setContainerHeight(calculatedHeight);
      }
    };

    if (isOpen) {
      updateDimensions();
      window.addEventListener('resize', updateDimensions);
    }
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, [aspectRatio, isOpen]);
  
  const handleSave = () => {
    if (cropperRef.current?.cropper) {
      const croppedCanvas = cropperRef.current.cropper.getCroppedCanvas({
        maxWidth: 2048, // Limit the output size for performance
        maxHeight: 2048,
        fillColor: '#000', // Fill areas outside the cropped area with black
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      });
      
      if (!croppedCanvas) {
        console.error('Failed to create cropped canvas');
        return;
      }
      
      try {
        const croppedImageData = croppedCanvas.toDataURL('image/png');
        onSaveCropped(croppedImageData);
      } catch (err) {
        console.error('Error creating cropped image data:', err);
      }
    }
  };

  // Calculate aspect ratio label for display
  const getAspectRatioLabel = () => {
    if (aspectRatio === 16/9) return 'Landscape (16:9)';
    if (aspectRatio === 1) return 'Square (1:1)';
    if (aspectRatio === 9/20) return 'Mobile (9:20)';
    return `Custom (${aspectRatio.toFixed(2)})`;
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Crop Background Image"
      className="max-w-4xl"
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}
        
        <div 
          ref={containerRef} 
          className="crop-container mx-auto bg-stone-900 rounded-lg overflow-hidden"
          style={{ 
            height: containerHeight,
            maxHeight: '70vh', // Additional safeguard
            visibility: loading ? 'hidden' : 'visible'
          }}
        >
          <Cropper
            ref={cropperRef}
            src={imageUrl}
            style={{ height: '100%', width: '100%' }}
            aspectRatio={aspectRatio}
            guides={true}
            background={false}
            responsive={true}
            checkOrientation={false}
            viewMode={1}
            ready={() => setLoading(false)}
            cropBoxMovable={true}
            cropBoxResizable={true}
            toggleDragModeOnDblclick={true}
            onError={handleImageError}
          />
        </div>

        <div className="flex justify-between items-center pt-4">
          <div className="text-sm text-gray-400">
            {getAspectRatioLabel()}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-lg"
            >
              <X size={16} />
              <span>Cancel</span>
            </button>
            
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              disabled={loading}
            >
              <Save size={16} />
              <span>Save Crop</span>
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

export default ImageCropperModal;