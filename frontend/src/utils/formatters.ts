/**
 * Formatting utility functions for the application
 */

/**
 * Format a world name by replacing underscores with spaces and applying title case
 * @param worldName The raw world name that might contain underscores
 * @returns A formatted world name with spaces instead of underscores
 */
export const formatWorldName = (worldName: string): string => {
  if (!worldName) return '';
  
  // Replace underscores with spaces
  return worldName.replace(/_/g, ' ');
};

/**
 * Format a user name by removing any file extensions
 * @param userName The user name that might contain file extensions
 * @returns A clean user name without file extensions
 */
export const formatUserName = (userName: string): string => {
  if (!userName) return '';
  
  // Remove file extension if present (like .png)
  return userName.replace(/\.\w+$/, '');
};