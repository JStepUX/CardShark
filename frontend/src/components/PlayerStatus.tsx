import React from 'react';
import { useWorldState } from '../contexts/WorldStateContext';

const PlayerStatus: React.FC = () => {
  const { worldState } = useWorldState();
  
  if (!worldState?.player) return null;
  
  const { health, stamina, level, experience } = worldState.player;
  
  return (
    <div className="bg-stone-800 rounded-lg p-4">
      <h2 className="text-xl mb-2">Player Status</h2>
      <div className="space-y-2">
        <div>
          <label className="text-stone-400">Health</label>
          <div className="h-2 bg-stone-700 rounded-full">
            <div 
              className="h-full bg-red-600 rounded-full" 
              style={{ width: `${health}%` }}
            ></div>
          </div>
        </div>
        <div>
          <label className="text-stone-400">Stamina</label>
          <div className="h-2 bg-stone-700 rounded-full">
            <div 
              className="h-full bg-green-600 rounded-full" 
              style={{ width: `${stamina}%` }}
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