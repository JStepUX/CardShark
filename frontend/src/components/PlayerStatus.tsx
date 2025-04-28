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
            <label htmlFor="health-progress" className="text-stone-400">Health</label>
            <span>{health}%</span>
          </div>
          <progress 
            id="health-progress"
            className="w-full h-2 [&::-webkit-progress-bar]:bg-stone-700 [&::-webkit-progress-value]:bg-red-600 [&::-moz-progress-bar]:bg-red-600 rounded-full"
            value={health}
            max={100}
            aria-label="Health progress"
          ></progress>
          {isLowHealth && (
            <div className="text-red-500 text-sm font-bold mt-1" role="alert">Low Health!</div>
          )}
        </div>
        <div>
          <div className="flex justify-between">
            <label htmlFor="stamina-progress" className="text-stone-400">Stamina</label>
            <span>{stamina}%</span>
          </div>
          <progress 
            id="stamina-progress"
            className="w-full h-2 [&::-webkit-progress-bar]:bg-stone-700 [&::-webkit-progress-value]:bg-green-600 [&::-moz-progress-bar]:bg-green-600 rounded-full"
            value={stamina}
            max={100}
            aria-label="Stamina progress"
          ></progress>
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