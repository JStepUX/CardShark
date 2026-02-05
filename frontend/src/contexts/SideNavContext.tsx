/**
 * @file SideNavContext.tsx
 * @description Context for controlling the side navigation collapse state.
 * Allows other components (like WorldPlayView) to collapse the sidenav.
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface SideNavContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
}

const SideNavContext = createContext<SideNavContextType | null>(null);

export function SideNavProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const collapse = useCallback(() => setIsCollapsed(true), []);
  const expand = useCallback(() => setIsCollapsed(false), []);
  const toggle = useCallback(() => setIsCollapsed(prev => !prev), []);

  return (
    <SideNavContext.Provider value={{ isCollapsed, setIsCollapsed, collapse, expand, toggle }}>
      {children}
    </SideNavContext.Provider>
  );
}

export function useSideNav(): SideNavContextType {
  const context = useContext(SideNavContext);
  if (!context) {
    throw new Error('useSideNav must be used within a SideNavProvider');
  }
  return context;
}

export function useOptionalSideNav(): SideNavContextType | null {
  return useContext(SideNavContext);
}
