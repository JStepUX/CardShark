import React from 'react';
import { useWorldState } from '../contexts/WorldStateContext';

const LocationDetail: React.FC = () => {
  const { worldState, move, createAdjacentLocation } = useWorldState();
  
  if (!worldState) return <div className="p-4 bg-stone-800 rounded-lg"><p>No world state available</p></div>;
  
  const currentPosition = worldState.current_position;
  const location = worldState.locations[currentPosition];
  
  if (!location) {
    return <div className="p-4 bg-stone-800 rounded-lg">Location not found</div>;
  }
  
  // Check if adjacent locations exist
  const getAdjacentCoordinate = (direction: string): string => {
    const [x, y, z] = location.coordinates || [0, 0, 0];
    switch (direction) {
      case "north": return `${x},${y+1},${z}`;
      case "south": return `${x},${y-1},${z}`;
      case "east": return `${x+1},${y},${z}`;
      case "west": return `${x-1},${y},${z}`;
      case "up": return `${x},${y},${z+1}`;
      case "down": return `${x},${y},${z-1}`;
      default: return `${x},${y},${z}`;
    }
  };
  
  const renderDirectionButton = (direction: string, label: string) => {
    const targetCoord = getAdjacentCoordinate(direction);
    const exists = worldState.locations[targetCoord] !== undefined;
    
    return exists ? (
      <button 
        onClick={() => move(direction)}
        className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded-md"
      >
        Move {label}
      </button>
    ) : (
      <button 
        onClick={() => createAdjacentLocation(direction)}
        className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded-md"
      >
        Create {label} Room
      </button>
    );
  };

  // Get background image URL
  const backgroundUrl = location.background ? 
    `/static/worldcards/${worldState.name}/images/backgrounds/${location.background}` : null;
  
  return (
    <div className="bg-stone-800 rounded-lg overflow-hidden mb-4">
      {/* Background image if available */}
      <div className="relative">
        {backgroundUrl && (
          <img 
            src={backgroundUrl}
            alt="Location background"
            className="w-full h-48 object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-800 to-transparent"></div>
        <div className="absolute bottom-0 left-0 p-4">
          <h2 className="text-2xl font-bold">{location.name}</h2>
          <p className="text-stone-300 text-sm">Location ID: {location.location_id}</p>
        </div>
      </div>
      
      {/* Location information */}
      <div className="p-4">
        <p className="mb-4">{location.description}</p>
        <p className="text-sm text-stone-400">Coordinates: {location.coordinates?.join(',')}</p>
        
        {/* Direction buttons */}
        <div>
          <h3 className="text-lg mb-2">Exits:</h3>
          <div className="flex flex-wrap gap-2">
            {renderDirectionButton("north", "North")}
            {renderDirectionButton("south", "South")}
            {renderDirectionButton("east", "East")}
            {renderDirectionButton("west", "West")}
            {renderDirectionButton("up", "Up")}
            {renderDirectionButton("down", "Down")}
          </div>
        </div>
        
        {/* NPCs in location */}
        {location.npcs && location.npcs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg mb-2">Characters Present:</h3>
            <ul className="list-disc list-inside">
              {location.npcs.map(npcId => (
                <li key={npcId}>{npcId}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Lore Source */}
        {location.lore_source && (
          <div className="mt-4 p-4 border-t border-stone-700">
            <p className="text-sm text-stone-400 italic">From lore: {location.lore_source}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationDetail;