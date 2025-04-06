// frontend/src/components/HighlightingSettings.tsx
import React from 'react';
import { SyntaxHighlightSettings, DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS } from '../types/settings';

interface HighlightingSettingsProps {
  settings: SyntaxHighlightSettings;
  onUpdate: (settings: SyntaxHighlightSettings) => void;
}

// Color picker input with label
const ColorInput: React.FC<{
  label: string;
  color: string;
  onChange: (color: string) => void;
}> = ({ label, color, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <label className="text-sm text-gray-300">{label}</label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer"
      />
      <span className="text-sm text-gray-400">{color}</span>
    </div>
  </div>
);

const HighlightingSettings: React.FC<HighlightingSettingsProps> = ({
  settings = DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS,
  onUpdate
}) => {
  // Get settings with defaults for any missing values
  const highlightSettings = {
    ...DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS,
    ...(settings || {})
  };

  // Helper to update a specific syntax type setting
  const updateSyntaxSetting = (
    syntaxType: keyof SyntaxHighlightSettings,
    property: 'textColor' | 'backgroundColor',
    value: string
  ) => {
    onUpdate({
      ...highlightSettings,
      [syntaxType]: {
        ...highlightSettings[syntaxType],
        [property]: value
      }
    });
  };

  return (
    <div className="p-6">
      <h3 className="text-md font-medium mb-4">Markdown Syntax Highlighting</h3>
      <p className="text-sm text-gray-400 mb-6">
        Customize the colors used for markdown syntax highlighting in text editors.
      </p>

      <div className="space-y-8">
        {/* Bold Syntax */}
        <div className="bg-zinc-800/50 p-4 rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Bold Text <span className="text-gray-400">(**text**)</span></h4>
          <div className="space-y-3">
            <ColorInput
              label="Text Color"
              color={highlightSettings.bold.textColor}
              onChange={(color) => updateSyntaxSetting('bold', 'textColor', color)}
            />
            <ColorInput
              label="Background Color"
              color={highlightSettings.bold.backgroundColor}
              onChange={(color) => updateSyntaxSetting('bold', 'backgroundColor', color)}
            />
            <div className="mt-2 p-3 bg-zinc-900 rounded">
              <div style={{
                color: highlightSettings.bold.textColor,
                backgroundColor: highlightSettings.bold.backgroundColor === 'transparent' ? undefined : highlightSettings.bold.backgroundColor,
                fontWeight: 'bold'
              }}>
                **Bold Text Example**
              </div>
            </div>
          </div>
        </div>

        {/* Italic Syntax */}
        <div className="bg-zinc-800/50 p-4 rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Italic Text <span className="text-gray-400">(*text*)</span></h4>
          <div className="space-y-3">
            <ColorInput
              label="Text Color"
              color={highlightSettings.italic.textColor}
              onChange={(color) => updateSyntaxSetting('italic', 'textColor', color)}
            />
            <ColorInput
              label="Background Color"
              color={highlightSettings.italic.backgroundColor}
              onChange={(color) => updateSyntaxSetting('italic', 'backgroundColor', color)}
            />
            <div className="mt-2 p-3 bg-zinc-900 rounded">
              <div style={{
                color: highlightSettings.italic.textColor,
                backgroundColor: highlightSettings.italic.backgroundColor === 'transparent' ? undefined : highlightSettings.italic.backgroundColor,
                fontStyle: 'italic'
              }}>
                *Italic Text Example*
              </div>
            </div>
          </div>
        </div>

        {/* Code Syntax */}
        <div className="bg-zinc-800/50 p-4 rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Code Text <span className="text-gray-400">(`text`)</span></h4>
          <div className="space-y-3">
            <ColorInput
              label="Text Color"
              color={highlightSettings.code.textColor}
              onChange={(color) => updateSyntaxSetting('code', 'textColor', color)}
            />
            <ColorInput
              label="Background Color"
              color={highlightSettings.code.backgroundColor}
              onChange={(color) => updateSyntaxSetting('code', 'backgroundColor', color)}
            />
            <div className="mt-2 p-3 bg-zinc-900 rounded">
              <div style={{
                color: highlightSettings.code.textColor,
                backgroundColor: highlightSettings.code.backgroundColor === 'transparent' ? undefined : highlightSettings.code.backgroundColor,
                fontFamily: 'monospace',
                padding: '0.125rem 0.25rem',
                borderRadius: '0.25rem',
                display: 'inline-block'
              }}>
                `Code Text Example`
              </div>
            </div>
          </div>
        </div>

        {/* Quote Syntax */}
        <div className="bg-zinc-800/50 p-4 rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Quote Text <span className="text-gray-400">("text")</span></h4>
          <div className="space-y-3">
            <ColorInput
              label="Text Color"
              color={highlightSettings.quote.textColor}
              onChange={(color) => updateSyntaxSetting('quote', 'textColor', color)}
            />
            <ColorInput
              label="Background Color"
              color={highlightSettings.quote.backgroundColor}
              onChange={(color) => updateSyntaxSetting('quote', 'backgroundColor', color)}
            />
            <div className="mt-2 p-3 bg-zinc-900 rounded">
              <div style={{
                color: highlightSettings.quote.textColor,
                backgroundColor: highlightSettings.quote.backgroundColor === 'transparent' ? undefined : highlightSettings.quote.backgroundColor,
              }}>
                "Quote Text Example"
              </div>
            </div>
          </div>
        </div>

        {/* Variable Syntax */}
        <div className="bg-zinc-800/50 p-4 rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Variable Text <span className="text-gray-400">{'({{var}})'}</span></h4>
          <div className="space-y-3">
            <ColorInput
              label="Text Color"
              color={highlightSettings.variable.textColor}
              onChange={(color) => updateSyntaxSetting('variable', 'textColor', color)}
            />
            <ColorInput
              label="Background Color"
              color={highlightSettings.variable.backgroundColor}
              onChange={(color) => updateSyntaxSetting('variable', 'backgroundColor', color)}
            />
            <div className="mt-2 p-3 bg-zinc-900 rounded">
              <div style={{
                color: highlightSettings.variable.textColor,
                backgroundColor: highlightSettings.variable.backgroundColor === 'transparent' ? undefined : highlightSettings.variable.backgroundColor,
                borderRadius: '0.25rem',
                padding: '0 0.25rem',
                display: 'inline-block'
              }}>
                {'{{variable}} Example'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HighlightingSettings;