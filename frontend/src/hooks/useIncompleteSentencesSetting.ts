import { useState } from 'react';
import { ContentFilterClient } from '../services/contentFilterClient';
import { toast } from 'sonner';

export function useIncompleteSentencesSetting(
  _initialValue: boolean, // Renamed with underscore to acknowledge unused param
  onUpdateSetting: ((value: boolean) => void) | undefined
) {
  const [isSaving, setIsSaving] = useState(false);

  const updateSetting = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      // Update local state via parent component
      if (onUpdateSetting) {
        onUpdateSetting(enabled);
      }
      
      // Update the server
      await ContentFilterClient.updateRemoveIncompleteSentences(enabled);
      toast.success('Incomplete sentences setting updated');
    } catch (error) {
      console.error('Failed to update incomplete sentences setting:', error);
      toast.error('Failed to update incomplete sentences setting');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    updateSetting
  };
}
