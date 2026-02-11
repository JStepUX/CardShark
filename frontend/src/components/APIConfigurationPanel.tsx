// components/APIConfigurationPanel.tsx
// Component for displaying and updating API configuration settings
import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Sliders } from 'lucide-react';
import { APIConfig, DEFAULT_GENERATION_SETTINGS } from '../types/api';

interface APIConfigurationPanelProps {
  config: APIConfig;
  onUpdate: (updates: Partial<APIConfig>) => void;
}

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  width?: string;
}> = ({ label, value, onChange, min, max, tooltip, width = 'w-32' }) => {
  // Add local state to track input value as string
  const [inputValue, setInputValue] = useState(value.toString());

  // Update local input value when external value changes
  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  // Handle blur event for validation
  const handleBlur = () => {
    let val = parseFloat(inputValue);

    // If input is invalid, reset to previous valid value
    if (isNaN(val)) {
      setInputValue(value.toString());
      return;
    }

    // Apply min/max constraints
    if (min !== undefined && val < min) val = min;
    if (max !== undefined && val > max) val = max;

    // Update both local input and parent state
    setInputValue(val.toString());
    onChange(val);
  };

  return (
    <div className={`${width}`}>
      <label className="block text-sm font-medium text-gray-300 mb-1" title={tooltip}>
        {label}
      </label>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        className="w-full px-3 py-1.5 bg-stone-950 border border-stone-700 rounded-lg 
                  focus:ring-1 focus:ring-blue-500 text-sm"
      />
    </div>
  );
};

const SamplerOrderItem: React.FC<{
  sampler: { id: number; label: string };
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = ({ sampler, index, isFirst, isLast, onMoveUp, onMoveDown }) => (
  <div className="flex items-center justify-between p-2 bg-stone-800 rounded-lg">
    <span className="text-sm flex-1">{sampler.label}</span>
    <span className="text-xs text-gray-500 mr-4">Order: {index + 1}</span>
    <div className="flex gap-1">
      <button
        onClick={onMoveUp}
        disabled={isFirst}
        className={`p-1 rounded ${isFirst ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-stone-700'
          }`}
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={onMoveDown}
        disabled={isLast}
        className={`p-1 rounded ${isLast ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-stone-700'
          }`}
      >
        <ChevronDown size={16} />
      </button>
    </div>
  </div>
);

// KoboldCPP sampler IDs — verified against KoboldCPP source (sampling.cpp)
const SAMPLER_ORDER_OPTIONS = [
  { id: 0, label: 'Top K' },
  { id: 1, label: 'Top A' },
  { id: 2, label: 'Top P' },
  { id: 3, label: 'TFS' },
  { id: 4, label: 'Typical' },
  { id: 5, label: 'Temperature' },
  { id: 6, label: 'Repetition Penalty' }
];

const RECOMMENDED_SAMPLER_ORDER = [6, 0, 1, 3, 4, 2, 5];

const APIConfigurationPanel: React.FC<APIConfigurationPanelProps> = ({ config, onUpdate }) => {
  const [expanded, setExpanded] = useState(true); // Set initial state to true
  const d = DEFAULT_GENERATION_SETTINGS;

  const buildSettings = (gen?: Record<string, unknown>) => ({
    max_length: (gen?.max_length as number) ?? d.max_length!,
    max_context_length: (gen?.max_context_length as number) ?? d.max_context_length!,
    temperature: (gen?.temperature as number) ?? d.temperature!,
    top_p: (gen?.top_p as number) ?? d.top_p!,
    top_k: (gen?.top_k as number) ?? d.top_k!,
    top_a: (gen?.top_a as number) ?? d.top_a!,
    typical: (gen?.typical as number) ?? d.typical!,
    tfs: (gen?.tfs as number) ?? d.tfs!,
    min_p: (gen?.min_p as number) ?? d.min_p!,
    rep_pen: (gen?.rep_pen as number) ?? d.rep_pen!,
    rep_pen_range: (gen?.rep_pen_range as number) ?? d.rep_pen_range!,
    rep_pen_slope: (gen?.rep_pen_slope as number) ?? d.rep_pen_slope!,
    sampler_order: (gen?.sampler_order as number[]) ?? [...d.sampler_order!],
    dynatemp_enabled: (gen?.dynatemp_enabled as boolean) ?? false,
    dynatemp_min: (gen?.dynatemp_min as number) ?? 0.0,
    dynatemp_max: (gen?.dynatemp_max as number) ?? 2.0,
    dynatemp_exponent: (gen?.dynatemp_exponent as number) ?? d.dynatemp_exponent!,
    reasoning_model: (gen?.reasoning_model as boolean) ?? false
  });

  const [settings, setSettings] = useState(buildSettings(config.generation_settings as Record<string, unknown>));

  useEffect(() => {
    if (config.generation_settings) {
      setSettings(buildSettings(config.generation_settings as Record<string, unknown>));
    }
  }, [config.generation_settings]);

  const handleSettingChange = (key: keyof typeof settings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onUpdate({ generation_settings: newSettings });
  };

  const handleMoveSampler = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...settings.sampler_order];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    const newSettings = { ...settings, sampler_order: newOrder };
    setSettings(newSettings);
    onUpdate({ generation_settings: newSettings });
  };

  const handleResetSamplerOrder = () => {
    const newSettings = { ...settings, sampler_order: [...RECOMMENDED_SAMPLER_ORDER] };
    setSettings(newSettings);
    onUpdate({ generation_settings: newSettings });
  };

  const isDefaultSamplerOrder = JSON.stringify(settings.sampler_order) === JSON.stringify(RECOMMENDED_SAMPLER_ORDER);

  return (
    <div className="space-y-4 mt-4 border-t border-stone-800 pt-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-gray-300 hover:text-white py-2"
        >
          <Sliders size={18} />
          <span className="text-md font-medium">Generation Settings</span>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      <div className={`space-y-6 pt-2 transition-expand ${expanded ? 'expanded' : ''}`}>
        {/* Basic Settings */}
        <div className="space-y-4">
          <h4 className="text-sm text-gray-400">Basic Parameters</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NumberField
              label="Max Length"
              value={settings.max_length}
              onChange={val => handleSettingChange('max_length', val)}
              min={1}
              max={settings.reasoning_model ? 16384 : 512}
              step={1}
              tooltip="Maximum number of tokens to generate"
              width="w-full"
            />
            <NumberField
              label="Max Context Length"
              value={settings.max_context_length}
              onChange={val => handleSettingChange('max_context_length', val)}
              min={512}
              max={262144}
              step={128}
              tooltip="Maximum context window size"
              width="w-full"
            />
            <NumberField
              label="Temperature"
              value={settings.temperature}
              onChange={val => handleSettingChange('temperature', val)}
              min={0.0}
              max={2}
              step={0.05}
              tooltip="Controls randomness (higher = more random)"
              width="w-full"
            />
          </div>
          <div className="flex items-center mt-2">
            <input
              type="checkbox"
              id="reasoning-model"
              checked={settings.reasoning_model}
              onChange={(e) => {
                const isReasoning = e.target.checked;
                const updates: Partial<typeof settings> = { reasoning_model: isReasoning };
                if (isReasoning && settings.max_length < 4096) {
                  updates.max_length = 4096;
                }
                const newSettings = { ...settings, ...updates };
                setSettings(newSettings);
                onUpdate({ generation_settings: newSettings });
              }}
              className="mr-2 h-4 w-4 rounded bg-stone-700 border-stone-500 focus:ring-blue-500"
            />
            <label htmlFor="reasoning-model" className="text-sm font-medium text-gray-300">
              Reasoning Model
            </label>
            <span className="ml-2 text-xs text-gray-500">(strips thinking tags, raises token budget)</span>
          </div>
        </div>

        {/* Sampling Parameters */}
        <div className="space-y-4">
          <h4 className="text-sm text-gray-400">Sampling Parameters</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NumberField
              label="Top P"
              value={settings.top_p}
              onChange={val => handleSettingChange('top_p', val)}
              min={0}
              max={1}
              step={0.01}
              tooltip="Nucleus sampling - consider tokens with cumulative probability"
              width="w-full"
            />
            <NumberField
              label="Top K"
              value={settings.top_k}
              onChange={val => handleSettingChange('top_k', val)}
              min={0}
              max={200}
              step={1}
              tooltip="Consider only the top K most likely tokens"
              width="w-full"
            />
            <NumberField
              label="Top A"
              value={settings.top_a}
              onChange={val => handleSettingChange('top_a', val)}
              min={0}
              max={1}
              step={0.01}
              tooltip="Dynamic adaptation of the probability threshold"
              width="w-full"
            />
            <NumberField
              label="Typical"
              value={settings.typical}
              onChange={val => handleSettingChange('typical', val)}
              min={0}
              max={1}
              step={0.01}
              tooltip="Selects tokens that are typical in context"
              width="w-full"
            />
            <NumberField
              label="TFS"
              value={settings.tfs}
              onChange={val => handleSettingChange('tfs', val)}
              min={0}
              max={1}
              step={0.01}
              tooltip="Tail-free sampling parameter"
              width="w-full"
            />
            <NumberField
              label="Min P"
              value={settings.min_p}
              onChange={val => handleSettingChange('min_p', val)}
              min={0}
              max={1}
              step={0.01}
              tooltip="Minimum probability threshold for token selection"
              width="w-full"
            />
          </div>
        </div>

        {/* Repetition Control */}
        <div className="space-y-4">
          <h4 className="text-sm text-gray-400">Repetition Control</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NumberField
              label="Repetition Penalty"
              value={settings.rep_pen}
              onChange={val => handleSettingChange('rep_pen', val)}
              min={1}
              max={3}
              step={0.01}
              tooltip="Higher values penalize repetition more strongly"
              width="w-full"
            />
            <NumberField
              label="Rep Pen Range"
              value={settings.rep_pen_range}
              onChange={val => handleSettingChange('rep_pen_range', val)}
              min={0}
              max={1024}
              step={8}
              tooltip="How many tokens back to apply repetition penalty"
              width="w-full"
            />
            <NumberField
              label="Rep Pen Slope"
              value={settings.rep_pen_slope}
              onChange={val => handleSettingChange('rep_pen_slope', val)}
              min={0}
              max={10}
              step={0.1}
              tooltip="Adjusts how penalty scales with distance"
              width="w-full"
            />
          </div>
        </div>

        {/* Sampler Order */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm text-gray-400">Sampler Order</h4>
            {!isDefaultSamplerOrder && (
              <button
                onClick={handleResetSamplerOrder}
                className="text-xs px-2 py-1 bg-amber-900/50 text-amber-400 hover:bg-amber-900/70 rounded transition-colors"
              >
                Reset to Recommended
              </button>
            )}
          </div>
          {!isDefaultSamplerOrder && (
            <div className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded px-3 py-2">
              Non-default sampler order. Recommended: Rep Pen, Top K, Top A, TFS, Typical, Top P, Temperature
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto border border-stone-700 rounded-lg p-3 bg-stone-900">
            {settings.sampler_order.map((samplerId: number, index: number) => {
              const sampler = SAMPLER_ORDER_OPTIONS.find(s => s.id === samplerId);
              if (!sampler) return null;
              return (
                <SamplerOrderItem
                  key={index}
                  sampler={sampler}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === settings.sampler_order.length - 1}
                  onMoveUp={() => handleMoveSampler(index, 'up')}
                  onMoveDown={() => handleMoveSampler(index, 'down')}
                />
              );
            })}
          </div>
        </div>

        {/* DynaTemp Settings */}
        <div className="space-y-4">
          <h4 className="text-sm text-gray-400">Dynamic Temperature Settings</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="dynatemp-enabled"
                checked={settings.dynatemp_enabled}
                onChange={(e) => handleSettingChange('dynatemp_enabled', e.target.checked)}
                className="mr-2 h-4 w-4 rounded bg-stone-700 border-stone-500 focus:ring-blue-500"
              />
              <label htmlFor="dynatemp-enabled" className="text-sm font-medium text-gray-300">
                Enable Dynamic Temperature
              </label>
            </div>
          </div>

          {settings.dynatemp_enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pl-6">
              <NumberField
                label="Min Temperature"
                value={settings.dynatemp_min}
                onChange={val => handleSettingChange('dynatemp_min', val)}
                min={0.0}
                max={2.0}
                step={0.05}
                tooltip="Minimum temperature value at the start of generation"
                width="w-full"
              />
              <NumberField
                label="Max Temperature"
                value={settings.dynatemp_max}
                onChange={val => handleSettingChange('dynatemp_max', val)}
                min={0.0}
                max={2.0}
                step={0.05}
                tooltip="Maximum temperature value at the end of generation"
                width="w-full"
              />
              <NumberField
                label="Curve Exponent"
                value={settings.dynatemp_exponent}
                onChange={val => handleSettingChange('dynatemp_exponent', val)}
                min={0.1}
                max={3.0}
                step={0.1}
                tooltip="Curve steepness for temperature progression (higher = steeper curve)"
                width="w-full"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default APIConfigurationPanel;