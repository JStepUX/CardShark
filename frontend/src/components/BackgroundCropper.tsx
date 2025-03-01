import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { Ratio } from 'lucide-react';
import ImageCropperModal from './ImageCropperModal';

interface BackgroundCropperProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onSaveCropped: (croppedImageData: string, aspectRatio: number) => void;
}

const BackgroundCropper: React.FC<BackgroundCropperProps> = ({
  isOpen,
  onClose,
  imageUrl,
  onSaveCropped
}) => {
  // Define aspect ratio options for backgrounds
  const aspectRatioOptions = [
    { label: 'Landscape (16:9)', value: 16/9, description: 'Best for desktop displays' },
    { label: 'Square (1:1)', value: 1, description: 'Equal height and width' },
    { label: 'Mobile (9:20)', value: 9/20, description: 'Optimized for mobile devices' }
  ];
  
  const [selectedRatio, setSelectedRatio] = useState(aspectRatioOptions[0]);
  const [showCropper, setShowCropper] = useState(false);
  
  const handleRatioSelect = (ratio: typeof selectedRatio) => {
    setSelectedRatio(ratio);
    setShowCropper(true);
  };
  
  const handleCropSave = (croppedImageData: string) => {
    // Pass the cropped image and selected aspect ratio to the parent component
    onSaveCropped(croppedImageData, selectedRatio.value);
    setShowCropper(false);
  };
  
  return (
    <>
      <Dialog
        isOpen={isOpen && !showCropper}
        onClose={onClose}
        title="Select Background Aspect Ratio"
        className="max-w-md"
      >
        <div className="space-y-6">
          <p className="text-sm text-gray-400">
            Choose the aspect ratio that best fits how you plan to use this background image:
          </p>
          
          <div className="space-y-4">
            {aspectRatioOptions.map((ratio) => (
              <button
                key={ratio.label}
                onClick={() => handleRatioSelect(ratio)}
                className="w-full flex items-center gap-4 p-4 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
              >
                <div className="flex-shrink-0 p-2 bg-blue-900/40 rounded-lg">
                  <Ratio size={24} />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium">{ratio.label}</div>
                  <div className="text-sm text-gray-400">{ratio.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Dialog>
      
      {/* Image Cropper Modal */}
      {showCropper && (
        <ImageCropperModal
          isOpen={showCropper}
          onClose={() => setShowCropper(false)}
          imageUrl={imageUrl}
          onSaveCropped={handleCropSave}
          aspectRatio={selectedRatio.value}
        />
      )}
    </>
  );
};

export default BackgroundCropper;