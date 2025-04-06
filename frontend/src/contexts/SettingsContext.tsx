import React, { createContext, useContext, useState, useEffect } from "react";
import { Settings, DEFAULT_SETTINGS } from "../types/settings";

interface SettingsContextType {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  isLoading: boolean;
}

const defaultContext: SettingsContextType = {
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  isLoading: true,
};

const SettingsContext = createContext<SettingsContextType>(defaultContext);

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/settings");
        if (!response.ok) throw new Error("Failed to load settings");
        const data = await response.json();
        if (data.success) {
          setSettings(data.settings);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Update settings handler
  const updateSettings = async (updates: Partial<Settings>) => {
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) throw new Error("Failed to save settings");
      
      const data = await response.json();
      if (data.success) {
        setSettings((prev) => ({ ...prev, ...updates }));
        return;
      }
      throw new Error("Failed to update settings: no success response");
    } catch (err) {
      console.error("Failed to save settings:", err);
      throw err;
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;