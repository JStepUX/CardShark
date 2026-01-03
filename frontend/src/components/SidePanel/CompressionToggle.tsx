import { Info } from 'lucide-react';
import { useState } from 'react';

interface CompressionToggleProps {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    disabled?: boolean;
}

export function CompressionToggle({ enabled, onToggle, disabled = false }: CompressionToggleProps) {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <label
                        htmlFor="compression-toggle"
                        className="text-sm text-gray-300 cursor-pointer"
                    >
                        Compress old messages
                    </label>
                    <div
                        className="relative"
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                    >
                        <Info className="w-4 h-4 text-gray-500 hover:text-gray-400 transition-colors cursor-help" />
                        {showTooltip && (
                            <div className="absolute right-0 bottom-6 z-50 w-64 bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 shadow-lg">
                                When enabled, older messages are summarized to help the AI focus on recent events.
                                If {'{{char}}'} is forgetting vital information, save those points as notes.
                            </div>
                        )}
                    </div>
                </div>

                {/* Toggle Switch */}
                <button
                    id="compression-toggle"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => !disabled && onToggle(!enabled)}
                    disabled={disabled}
                    className={`
            relative inline-flex h-6 w-11 items-center rounded-full
            transition-colors duration-200 ease-in-out
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#1a1a1a]
            ${enabled ? 'bg-blue-600' : 'bg-stone-700'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
                >
                    <span
                        className={`
              inline-block h-4 w-4 transform rounded-full bg-white
              transition-transform duration-200 ease-in-out
              ${enabled ? 'translate-x-6' : 'translate-x-1'}
            `}
                    />
                </button>
            </div>

            {/* Helper text */}
            <p className="text-xs text-gray-600">
                {enabled
                    ? 'Old messages will be compressed before sending to the API.'
                    : 'All messages will be sent verbatim (up to context limit).'}
            </p>
        </div>
    );
}
