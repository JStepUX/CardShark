import React from 'react';
import { WorldStateProvider } from '../contexts/WorldStateContext';
import { LocationDetail } from '@components/world/LocationDetail';
import { WorldMap } from '@components/world/WorldMap';
import PlayerStatus from '@components/PlayerStatus';
import UnconnectedLocations from '@components/UnconnectedLocations';
import EventDisplay from '@components/EventDisplay';

// Error boundary fallback component
const ErrorFallback = () => (
  <div className="p-4 bg-red-900 text-white rounded-lg">
    <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
    <p>There was an error loading the world. Please try again or contact support.</p>
  </div>
);

// Custom error boundary component
class WorldErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error in WorldView:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}

interface WorldViewProps {
  worldName: string;
}

export const WorldView: React.FC<WorldViewProps> = ({ worldName }) => {
  return (
    <WorldErrorBoundary>
      <WorldStateProvider worldName={worldName}>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8">
            <LocationDetail />
            <WorldMap />
          </div>
          <div className="col-span-4">
            <PlayerStatus />
            <UnconnectedLocations />
            <EventDisplay />
          </div>
        </div>
      </WorldStateProvider>
    </WorldErrorBoundary>
  );
};

export default WorldView;