import React, { useState } from 'react';
import { useWorldState } from '../contexts/WorldStateContext';

export const UnconnectedLocations: React.FC = () => {
  const { worldState, connectLocation } = useWorldState();
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [targetCoordinates, setTargetCoordinates] = useState<number[]>([0, 0, 0]);
  
  if (!worldState || !worldState.unconnected_locations || Object.keys(worldState.unconnected_locations).length === 0) {
    return null;
  }
  
  const handleConnect = async () => {
    if (!selectedLocation) return;
    await connectLocation(selectedLocation, targetCoordinates);
    setSelectedLocation(null);
  };
  
  return (
    <div className="bg-stone-800 rounded-lg p-4 mt-4">
      <h2 className="text-xl mb-2">Unconnected Locations</h2>
      <p className="text-sm text-stone-400 mb-2">
        These locations were found in the character lore but need to be placed on the map.
      </p>
      
      <div className="max-h-40 overflow-y-auto mb-4">
        {Object.entries(worldState.unconnected_locations).map(([id, location]) => (
          <div 
            key={id}
            className={`p-2 mb-2 rounded cursor-pointer ${selectedLocation === id ? 'bg-blue-900' : 'bg-stone-700 hover:bg-stone-600'}`}
            onClick={() => setSelectedLocation(id)}
          >
            <div className="font-medium">{location.name}</div>
            <div className="text-sm text-stone-300">{location.description.substring(0, 60)}...</div>
            <div className="text-xs text-stone-400">From lore: {location.lore_source}</div>
          </div>
        ))}
      </div>
      
      {selectedLocation && (
        <div className="border border-stone-600 rounded p-2 mb-2">
          <h3 className="text-md font-medium mb-1">Connect to Map</h3>
          <div className="flex items-center space-x-2 mb-2">
            <span>Coordinates:</span>
            <input 
              type="number" 
              className="w-16 bg-stone-700 px-2 py-1 rounded"
              value={targetCoordinates[0]}
              onChange={e => setTargetCoordinates([parseInt(e.target.value), targetCoordinates[1], targetCoordinates[2]])}
            />
            <input 
              type="number" 
              className="w-16 bg-stone-700 px-2 py-1 rounded"
              value={targetCoordinates[1]}
              onChange={e => setTargetCoordinates([targetCoordinates[0], parseInt(e.target.value), targetCoordinates[2]])}
            />
            <input 
              type="number" 
              className="w-16 bg-stone-700 px-2 py-1 rounded"
              value={targetCoordinates[2]}
              onChange={e => setTargetCoordinates([targetCoordinates[0], targetCoordinates[1], parseInt(e.target.value)])}
            />
          </div>
          <button 
            className="w-full bg-blue-600 rounded py-1"
            onClick={handleConnect}
          >
            Connect Location
          </button>
        </div>
      )}
    </div>
  );
};

export default UnconnectedLocations;