import { useState, useMemo } from 'react';

export type SortOption = 'name_asc' | 'name_desc' | 'date_newest' | 'date_oldest';

export interface SortConfig<T> {
  getName: (item: T) => string;
  getDate: (item: T) => number | string | Date;
}

export function useCharacterSort<T>(
  items: T[],
  config: SortConfig<T>,
  initialSort: SortOption = 'name_asc'
) {
  const [sortOption, setSortOption] = useState<SortOption>(initialSort);

  const sortedItems = useMemo(() => {
    // Create a shallow copy to avoid mutating the original array
    const sorted = [...items];
    
    sorted.sort((a, b) => {
      switch (sortOption) {
        case 'name_asc':
          return config.getName(a).localeCompare(config.getName(b));
        case 'name_desc':
          return config.getName(b).localeCompare(config.getName(a));
        case 'date_newest': {
          const dateA = new Date(config.getDate(a)).getTime();
          const dateB = new Date(config.getDate(b)).getTime();
          return dateB - dateA;
        }
        case 'date_oldest': {
          const dateA = new Date(config.getDate(a)).getTime();
          const dateB = new Date(config.getDate(b)).getTime();
          return dateA - dateB;
        }
        default:
          return 0;
      }
    });
    
    return sorted;
  }, [items, sortOption, config]);

  return { 
    sortedItems, 
    sortOption, 
    setSortOption,
    // Helper to get a human-readable label for the current sort
    sortLabel: getSortLabel(sortOption)
  };
}

export function getSortLabel(option: SortOption): string {
  switch (option) {
    case 'name_asc': return 'Name (A-Z)';
    case 'name_desc': return 'Name (Z-A)';
    case 'date_newest': return 'Newest First';
    case 'date_oldest': return 'Oldest First';
    default: return 'Custom';
  }
}














