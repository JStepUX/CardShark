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
 * @param userName The user name or UserProfile object
 * @returns A clean user name without file extensions
 */
export const formatUserName = (userName: any): string => {
  if (!userName) return 'User';
  
  // Handle UserProfile objects
  if (typeof userName === 'object' && userName !== null) {
    if (userName.name) {
      // Return the profile name directly
      return userName.name.trim() || 'User';
    }
    return 'User';
  }
  
  // Handle string values (backward compatibility)
  if (typeof userName === 'string') {
    if (!userName || userName === "Unnamed User") return 'User';
    
    // Remove file extension if present (like .png)
    const cleanedName = userName.replace(/\.\w+$/, '');
    
    // Default if name becomes empty after cleaning or is just whitespace
    return cleanedName.trim() || 'User';
  }
  
  return 'User'; // Default for any other case
};