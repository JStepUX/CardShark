import { useEffect } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { updateHighlightSettings } from './extensions/highlightSettings';
import { DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS } from '../../types/settings';

/**
 * This component doesn't render anything.
 * It subscribes to settings changes and updates the highlight styles accordingly.
 */
const HighlightStylesUpdater: React.FC = () => {
  const { settings } = useSettings();
  
  // Update the highlight settings whenever they change
  useEffect(() => {
    // Use current settings or defaults
    const highlightSettings = settings.syntaxHighlighting || DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS;
    updateHighlightSettings(highlightSettings);
  }, [settings]);
  
  // This component doesn't render anything
  return null;
};

export default HighlightStylesUpdater;