import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import DirectoryPicker from './DirectoryPicker';

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
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const { setCharacterData, setImageUrl, setIsLoading: setAppLoading } = useCharacter();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Load initial settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to load settings');
        
        const data = await response.json();
        if (data.success && data.settings.character_directory) {
          setCurrentDirectory(data.settings.character_directory);
          handleDirectoryChange(data.settings.character_directory);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    
    loadSettings();
  }, []);

  const loadMore = useCallback(() => {
    if (displayedCount < characters.length) {
      console.log('Loading more items...', { current: displayedCount, total: characters.length });
      setDisplayedCount(prev => Math.min(prev + 20, characters.length));
    }
  }, [displayedCount, characters.length]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollBottom = container.scrollTop + container.clientHeight;
    const threshold = container.scrollHeight - 300;
    
    if (scrollBottom >= threshold && displayedCount < characters.length) {
      console.log('Scroll threshold reached', {
        scrollBottom,
        threshold,
        displayedCount,
        total: characters.length
      });
      loadMore();
    }
  }, [loadMore, displayedCount, characters.length]);

  const handleDirectoryChange = async (directory: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setDisplayedCount(20); // Reset display count for new directory

      const response = await fetch(`/api/characters?directory=${encodeURIComponent(directory)}`);
      if (!response.ok) throw new Error('Failed to load characters');
      
      const data = await response.json();
      console.log('Directory change response:', data);
      
      if (data.exists) {
        setCharacters(data.files);
        setCurrentDirectory(data.directory);
      } else {
        setError(data.message);
        setCharacters([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load characters');
      setCharacters([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCharacterClick = async (character: CharacterFile) => {
    try {
      setAppLoading(true);
      
      const response = await fetch(`/api/character-image/${encodeURIComponent(character.path)}`);
      if (!response.ok) throw new Error('Failed to load character image');
      
      const blob = await response.blob();
      const formData = new FormData();
      formData.append('file', blob, character.name + '.png');
      
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

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 bg-stone-900 border-b border-stone-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Character Gallery {characters.length ? `(${characters.length})` : ''}
          </h2>
          <DirectoryPicker 
            currentDirectory={currentDirectory}
            onDirectoryChange={handleDirectoryChange}
          />
        </div>
        {currentDirectory && (
          <div className="mt-2 text-sm text-gray-400 truncate">
            Directory: {currentDirectory}
          </div>
        )}
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {error ? (
          <div className="p-8 text-center text-red-500">
            {error}
          </div>
        ) : isLoading ? (
          <div className="p-8 text-center text-gray-400">
            Loading characters...
          </div>
        ) : characters.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No characters found. Select a directory containing character cards.
          </div>
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {characters.slice(0, displayedCount).map((character) => (
                <div 
                  key={character.path}
                  className="relative group cursor-pointer"
                  onClick={() => handleCharacterClick(character)}
                >
                  <div className="aspect-[3/5] bg-stone-950 rounded-lg overflow-hidden">
                    <img
                      src={`/api/character-image/${encodeURIComponent(character.path)}`}
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
                Loading more characters... ({displayedCount} / {characters.length})
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CharacterGallery;