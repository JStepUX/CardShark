import React, { useState, useRef, useEffect } from 'react';
import { Dialog } from './Dialog';
import { ZoomIn, ZoomOut, RefreshCw, RotateCw, Check } from 'lucide-react';

interface ImageCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onSaveCropped: (croppedImageData: string) => void;
  aspectRatio?: number; // For character images use 2/3, backgrounds can vary
}

const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  onSaveCropped,
  aspectRatio = 2/3 // Default to character image aspect ratio (2:3)
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  // Reset when a new image is loaded
  useEffect(() => {
    if (imageUrl) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      
      // Pre-load the image to get its dimensions
      const img = new Image();
      img.onload = () => {
        setOriginalSize({ width: img.width, height: img.height });
      };
      img.src = imageUrl;
    }
  }, [imageUrl]);
  
  // Handle mouse down event to start dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  
  // Handle mouse move event for dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    setPosition({
      x: position.x + deltaX,
      y: position.y + deltaY
    });
    
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  
  // Handle mouse up event to stop dragging
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // Handle zoom in
  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.1, 3)); // Max zoom: 3x
  };
  
  // Handle zoom out
  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.1, 0.5)); // Min zoom: 0.5x
  };
  
  // Handle rotation
  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };
  
  // Handle reset
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };
  
  // Generate cropped image
  const handleSave = () => {
    if (!containerRef.current || !imageRef.current) return;
    
    try {
      // Create a canvas element to draw the cropped image
      const canvas = document.createElement('canvas');
      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Set canvas size to match container dimensions (respecting aspect ratio)
      canvas.width = containerRect.width;
      canvas.height = containerRect.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Apply transformations
      ctx.save();
      
      // Move to center of canvas
      ctx.translate(canvas.width / 2, canvas.height / 2);
      
      // Apply rotation
      if (rotation !== 0) {
        ctx.rotate((rotation * Math.PI) / 180);
      }
      
      // Apply scale
      ctx.scale(scale, scale);
      
      // Apply position offset
      ctx.translate(position.x / scale, position.y / scale);
      
      // Draw the image centered
      const imgWidth = imageRef.current.naturalWidth;
      const imgHeight = imageRef.current.naturalHeight;
      ctx.drawImage(
        imageRef.current,
        -imgWidth / 2,
        -imgHeight / 2,
        imgWidth,
        imgHeight
      );
      
      // Restore context
      ctx.restore();
      
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL('image/png');
      onSaveCropped(dataUrl);
      onClose();
    } catch (err) {
      console.error('Error generating cropped image:', err);
    }
  };
  
  // Different aspect ratio options for backgrounds
  const aspectRatioOptions = [
    { label: 'Character (2:3)', value: 2/3 },
    { label: 'Landscape (16:9)', value: 16/9 },
    { label: 'Square (1:1)', value: 1 },
    { label: 'Mobile (9:20)', value: 9/20 }
  ];
  
  // Find the current aspect ratio label
  const currentAspectRatioLabel = aspectRatioOptions.find(opt => 
    Math.abs(opt.value - aspectRatio) < 0.01
  )?.label || 'Custom';
  
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Adjust Image (${currentAspectRatioLabel})`}
      className="max-w-3xl w-full"
      buttons={[
        {
          label: 'Cancel',
          onClick: onClose
        },
        {
          label: 'Apply',
          onClick: handleSave,
          variant: 'primary'
        }
      ]}
    >
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={handleZoomOut} 
              className="p-2 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
              title="Zoom Out"
            >
              <ZoomOut size={20} />
            </button>
            <div className="text-sm w-16 text-center">
              {Math.round(scale * 100)}%
            </div>
            <button 
              onClick={handleZoomIn}
              className="p-2 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
              title="Zoom In"
            >
              <ZoomIn size={20} />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleRotate}
              className="p-2 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
              title="Rotate 90°"
            >
              <RotateCw size={20} />
            </button>
            <button 
              onClick={handleReset}
              className="p-2 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
              title="Reset"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </div>
        
        {/* Image Container */}
        <div 
          ref={containerRef}
          className="relative overflow-hidden mx-auto border border-stone-700 bg-stone-900 cursor-move"
          style={{ 
            width: '100%', 
            maxWidth: '500px',
            height: '400px',
            aspectRatio: aspectRatio.toString(),
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {imageUrl && (
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Crop preview"
              className="absolute transform-gpu"
              style={{
                transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                left: '50%',
                top: '50%',
                maxWidth: 'none',
                maxHeight: 'none',
                touchAction: 'none'
              }}
              draggable={false}
            />
          )}
        </div>
        
        {/* Instructions */}
        <div className="text-sm text-gray-400 text-center">
          Drag to reposition • Use zoom controls to resize • Click and drag to adjust
        </div>
      </div>
    </Dialog>
  );
};

export default ImageCropperModal;