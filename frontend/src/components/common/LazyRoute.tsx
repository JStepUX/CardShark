import React, { Suspense, ReactNode } from 'react';
import RouteLoadingFallback from './RouteLoadingFallback';
import LazyRouteErrorBoundary from './LazyRouteErrorBoundary';

interface LazyRouteProps {
  children: ReactNode;
  routeName?: string;
}

/**
 * LazyRoute combines Suspense and error boundaries for lazy-loaded components
 * Provides consistent loading states and error handling for all lazy routes
 */
const LazyRoute: React.FC<LazyRouteProps> = ({ children, routeName }) => {
  return (
    <LazyRouteErrorBoundary routeName={routeName}>
      <Suspense fallback={<RouteLoadingFallback />}>
        {children}
      </Suspense>
    </LazyRouteErrorBoundary>
  );
};

export default LazyRoute;