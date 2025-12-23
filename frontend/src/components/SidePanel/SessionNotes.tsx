import { useEffect, useRef, useState } from 'react';

const MAX_CHARACTERS = 2000;

interface SessionNotesProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export function SessionNotes({ value, onChange, disabled = false }: SessionNotesProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [localValue, setLocalValue] = useState(value);
    const characterCount = localValue.length;
    const isNearLimit = characterCount > MAX_CHARACTERS * 0.9; // Warn at 90%
    const isAtLimit = characterCount >= MAX_CHARACTERS;

    // Sync local value with prop value when it changes externally
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Auto-resize textarea based on content
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [localValue]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;

        // Enforce character limit
        if (newValue.length > MAX_CHARACTERS) {
            return;
        }

        setLocalValue(newValue);
        onChange(newValue); // Parent handles debounce
    };

    return (
        <div className="flex flex-col gap-2">
            <textarea
                ref={textareaRef}
                value={localValue}
                onChange={handleChange}
                disabled={disabled}
                placeholder="Notes for the AI to remember..."
                maxLength={MAX_CHARACTERS}
                className="
          w-full
          min-h-[80px]
          max-h-[300px]
          bg-[#0a0a0a]
          border border-gray-800
          rounded-lg
          px-3 py-3
          text-sm text-gray-200
          placeholder-gray-600
          resize-none
          overflow-y-auto
          focus:outline-none
          focus:border-gray-700
          focus:ring-1
          focus:ring-gray-700
          disabled:opacity-50
          disabled:cursor-not-allowed
          transition-colors
        "
                style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#2a2a2a #0a0a0a'
                }}
            />
            <div className="flex items-center justify-between text-xs">
                <p className="text-gray-600">
                    Notes are injected into the AI's context and auto-save after you stop typing.
                </p>
                <p className={`font-mono ${isAtLimit ? 'text-red-500' : isNearLimit ? 'text-yellow-500' : 'text-gray-600'}`}>
                    {characterCount}/{MAX_CHARACTERS}
                </p>
            </div>
        </div>
    );
}

