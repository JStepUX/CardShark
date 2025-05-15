import { useState, useEffect } from 'react';
import { FilterPackageClient, FilterPackage } from '../services/filterPackageClient';
import { ContentFilterClient } from '../services/contentFilterClient';
import { WordSwapRule } from '../utils/contentProcessing';
import { toast } from 'sonner';

export function useFilterPackages(
  onUpdateRules: (rules: WordSwapRule[]) => void
) {
  const [availablePackages, setAvailablePackages] = useState<FilterPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch available filter packages
  const fetchPackages = async () => {
    setIsLoading(true);
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
      return packages;
    } catch (error) {
      console.error('Failed to fetch filter packages:', error);
      toast.error('Failed to load filter packages');
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Load packages on component mount
  useEffect(() => {
    fetchPackages();
    // No dependency on selectedPackageId to prevent fetch loops
  }, []);

  // Handle package activation/deactivation
  const togglePackage = async (packageId: string, isActive: boolean) => {
    try {
      if (isActive) {
        await FilterPackageClient.deactivateFilterPackage(packageId);
      } else {
        await FilterPackageClient.activateFilterPackage(packageId);
      }
      
      // Refresh packages and rules
      const packages = await fetchPackages();
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

  // Handle editing a package
  const editPackage = async (packageId: string) => {
    setIsLoading(true);
    try {
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
  const deletePackage = async (packageId: string) => {
    if (!window.confirm(`Are you sure you want to delete this filter package? This cannot be undone.`)) {
      return;
    }
    
    try {
      await FilterPackageClient.deleteFilterPackage(packageId);
      
      // Refresh packages
      const packages = await fetchPackages();
      setAvailablePackages(packages);
      
      // Update rules
      const rules = await ContentFilterClient.getContentFilters();
      onUpdateRules(rules);
      
      toast.success('Filter package deleted');
    } catch (error) {
      console.error('Failed to delete filter package:', error);
      toast.error('Failed to delete filter package');
    }
  };

  // Create a new filter package
  const createPackage = async () => {
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
      const packages = await fetchPackages();
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

  // Clear selected package and load all rules
  const clearSelectedPackage = async () => {
    setSelectedPackageId(null);
    // Load all rules
    const rules = await ContentFilterClient.getContentFilters();
    onUpdateRules(rules);
  };

  return {
    availablePackages,
    selectedPackageId,
    isLoading,
    togglePackage,
    editPackage,
    deletePackage,
    createPackage,
    clearSelectedPackage
  };
}
