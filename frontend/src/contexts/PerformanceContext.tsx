import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PerformanceConfig, DEFAULT_PERFORMANCE_CONFIG, PerformanceMonitor, performanceUtils } from '../utils/performance';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';

interface PerformanceContextType {
  config: PerformanceConfig;
  updateConfig: (updates: Partial<PerformanceConfig>) => void;
  metrics: ReturnType<typeof usePerformanceMonitor>;
  isHighPerformanceMode: boolean;
  toggleHighPerformanceMode: () => void;
}

const PerformanceContext = createContext<PerformanceContextType | undefined>(undefined);

interface PerformanceProviderProps {
  children: ReactNode;
  initialConfig?: Partial<PerformanceConfig>;
}

export const PerformanceProvider: React.FC<PerformanceProviderProps> = ({ 
  children, 
  initialConfig = {} 
}) => {
  const [config, setConfig] = useState<PerformanceConfig>(() => ({
    ...DEFAULT_PERFORMANCE_CONFIG,
    ...initialConfig,
    // Override animations if user prefers reduced motion
    animations: {
      ...DEFAULT_PERFORMANCE_CONFIG.animations,
      ...initialConfig.animations,
      enabled: initialConfig.animations?.enabled ?? !performanceUtils.prefersReducedMotion(),
      reducedMotion: performanceUtils.prefersReducedMotion()
    }
  }));

  const [isHighPerformanceMode, setIsHighPerformanceMode] = useState(false);
  const metrics = usePerformanceMonitor(true);

  // Initialize performance monitoring
  useEffect(() => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.startMonitoring();

    return () => {
      monitor.dispose();
    };
  }, []);
  // Auto-adjust performance based on metrics
  useEffect(() => {
    let id: number;
    
    const check = () => {
      const currentMetrics = metrics.getMetrics();
      
      // Enable high performance mode if FPS is consistently low
      if (currentMetrics.fps < 45 && currentMetrics.averageRenderTime > 20) {
        if (!isHighPerformanceMode) {
          console.log('Auto-enabling high performance mode due to low FPS');
          setIsHighPerformanceMode(true);
        }
      }
      
      // Disable high performance mode if FPS is good
      if (currentMetrics.fps > 55 && currentMetrics.averageRenderTime < 10) {
        if (isHighPerformanceMode) {
          console.log('Auto-disabling high performance mode - good performance detected');
          setIsHighPerformanceMode(false);
        }
      }
      
      id = requestAnimationFrame(check);
    };
    
    id = requestAnimationFrame(check);
    
    return () => cancelAnimationFrame(id);
  }, [metrics, isHighPerformanceMode]);

  // Apply high performance mode adjustments
  useEffect(() => {
    if (isHighPerformanceMode) {
      setConfig(prev => ({
        ...prev,
        virtualScrolling: {
          ...prev.virtualScrolling,
          enabled: true,
          threshold: 20 // Enable virtual scrolling sooner
        },
        animations: {
          ...prev.animations,
          enabled: false // Disable animations for performance
        },
        streaming: {
          ...prev.streaming,
          bufferSize: 25, // Smaller buffer for faster updates
          flushInterval: 33, // 30fps instead of 60fps
          maxConcurrentUpdates: 1 // Limit concurrent updates
        },
        rendering: {
          ...prev.rendering,
          enableGPUAcceleration: true,
          enableContentContainment: true
        }
      }));    } else {
      // Restore normal performance settings
      setConfig(() => ({
        ...DEFAULT_PERFORMANCE_CONFIG,
        animations: {
          ...DEFAULT_PERFORMANCE_CONFIG.animations,
          enabled: !performanceUtils.prefersReducedMotion(),
          reducedMotion: performanceUtils.prefersReducedMotion()
        }
      }));
    }
  }, [isHighPerformanceMode]);

  // Listen for reduced motion preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const handleChange = () => {
      setConfig(prev => ({
        ...prev,
        animations: {
          ...prev.animations,
          enabled: !mediaQuery.matches && !isHighPerformanceMode,
          reducedMotion: mediaQuery.matches
        }
      }));
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [isHighPerformanceMode]);

  const updateConfig = (updates: Partial<PerformanceConfig>) => {
    setConfig(prev => {
      const newConfig = { ...prev };
      
      // Deep merge the updates
      Object.keys(updates).forEach(key => {
        const typedKey = key as keyof PerformanceConfig;
        if (typeof updates[typedKey] === 'object' && updates[typedKey] !== null) {
          newConfig[typedKey] = { ...prev[typedKey], ...updates[typedKey] } as any;
        } else {
          newConfig[typedKey] = updates[typedKey] as any;
        }
      });
      
      return newConfig;
    });
  };

  const toggleHighPerformanceMode = () => {
    setIsHighPerformanceMode(prev => !prev);
  };

  const value: PerformanceContextType = {
    config,
    updateConfig,
    metrics,
    isHighPerformanceMode,
    toggleHighPerformanceMode
  };

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  );
};

export const usePerformance = (): PerformanceContextType => {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformance must be used within a PerformanceProvider');
  }
  return context;
};

// Custom hook for performance-aware components
export const usePerformanceAware = () => {
  const { config, metrics, isHighPerformanceMode } = usePerformance();
  
  return {
    shouldUseVirtualScrolling: (itemCount: number) => 
      config.virtualScrolling.enabled && itemCount > config.virtualScrolling.threshold,
    
    shouldAnimateTransitions: () => 
      config.animations.enabled && !config.animations.reducedMotion && !isHighPerformanceMode,
    
    getOptimalAnimationDuration: (baseMs: number) =>
      performanceUtils.getOptimalAnimationDuration(baseMs),
    
    shouldUseGPUAcceleration: () => 
      config.rendering.enableGPUAcceleration,
    
    getCurrentFPS: () => 
      metrics.getMetrics().fps,
    
    isPerformanceCritical: () => 
      metrics.getMetrics().fps < 30 || metrics.getMetrics().averageRenderTime > 33,
    
    getStreamingConfig: () => config.streaming
  };
};
