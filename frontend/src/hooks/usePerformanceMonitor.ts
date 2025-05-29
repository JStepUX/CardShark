import { useEffect, useRef, useCallback } from 'react';

interface PerformanceMetrics {
  fps: number;
  renderTime: number;
  totalRenders: number;
  averageRenderTime: number;
}

export const usePerformanceMonitor = (enabled = process.env.NODE_ENV === 'development') => {
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const renderTimesRef = useRef<number[]>([]);
  const renderCountRef = useRef<number>(0);
  const metricsRef = useRef<PerformanceMetrics>({
    fps: 60,
    renderTime: 0,
    totalRenders: 0,
    averageRenderTime: 0
  });

  const measureRender = useCallback(() => {
    if (!enabled) return;

    const now = performance.now();
    const renderTime = now - lastTimeRef.current;
    
    renderTimesRef.current.push(renderTime);
    renderCountRef.current++;
    
    // Keep only last 60 samples (1 second at 60fps)
    if (renderTimesRef.current.length > 60) {
      renderTimesRef.current.shift();
    }

    // Calculate FPS (frames per second)
    const fps = Math.round(1000 / renderTime);
    
    // Calculate average render time
    const avgRenderTime = renderTimesRef.current.reduce((a, b) => a + b, 0) / renderTimesRef.current.length;

    metricsRef.current = {
      fps: Math.min(fps, 60), // Cap at 60fps
      renderTime,
      totalRenders: renderCountRef.current,
      averageRenderTime: avgRenderTime
    };

    lastTimeRef.current = now;

    // Log performance warnings
    if (fps < 30) {
      console.warn(`Low FPS detected: ${fps}fps (render time: ${renderTime.toFixed(2)}ms)`);
    }
    if (renderTime > 33.33) { // More than 30fps threshold
      console.warn(`Slow render detected: ${renderTime.toFixed(2)}ms`);
    }
  }, [enabled]);

  // Performance monitoring loop
  useEffect(() => {
    if (!enabled) return;

    const loop = () => {
      measureRender();
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [enabled, measureRender]);

  const getMetrics = useCallback(() => ({ ...metricsRef.current }), []);

  const logMetrics = useCallback(() => {
    if (!enabled) return;
    console.table(getMetrics());
  }, [enabled, getMetrics]);

  return {
    getMetrics,
    logMetrics,
    measureRender
  };
};
