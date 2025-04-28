import React, { useState, useEffect } from 'react';
import { useWorldState } from '../../contexts/WorldStateContext';

export const WorldMap: React.FC = () => {
  const { worldState, move } = useWorldState();
  const [zoom, setZoom] = useState<number>(100);
  const [currentZLevel, setCurrentZLevel] = useState<number>(0);
  
  // Handle null worldState
  if (!worldState) {
    return <div className="p-4 bg-stone-800 rounded-lg"><p>No world state available</p></div>;
  }
  
  // Get current position coordinates
  const currentPos = worldState.current_position.split(',').map(Number);
  const [currentX, currentY, currentZ] = currentPos;
  
  // Set the current Z level to match the player's Z position on initial render
  useEffect(() => {
    setCurrentZLevel(currentZ);
  }, [currentZ]);
  
  // Get all locations for the current Z level
  const locationsAtCurrentZ = Object.entries(worldState.locations).filter(([coords]) => {
    const [, , z] = coords.split(',').map(Number);
    return z === currentZLevel;
  });
  
  // Find the bounds of the map
  const xValues = locationsAtCurrentZ.map(([coords]) => Number(coords.split(',')[0]));
  const yValues = locationsAtCurrentZ.map(([coords]) => Number(coords.split(',')[1]));
  
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  
  // Calculate grid size
  const cellSize = 40 * (zoom / 100);
  const gridWidth = (maxX - minX + 3) * cellSize; // Add padding
  const gridHeight = (maxY - minY + 3) * cellSize; // Add padding
  
  // Zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 10, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 10, 50));
  
  // Create grid cells
  const renderMapGrid = () => {
    const cells = [];
    
    // Add extra cells for empty spaces and to ensure the grid extends beyond the locations
    for (let y = maxY + 1; y >= minY - 1; y--) {
      for (let x = minX - 1; x <= maxX + 1; x++) {
        const coordKey = `${x},${y},${currentZLevel}`;
        const isCurrentLocation = x === currentX && y === currentY && currentZLevel === currentZ;
        const location = worldState.locations[coordKey];
        
        // Calculate position
        const left = (x - minX + 1) * cellSize;
        const top = (maxY - y + 1) * cellSize;
        
        cells.push(
          <div
            key={coordKey}
            role="button"
            tabIndex={0}
            className={`absolute border ${
              isCurrentLocation 
                ? 'bg-stone-700 border-yellow-400 ring-2 ring-yellow-400' 
                : location 
                  ? 'bg-stone-800 border-stone-600 hover:bg-stone-700'
                  : 'border-stone-900 bg-stone-900 hover:bg-stone-800'
            }`}
            style={{
              left,
              top,
              width: cellSize,
              height: cellSize,
              fontSize: `${zoom / 100}rem`
            }}
            aria-label={location ? location.name : `Empty space at ${x},${y},${currentZLevel}`}
            aria-current={isCurrentLocation ? 'true' : undefined}
            onClick={() => {
              // Only allow movement to adjacent cells that have locations
              if (location && 
                  ((Math.abs(x - currentX) === 1 && y === currentY) || 
                   (Math.abs(y - currentY) === 1 && x === currentX))) {
                  
                // Determine direction
                if (x > currentX) move('east');
                else if (x < currentX) move('west');
                else if (y > currentY) move('north');
                else if (y < currentY) move('south');
              }
            }}
          >
            {location && (
              <div className="flex items-center justify-center h-full w-full overflow-hidden p-1">
                <span className="text-xs truncate">{location.name.charAt(0)}</span>
              </div>
            )}
          </div>
        );
      }
    }
    
    return cells;
  };
  
  return (
    <div className="bg-stone-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Map View (Z-Level: {currentZLevel})</h2>
        <div className="flex items-center space-x-2">
          <span>{zoom}%</span>
          <button 
            onClick={handleZoomOut}
            className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded"
            title="Zoom out"
          >
            -
          </button>
          <button 
            onClick={handleZoomIn}
            className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>
      
      <div 
        className="relative border border-stone-600 bg-stone-900 overflow-auto"
        style={{ 
          width: '100%',
          height: '300px'
        }}
      >
        <div
          className="relative"
          style={{
            width: gridWidth,
            height: gridHeight
          }}
        >
          {renderMapGrid()}
        </div>
      </div>
      
      <div className="mt-2 text-xs text-stone-400">
        <p>Current position: {worldState.current_position}</p>
      </div>
    </div>
  );
};

export default WorldMap;