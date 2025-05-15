// src/services/filterPackageClient.ts
import { WordSwapRule } from '../utils/contentProcessing';

export interface FilterPackage {
  id: string;
  name: string;
  description: string;
  version: string;
  rules_count: number;
  is_active: boolean;
  is_builtin: boolean;
}

/**
 * Client for interacting with the filter package API.
 */
export class FilterPackageClient {
  /**
   * Get all available filter packages.
   * 
   * @returns A promise that resolves to an array of filter packages.
   */
  static async getFilterPackages(): Promise<FilterPackage[]> {
    try {
      const response = await fetch('/api/content-filters/packages');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to get filter packages (${response.status})`);
      }
      
      const data = await response.json();
      return data.packages || [];
    } catch (error) {
      console.error('Error getting filter packages:', error);
      throw error;
    }
  }

  /**
   * Get active filter packages.
   * 
   * @returns A promise that resolves to an array of active filter packages.
   */
  static async getActiveFilterPackages(): Promise<FilterPackage[]> {
    try {
      const response = await fetch('/api/content-filters/active-packages');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to get active filter packages (${response.status})`);
      }
      
      const data = await response.json();
      return data.packages || [];
    } catch (error) {
      console.error('Error getting active filter packages:', error);
      throw error;
    }
  }

  /**
   * Get rules for a specific filter package.
   * 
   * @param packageId The ID of the filter package to get rules for.
   * @returns A promise that resolves to an array of word swap rules.
   */
  static async getFilterPackageRules(packageId: string): Promise<WordSwapRule[]> {
    try {
      const response = await fetch(`/api/content-filters/package/${packageId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to get filter package rules (${response.status})`);
      }
      
      const data = await response.json();
      return data.rules || [];
    } catch (error) {
      console.error(`Error getting filter package rules for ${packageId}:`, error);
      throw error;
    }
  }

  /**
   * Activate a filter package.
   * 
   * @param packageId The ID of the filter package to activate.
   * @returns A promise that resolves when the activation is successful.
   */
  static async activateFilterPackage(packageId: string): Promise<void> {
    try {
      const response = await fetch('/api/content-filters/package/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: packageId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to activate filter package (${response.status})`);
      }
    } catch (error) {
      console.error(`Error activating filter package ${packageId}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate a filter package.
   * 
   * @param packageId The ID of the filter package to deactivate.
   * @returns A promise that resolves when the deactivation is successful.
   */
  static async deactivateFilterPackage(packageId: string): Promise<void> {
    try {
      const response = await fetch('/api/content-filters/package/deactivate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: packageId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to deactivate filter package (${response.status})`);
      }
    } catch (error) {
      console.error(`Error deactivating filter package ${packageId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new filter package.
   * 
   * @param packageInfo Information about the new package.
   * @param rules Rules for the new package.
   * @returns A promise that resolves to an array of updated filter packages.
   */
  static async createFilterPackage(
    packageInfo: Pick<FilterPackage, 'id' | 'name' | 'description'>, 
    rules: WordSwapRule[]
  ): Promise<FilterPackage[]> {
    try {
      const response = await fetch('/api/content-filters/package', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          package_info: packageInfo,
          rules 
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to create filter package (${response.status})`);
      }
      
      const data = await response.json();
      return data.packages || [];
    } catch (error) {
      console.error('Error creating filter package:', error);
      throw error;
    }
  }

  /**
   * Update an existing filter package.
   * 
   * @param packageId The ID of the filter package to update.
   * @param rules The updated rules.
   * @returns A promise that resolves when the update is successful.
   */
  static async updateFilterPackage(packageId: string, rules: WordSwapRule[]): Promise<void> {
    try {
      const response = await fetch(`/api/content-filters/package/${packageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rules })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update filter package (${response.status})`);
      }
    } catch (error) {
      console.error(`Error updating filter package ${packageId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a filter package.
   * 
   * @param packageId The ID of the filter package to delete.
   * @returns A promise that resolves when the deletion is successful.
   */
  static async deleteFilterPackage(packageId: string): Promise<void> {
    try {
      const response = await fetch(`/api/content-filters/package/${packageId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to delete filter package (${response.status})`);
      }
    } catch (error) {
      console.error(`Error deleting filter package ${packageId}:`, error);
      throw error;
    }
  }
}
