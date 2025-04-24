import React from 'react';
import { useWorldState } from '../contexts/WorldStateContext';

const LocationDetail: React.FC = () => {
  const { worldState, move, createAdjacentLocation } = useWorldState();
  
  if (!worldState) return <div>No world state available</div>;
  
  const currentPosition = worldState.current_position;
  const location = worldState.locations[currentPosition];
  
  if (!location) {
    return <div className="bg-stone-800 rounded-lg p-4">Location not found</div>;
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
        className="bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded"
      >
        Move {label}
      </button>
    ) : (
      <button 
        onClick={() => createAdjacentLocation(direction)}
        className="bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded"
      >
        Create {label} Room
      </button>
    );
  };
  
  return (
    <div className="relative bg-stone-800 rounded-lg overflow-hidden">
      {/* Background image if available */}
      {location.background && (
        <div className="absolute inset-0 z-0 opacity-30">
          <img 
            src={`/static/worldcards/${worldState.name}/images/backgrounds/${location.background}`} 
            alt="Room background"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      {/* Location information */}
      <div className="relative z-10 p-4">
        <h2 className="text-2xl">{location.name}</h2>
        <p className="text-sm text-stone-400">Coordinates: {location.coordinates?.join(',')}</p>
        
        {location.lore_source && (
          <p className="text-xs text-stone-500 mt-1">From lore: {location.lore_source}</p>
        )}
        
        <p className="my-4">{location.description}</p>
        
        {/* Direction buttons */}
        <div className="grid grid-cols-3 gap-2 my-4">
          <div className="col-start-2">{renderDirectionButton("north", "North")}</div>
          <div>{renderDirectionButton("west", "West")}</div>
          <div>{renderDirectionButton("east", "East")}</div>
          <div className="col-start-2">{renderDirectionButton("south", "South")}</div>
          <div className="col-start-1">{renderDirectionButton("up", "Up")}</div>
          <div className="col-start-3">{renderDirectionButton("down", "Down")}</div>
        </div>
        
        {/* NPCs in location */}
        {location.npcs && location.npcs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xl mb-2">Characters Present:</h3>
            <div className="flex flex-wrap gap-2">
              {location.npcs.map(npcId => (
                <div key={npcId} className="text-sm bg-stone-700 px-2 py-1 rounded">
                  {npcId}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationDetail;