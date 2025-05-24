import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Server, ChevronDown, ChevronUp, Check } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner'; // Added
import { useAPIConfig } from '../../contexts/APIConfigContext';
import { useSettings } from '../../contexts/SettingsContext';

interface ApiSelectProps {
  isCollapsed?: boolean;
}

/**
 * ApiSelect component that allows users to switch between different API connections
 * Displays in either collapsed (icon only) or expanded (with text) mode
 */
const ApiSelect: React.FC<ApiSelectProps> = ({ isCollapsed = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { allAPIConfigs, activeApiId, setActiveApiId } = useAPIConfig();
  const { updateSettings } = useSettings();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isSwitchingApiTo, setIsSwitchingApiTo] = useState<string | null>(null);
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get all enabled APIs and memoize to prevent unnecessary re-renders
  const enabledApis = useMemo(() => {
    return Object.entries(allAPIConfigs)
      .filter(([_, api]) => api.enabled)
      .sort((a, b) => {
        // Sort by name if available, otherwise by provider then ID
        if (a[1].name && b[1].name) return a[1].name.localeCompare(b[1].name);
        return a[1].provider.localeCompare(b[1].provider) || a[0].localeCompare(b[0]);
      });
  }, [allAPIConfigs]);

  // No need to show selector if there's only one or zero APIs
  if (enabledApis.length <= 1) {
    return null;
  }

  // Find the currently active API
  const activeApi = activeApiId ? allAPIConfigs[activeApiId] : null;

  // Handle selecting an API
  const handleSelectApi = (id: string) => {
    if (id === activeApiId || isSwitchingApiTo) {
      if (id === activeApiId && !isSwitchingApiTo) setIsOpen(false); // Close if re-selecting current and not switching
      return;
    }

    setIsSwitchingApiTo(id);
    setShowSpinner(false); // Reset spinner visibility for the new switch

    if (spinnerTimeoutRef.current) {
      clearTimeout(spinnerTimeoutRef.current);
    }
    spinnerTimeoutRef.current = setTimeout(() => {
      if (isSwitchingApiTo === id) { // Check if still switching to the same API
        setShowSpinner(true);
      }
    }, 300);

    setActiveApiId(id);
    updateSettings({ activeApiId: id });
  };

  // useEffect to clear switching state once activeApiId from context matches
  useEffect(() => {
    if (activeApiId === isSwitchingApiTo) {
      if (spinnerTimeoutRef.current) {
        clearTimeout(spinnerTimeoutRef.current);
        spinnerTimeoutRef.current = null;
      }
      setShowSpinner(false);
      setIsSwitchingApiTo(null);
      setIsOpen(false); // Close dropdown after successful switch
    }
  }, [activeApiId, isSwitchingApiTo]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (spinnerTimeoutRef.current) {
        clearTimeout(spinnerTimeoutRef.current);
      }
    };
  }, []);

  // Handle clicks outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Render API options list (shared between collapsed and expanded views)
  const renderApiOptions = () => (
    <div className="py-1" role="menu">
      {enabledApis.map(([id, api]) => (
        <button
          key={id}
          onClick={() => handleSelectApi(id)}
          disabled={!!isSwitchingApiTo}
          className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors ${
            id === activeApiId ? 'bg-blue-600/20 text-blue-300' : 'text-gray-300 hover:bg-gray-800'
          } ${isSwitchingApiTo ? 'cursor-not-allowed opacity-70' : ''}`}
          role="menuitem"
        >
          {isCollapsed ? (
            <span className="truncate">{api.name || api.provider}</span>
          ) : (
            <div className="flex flex-col">
              <span className="font-medium">{api.name || 'Unnamed API'}</span>
              <span className="text-xs text-gray-400">{api.provider}</span>
            </div>
          )}
          {isSwitchingApiTo === id && showSpinner ? (
            <LoadingSpinner size={16} className="text-blue-400" />
          ) : id === activeApiId ? (
            <Check size={16} className="text-blue-400" aria-hidden="true" />
          ) : (
            <div style={{ width: '16px' }} /> // Placeholder for alignment
          )}
        </button>
      ))}
    </div>
  );

  if (isCollapsed) {
    // Collapsed version (minimal, icon only)
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={!!isSwitchingApiTo}
          className={`w-10 h-10 flex items-center justify-center text-gray-300 hover:text-white rounded-lg transition-colors
                     ${isOpen && !isSwitchingApiTo ? 'bg-stone-700 text-white' : 'hover:bg-stone-700'}
                     ${isSwitchingApiTo ? 'cursor-not-allowed' : ''}`}
          title="Switch API"
          aria-label="Select API"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          {isSwitchingApiTo && showSpinner ? (
            <LoadingSpinner size={18} aria-hidden="true" />
          ) : (
            <Server size={18} aria-hidden="true" />
          )}
        </button>

        <div
          className={`absolute left-12 top-0 z-20 bg-zinc-900 border border-gray-700 rounded-lg shadow-lg min-w-[200px]
                     transition-all duration-200 ease-in-out transform ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
          role="menu"
          aria-orientation="vertical"
          aria-hidden={!isOpen}
        >
          <div className="p-2 border-b border-gray-700">
            <h3 className="text-sm font-medium text-gray-300">Select API</h3>
          </div>
          {renderApiOptions()}
        </div>
      </div>
    );
  }

  // Full version with names and dropdown
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!!isSwitchingApiTo}
        className={`w-full flex items-center justify-between px-3 py-2 text-gray-300 hover:text-white rounded-lg transition-colors
                   ${isOpen && !isSwitchingApiTo ? 'bg-stone-700 text-white' : 'hover:bg-stone-700'}
                   ${isSwitchingApiTo ? 'cursor-not-allowed' : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <Server size={18} aria-hidden="true" />
          <span className="text-sm truncate">
            {isSwitchingApiTo && showSpinner
              ? `Switching to ${allAPIConfigs[isSwitchingApiTo]?.name || allAPIConfigs[isSwitchingApiTo]?.provider || isSwitchingApiTo}...`
              : activeApi ? (activeApi.name || activeApi.provider) : 'No API Selected'}
          </span>
        </div>
        {isSwitchingApiTo && showSpinner ? (
          <LoadingSpinner size={16} aria-hidden="true" />
        ) : isOpen ? (
          <ChevronUp size={16} aria-hidden="true" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </button>

      <div
        className={`absolute top-full left-0 z-20 mt-1 bg-zinc-900 border border-gray-700 rounded-lg shadow-lg w-full
                   transition-all duration-200 ease-in-out transform ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
        role="menu"
        aria-orientation="vertical"
        aria-hidden={!isOpen}
      >
        {renderApiOptions()}
      </div>
    </div>
  );
};

export default ApiSelect;