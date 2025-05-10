import React from 'react';
import { useWorldState } from '../contexts/WorldStateContext';

const PlayerStatus: React.FC = () => {
  const { worldState } = useWorldState();
  
  if (!worldState?.player) return null;
  
  const { health, stamina, level, experience } = worldState.player;
  const isLowHealth = health < 30;
  
  return (
    <div className="bg-stone-800 rounded-lg p-4">
      <h2 className="text-xl mb-2">Player Status</h2>
      <div className="space-y-2">
        <div>
          <div className="flex justify-between">
            <label id="health-label" className="text-stone-400">Health</label>
            <span>{health}%</span>
          </div>
          <div className="w-full h-2 bg-stone-700 rounded-full">
            <div 
              className="h-full bg-red-600 rounded-full" 
              style={{ width: `${health}%` }}
              aria-labelledby="health-label"
            ></div>
          </div>
          {isLowHealth && (
            <div className="text-red-500 text-sm font-bold mt-1" role="alert">Low Health!</div>
          )}
        </div>
        <div>
          <div className="flex justify-between">
            <label id="stamina-label" className="text-stone-400">Stamina</label>
            <span>{stamina}%</span>
          </div>
          <div className="w-full h-2 bg-stone-700 rounded-full">
            <div 
              className="h-full bg-green-600 rounded-full" 
              style={{ width: `${stamina}%` }}
              aria-labelledby="stamina-label"
            ></div>
          </div>
        </div>
        <div className="flex justify-between">
          <span>Level: {level}</span>
          <span>XP: {experience}</span>
        </div>
      </div>
    </div>
  );
};

export default PlayerStatus;