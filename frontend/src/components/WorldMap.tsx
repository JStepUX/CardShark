import React, { useState } from 'react';
import { useWorldState } from '../contexts/WorldStateContext';

const WorldMap: React.FC = () => {
  const { worldState, move } = useWorldState();
  const [zoomLevel, setZoomLevel] = useState(1);
  
  if (!worldState) return <div>No world state available</div>;
  
  // Process locations into a 2D grid for simplified visualization
  const processLocations = () => {
    const grid: Record<string, any> = {};
    const currentCoords = worldState.current_position.split(',').map(Number);
    
    // Process all locations
    Object.entries(worldState.locations).forEach(([_, location]) => {
      if (!location.coordinates || location.coordinates.length < 2) return;
      
      const [x, y, z] = location.coordinates;
      // For now, we'll visualize only the current Z level
      if (z !== currentCoords[2]) return;
      
      const key = `${x},${y}`;
      grid[key] = {
        ...location,
        isCurrentLocation: x === currentCoords[0] && y === currentCoords[1] && z === currentCoords[2]
      };
    });
    
    return grid;
  };
  
  const grid = processLocations();
  
  // Find min/max coordinates to determine viewport
  const locations = Object.entries(grid).map(([coordStr, location]) => {
    const [x, y] = coordStr.split(',').map(Number);
    return { x, y, location };
  });
  
  const minX = Math.min(...locations.map(l => l.x), 0) - 1;
  const maxX = Math.max(...locations.map(l => l.x), 0) + 1;
  const minY = Math.min(...locations.map(l => l.y), 0) - 1;
  const maxY = Math.max(...locations.map(l => l.y), 0) + 1;
  
  const renderLocation = (x: number, y: number) => {
    const key = `${x},${y}`;
    const location = grid[key];
    
    if (!location) {
      return (
        <div 
          key={key}
          className="w-12 h-12 bg-stone-900 opacity-25 rounded"
        />
      );
    }
    
    return (
      <div
        key={key}
        className={`w-12 h-12 rounded cursor-pointer flex items-center justify-center
          ${location.isCurrentLocation ? 'bg-blue-800 ring-2 ring-white' : 'bg-stone-700 hover:bg-stone-600'}`}
        onClick={() => {
          if (!location.isCurrentLocation) {
            // Calculate direction to move
            const currentCoords = worldState.current_position.split(',').map(Number);
            const dx = x - currentCoords[0];
            const dy = y - currentCoords[1];
            
            if (dx === 1 && dy === 0) move('east');
            else if (dx === -1 && dy === 0) move('west');
            else if (dx === 0 && dy === 1) move('north');
            else if (dx === 0 && dy === -1) move('south');
          }
        }}
        title={location.name}
      >
        <div className="text-xs overflow-hidden max-w-full truncate px-1">
          {location.name.charAt(0)}
        </div>
      </div>
    );
  };
  
  return (
    <div className="mt-4 bg-stone-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xl">Map View (Z-Level: {worldState.current_position.split(',')[2]})</h3>
        <div className="flex items-center space-x-2">
          <button 
            className="bg-stone-700 w-8 h-8 rounded flex items-center justify-center"
            onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}
          >
            -
          </button>
          <span className="text-sm">{Math.round(zoomLevel * 100)}%</span>
          <button 
            className="bg-stone-700 w-8 h-8 rounded flex items-center justify-center"
            onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))}
          >
            +
          </button>
        </div>
      </div>
      
      <div className="overflow-auto p-2 bg-stone-900 rounded" style={{ maxHeight: '300px' }}>
        <div 
          className="grid gap-1 transition-transform duration-200"
          style={{ 
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top left',
            gridTemplateColumns: `repeat(${maxX - minX + 1}, 1fr)`,
            gridTemplateRows: `repeat(${maxY - minY + 1}, 1fr)`
          }}
        >
          {Array.from({ length: (maxY - minY + 1) * (maxX - minX + 1) }).map((_, index) => {
            const y = maxY - Math.floor(index / (maxX - minX + 1));
            const x = minX + (index % (maxX - minX + 1));
            return renderLocation(x, y);
          })}
        </div>
      </div>
    </div>
  );
};

export default WorldMap;