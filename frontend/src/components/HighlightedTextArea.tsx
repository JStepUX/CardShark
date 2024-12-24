import React, { memo } from 'react';

interface HighlightedTextAreaProps {
  className?: string;
  placeholder?: string;
  value?: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}

const HighlightedTextArea = memo(({ value, onChange, className, placeholder }: HighlightedTextAreaProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const highlightSyntax = (text: string) => {
    return text
      .replace(/(".*?")/g, '<span class="text-green-300">$1</span>')
      .replace(/(\*.*?\*)/g, '<span class="text-blue-300">$1</span>')
      .replace(/(\{\{.*?\}\})/g, '<span class="text-pink-300">$1</span>');
  };

  return (
    <div className="relative w-full">
      <textarea
        value={value}
        onChange={handleChange}
        className={`${className} relative z-10 bg-transparent text-white`}
        placeholder={placeholder}
        spellCheck={false}
      />
      <div 
        aria-hidden="true"
        className={`${className} absolute top-0 left-0 pointer-events-none whitespace-pre-wrap`}
        dangerouslySetInnerHTML={{ __html: highlightSyntax(value || '') }}
      />
    </div>
  );
});

export default HighlightedTextArea;