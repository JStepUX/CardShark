import React, { useEffect, useState } from 'react';
import { WordSwapRule } from '../utils/contentProcessing';
import { SubstitutionManager } from './SubstitutionManager';
import { Info, Loader2, ToggleLeft, ToggleRight, Edit, Trash2 } from 'lucide-react';
import { FilterPackage, FilterPackageClient } from '@/services/filterPackageClient';
import { ContentFilterClient } from '@/services/contentFilterClient';
import { toast } from 'sonner';

interface ContentFilteringTabProps {
  wordSwapRules: WordSwapRule[];
  onUpdateRules: (rules: WordSwapRule[]) => void;
  removeIncompleteSentences?: boolean;
  onUpdateRemoveIncompleteSentences?: (value: boolean) => void;
}

export const ContentFilteringTab: React.FC<ContentFilteringTabProps> = ({
  wordSwapRules,
  onUpdateRules,
  removeIncompleteSentences = false,
  onUpdateRemoveIncompleteSentences,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingIncomplete, setIsSavingIncomplete] = useState(false);
  
  // Filter package states
  const [availablePackages, setAvailablePackages] = useState<FilterPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  // Fetch available filter packages on component mount
  useEffect(() => {
    const fetchPackages = async () => {
      setIsLoadingPackages(true);
      try {
        const packages = await FilterPackageClient.getFilterPackages();
        setAvailablePackages(packages);
        
        // Select the first active package if none is selected
        if (!selectedPackageId) {
          const activePackage = packages.find(pkg => pkg.is_active);
          if (activePackage) {
            setSelectedPackageId(activePackage.id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch filter packages:', error);
        toast.error('Failed to load filter packages');
      } finally {
        setIsLoadingPackages(false);
      }
    };
    
    fetchPackages();
  }, [selectedPackageId]);
  
  // Handle package activation/deactivation
  const handleTogglePackage = async (packageId: string, isActive: boolean) => {
    try {
      if (isActive) {
        await FilterPackageClient.deactivateFilterPackage(packageId);
      } else {
        await FilterPackageClient.activateFilterPackage(packageId);
      }
      
      // Refresh packages and rules
      const packages = await FilterPackageClient.getFilterPackages();
      setAvailablePackages(packages);
      
      // Update rules from content filter manager (combined active packages)
      const rules = await ContentFilterClient.getContentFilters();
      onUpdateRules(rules);
      
      toast.success(`Filter package ${isActive ? 'deactivated' : 'activated'}`);
    } catch (error) {
      console.error(`Failed to ${isActive ? 'deactivate' : 'activate'} filter package:`, error);
      toast.error(`Failed to ${isActive ? 'deactivate' : 'activate'} filter package`);
    }
  };
  
  // Handle viewing/editing a package's rules
  const handleEditPackage = async (packageId: string) => {
    try {
      setIsLoading(true);
      // Fetch the package's rules
      const rules = await FilterPackageClient.getFilterPackageRules(packageId);
      
      // Update the UI with these rules for editing
      setSelectedPackageId(packageId);
      onUpdateRules(rules);
      
    } catch (error) {
      console.error('Failed to load package rules:', error);
      toast.error('Failed to load package rules');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle deleting a package
  const handleDeletePackage = async (packageId: string) => {
    if (window.confirm(`Are you sure you want to delete this filter package? This cannot be undone.`)) {
      try {
        await FilterPackageClient.deleteFilterPackage(packageId);
        
        // Refresh packages
        const packages = await FilterPackageClient.getFilterPackages();
        setAvailablePackages(packages);
        
        // Update rules
        const rules = await ContentFilterClient.getContentFilters();
        onUpdateRules(rules);
        
        toast.success('Filter package deleted');
      } catch (error) {
        console.error('Failed to delete filter package:', error);
        toast.error('Failed to delete filter package');
      }
    }
  };
  
  // Create a new filter package
  const handleCreatePackage = async () => {
    const packageName = prompt('Enter a name for the new filter package:');
    if (!packageName) return;
    
    const packageDescription = prompt('Enter a description for the filter package:', 'Custom filter package');
    
    try {
      const packageId = packageName.toLowerCase().replace(/\s+/g, '_') + '_filter';
      
      await FilterPackageClient.createFilterPackage(
        { 
          id: packageId, 
          name: packageName, 
          description: packageDescription || 'Custom filter package' 
        }, 
        [] // Start with no rules
      );
      
      // Refresh packages
      const packages = await FilterPackageClient.getFilterPackages();
      setAvailablePackages(packages);
      
      // Select the new package
      setSelectedPackageId(packageId);
      onUpdateRules([]); // Clear rules for editing
      
      toast.success('New filter package created');
    } catch (error) {
      console.error('Failed to create filter package:', error);
      toast.error('Failed to create filter package');
    }
  };
  const handleUpdateRules = async (rules: WordSwapRule[]) => {
    setIsLoading(true);
    try {
      // Update local state via parent component
      onUpdateRules(rules);
      
      // If we're editing a specific package, update that package
      if (selectedPackageId) {
        await FilterPackageClient.updateFilterPackage(selectedPackageId, rules);
        toast.success(`Filter package "${selectedPackageId}" updated`);
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

  const handleUpdateIncompleteSentences = async (enabled: boolean) => {
    setIsSavingIncomplete(true);
    try {
      // Update local state via parent component
      if (onUpdateRemoveIncompleteSentences) {
        onUpdateRemoveIncompleteSentences(enabled);
      }
      
      // Update the server
      await ContentFilterClient.updateRemoveIncompleteSentences(enabled);
      toast.success('Incomplete sentences setting updated');
    } catch (error) {
      console.error('Failed to update incomplete sentences setting:', error);
      toast.error('Failed to update incomplete sentences setting');
    } finally {
      setIsSavingIncomplete(false);
    }
  };

  const handleExport = () => {
    try {
      // Create a JSON string of the current rules
      const rulesJson = JSON.stringify(wordSwapRules, null, 2);
      
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

  const handleImport = () => {
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
          
          handleUpdateRules(importedRules);
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium mb-2">Chat Settings</h2>
        <p className="text-sm text-gray-400 mb-4">
          Configure chat behavior, content filters, and word substitutions to control AI-generated responses.
        </p>

        {/* Output Cleanup section - moved to top */}
        <div className="bg-stone-800 border border-stone-700 p-4 rounded-lg mb-6">
          <h3 className="text-md font-medium mb-3">Output Cleanup</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={removeIncompleteSentences}
                onChange={(e) => handleUpdateIncompleteSentences(e.target.checked)}
                disabled={isSavingIncomplete}
                className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300">
                Remove unfinished sentences from chat responses
                {isSavingIncomplete && (
                  <Loader2 size={14} className="inline ml-2 animate-spin" />
                )}
              </span>
            </label>
            <p className="text-xs text-gray-400">
              When enabled, sentences that don't end with proper punctuation (., ?, !, etc.) will be removed from the end of
              generated messages. This can make responses appear more natural by eliminating cut-off thoughts.
            </p>
          </div>
        </div>
        
        {/* Content Filtering section - renamed and reorganized */}
        <h3 className="text-md font-medium mb-3">Content Filtering</h3>
        
        <div className="bg-blue-900/20 border border-blue-700/30 p-3 rounded mb-6">
          <div className="flex items-start">
            <Info size={18} className="text-blue-400 mr-2 mt-0.5" />
            <div className="text-sm text-blue-300">
              <p className="mb-1"><strong>How filtering works:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>For KoboldCPP: Rules are sent as banned_tokens</li>
                <li>For OpenAI: Rules are applied using logit_bias</li>
                <li>For other providers: Client-side replacement is used</li>
              </ul>
              <p className="mt-1">
                The "Auto" strategy will choose the most effective method based on the API provider.
              </p>
            </div>
          </div>
        </div>
        
        {/* Filter Packages Management */}
        <div className="bg-stone-800 border border-stone-700 p-4 rounded-lg mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-md font-medium">Filter Packages</h3>
            <button 
              onClick={() => handleCreatePackage()}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 transition-colors rounded"
              disabled={isLoadingPackages}
            >
              Create New Package
            </button>
          </div>
          
          {isLoadingPackages ? (
            <div className="flex justify-center py-4">
              <Loader2 size={24} className="animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {availablePackages.map(pkg => (
                <div key={pkg.id} className="flex items-center justify-between p-2 bg-zinc-800 rounded">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{pkg.name}</h4>
                    <p className="text-xs text-gray-400">{pkg.description}</p>
                    <div className="text-xs text-gray-500 flex gap-2 mt-1">
                      <span>{pkg.rules_count} rules</span>
                      {pkg.is_builtin && <span className="bg-blue-900/50 text-blue-300 px-1 rounded">Built-in</span>}
                      {pkg.is_active && <span className="bg-green-900/50 text-green-300 px-1 rounded">Active</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleTogglePackage(pkg.id, pkg.is_active)}
                      className="p-1 text-gray-400 hover:text-white"
                      title={pkg.is_active ? "Deactivate package" : "Activate package"}
                    >
                      {pkg.is_active ? 
                        <ToggleRight className="h-5 w-5 text-green-400" /> : 
                        <ToggleLeft className="h-5 w-5" />
                      }
                    </button>
                    <button 
                      onClick={() => handleEditPackage(pkg.id)}
                      className="p-1 text-gray-400 hover:text-white"
                      title="Edit package rules"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    {!pkg.is_builtin && (
                      <button 
                        onClick={() => handleDeletePackage(pkg.id)}
                        className="p-1 text-gray-400 hover:text-red-400"
                        title="Delete package"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              
              {availablePackages.length === 0 && (
                <div className="text-center py-4 text-gray-400">
                  No filter packages available
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Rules Management */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-md font-medium">
              {selectedPackageId ? 
                `Editing Package: ${availablePackages.find(pkg => pkg.id === selectedPackageId)?.name || selectedPackageId}` : 
                'Custom Rules'
              }
            </h3>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleImport}
                className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 transition-colors rounded"
                title="Import word substitution rules from a JSON file"
                disabled={isLoading}
              >
                Import Rules
              </button>              <button
                onClick={handleExport}
                className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 transition-colors rounded"
                disabled={wordSwapRules.length === 0 || isLoading}
                title="Export word substitution rules to a JSON file"
              >
                Export Rules
              </button>
              
              {selectedPackageId && (
                <button
                  onClick={() => {
                    setSelectedPackageId(null);
                    // Load all rules
                    ContentFilterClient.getContentFilters().then(rules => onUpdateRules(rules));
                  }}
                  className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded"
                  title="Back to all rules"
                >
                  ← Back to All Rules
                </button>
              )}
            </div>
          </div>
          
          {isLoading && (
            <div className="flex items-center text-sm text-blue-400">
              <Loader2 size={16} className="mr-2 animate-spin" />
              Saving rules...
            </div>
          )}
        </div>
        
        <SubstitutionManager 
          rules={wordSwapRules} 
          onChange={handleUpdateRules} 
        />
      </div>
    </div>
  );
};
