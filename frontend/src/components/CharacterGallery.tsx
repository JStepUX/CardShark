import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { Tag, Grid } from 'lucide-react'; // Use Lucide React icons

interface CharacterFile {
  name: string;
  path: string;
  size: number;
  modified: number;
  tags?: string[]; // Add this property
}

interface CharacterGalleryProps {
  settingsChangeCount?: number;
}

// Add this interface for tag counts
interface TagCount {
  tag: string;
  count: number;
}

const CharacterGallery: React.FC<CharacterGalleryProps> = ({ settingsChangeCount = 0 }) => {
  const [characters, setCharacters] = useState<CharacterFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayedCount, setDisplayedCount] = useState(25);
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { setCharacterData, setImageUrl, setIsLoading: setAppLoading } = useCharacter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTagView, setShowTagView] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [] = useState<string[]>([]);
  // Add this state
  const [tagCounts, setTagCounts] = useState<TagCount[]>([]);
  const [otherCount, setOtherCount] = useState(0);
  const [tagsLoading, setTagsLoading] = useState(false);

  // Filter characters based on search term
  const filteredCharacters = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) return characters;
    return characters.filter(char => 
      char.name.toLowerCase().includes(searchLower)
    );
  }, [characters, searchTerm]);
  
  // Load initial settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to load settings');
        
        const data = await response.json();
        if (data.success && data.settings.character_directory) {
          setCurrentDirectory(data.settings.character_directory);
          loadFromDirectory(data.settings.character_directory);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    
    loadSettings();
  }, [settingsChangeCount]);

  const loadMore = useCallback(() => {
    if (displayedCount < filteredCharacters.length) {
      console.log('Loading more items...', { current: displayedCount, total: filteredCharacters.length });
      setDisplayedCount(prev => Math.min(prev + 20, filteredCharacters.length));
    }
  }, [displayedCount, filteredCharacters.length]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollBottom = container.scrollTop + container.clientHeight;
    const threshold = container.scrollHeight - 300;
    
    if (scrollBottom >= threshold && displayedCount < filteredCharacters.length) {
      console.log('Scroll threshold reached', {
        scrollBottom,
        threshold,
        displayedCount,
        total: filteredCharacters.length
      });
      loadMore();
    }
  }, [loadMore, displayedCount, filteredCharacters.length]);

  const loadFromDirectory = async (directory: string) => {
    try {
      setIsLoading(true);
      setTagsLoading(true); // Start tags loading
      setError(null);
      setDisplayedCount(24); // Reset display count for new directory

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
      // Note: We don't set tagsLoading to false here, as we'll do that after tags are processed
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

  // Add this function to extract tags from characters
  
  // Add this after we load characters
  useEffect(() => {
    if (characters.length > 0) {
      setTagsLoading(true);
    
      // Use setTimeout to allow UI update before heavy processing
      setTimeout(() => {
        try {
          // Create case-insensitive mapping
          const tagMapping: Record<string, string> = {};
          const counts: Record<string, number> = {};
          let untaggedCount = 0;
          
          // First pass: establish preferred case for each tag
          characters.forEach(char => {
            if (char.tags && char.tags.length > 0) {
              char.tags.forEach(tag => {
                if (tag) {
                  const tagLower = tag.toLowerCase();
                  // First occurrence defines preferred case
                  if (!tagMapping[tagLower]) {
                    tagMapping[tagLower] = tag;
                  }
                }
              });
            }
          });
          
          // Second pass: count using normalized tags
          characters.forEach(char => {
            if (!char.tags || char.tags.length === 0) {
              untaggedCount++;
            } else {
              char.tags.forEach(tag => {
                if (tag) {
                  const tagLower = tag.toLowerCase();
                  // Use the preferred case from our mapping
                  const normalizedTag = tagMapping[tagLower];
                  counts[normalizedTag] = (counts[normalizedTag] || 0) + 1;
                }
              });
            }
          });
          
          // Convert to array and sort by count (descending)
          const sortedTags = Object.keys(counts).map(tag => ({
            tag,
            count: counts[tag]
          })).sort((a, b) => b.count - a.count);
          
          setTagCounts(sortedTags);
          setOtherCount(untaggedCount);
        } finally {
          setTagsLoading(false); // Ensure this gets called even if there's an error
        }
      }, 10); // Small timeout to ensure UI updates first
    }
  }, [characters]);
  
  // Update the tag filtering logic for case insensitivity
  const tagFilteredCharacters = useMemo(() => {
    if (!selectedTag) return filteredCharacters;
    
    if (selectedTag === "Other") {
      // Show characters with no tags
      return filteredCharacters.filter(char => 
        !char.tags || char.tags.length === 0
      );
    }
    
    // Show characters with the selected tag (case insensitive)
    const selectedTagLower = selectedTag.toLowerCase();
    return filteredCharacters.filter(char => 
      char.tags && char.tags.some(tag => tag.toLowerCase() === selectedTagLower)
    );
  }, [filteredCharacters, selectedTag]);
  
  // Function to reset tag filter
  const clearTagFilter = () => {
    setSelectedTag(null);
    setShowTagView(false);
  };
  
  // Use tagFilteredCharacters instead of filteredCharacters for rendering

  return (
    <div className="h-full flex flex-col">
      {/* Fixed header section */}
      <div className="flex-none bg-stone-900 border-b border-stone-800">
        <div className="p-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            Character Gallery {tagFilteredCharacters.length ? `(${tagFilteredCharacters.length})` : ''}
          </h2>
          
          {/* Add toggle button here */}
          <button 
            onClick={() => setShowTagView(prev => !prev)}
            className={`p-2 rounded-lg transition-colors ${
              showTagView ? 'bg-blue-600 text-white' : 'bg-stone-800 text-gray-300'
            }`}
            title={showTagView ? "Show character grid" : "Show tag folders"}
          >
            {showTagView ? 
              <Grid className="w-5 h-5" /> : 
              <Tag className="w-5 h-5" />
            }
          </button>
        </div>
        
        {selectedTag && (
          <div className="px-4 pb-2 flex items-center">
            <span className="bg-blue-600 text-white px-2 py-1 rounded-md text-sm flex items-center">
              {selectedTag}
              <button 
                onClick={clearTagFilter}
                className="ml-2 text-white hover:text-red-200"
              >
                ×
              </button>
            </span>
          </div>
        )}
        
        {currentDirectory && (
          <div className="px-4 pb-2 text-sm text-slate-500 truncate">
            Directory: {currentDirectory}
          </div>
        )}
        
        {/* Search input in fixed header */}
        <div className="px-4 pb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search characters..."
            className="w-full px-4 py-2 bg-stone-950 border border-slate-700 rounded-lg focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Scrollable content area */}
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
          // Loading skeleton for initial load
          <div className="p-4">
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 24 }).map((_, index) => (
                <div key={`skeleton-${index}`} className="relative">
                  <div className="aspect-[3/5] bg-stone-800 rounded-lg animate-pulse"></div>
                  <div className="absolute inset-x-0 bottom-0 bg-stone-700 h-8 rounded-b-lg animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        ) : characters.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No characters found. Set your character directory in Settings.
          </div>
        ) : showTagView ? (
          // Tag folders view
          <div className="p-4">
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {tagCounts.map(({ tag, count }) => (
                <div 
                  key={tag}
                  className="aspect-square bg-stone-800 rounded-lg cursor-pointer hover:bg-stone-700 transition-colors flex flex-col items-center justify-center shadow-md relative"
                  onClick={() => {
                    setSelectedTag(tag);
                    setShowTagView(false);
                  }}
                >
                  <Tag className="w-10 h-10 text-blue-400 mb-2" />
                  <div className="text-center px-2 truncate w-full">
                    <span className="text-sm font-medium">{tag}</span>
                  </div>
                  {count > 0 && (
                    <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                      {count}
                    </div>
                  )}
                </div>
              ))}
              
              {otherCount > 0 && (
                <div 
                  className="aspect-square bg-stone-800 rounded-lg cursor-pointer hover:bg-stone-700 transition-colors flex flex-col items-center justify-center shadow-md relative"
                  onClick={() => {
                    setSelectedTag("Other");
                    setShowTagView(false);
                  }}
                >
                  <Tag className="w-10 h-10 text-gray-400 mb-2" />
                  <div className="text-center">
                    <span className="text-sm font-medium">Untagged</span>
                  </div>
                  <div className="absolute top-2 right-2 bg-gray-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                    {otherCount}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : tagsLoading ? (
          // Show skeleton loading during tag processing
          <div className="p-4">
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: Math.min(24, characters.length) }).map((_, index) => (
                <div key={`skeleton-${index}`} className="relative">
                  <div className="aspect-[3/5] bg-stone-800 rounded-lg animate-pulse"></div>
                  <div className="absolute inset-x-0 bottom-0 bg-stone-700 h-8 rounded-b-lg animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Normal character grid view
          <div className="p-4">
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {tagFilteredCharacters.slice(0, displayedCount).map((character) => (
                <div 
                  key={character.path}
                  className="relative group cursor-pointer"
                  onClick={() => handleCharacterClick(character)}
                >
                  <div className="aspect-[3/5] bg-stone-950 rounded-lg overflow-hidden">
                    <img
                      src={`/api/character-image/${encodeURIComponent(character.path)}`}
                      alt={character.name}
                      className="w-full h-full object-cover object-center transform group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-black/50 p-2 text-white text-md truncate rounded-b-lg">
                    {character.name}
                  </div>
                </div>
              ))}
            </div>
            
            {displayedCount < tagFilteredCharacters.length && (
              <div className="h-20 flex items-center justify-center text-gray-400">
                Loading more characters... ({displayedCount} / {tagFilteredCharacters.length})
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CharacterGallery;