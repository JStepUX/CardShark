import { useState, useEffect } from 'react';
import { WorldState } from '../types/world';

interface UseLocationBackgroundProps {
  worldState: WorldState;
  background?: string;
  fallbackImage?: string;
}

interface UseLocationBackgroundResult {
  backgroundUrl: string;
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
}

/**
 * Hook to manage location background images with proper loading, error handling, and fallbacks
 */
export function useLocationBackground({
  worldState,
  background,
  fallbackImage = '/assets/default_room.png',
}: UseLocationBackgroundProps): UseLocationBackgroundResult {
  const [backgroundUrl, setBackgroundUrl] = useState<string>(fallbackImage);
  const [isLoading, setIsLoading] = useState<boolean>(!!background);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    // Reset states when background changes
    setIsLoading(!!background);
    setHasError(false);
    setErrorMessage(undefined);

    if (!background) {
      setBackgroundUrl(fallbackImage);
      setIsLoading(false);
      return;
    }

    // Generate the image URL
    const imageUrl = `/static/worldcards/${worldState.name}/images/backgrounds/${background}`;

    // Check if the image exists and can be loaded
    const img = new Image();
    
    img.onload = () => {
      setBackgroundUrl(imageUrl);
      setIsLoading(false);
    };
    
    img.onerror = (e) => {
      console.error('Failed to load location background:', imageUrl, e);
      setHasError(true);
      setErrorMessage(`Unable to load background image: ${background}`);
      setBackgroundUrl(fallbackImage);
      setIsLoading(false);
    };
    
    img.src = imageUrl;
    
    // Cleanup
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [worldState.name, background, fallbackImage]);

  return {
    backgroundUrl,
    isLoading,
    hasError,
    errorMessage
  };
}