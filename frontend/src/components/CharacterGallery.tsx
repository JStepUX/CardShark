import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useCharacter } from '../contexts/CharacterContext';

interface CharacterFile {
  name: string;
  path: string;
  size: number;
  modified: number;
}

const CharacterGallery: React.FC = () => {
  const [characters, setCharacters] = useState<CharacterFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayedCount, setDisplayedCount] = useState(20);
  const { setCharacterData, setImageUrl, setIsLoading: setAppLoading } = useCharacter();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const loadMore = useCallback(() => {
    if (displayedCount < characters.length) {
      setDisplayedCount(prev => Math.min(prev + 20, characters.length));
    }
  }, [displayedCount, characters.length]);

  // Scroll handler for infinite scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollBottom = container.scrollTop + container.clientHeight;
    const threshold = container.scrollHeight - 300; // Load more when within 300px of bottom
    
    if (scrollBottom >= threshold) {
      loadMore();
    }
  }, [loadMore]);

  // Fetch character list
  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/silly-characters');
        if (!response.ok) throw new Error('Failed to fetch characters');
        
        const data = await response.json();
        if (data.exists) {
          setCharacters(data.files);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load characters');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCharacters();
  }, []);

  // Set up scroll listener
  useEffect(() => {
    const currentContainer = containerRef.current;
    if (currentContainer) {
      currentContainer.addEventListener('scroll', handleScroll);
      return () => currentContainer.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Load character when clicked
  const handleCharacterClick = async (character: CharacterFile) => {
    try {
      setAppLoading(true);
      
      // Fetch the image from our new endpoint
      const response = await fetch(`/api/character-image/${character.name}.png`);
      if (!response.ok) throw new Error('Failed to load character image');
      
      const blob = await response.blob();
      const formData = new FormData();
      formData.append('file', blob, character.name + '.png');
      
      // Upload to our backend
      const uploadResponse = await fetch('/api/upload-png', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to load character');
      }

      const data = await uploadResponse.json();
      
      if (data.success && data.metadata) {
        setCharacterData(data.metadata);
        setImageUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load character');
    } finally {
      setAppLoading(false);
    }
  };

  if (error) {
    return (
      <div className="p-8 text-red-500">
        {error}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 text-gray-400">
        Loading characters...
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="h-full overflow-y-auto"
    >
      <div className="p-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {characters.slice(0, displayedCount).map((character) => (
            <div 
              key={character.path}
              className="relative group cursor-pointer"
              onClick={() => handleCharacterClick(character)}
            >
              <div className="aspect-[3/5] bg-stone-950 rounded-lg overflow-hidden">
                <img
                  src={`/api/character-image/${character.name}.png`}
                  alt={character.name}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-black/50 p-2 text-white text-md truncate rounded-b-lg">
                {character.name}
              </div>
            </div>
          ))}
        </div>
        
        {displayedCount < characters.length && (
          <div className="h-20 flex items-center justify-center text-gray-400">
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
};

export default CharacterGallery;