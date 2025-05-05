import React, { useState, useEffect } from 'react';
import { useWorldState } from '../contexts/WorldStateContext';

export const WorldMap: React.FC = () => {
  const { worldState, move } = useWorldState();
  const [zoom, setZoom] = useState(100);
  const [currentZLevel, setCurrentZLevel] = useState(0);
  
  if (!worldState) return <div aria-live="polite" className="p-4 bg-stone-800 rounded-lg"><p>No world state available</p></div>;
  if (!worldState.locations) return <div aria-live="polite" className="p-4 bg-stone-800 rounded-lg"><p>Loading map data...</p></div>;
  
  const cellSize = 40 * (zoom / 100);
  
  // Get the bounds of the map
  const allCoordinates = Object.keys(worldState.locations).map(key => {
    const [x, y, z] = key.split(',').map(Number);
    return { x, y, z };
  });
  
  const minX = Math.min(...allCoordinates.map(c => c.x));
  const maxX = Math.max(...allCoordinates.map(c => c.x));
  const minY = Math.min(...allCoordinates.map(c => c.y));
  const maxY = Math.max(...allCoordinates.map(c => c.y));
  
  // Get current position
  const currentPos = worldState.current_position.split(',').map(Number);
  const [currentX, currentY, currentZ] = currentPos;
  
  // If no Z level is explicitly set, use the current location's Z
  useEffect(() => {
    setCurrentZLevel(currentZ);
  }, [currentZ]);
  
  // Filtered locations for current Z level
  const locationsOnCurrentZ = Object.entries(worldState.locations).filter(([coords]) => {
    const [, , z] = coords.split(',').map(Number);
    return z === currentZLevel;
  });
  
  // Map dimensions
  const mapWidth = (maxX - minX + 1) * cellSize;
  const mapHeight = (maxY - minY + 1) * cellSize;
  
  // Zoom controls
  const zoomIn = () => setZoom(prev => Math.min(prev + 10, 200));
  const zoomOut = () => setZoom(prev => Math.max(prev - 10, 50));
  
  // Find current location name
  const currentLocationName = worldState.locations[worldState.current_position]?.name || "Unknown location";
  
  return (
    <div role="region" aria-label="World Map" className="bg-stone-800 rounded-lg p-4 mt-4">
      <div className="flex justify-between items-center mb-4">
        <h2 id="world-map-heading" className="text-xl">Map View (Z-Level: {currentZLevel})</h2>
        <div role="toolbar" aria-label="Map controls" className="flex gap-2">
          <span>{zoom}%</span>
          <button 
            onClick={zoomOut} 
            className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded-md"
            title="Zoom out"
            aria-label="Zoom out"
          >-</button>
          <button 
            onClick={zoomIn} 
            className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded-md"
            title="Zoom in"
            aria-label="Zoom in"
          >+</button>
        </div>
      </div>
      
      <div 
        className="overflow-auto p-2 bg-stone-900 rounded-lg" 
        style={{ maxHeight: '400px' }}
        aria-labelledby="world-map-heading"
      >
        <div 
          className="relative" 
          style={{ width: mapWidth, height: mapHeight }}
          role="grid"
          aria-label="Map grid showing locations"
        >
          {locationsOnCurrentZ.map(([coords, location]) => {
            const [x, y, z] = coords.split(',').map(Number);
            const isCurrentLocation = coords === worldState.current_position;
            
            // Position based on grid coordinates
            const cellLeft = (x - minX) * cellSize;
            const cellTop = (maxY - y) * cellSize; // Invert Y for proper visualization
            
            return (
              <div
                key={coords}
                style={{
                  left: cellLeft,
                  top: cellTop,
                  width: cellSize,
                  height: cellSize
                }}
                className={`absolute border-2 flex items-center justify-center 
                      ${isCurrentLocation ? 'border-orange-400 bg-stone-700' : 'border-stone-600 bg-stone-800'}
                      cursor-pointer hover:bg-stone-700
                    `}
                onClick={() => {
                  // If adjacent to current location, move there
                  if (Math.abs(x - currentX) + Math.abs(y - currentY) === 1 && z === currentZ) {
                    if (x > currentX) move('east');
                    else if (x < currentX) move('west');
                    else if (y > currentY) move('north');
                    else if (y < currentY) move('south');
                  }
                }}
                role="button"
                tabIndex={0}
                data-testid={`map-cell-${x}-${y}-${currentZLevel}`}
                aria-current={isCurrentLocation}
                aria-label={`${location.name}${isCurrentLocation ? ' (current location)' : ''}`}
              >
                {isCurrentLocation && (
                  <div className="absolute inset-0 bg-orange-400 opacity-25"></div>
                )}
                <span className="text-xs truncate">{location.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="mt-2 text-stone-400 text-xs" aria-live="polite">
        <p>Your current location: {currentLocationName}</p>
      </div>
    </div>
  );
};

export default WorldMap;