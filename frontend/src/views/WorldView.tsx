import React, { useEffect } from 'react';
import { WorldStateProvider, useWorldState } from '../contexts/WorldStateContext'; // Import useWorldState
import { LocationDetail } from '../components/world/LocationDetail';
import { WorldMap } from '../components/world/WorldMap';
import PlayerStatus from '../components/PlayerStatus';
import UnconnectedLocations from '../components/UnconnectedLocations';
import EventDisplay from '../components/EventDisplay';
import ErrorDisplay from '../components/world/ErrorDisplay';
import { useCharacter } from '../contexts/CharacterContext';

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
    console.error("Error in WorldView (Boundary):", error, errorInfo); // Clarify boundary log
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

// Define WorldViewContent that uses the context
const WorldViewContent: React.FC = () => {
  const { worldState, loading, error } = useWorldState();

  if (error) {
    // If there's an error from WorldStateProvider, ErrorDisplay will render it.
    // No other components should render to avoid further errors.
    return <ErrorDisplay />;
  }

  if (loading && !worldState) {
    // Show a loading indicator while data is being fetched and worldState is not yet available
    return (
      <div className="p-4 text-center text-white">
        <p>Loading world data...</p>
      </div>
    );
  }
  
  // If worldState is null but no error and not loading, it's an edge case.
  // Components below are expected to handle null worldState if it can still occur.
  // However, the primary goal here is to ensure ErrorDisplay shows for API errors.
   if (!worldState && !loading && !error) {
      // This case implies loading finished, no error was set, but worldState is still null.
      // This could be an unhandled case in WorldStateProvider or an API returning null successfully.
      // For the test, if an error was expected, it should have been caught by the 'if (error)' block.
      // If no error was expected, but data is null, it's a different kind of problem.
      // For now, to ensure test passes if it expects an error message, ErrorDisplay is fine.
      // Or, if this state means "no data found" rather than "API error", a different message might be better.
      // Given the test is for "Failed to load world", the `if (error)` block is the target.
      // This block might not be strictly necessary if all components handle null worldState gracefully
      // and the `if (error)` block correctly shows the API error.
      // Let's assume for now that if there's no error and not loading, but no worldState,
      // it's a valid "empty" or "not found" state that components should handle or ErrorDisplay can show a generic message.
      // For the specific test, the `if (error)` path is critical.
      // We can return a generic "No data" or rely on child components' null handling.
      // To be safe and ensure the main content doesn't render on unexpected null worldState:
      return (
        <div className="p-4 text-center text-white">
          <p>World data is not available.</p>
        </div>
      );
  }


  // Render the main layout if no error and not initial loading without data
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-8">
        {/* ErrorDisplay is handled by the conditions above */}
        <LocationDetail />
        <WorldMap />
      </div>
      <div className="col-span-4">
        <PlayerStatus />
        <UnconnectedLocations />
        <EventDisplay />
      </div>
    </div>
  );
};

export const WorldView: React.FC<WorldViewProps> = ({ worldName }) => {
  const { setImageUrl } = useCharacter();
  
  useEffect(() => {
    const worldCardImageUrl = `/api/worlds/${encodeURIComponent(worldName)}/card`;
    setImageUrl(worldCardImageUrl);
    return () => {
      setImageUrl(undefined);
    };
  }, [worldName, setImageUrl]);

  return (
    <WorldErrorBoundary>
      <WorldStateProvider worldName={worldName}>
        <WorldViewContent /> {/* This component now handles conditional rendering based on context state */}
      </WorldStateProvider>
    </WorldErrorBoundary>
  );
};

export default WorldView;