import React from 'react';
import { useWorldState } from '../contexts/WorldStateContext';

const EventDisplay: React.FC = () => {
  const { currentEvent, resolveCurrentEvent } = useWorldState();
  
  if (!currentEvent) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-stone-800 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-2xl mb-4">Event</h2>
        <p className="my-4">{currentEvent.description}</p>
        <div className="flex justify-end">
          <button 
            className="px-4 py-2 bg-blue-600 rounded-lg"
            onClick={() => resolveCurrentEvent()}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default EventDisplay;