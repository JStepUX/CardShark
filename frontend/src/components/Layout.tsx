// frontend/src/components/Layout.tsx (Modified)
import React, { useRef, useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useCharacter } from "../contexts/CharacterContext";
import { useSettings } from "../contexts/SettingsContext";
import { useComparison } from "../contexts/ComparisonContext";
import { useAPIConfig } from "../contexts/APIConfigContext";
import ComparisonPanel from "./ComparisonPanel";
import SideNav from "./SideNav";
import { BottomBanner } from "./BottomBanner";

const Layout: React.FC = () => {

  // State management
  const [settingsChangeCount, setSettingsChangeCount] = useState(0);
  const [infoMessage, _setInfoMessage] = useState<string | null>(null);
  const { settings, updateSettings } = useSettings();

  const {
    isLoading,
    error,
  } = useCharacter();

  const { isCompareMode } = useComparison();
  const { activeApiId, apiConfig } = useAPIConfig();

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
      max_context_length?: number | null;
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
              prevLLM.model !== llmData.model ||
              prevLLM.max_context_length !== llmData.max_context_length;

            // Only update state if something changed
            if (hasChanged) {
              console.debug('[llm-status] Model changed:', llmData.model);
              return {
                ...prev,
                llm: {
                  configured: llmData.configured,
                  provider: llmData.provider,
                  model: llmData.model,
                  max_context_length: llmData.max_context_length ?? null
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

  // Auto-sync KoboldCPP context length: when the live max_context_length from the
  // LLM status poll differs from the stored generation_settings value, update settings
  useEffect(() => {
    const liveCtx = healthStatus.llm?.max_context_length;
    if (!liveCtx || !activeApiId) return;
    // Only applies to KoboldCPP
    if (apiConfig?.provider?.toLowerCase() !== 'koboldcpp') return;

    const storedCtx = apiConfig?.generation_settings?.max_context_length;
    if (storedCtx === liveCtx) return;

    console.log(`[llm-status] Syncing max_context_length: ${storedCtx} → ${liveCtx}`);
    // Backend deep-merges partial updates, so we only send the changed leaf
    updateSettings({
      apis: { [activeApiId]: { generation_settings: { max_context_length: liveCtx } } }
    } as unknown as Partial<typeof settings>);
  }, [healthStatus.llm?.max_context_length, activeApiId, apiConfig?.provider, apiConfig?.generation_settings?.max_context_length]);

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

      {/* Icon Rail */}
      <SideNav />

      {/* Main Content Area - single flex container for side-by-side layout */}
      <div className={`flex flex-1 ${isCompareMode ? 'min-w-0' : 'min-w-[600px]'} pb-8 bg-stone-900 overflow-hidden`}>
        {/* Main content column */}
        <div className={`flex flex-col ${isCompareMode ? 'w-1/2' : 'flex-1'} h-full overflow-hidden`}>
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

        {/* Panel slot - comparison panel */}
        {isCompareMode && (
          <div className="flex flex-col w-1/2 h-full border-l border-stone-800 relative z-20 overflow-hidden">
            <ComparisonPanel settingsChangeCount={settingsChangeCount} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Layout;