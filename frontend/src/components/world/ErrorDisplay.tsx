import React from 'react';
import { useWorldState } from '../../contexts/WorldStateContext';

const ErrorDisplay: React.FC = () => {
  const { error } = useWorldState();
  
  if (!error) return null;
  
  return (
    <div className="p-4 bg-red-900 text-white rounded-lg mb-4">
      <h2 className="text-xl font-bold mb-2">Error</h2>
      <p>{error}</p>
    </div>
  );
};

export default ErrorDisplay;
