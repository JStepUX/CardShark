import { useCallback, useRef } from 'react';

/**
 * Custom hook to prefetch lazy-loaded routes on user interaction (hover/focus)
 * @param importFn - The import function to prefetch the component
 * @returns An object with handlers for onMouseEnter and onFocus
 */
const usePrefetchRoute = (importFn: () => Promise<any>) => {
  // Keep track if we've already prefetched this route
  const prefetched = useRef(false);
  
  // Function to trigger prefetching
  const prefetch = useCallback(() => {
    if (!prefetched.current) {
      // Start loading the module
      importFn().then(() => {
        prefetched.current = true;
      });
    }
  }, [importFn]);

  return {
    // Add these handlers to navigation elements
    onMouseEnter: prefetch,
    onFocus: prefetch
  };
};

export default usePrefetchRoute;