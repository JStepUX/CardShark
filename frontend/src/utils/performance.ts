// Performance configuration for CardShark frontend

export interface PerformanceConfig {
  // Virtual scrolling
  virtualScrolling: {
    enabled: boolean;
    itemHeight: number;
    overscanCount: number;
    threshold: number; // Number of messages before enabling virtual scrolling
  };
  
  // Animation settings
  animations: {
    enabled: boolean;
    duration: number;
    easing: string;
    reducedMotion: boolean;
  };
  
  // Streaming optimizations
  streaming: {
    bufferSize: number;
    flushInterval: number;
    maxConcurrentUpdates: number;
  };
  
  // Memory management
  memory: {
    maxCachedMessages: number;
    cacheTimeout: number;
    clearCacheOnNavigation: boolean;
  };
  
  // Rendering optimizations
  rendering: {
    enableGPUAcceleration: boolean;
    enableContentContainment: boolean;
    debounceResize: number;
  };
}

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  virtualScrolling: {
    enabled: true,
    itemHeight: 150,
    overscanCount: 5,
    threshold: 50 // Enable virtual scrolling after 50 messages
  },
  
  animations: {
    enabled: true,
    duration: 150,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    reducedMotion: false
  },
  
  streaming: {
    bufferSize: 50,
    flushInterval: 16, // 60fps
    maxConcurrentUpdates: 2
  },
  
  memory: {
    maxCachedMessages: 1000,
    cacheTimeout: 300000, // 5 minutes
    clearCacheOnNavigation: true
  },
  
  rendering: {
    enableGPUAcceleration: true,
    enableContentContainment: true,
    debounceResize: 100
  }
};

// Performance monitoring utilities
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  private observers: PerformanceObserver[] = [];

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startMonitoring() {
    if (typeof window === 'undefined') return;

    // Monitor long tasks
    if ('PerformanceObserver' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.duration > 50) { // Tasks longer than 50ms
            console.warn(`Long task detected: ${entry.duration}ms`);
          }
        });
      });

      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch (e) {
        console.log('Long task monitoring not supported');
      }

      // Monitor layout shifts
      const clsObserver = new PerformanceObserver((list) => {
        let clsValue = 0;
        const entries = list.getEntries();
        
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });

        if (clsValue > 0.1) { // CLS threshold
          console.warn(`High layout shift detected: ${clsValue}`);
        }
      });

      try {
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(clsObserver);
      } catch (e) {
        console.log('Layout shift monitoring not supported');
      }
    }
  }

  recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // Keep only last 100 values
    if (values.length > 100) {
      values.shift();
    }
  }

  getMetric(name: string): { avg: number; min: number; max: number } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;

    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  getReport(): Record<string, any> {
    const report: Record<string, any> = {};
    
    for (const [name, values] of this.metrics.entries()) {
      if (values.length > 0) {
        report[name] = this.getMetric(name);
      }
    }

    return report;
  }

  dispose() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.metrics.clear();
  }
}

// Utility functions for performance optimization
export const performanceUtils = {
  // Check if device supports high refresh rate
  supportsHighRefreshRate(): boolean {
    return window.screen && 'refreshRate' in window.screen && 
           (window.screen as any).refreshRate > 60;
  },

  // Check if user prefers reduced motion
  prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  // Get optimal animation duration based on device capabilities
  getOptimalAnimationDuration(baseMs: number): number {
    if (this.prefersReducedMotion()) return 0;
    if (this.supportsHighRefreshRate()) return Math.max(baseMs * 0.8, 100);
    return baseMs;
  },

  // Throttle function optimized for animation frames
  throttleAnimationFrame<T extends (...args: any[]) => any>(fn: T): T {
    let inThrottle = false;
    return ((...args: any[]) => {
      if (!inThrottle) {
        requestAnimationFrame(() => {
          fn.apply(this, args);
          inThrottle = false;
        });
        inThrottle = true;
      }
    }) as T;
  },

  // Debounce with immediate execution option
  debounceImmediate<T extends (...args: any[]) => any>(
    fn: T, 
    delay: number, 
    immediate = false
  ): T {
    let timeoutId: NodeJS.Timeout | null = null;
    
    return ((...args: any[]) => {
      const callNow = immediate && !timeoutId;
      
      if (timeoutId) clearTimeout(timeoutId);
      
      timeoutId = setTimeout(() => {
        timeoutId = null;
        if (!immediate) fn.apply(this, args);
      }, delay);
      
      if (callNow) fn.apply(this, args);
    }) as T;
  }
};
