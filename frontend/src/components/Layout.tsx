// frontend/src/components/Layout.tsx (Modified)
import React, { useRef, useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom"; // Added useLocation for routing transitions
import { useCharacter } from "../contexts/CharacterContext";
import { useSettings } from "../contexts/SettingsContext";
import { useComparison } from "../contexts/ComparisonContext";
import ComparisonPanel from "./ComparisonPanel";
import WorkshopPanel from "./WorkshopPanel";
import SideNav from "./SideNav";
import { BottomBanner } from "./BottomBanner";
import { ChatProvider } from "../contexts/ChatContext";

const Layout: React.FC = () => {

  // State management
  const [settingsChangeCount, setSettingsChangeCount] = useState(0);
  const [infoMessage, _setInfoMessage] = useState<string | null>(null);
  const location = useLocation(); // Track route changes

  const { settings } = useSettings();

  const {
    characterData,
    setCharacterData: _setCharacterData,
    imageUrl,
    setImageUrl: _setImageUrl,
    isLoading,
    setIsLoading,
    error,
    setError,
    invalidateCharacterCache
  } = useCharacter();

  // Comparison and workshop context
  const { isCompareMode, isWorkshopMode, setWorkshopMode } = useComparison();

  // We no longer need to load settings here as it's handled by the SettingsContext

  // Enhanced health status with more info
  interface HealthStatus {
    status: 'running' | 'disconnected';
    version?: string;
    latency_ms?: number;
    llm?: {
      configured: boolean;
      provider: string | null;
      model: string | null;
    };
  }

  const [healthStatus, setHealthStatus] = useState<HealthStatus>({ status: 'disconnected' });
  const lastHealthCheckRef = useRef<number>(0);
  const previousStatusRef = useRef<'running' | 'disconnected'>('disconnected');

  // Backend status check - frequent checks (45s) with quiet logging (only on state changes)
  useEffect(() => {
    const CHECK_INTERVAL = 45000; // 45 seconds for responsiveness

    const checkBackend = async () => {
      const now = Date.now();

      try {
        const startTime = performance.now();
        const response = await fetch("/api/health");
        const roundTripMs = Math.round(performance.now() - startTime);

        if (response.ok) {
          const data = await response.json();
          // Parse response - handle both new format (top level) and old format (nested in data)
          const responseData = data.data || data;

          // Only log on state transition
          if (previousStatusRef.current !== 'running') {
            console.log(`[health] Backend connected (v${responseData.version || 'unknown'}, ${roundTripMs}ms)`);
            previousStatusRef.current = 'running';
          }

          // Update health status while preserving existing LLM data
          // This prevents the health check from clearing LLM info set by the separate LLM status check
          setHealthStatus(prev => ({
            status: 'running',
            version: responseData.version,
            latency_ms: roundTripMs,
            // Preserve existing LLM data if health endpoint doesn't provide it
            llm: responseData.llm || prev.llm
          }));
        } else {
          if (previousStatusRef.current !== 'disconnected') {
            console.warn(`[health] Backend disconnected - HTTP ${response.status}`);
            previousStatusRef.current = 'disconnected';
          }
          setHealthStatus({ status: 'disconnected' });
        }
      } catch (error) {
        if (previousStatusRef.current !== 'disconnected') {
          console.warn(`[health] Backend disconnected - ${error instanceof Error ? error.message : 'connection refused'}`);
          previousStatusRef.current = 'disconnected';
        }
        setHealthStatus({ status: 'disconnected' });
      }

      lastHealthCheckRef.current = now;
    };

    // Check immediately on first mount
    checkBackend();

    // Set up interval for periodic checks (45 seconds)
    const interval = setInterval(checkBackend, CHECK_INTERVAL);

    // Visibility change handler - uses ref to avoid stale closure
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if it's been more than 30 seconds since last check
        if (Date.now() - lastHealthCheckRef.current > 30000) {
          checkBackend();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Empty deps - uses refs to avoid stale closures

  // Separate LLM status check - fetches live model info every 60 seconds
  // Only updates state if the model actually changes to prevent jitter
  useEffect(() => {
    const LLM_CHECK_INTERVAL = 60000; // 60 seconds (reduced frequency to minimize jitter)

    const checkLLMStatus = async () => {
      try {
        const response = await fetch("/api/llm-status");
        if (response.ok) {
          const llmData = await response.json();

          // Only update if the LLM data has actually changed
          setHealthStatus(prev => {
            const prevLLM = prev.llm;
            const hasChanged = !prevLLM ||
              prevLLM.configured !== llmData.configured ||
              prevLLM.provider !== llmData.provider ||
              prevLLM.model !== llmData.model;

            // Only update state if something changed
            if (hasChanged) {
              console.debug('[llm-status] Model changed:', llmData.model);
              return {
                ...prev,
                llm: {
                  configured: llmData.configured,
                  provider: llmData.provider,
                  model: llmData.model
                }
              };
            }

            // Return previous state unchanged to prevent re-render
            return prev;
          });
        }
      } catch (error) {
        // Silently fail - health check will handle connection issues
        console.debug('[llm-status] Failed to fetch LLM status:', error);
      }
    };

    // Check immediately after a short delay (let health check go first)
    const initialTimeout = setTimeout(checkLLMStatus, 3000);

    // Set up interval for periodic checks
    const interval = setInterval(checkLLMStatus, LLM_CHECK_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);


  // Auto-close workshop mode on route change as it should only be active in Info/Greetings
  useEffect(() => {
    setWorkshopMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);


  // Save handler
  const handleSave = async () => {
    if (!characterData) {
      setError("No character data available to save");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Prepare the file - use imageUrl from context
      let fileToSave: File | null = null;

      if (imageUrl) {
        // Fetch the current image from context
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          fileToSave = new File([blob], "character.png", { type: "image/png" });
        } catch (fetchError) {
          console.error("Error fetching current image:", fetchError);
          throw new Error("Failed to access the current image");
        }
      }

      // Final check - if we still don't have a valid image, throw an error
      if (!fileToSave) {
        throw new Error("No valid image available to save");
      }

      // Create form data
      const formData = new FormData();
      formData.append("file", fileToSave);
      formData.append("metadata_json", JSON.stringify(characterData));

      // Save the file
      const saveResponse = await fetch("/api/characters/save-card", {
        method: "POST",
        body: formData,
      });

      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        throw new Error(`Save failed: ${errorText}`);
      }

      // Handle successful save
      const saveResult = await saveResponse.json();

      if (saveResult.success) {
        console.log("Character saved successfully:", saveResult);

        // IMPORTANT: Invalidate character gallery cache to ensure immediate refresh
        invalidateCharacterCache();
      } else {
        throw new Error(saveResult.message || "Unknown error during save");
      }

    } catch (error) {
      console.error("Save error:", error);
      setError(error instanceof Error ? error.message : "Failed to save character");
    } finally {
      setIsLoading(false);
    }
  };

  // World import handler
  const handleWorldImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setIsLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('conflict_policy', 'skip');

        const response = await fetch('/api/world-cards/import', {
          method: 'POST',
          body: formData,
        });

        if (response.status === 409) {
          // Conflict - ask user
          const shouldOverwrite = window.confirm('World already exists. Overwrite?');
          if (shouldOverwrite) {
            formData.set('conflict_policy', 'overwrite');
            const retryResponse = await fetch('/api/world-cards/import', {
              method: 'POST',
              body: formData,
            });
            const retryResult = await retryResponse.json();
            if (retryResult.success && retryResult.data) {
              alert(`World "${retryResult.data.world_name}" imported successfully!\nNPCs: ${retryResult.data.imported_npcs} imported, ${retryResult.data.skipped_npcs} skipped`);
              invalidateCharacterCache(); // Refresh gallery
            } else {
              throw new Error(retryResult.message || 'Failed to import world');
            }
          }
          return;
        }

        const result = await response.json();
        if (result.success && result.data) {
          alert(`World "${result.data.world_name}" imported successfully!\nNPCs: ${result.data.imported_npcs} imported, ${result.data.skipped_npcs} skipped`);
          invalidateCharacterCache(); // Refresh gallery
        } else {
          throw new Error(result.message || 'Failed to import world');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import world');
      } finally {
        setIsLoading(false);
      }
    };
    input.click();
  };

  // Settings change tracking
  const incrementSettingsChangeCount = () => {
    setSettingsChangeCount((prev) => prev + 1);
  };

  // Track settings changes
  useEffect(() => {
    incrementSettingsChangeCount();
  }, [settings]);

  return (
    <div className="h-screen w-screen flex bg-stone-950 text-gray-100 overflow-hidden">
      {/* Add Bottom Banner at the top level */}
      <BottomBanner healthStatus={healthStatus} />

      {/* Side Navigation */}
      <SideNav
        onWorldImport={handleWorldImport}
        onSave={handleSave}
      />

      {/* Main Content Area - single flex container for side-by-side layout */}
      <div className={`flex flex-1 ${(isCompareMode || isWorkshopMode) ? 'min-w-0' : 'min-w-[600px]'} pb-8 bg-stone-900 overflow-hidden`}>
        {/* Main content column */}
        <div className={`flex flex-col ${(isCompareMode || isWorkshopMode) ? 'w-1/2' : 'flex-1'} h-full overflow-hidden`}>
          {error && (
            <div className="flex-none px-8 py-4 bg-red-900/50 text-red-200">{error}</div>
          )}
          {infoMessage && (
            <div className="flex-none px-8 py-4 bg-blue-900/50 text-blue-200">{infoMessage}</div>
          )}
          {isLoading && (
            <div className="flex-none px-8 py-4 bg-blue-900/50 text-blue-200">
              Loading character data...
            </div>
          )}
          {/* Render the matched nested route component here */}
          <Outlet />
        </div>

        {/* Panel slot - supports both comparison and workshop panels */}
        {(isCompareMode || isWorkshopMode) && (
          <div className="flex flex-col w-1/2 h-full border-l border-stone-800 relative z-20 overflow-hidden">
            {isCompareMode && <ComparisonPanel settingsChangeCount={settingsChangeCount} />}
            {isWorkshopMode && (
              <ChatProvider disableAutoLoad={true}>
                <WorkshopPanel onClose={() => setWorkshopMode(false)} />
              </ChatProvider>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Layout;