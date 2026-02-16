import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import { useAPIConfig } from '../../contexts/APIConfigContext';
import { useSettings } from '../../contexts/SettingsContext';
import { DEFAULT_GENERATION_SETTINGS } from '../../types/api';
import { debounce } from '../../utils/performance';

interface SamplerSettingsPanelProps {
  onClose: () => void;
}

// --- Interpolation helpers ---

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function inverseLerp(a: number, b: number, v: number): number {
  if (a === b) return 0;
  return Math.max(0, Math.min(1, (v - a) / (b - a)));
}

// --- Quick Tune slider mappings ---
// Each macro maps slider 0-100 to a set of underlying parameters.

interface SliderMapping {
  key: string;
  min: number;
  max: number;
  round?: boolean; // integer rounding (top_k)
}

const CREATIVITY_PARAMS: SliderMapping[] = [
  { key: 'temperature', min: 0.3, max: 1.5 },
  { key: 'top_p',       min: 0.7, max: 1.0 },
  { key: 'top_k',       min: 20,  max: 200, round: true },
];

const FOCUS_PARAMS: SliderMapping[] = [
  { key: 'typical', min: 0.8, max: 1.0 },
  { key: 'tfs',     min: 0.8, max: 1.0 },
  { key: 'min_p',   min: 0.15, max: 0.01 }, // inverted: narrow = high min_p
  { key: 'top_a',   min: 0.1,  max: 0.0 },  // inverted: narrow = more top_a
];

const REPETITION_PARAMS: SliderMapping[] = [
  { key: 'rep_pen',           min: 1.0,  max: 1.25 },
  { key: 'rep_pen_range',     min: 64,   max: 512, round: true },
  { key: 'presence_penalty',  min: 0.0,  max: 0.3 },
  { key: 'frequency_penalty', min: 0.0,  max: 0.2 },
];

function applySlider(mappings: SliderMapping[], value: number): Record<string, number> {
  const t = value / 100;
  const result: Record<string, number> = {};
  for (const m of mappings) {
    const v = lerp(m.min, m.max, t);
    result[m.key] = m.round ? Math.round(v) : parseFloat(v.toFixed(3));
  }
  return result;
}

function reverseSlider(mappings: SliderMapping[], settings: Record<string, number>): number | null {
  // Try to find a single slider value that produces all current param values.
  // If params are inconsistent (manually tweaked) or out of range, return null → "Custom".
  const ts: number[] = [];
  for (const m of mappings) {
    const current = settings[m.key];
    if (current === undefined) return null;

    // Reject values outside the slider's mapped range (handles inverted ranges too)
    const lo = Math.min(m.min, m.max);
    const hi = Math.max(m.min, m.max);
    const rangeTolerance = (hi - lo) * 0.05;
    if (current < lo - rangeTolerance || current > hi + rangeTolerance) return null;

    const t = inverseLerp(m.min, m.max, current);
    ts.push(t);
  }
  if (ts.length === 0) return null;

  const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
  const maxDeviation = Math.max(...ts.map(t => Math.abs(t - avg)));

  // If all params agree within tolerance, the slider position is valid
  if (maxDeviation < 0.08) return Math.round(avg * 100);
  return null; // Custom
}

// --- Macro Slider sub-component ---

const MacroSlider: React.FC<{
  label: string;
  lowLabel: string;
  highLabel: string;
  value: number | null; // null = Custom
  onChange: (value: number) => void;
}> = ({ label, lowLabel, highLabel, value, onChange }) => {
  const isCustom = value === null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-300">{label}</span>
        {isCustom && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-700 text-gray-400">Custom</span>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={isCustom ? 50 : value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className={`w-full h-1.5 rounded-full appearance-none cursor-pointer
          ${isCustom
            ? 'bg-stone-700 [&::-webkit-slider-thumb]:bg-stone-500'
            : 'bg-stone-700 [&::-webkit-slider-thumb]:bg-blue-400'
          }
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3.5
          [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:transition-colors
          [&::-moz-range-thumb]:w-3.5
          [&::-moz-range-thumb]:h-3.5
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0
          ${isCustom
            ? '[&::-moz-range-thumb]:bg-stone-500'
            : '[&::-moz-range-thumb]:bg-blue-400'
          }
        `}
      />
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
};

// --- Sub-components ---

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
}> = ({ label, value, onChange, min, max, tooltip }) => {
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleBlur = () => {
    let val = parseFloat(inputValue);
    if (isNaN(val)) {
      setInputValue(value.toString());
      return;
    }
    if (min !== undefined && val < min) val = min;
    if (max !== undefined && val > max) val = max;
    setInputValue(val.toString());
    onChange(val);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1" title={tooltip}>
        {label}
      </label>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        className="w-full px-2 py-1.5 bg-stone-950 border border-stone-700 rounded-lg
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
        className={`p-1 rounded ${isFirst ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-stone-700'}`}
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={onMoveDown}
        disabled={isLast}
        className={`p-1 rounded ${isLast ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-stone-700'}`}
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

// --- Main Panel ---

export function SamplerSettingsPanel({ onClose }: SamplerSettingsPanelProps) {
  const { apiConfig, activeApiId, setAPIConfig } = useAPIConfig();
  const { updateSettings } = useSettings();
  const d = DEFAULT_GENERATION_SETTINGS;

  // Create a stable debounced persist function
  const debouncedPersistRef = useRef(
    debounce((apiId: string, config: Record<string, unknown>) => {
      updateSettings({ apis: { [apiId]: config } } as Record<string, unknown>).catch((err: unknown) => {
        console.error('Failed to persist sampler settings:', err);
      });
    }, 1500)
  );

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
    presence_penalty: (gen?.presence_penalty as number) ?? d.presence_penalty!,
    frequency_penalty: (gen?.frequency_penalty as number) ?? d.frequency_penalty!,
    sampler_order: (gen?.sampler_order as number[]) ?? [...d.sampler_order!],
    dynatemp_enabled: (gen?.dynatemp_enabled as boolean) ?? false,
    dynatemp_min: (gen?.dynatemp_min as number) ?? 0.0,
    dynatemp_max: (gen?.dynatemp_max as number) ?? 2.0,
    dynatemp_exponent: (gen?.dynatemp_exponent as number) ?? d.dynatemp_exponent!,
    reasoning_model: (gen?.reasoning_model as boolean) ?? false
  });

  const [settings, setSettings] = useState(() =>
    buildSettings(apiConfig?.generation_settings as Record<string, unknown>)
  );

  // Sync when active API changes
  useEffect(() => {
    if (apiConfig?.generation_settings) {
      setSettings(buildSettings(apiConfig.generation_settings as Record<string, unknown>));
    }
  }, [apiConfig?.generation_settings]);

  // Two-phase write helper: updates both context and debounced persist
  const commitSettings = useCallback((newSettings: Record<string, unknown>) => {
    if (apiConfig) {
      setAPIConfig({ ...apiConfig, generation_settings: newSettings });
    }
    if (activeApiId && apiConfig) {
      debouncedPersistRef.current(activeApiId, { ...apiConfig, generation_settings: newSettings });
    }
  }, [apiConfig, activeApiId, setAPIConfig]);

  // Two-phase write: immediate context update + debounced persistence
  const handleSettingChange = useCallback((key: string, value: unknown) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      commitSettings(newSettings);
      return newSettings;
    });
  }, [commitSettings]);

  // Bulk setting change (for macro sliders and reasoning model toggle)
  const handleBulkSettingChange = useCallback((updates: Record<string, unknown>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      commitSettings(newSettings);
      return newSettings;
    });
  }, [commitSettings]);

  const handleMoveSampler = useCallback((index: number, direction: 'up' | 'down') => {
    setSettings(prev => {
      const newOrder = [...prev.sampler_order];
      if (direction === 'up' && index > 0) {
        [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
      } else if (direction === 'down' && index < newOrder.length - 1) {
        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      }
      const newSettings = { ...prev, sampler_order: newOrder };
      commitSettings(newSettings);
      return newSettings;
    });
  }, [commitSettings]);

  const handleResetSamplerOrder = useCallback(() => {
    handleSettingChange('sampler_order', [...RECOMMENDED_SAMPLER_ORDER]);
  }, [handleSettingChange]);

  // --- Quick Tune: derive slider positions from current settings ---
  const creativityValue = useMemo(
    () => reverseSlider(CREATIVITY_PARAMS, settings as unknown as Record<string, number>),
    [settings.temperature, settings.top_p, settings.top_k]
  );
  const focusValue = useMemo(
    () => reverseSlider(FOCUS_PARAMS, settings as unknown as Record<string, number>),
    [settings.typical, settings.tfs, settings.min_p, settings.top_a]
  );
  const repetitionValue = useMemo(
    () => reverseSlider(REPETITION_PARAMS, settings as unknown as Record<string, number>),
    [settings.rep_pen, settings.rep_pen_range, settings.presence_penalty, settings.frequency_penalty]
  );

  const handleCreativityChange = useCallback((val: number) => {
    handleBulkSettingChange(applySlider(CREATIVITY_PARAMS, val));
  }, [handleBulkSettingChange]);

  const handleFocusChange = useCallback((val: number) => {
    handleBulkSettingChange(applySlider(FOCUS_PARAMS, val));
  }, [handleBulkSettingChange]);

  const handleRepetitionChange = useCallback((val: number) => {
    handleBulkSettingChange(applySlider(REPETITION_PARAMS, val));
  }, [handleBulkSettingChange]);

  // No active API — show empty state
  if (!apiConfig || !activeApiId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-medium text-white">Generation Settings</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-gray-500">
            <p className="text-sm mb-2">No active API configured.</p>
            <a href="/settings" className="text-blue-400 hover:text-blue-300 text-sm underline">
              Go to Settings
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isDefaultSamplerOrder = JSON.stringify(settings.sampler_order) === JSON.stringify(RECOMMENDED_SAMPLER_ORDER);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-white truncate">Generation Settings</h3>
          <div className="text-xs text-gray-500 truncate">{apiConfig.name || 'Unnamed API'} &middot; {apiConfig.model || 'No model'}</div>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition-colors ml-2 flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Quick Tune */}
        <details open>
          <summary className="text-xs text-gray-400 uppercase tracking-wide cursor-pointer select-none mb-3 hover:text-gray-300">
            Quick Tune
          </summary>
          <div className="space-y-4 bg-stone-900/50 rounded-lg p-3 border border-stone-800">
            <MacroSlider
              label="Creativity"
              lowLabel="Low"
              highLabel="High"
              value={creativityValue}
              onChange={handleCreativityChange}
            />
            <MacroSlider
              label="Focus"
              lowLabel="Narrow"
              highLabel="Broad"
              value={focusValue}
              onChange={handleFocusChange}
            />
            <MacroSlider
              label="Repetition Control"
              lowLabel="Lenient"
              highLabel="Strict"
              value={repetitionValue}
              onChange={handleRepetitionChange}
            />
          </div>
        </details>

        {/* Basic Parameters */}
        <details open>
          <summary className="text-xs text-gray-400 uppercase tracking-wide cursor-pointer select-none mb-3 hover:text-gray-300">
            Basic Parameters
          </summary>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Max Length"
              value={settings.max_length}
              onChange={val => handleSettingChange('max_length', val)}
              min={1}
              max={settings.reasoning_model ? 16384 : 512}
              tooltip="Maximum number of tokens to generate"
            />
            <NumberField
              label="Max Context"
              value={settings.max_context_length}
              onChange={val => handleSettingChange('max_context_length', val)}
              min={512}
              max={262144}
              tooltip="Maximum context window size"
            />
            <NumberField
              label="Temperature"
              value={settings.temperature}
              onChange={val => handleSettingChange('temperature', val)}
              min={0.0}
              max={5}
              tooltip="Controls randomness (higher = more random)"
            />
          </div>
          <div className="flex items-center mt-3">
            <input
              type="checkbox"
              id="sampler-reasoning-model"
              checked={settings.reasoning_model}
              onChange={(e) => {
                const isReasoning = e.target.checked;
                const updates: Record<string, unknown> = { reasoning_model: isReasoning };
                if (isReasoning && settings.max_length < 4096) {
                  updates.max_length = 4096;
                }
                handleBulkSettingChange(updates);
              }}
              className="mr-2 h-4 w-4 rounded bg-stone-700 border-stone-500 focus:ring-blue-500"
            />
            <label htmlFor="sampler-reasoning-model" className="text-xs text-gray-300">
              Reasoning Model
            </label>
            <span className="ml-1 text-xs text-gray-600">(strips thinking tags)</span>
          </div>
        </details>

        {/* Sampling Parameters */}
        <details>
          <summary className="text-xs text-gray-400 uppercase tracking-wide cursor-pointer select-none mb-3 hover:text-gray-300">
            Sampling Parameters
          </summary>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Top P"
              value={settings.top_p}
              onChange={val => handleSettingChange('top_p', val)}
              min={0} max={1}
              tooltip="Nucleus sampling - consider tokens with cumulative probability"
            />
            <NumberField
              label="Top K"
              value={settings.top_k}
              onChange={val => handleSettingChange('top_k', val)}
              min={0} max={200}
              tooltip="Consider only the top K most likely tokens"
            />
            <NumberField
              label="Top A"
              value={settings.top_a}
              onChange={val => handleSettingChange('top_a', val)}
              min={0} max={1}
              tooltip="Dynamic adaptation of the probability threshold"
            />
            <NumberField
              label="Typical"
              value={settings.typical}
              onChange={val => handleSettingChange('typical', val)}
              min={0} max={1}
              tooltip="Selects tokens that are typical in context"
            />
            <NumberField
              label="TFS"
              value={settings.tfs}
              onChange={val => handleSettingChange('tfs', val)}
              min={0} max={1}
              tooltip="Tail-free sampling parameter"
            />
            <NumberField
              label="Min P"
              value={settings.min_p}
              onChange={val => handleSettingChange('min_p', val)}
              min={0} max={1}
              tooltip="Minimum probability threshold for token selection"
            />
          </div>
        </details>

        {/* Repetition Control */}
        <details>
          <summary className="text-xs text-gray-400 uppercase tracking-wide cursor-pointer select-none mb-3 hover:text-gray-300">
            Repetition Control
          </summary>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Rep Penalty"
              value={settings.rep_pen}
              onChange={val => handleSettingChange('rep_pen', val)}
              min={1} max={3}
              tooltip="Higher values penalize repetition more strongly"
            />
            <NumberField
              label="Rep Pen Range"
              value={settings.rep_pen_range}
              onChange={val => handleSettingChange('rep_pen_range', val)}
              min={0} max={1024}
              tooltip="How many tokens back to apply repetition penalty"
            />
            <NumberField
              label="Rep Pen Slope"
              value={settings.rep_pen_slope}
              onChange={val => handleSettingChange('rep_pen_slope', val)}
              min={0} max={10}
              tooltip="Adjusts how penalty scales with distance"
            />
            <NumberField
              label="Presence Pen"
              value={settings.presence_penalty}
              onChange={val => handleSettingChange('presence_penalty', val)}
              min={-2} max={2}
              tooltip="Penalizes tokens that have appeared at all (OpenAI-style)"
            />
            <NumberField
              label="Frequency Pen"
              value={settings.frequency_penalty}
              onChange={val => handleSettingChange('frequency_penalty', val)}
              min={-2} max={2}
              tooltip="Penalizes tokens proportionally to how often they appeared (OpenAI-style)"
            />
          </div>
        </details>

        {/* Sampler Order */}
        <details>
          <summary className="text-xs text-gray-400 uppercase tracking-wide cursor-pointer select-none mb-3 hover:text-gray-300">
            Sampler Order
          </summary>
          <div className="space-y-2">
            {!isDefaultSamplerOrder && (
              <>
                <div className="flex justify-end">
                  <button
                    onClick={handleResetSamplerOrder}
                    className="text-xs px-2 py-1 bg-amber-900/50 text-amber-400 hover:bg-amber-900/70 rounded transition-colors"
                  >
                    Reset to Recommended
                  </button>
                </div>
                <div className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded px-3 py-2">
                  Non-default order. Recommended: Rep Pen, Top K, Top A, TFS, Typical, Top P, Temperature
                </div>
              </>
            )}
            <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto border border-stone-700 rounded-lg p-2 bg-stone-900">
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
        </details>

        {/* Dynamic Temperature */}
        <details>
          <summary className="text-xs text-gray-400 uppercase tracking-wide cursor-pointer select-none mb-3 hover:text-gray-300">
            Dynamic Temperature
          </summary>
          <div className="space-y-3">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="sampler-dynatemp-enabled"
                checked={settings.dynatemp_enabled}
                onChange={(e) => handleSettingChange('dynatemp_enabled', e.target.checked)}
                className="mr-2 h-4 w-4 rounded bg-stone-700 border-stone-500 focus:ring-blue-500"
              />
              <label htmlFor="sampler-dynatemp-enabled" className="text-xs text-gray-300">
                Enable Dynamic Temperature
              </label>
            </div>

            {settings.dynatemp_enabled && (
              <div className="grid grid-cols-2 gap-3 pl-4">
                <NumberField
                  label="Min Temp"
                  value={settings.dynatemp_min}
                  onChange={val => handleSettingChange('dynatemp_min', val)}
                  min={0.0} max={2.0}
                  tooltip="Minimum temperature value at the start of generation"
                />
                <NumberField
                  label="Max Temp"
                  value={settings.dynatemp_max}
                  onChange={val => handleSettingChange('dynatemp_max', val)}
                  min={0.0} max={2.0}
                  tooltip="Maximum temperature value at the end of generation"
                />
                <NumberField
                  label="Curve Exponent"
                  value={settings.dynatemp_exponent}
                  onChange={val => handleSettingChange('dynatemp_exponent', val)}
                  min={0.1} max={3.0}
                  tooltip="Curve steepness for temperature progression"
                />
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
