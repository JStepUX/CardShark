import { useEffect, useState } from 'react';

const ImagePreview = ({ 
    imageUrl = '', 
    placeholderUrl = './pngPlaceholder.png'  // Relative to dist folder
}) => {
  const [imageError, setImageError] = useState(false);
  const [currentImage, setCurrentImage] = useState(imageUrl || placeholderUrl);

  useEffect(() => {
    setCurrentImage(imageUrl || placeholderUrl);
    setImageError(false);
  }, [imageUrl, placeholderUrl]);

  const handleImageError = () => {
    setImageError(true);
    setCurrentImage(placeholderUrl);
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-stone-950 rounded-lg overflow-hidden">
      <div className="relative w-full h-full flex items-center justify-center">
        <img
          src={currentImage}
          alt={imageError ? "Placeholder" : "Character"}
          onError={handleImageError}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    </div>
  );
};

export default ImagePreview;