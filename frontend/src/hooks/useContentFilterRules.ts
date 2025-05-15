import { useState } from 'react';
import { WordSwapRule } from '../utils/contentProcessing';
import { ContentFilterClient } from '../services/contentFilterClient';
import { FilterPackageClient } from '../services/filterPackageClient';
import { toast } from 'sonner';

export function useContentFilterRules(
  _initialRules: WordSwapRule[], // Renamed with underscore to acknowledge unused param
  onUpdateRules: (rules: WordSwapRule[]) => void
) {
  const [isLoading, setIsLoading] = useState(false);

  // Update rules (either package rules or global rules)
  const updateRules = async (rules: WordSwapRule[], selectedPackageId: string | null) => {
    setIsLoading(true);
    try {
      // Update local state via parent component
      onUpdateRules(rules);
      
      // If we're editing a specific package, update that package
      if (selectedPackageId) {
        await FilterPackageClient.updateFilterPackage(selectedPackageId, rules);
        toast.success(`Filter package updated`);
      } else {
        // Otherwise update the combined rules
        await ContentFilterClient.updateContentFilters(rules);
        toast.success('Content filtering rules updated');
      }
    } catch (error) {
      console.error('Failed to update content filtering rules:', error);
      toast.error('Failed to update content filtering rules');
    } finally {
      setIsLoading(false);
    }
  };

  const exportRules = (rules: WordSwapRule[]) => {
    try {
      // Create a JSON string of the current rules
      const rulesJson = JSON.stringify(rules, null, 2);
      
      // Create a data URL for download
      const dataUrl = `data:text/json;charset=utf-8,${encodeURIComponent(rulesJson)}`;
      
      // Create a temporary anchor element and trigger download
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'cardshark-content-filters.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export rules:', error);
      toast.error('Failed to export rules');
    }
  };

  const importRules = (onImport: (rules: WordSwapRule[]) => void) => {
    // Create a file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json';
    
    fileInput.onchange = (event) => {
      const target = event.target as HTMLInputElement;
      if (!target.files || target.files.length === 0) return;
      
      const file = target.files[0];
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const importedRules = JSON.parse(content) as WordSwapRule[];
          
          // Validate the imported rules
          if (!Array.isArray(importedRules)) {
            throw new Error('Imported data is not an array');
          }
          
          // Check if each item has the required properties
          for (const rule of importedRules) {
            if (!rule.original || !Array.isArray(rule.substitutions) || 
                !rule.mode || typeof rule.enabled !== 'boolean' || !rule.strategy) {
              throw new Error('One or more rules are missing required properties');
            }
          }
          
          onImport(importedRules);
        } catch (error) {
          console.error('Failed to import rules:', error);
          toast.error('Failed to import rules. Make sure the file format is correct.');
        }
      };
      
      reader.readAsText(file);
    };
    
    // Trigger the file dialog
    fileInput.click();
  };

  return {
    isLoading,
    updateRules,
    exportRules,
    importRules
  };
}
