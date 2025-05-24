import React from 'react';
import { WordSwapRule } from '../utils/contentProcessing';
import { SubstitutionManager } from './SubstitutionManager';
import { Info, ToggleLeft, ToggleRight, Edit, Trash2 } from 'lucide-react';
import LoadingSpinner from './common/LoadingSpinner'; // Added
import { useFilterPackages } from '../hooks/useFilterPackages';
import { useContentFilterRules } from '../hooks/useContentFilterRules';
import { useIncompleteSentencesSetting } from '../hooks/useIncompleteSentencesSetting';
// Removed unused import: FilterPackage

interface ContentFilteringTabProps {
  wordSwapRules: WordSwapRule[];
  onUpdateRules: (rules: WordSwapRule[]) => void;
  removeIncompleteSentences?: boolean;
  onUpdateRemoveIncompleteSentences?: (value: boolean) => void;
}

export const ContentFilteringTabRefactored: React.FC<ContentFilteringTabProps> = ({
  wordSwapRules,
  onUpdateRules,
  removeIncompleteSentences = false,
  onUpdateRemoveIncompleteSentences,
}) => {
  // Use custom hooks for better separation of concerns
  const {
    availablePackages,
    selectedPackageId,
    isLoading: isLoadingPackages,
    togglePackage: handleTogglePackage,
    editPackage: handleEditPackage,
    deletePackage: handleDeletePackage,
    createPackage: handleCreatePackage,
    clearSelectedPackage
  } = useFilterPackages(onUpdateRules);
  
  const {
    isLoading,
    updateRules: handleUpdateRules,
    exportRules: handleExport,
    importRules
  } = useContentFilterRules(wordSwapRules, onUpdateRules);
  
  const {
    isSaving: isSavingIncomplete,
    updateSetting: handleUpdateIncompleteSentences
  } = useIncompleteSentencesSetting(
    removeIncompleteSentences, 
    onUpdateRemoveIncompleteSentences
  );
  
  // Handler for importing rules
  const handleImport = () => {
    importRules((importedRules) => {
      handleUpdateRules(importedRules, selectedPackageId);
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium mb-2">Chat Settings</h2>
        <p className="text-sm text-gray-400 mb-4">
          Configure chat behavior, content filters, and word substitutions to control AI-generated responses.
        </p>

        {/* Output Cleanup section */}
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
                  <LoadingSpinner size={14} className="inline ml-2" />
                )}
              </span>
            </label>
            <p className="text-xs text-gray-400">
              When enabled, sentences that don't end with proper punctuation (., ?, !, etc.) will be removed from the end of
              generated messages. This can make responses appear more natural by eliminating cut-off thoughts.
            </p>
          </div>
        </div>
        
        {/* Content Filtering section */}
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
              onClick={handleCreatePackage}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 transition-colors rounded"
              disabled={isLoadingPackages}
            >
              Create New Package
            </button>
          </div>
          
          {isLoadingPackages ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner size={24} className="text-blue-500" />
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
              </button>
              <button
                onClick={() => handleExport(wordSwapRules)}
                className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 transition-colors rounded"
                disabled={wordSwapRules.length === 0 || isLoading}
                title="Export word substitution rules to a JSON file"
              >
                Export Rules
              </button>
              
              {selectedPackageId && (
                <button
                  onClick={clearSelectedPackage}
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
              <LoadingSpinner size={16} className="mr-2" />
              Saving rules...
            </div>
          )}
        </div>
        
        <SubstitutionManager 
          rules={wordSwapRules} 
          onChange={(rules) => handleUpdateRules(rules, selectedPackageId)} 
        />
      </div>
    </div>
  );
};
