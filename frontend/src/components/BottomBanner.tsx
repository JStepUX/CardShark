import React, { useState, useEffect, useRef } from 'react';
import LoadingSpinner from './common/LoadingSpinner'; // Added
import { useAPIConfig } from '../contexts/APIConfigContext';
import { useSettings } from '../contexts/SettingsContext';
import { APIConfig } from '../types/api';

// Health status from Layout's health check
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

interface BottomBannerProps {
  className?: string;
  healthStatus?: HealthStatus;
}

export const BottomBanner: React.FC<BottomBannerProps> = ({ className = '', healthStatus }) => {
  const {
    activeApiId,
    allAPIConfigs,
    setActiveApiId,
    setAPIConfig
  } = useAPIConfig();
  const { updateSettings } = useSettings();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get current API configuration
  const currentApiConfig = activeApiId ? allAPIConfigs[activeApiId] : null;

  // Determine API status display
  const getStatusColor = (config: APIConfig | null) => {
    if (!config) return 'bg-stone-400';

    if (!config.enabled) return 'bg-red-500'; // API disabled/offline

    if (config.lastConnectionStatus?.connected) {
      return 'bg-green-500'; // API connected and working
    } else if (config.lastConnectionStatus?.error) {
      return 'bg-red-500'; // API has connection error
    }

    return 'bg-yellow-500'; // Status unknown or pending
  };

  // Handle API selection - Enhanced version to work properly with all API types
  const handleApiSelect = async (apiId: string) => {
    if (apiId !== activeApiId) {
      setIsSwitching(true);
      try {
        // Update settings in backend
        await updateSettings({ activeApiId: apiId });

        // Get the full config for the new API and update the context
        const newApiConfig = allAPIConfigs[apiId];
        if (newApiConfig) {
          // Update both the active ID and the full config in the context
          setActiveApiId(apiId);
          setAPIConfig(newApiConfig);
        }

        setIsDropdownOpen(false);
      } catch (error) {
        console.error("Failed to change active API:", error);
      } finally {
        setIsSwitching(false);
      }
    } else {
      setIsDropdownOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get available APIs that are enabled
  const availableApis = Object.entries(allAPIConfigs)
    .filter(([, config]) => config.enabled)
    .map(([id, config]) => ({ id, ...config }));

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-stone-950 border-t border-stone-800 h-8 flex items-center px-4 z-50 text-sm ${className}`}>
      {/* API Status indicator and selector */}
      <div className="flex items-center" ref={dropdownRef}>
        <div className={`w-2 h-2 rounded-full ${getStatusColor(currentApiConfig)} mr-2`}></div>
        <div className="relative">          <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          disabled={isSwitching}
          className="flex items-center text-gray-300 hover:text-white"
        >
          <span className="mr-1">
            {isSwitching ? 'Switching...' : currentApiConfig?.name || 'No API Selected'}
          </span>
          {isSwitching ? (
            <LoadingSpinner size="sm" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>

          {isDropdownOpen && (
            <div className="absolute bottom-8 left-0 bg-stone-900 border border-stone-700 rounded shadow-lg py-1 min-w-[200px] z-10">
              {availableApis.length > 0 ? (availableApis.map(api => (
                <button
                  key={api.id}
                  className={`w-full text-left px-4 py-2 hover:bg-stone-800 ${api.id === activeApiId ? 'bg-stone-800' : ''}`}
                  onClick={() => handleApiSelect(api.id)}
                  disabled={isSwitching}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full ${api.lastConnectionStatus?.connected ? 'bg-green-500' : 'bg-stone-400'} mr-2`}></div>
                      {api.name || api.provider}
                    </div>
                    {isSwitching && api.id === activeApiId && (
                      <LoadingSpinner size="sm" className="ml-2" />
                    )}
                  </div>
                </button>
              ))
              ) : (
                <div className="px-4 py-2 text-gray-500">No enabled APIs available</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center section - Current model information */}
      <div className="flex-1 text-center text-gray-500 text-xs">
        {currentApiConfig?.model_info?.name || currentApiConfig?.model || ''}
      </div>

      {/* Right section - live model info + backend status */}
      <div className="flex items-center gap-3 text-gray-500 text-xs">
        {/* Live model info from health check (when available) */}
        {healthStatus?.llm?.configured && healthStatus.llm.model && (
          <span className="text-gray-400" title={`Loaded Model: ${healthStatus.llm.model}`}>
            {healthStatus.llm.model}
          </span>
        )}

        {/* Separator when model is shown */}
        {healthStatus?.llm?.configured && healthStatus.llm.model && (
          <span className="text-gray-700">•</span>
        )}

        {/* Backend status indicator */}
        <div
          className="flex items-center gap-1.5 cursor-default"
          title={healthStatus?.status === 'running'
            ? `Backend: Connected\nVersion: ${healthStatus.version || 'unknown'}\nLatency: ${healthStatus.latency_ms || '?'}ms`
            : 'Backend: Disconnected'}
        >
          <span
            className={`w-2 h-2 rounded-full ${healthStatus?.status === 'running' ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
          <span>
            {healthStatus?.status === 'running'
              ? `v${healthStatus.version || '?'} • ${healthStatus.latency_ms || '?'}ms`
              : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BottomBanner;
