import React from 'react';
import { usePerformance, usePerformanceAware } from '../contexts/PerformanceContext';
import { Monitor, Zap, ZapOff, Settings, BarChart3 } from 'lucide-react';

const PerformanceSettings: React.FC = () => {
  const { config, updateConfig, metrics, isHighPerformanceMode, toggleHighPerformanceMode } = usePerformance();
  const performanceAware = usePerformanceAware();
  const currentMetrics = metrics.getMetrics();

  return (
    <div className="bg-stone-900 text-gray-200 p-6 rounded-lg border border-stone-700">
      <div className="flex items-center gap-2 mb-6">
        <Monitor className="text-blue-400" size={20} />
        <h3 className="text-lg font-semibold">Performance Settings</h3>
      </div>

      {/* Performance Metrics */}
      <div className="mb-6 p-4 bg-stone-800 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="text-green-400" size={16} />
          <h4 className="font-medium">Current Performance</h4>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">FPS:</span>
            <span className={`ml-2 font-mono ${currentMetrics.fps >= 50 ? 'text-green-400' : currentMetrics.fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
              {currentMetrics.fps.toFixed(1)}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Render Time:</span>
            <span className={`ml-2 font-mono ${currentMetrics.averageRenderTime <= 16 ? 'text-green-400' : currentMetrics.averageRenderTime <= 33 ? 'text-yellow-400' : 'text-red-400'}`}>
              {currentMetrics.averageRenderTime.toFixed(1)}ms
            </span>
          </div>
          <div>
            <span className="text-gray-400">Total Renders:</span>
            <span className="ml-2 font-mono text-blue-400">{currentMetrics.totalRenders}</span>
          </div>
          <div>
            <span className="text-gray-400">Performance:</span>
            <span className={`ml-2 ${performanceAware.isPerformanceCritical() ? 'text-red-400' : 'text-green-400'}`}>
              {performanceAware.isPerformanceCritical() ? 'Critical' : 'Good'}
            </span>
          </div>
        </div>
      </div>

      {/* High Performance Mode Toggle */}
      <div className="mb-6 p-4 bg-stone-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isHighPerformanceMode ? (
              <Zap className="text-yellow-400" size={16} />
            ) : (
              <ZapOff className="text-gray-400" size={16} />
            )}
            <span className="font-medium">High Performance Mode</span>
          </div>
          <button
            onClick={toggleHighPerformanceMode}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              isHighPerformanceMode 
                ? 'bg-yellow-600 text-yellow-100 hover:bg-yellow-700' 
                : 'bg-gray-600 text-gray-200 hover:bg-gray-700'
            }`}
          >
            {isHighPerformanceMode ? 'Enabled' : 'Disabled'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Automatically optimizes settings for better performance when FPS drops below 45
        </p>
      </div>

      {/* Advanced Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="text-blue-400" size={16} />
          <h4 className="font-medium">Advanced Settings</h4>
        </div>

        {/* Virtual Scrolling */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">Virtual Scrolling</span>
            <p className="text-xs text-gray-400">Enable for large message lists</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.virtualScrolling.enabled}
              onChange={(e) => updateConfig({ 
                virtualScrolling: { ...config.virtualScrolling, enabled: e.target.checked }
              })}
              className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <input
              type="number"
              value={config.virtualScrolling.threshold}
              onChange={(e) => updateConfig({
                virtualScrolling: { ...config.virtualScrolling, threshold: parseInt(e.target.value) }
              })}
              className="w-16 px-2 py-1 text-xs bg-stone-700 border border-stone-600 rounded focus:border-blue-500"
              min="10"
              max="200"
              title="Messages threshold"
            />
          </div>
        </div>

        {/* Animations */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">Animations</span>
            <p className="text-xs text-gray-400">Smooth transitions and effects</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.animations.enabled && !config.animations.reducedMotion}
              onChange={(e) => updateConfig({ 
                animations: { ...config.animations, enabled: e.target.checked }
              })}
              disabled={config.animations.reducedMotion}
              className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
            />
            <input
              type="number"
              value={config.animations.duration}
              onChange={(e) => updateConfig({
                animations: { ...config.animations, duration: parseInt(e.target.value) }
              })}
              className="w-16 px-2 py-1 text-xs bg-stone-700 border border-stone-600 rounded focus:border-blue-500"
              min="50"
              max="500"
              step="25"
              title="Animation duration (ms)"
            />
          </div>
        </div>

        {/* GPU Acceleration */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">GPU Acceleration</span>
            <p className="text-xs text-gray-400">Use hardware acceleration for rendering</p>
          </div>
          <input
            type="checkbox"
            checked={config.rendering.enableGPUAcceleration}
            onChange={(e) => updateConfig({ 
              rendering: { ...config.rendering, enableGPUAcceleration: e.target.checked }
            })}
            className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
          />
        </div>

        {/* Content Containment */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">Content Containment</span>
            <p className="text-xs text-gray-400">Optimize layout calculations</p>
          </div>
          <input
            type="checkbox"
            checked={config.rendering.enableContentContainment}
            onChange={(e) => updateConfig({ 
              rendering: { ...config.rendering, enableContentContainment: e.target.checked }
            })}
            className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
          />
        </div>

        {/* Streaming Buffer Size */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">Stream Buffer Size</span>
            <p className="text-xs text-gray-400">Characters before flushing to UI</p>
          </div>
          <input
            type="number"
            value={config.streaming.bufferSize}
            onChange={(e) => updateConfig({
              streaming: { ...config.streaming, bufferSize: parseInt(e.target.value) }
            })}
            className="w-20 px-2 py-1 text-xs bg-stone-700 border border-stone-600 rounded focus:border-blue-500"
            min="10"
            max="200"
            step="10"
          />
        </div>

        {/* Flush Interval */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">Update Rate</span>
            <p className="text-xs text-gray-400">Milliseconds between UI updates</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={config.streaming.flushInterval}
              onChange={(e) => updateConfig({
                streaming: { ...config.streaming, flushInterval: parseInt(e.target.value) }
              })}
              className="w-16 px-2 py-1 text-xs bg-stone-700 border border-stone-600 rounded focus:border-blue-500"
              min="8"
              max="100"
              step="1"
            />
            <span className="text-xs text-gray-400">
              ({Math.round(1000 / config.streaming.flushInterval)}fps)
            </span>
          </div>
        </div>
      </div>

      {/* Performance Tips */}
      {performanceAware.isPerformanceCritical() && (
        <div className="mt-6 p-4 bg-red-900/20 border border-red-800 rounded-lg">
          <h4 className="text-red-400 font-medium mb-2">Performance Tips</h4>
          <ul className="text-xs text-red-300 space-y-1">
            <li>• Enable High Performance Mode for better FPS</li>
            <li>• Close other browser tabs to free up memory</li>
            <li>• Disable animations if experiencing lag</li>
            <li>• Use virtual scrolling for long conversations</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default PerformanceSettings;
