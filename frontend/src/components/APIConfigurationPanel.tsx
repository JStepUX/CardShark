import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Sliders } from 'lucide-react';
import { APIConfig } from '../types/api';

interface APIConfigurationPanelProps {
  config: APIConfig;
  onUpdate: (updates: Partial<APIConfig>) => void;
}

// Numeric input field with validation
const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  width?: string;
}> = ({ label, value, onChange, min, max, step = 0.01, tooltip, width = 'w-32' }) => (
  <div className={`${width}`}>
    <label className="block text-sm font-medium text-gray-300 mb-1" title={tooltip}>
      {label}
    </label>
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && (min === undefined || val >= min) && (max === undefined || val <= max)) {
          onChange(val);
        }
      }}
      min={min}
      max={max}
      step={step}
      className="w-full px-3 py-1.5 bg-stone-950 border border-stone-700 rounded-lg 
                focus:ring-1 focus:ring-blue-500 text-sm"
    />
  </div>
);

// Sampler order item with up/down controls
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
        className={`p-1 rounded ${
          isFirst ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-gray-700'
        }`}
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={onMoveDown}
        disabled={isLast}
        className={`p-1 rounded ${
          isLast ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-gray-700'
        }`}
      >
        <ChevronDown size={16} />
      </button>
    </div>
  </div>
);

const SAMPLER_ORDER_OPTIONS = [
  { id: 6, label: 'Repetition Penalty' },
  { id: 0, label: 'Temperature' },
  { id: 1, label: 'Top K' },
  { id: 3, label: 'Top P' },
  { id: 4, label: 'TFS' },
  { id: 2, label: 'Top A' },
  { id: 5, label: 'Typical' }
];

const APIConfigurationPanel: React.FC<APIConfigurationPanelProps> = ({
  config,
  onUpdate
}) => {
  const [settings, setSettings] = useState({
    max_length: config.generation_settings?.max_length ?? 220,
    max_context_length: config.generation_settings?.max_context_length ?? 6144,
    temperature: config.generation_settings?.temperature ?? 1.05,
    top_p: config.generation_settings?.top_p ?? 0.92,
    top_k: config.generation_settings?.top_k ?? 100,
    top_a: config.generation_settings?.top_a ?? 0,
    typical: config.generation_settings?.typical ?? 1,
    tfs: config.generation_settings?.tfs ?? 1,
    rep_pen: config.generation_settings?.rep_pen ?? 1.07,
    rep_pen_range: config.generation_settings?.rep_pen_range ?? 360,
    rep_pen_slope: config.generation_settings?.rep_pen_slope ?? 0.7,
    sampler_order: config.generation_settings?.sampler_order ?? [6, 0, 1, 3, 4, 2, 5]
  });

  // Handle settings update
  const handleSettingChange = (key: keyof typeof settings, value: number) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onUpdate({ generation_settings: newSettings });
  };

  // Handle sampler order changes
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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-gray-300">
        <Sliders size={20} />
        <h3 className="text-lg font-medium">Generation Settings</h3>
      </div>

      {/* Context Settings */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400">Context Settings</h4>
        <div className="flex flex-wrap gap-4">
          <NumberField
            label="Response Length"
            value={settings.max_length}
            onChange={(v) => handleSettingChange('max_length', v)}
            min={1}
            max={512}
            step={1}
            tooltip="Number of tokens to generate"
          />
          <NumberField
            label="Max Context Length"
            value={settings.max_context_length}
            onChange={(v) => handleSettingChange('max_context_length', v)}
            min={1}
            max={8192}
            step={1}
            tooltip="Maximum number of tokens to send to model"
            width="w-40"
          />
        </div>
      </div>

      {/* Primary Sampling */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400">Primary Sampling</h4>
        <div className="flex flex-wrap gap-4">
          <NumberField
            label="Temperature"
            value={settings.temperature}
            onChange={(v) => handleSettingChange('temperature', v)}
            min={0}
            max={2}
            tooltip="Higher = more random, lower = more focused"
          />
          <NumberField
            label="Top P"
            value={settings.top_p}
            onChange={(v) => handleSettingChange('top_p', v)}
            min={0}
            max={1}
            tooltip="Nucleus sampling threshold"
          />
          <NumberField
            label="Top K"
            value={settings.top_k}
            onChange={(v) => handleSettingChange('top_k', v)}
            min={0}
            max={200}
            step={1}
            tooltip="Number of tokens to consider"
          />
        </div>
      </div>

      {/* Repetition Control */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400">Repetition Control</h4>
        <div className="flex flex-wrap gap-4">
          <NumberField
            label="Rep Penalty"
            value={settings.rep_pen}
            onChange={(v) => handleSettingChange('rep_pen', v)}
            min={1}
            max={3}
            tooltip="How strongly to penalize repetitions"
          />
          <NumberField
            label="Rep Range"
            value={settings.rep_pen_range}
            onChange={(v) => handleSettingChange('rep_pen_range', v)}
            min={0}
            max={2048}
            step={1}
            tooltip="How far back to look for repetitions"
          />
          <NumberField
            label="Rep Slope"
            value={settings.rep_pen_slope}
            onChange={(v) => handleSettingChange('rep_pen_slope', v)}
            min={0}
            max={10}
            tooltip="How quickly the penalty falls off"
          />
        </div>
      </div>

      {/* Advanced Sampling */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400">Advanced Sampling</h4>
        <div className="flex flex-wrap gap-4">
          <NumberField
            label="Top A"
            value={settings.top_a}
            onChange={(v) => handleSettingChange('top_a', v)}
            min={0}
            max={1}
            tooltip="Advanced sampling threshold"
          />
          <NumberField
            label="Typical"
            value={settings.typical}
            onChange={(v) => handleSettingChange('typical', v)}
            min={0}
            max={1}
            tooltip="Typical sampling threshold"
          />
          <NumberField
            label="TFS"
            value={settings.tfs}
            onChange={(v) => handleSettingChange('tfs', v)}
            min={0}
            max={1}
            tooltip="Tail-free sampling"
          />
        </div>
      </div>

      {/* Sampler Order */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400">Sampler Order</h4>
        <div className="space-y-1 max-w-md">
          {settings.sampler_order.map((samplerId, index) => {
            const sampler = SAMPLER_ORDER_OPTIONS.find(s => s.id === samplerId);
            if (!sampler) return null;
            return (
              <SamplerOrderItem
                key={sampler.id}
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
    </div>
  );
};

export default APIConfigurationPanel;