import React, { useState, useEffect } from 'react';

interface WorldCardImageProps {
  worldName: string;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
  onError?: () => void; // Added onError callback prop
}

/**
 * A component that displays a world card image with a graceful fallback
 * when the image isn't found or fails to load.
 */
const WorldCardImage: React.FC<WorldCardImageProps> = ({
  worldName,
  className = "w-full h-full object-cover",
  fallbackClassName = "flex items-center justify-center h-full w-full bg-stone-800 text-stone-400",
  alt = "World card",
  onError
}) => {
  const [imageError, setImageError] = useState(false);
  
  // Create the image URL using the world name
  const imageUrl = `/api/worlds/${encodeURIComponent(worldName)}/card`;
  
  // Call the onError callback when an error occurs
  useEffect(() => {
    if (imageError && onError) {
      onError();
    }
  }, [imageError, onError]);

  const handleImageError = () => {
    setImageError(true);
  };
  
  if (imageError) {
    return (
      <div className={fallbackClassName}>
        <div className="flex flex-col items-center">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-10 w-10 mb-2 opacity-50" 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm opacity-75">No Image</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={`${alt} - ${worldName}`}
      className={className}
      onError={handleImageError}
      loading="lazy"
    />
  );
};

export default WorldCardImage;