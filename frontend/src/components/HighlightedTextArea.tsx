import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

interface HighlightedTextAreaProps {
  className?: string;
  placeholder?: string;
  value?: string;
  onChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  readOnly?: boolean; // Add this line
  minHeight?: string;
}

const HighlightedTextArea = forwardRef<HTMLTextAreaElement, HighlightedTextAreaProps>(({
  value = '',
  onChange,
  className = '',
  placeholder = '',
  onKeyDown,
  readOnly = false, // Add this line and set a default value
  minHeight = '120px'
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use useImperativeHandle to expose the textareaRef to the parent component
  useImperativeHandle(ref, () => textareaRef.current!, [textareaRef]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    const container = containerRef.current;

    if (!textarea || !highlight || !container) return;

    // Sync scroll positions
    const syncScroll = () => {
      if (highlight) {
        highlight.scrollTop = textarea.scrollTop;
        highlight.scrollLeft = textarea.scrollLeft;
      }
    };

    // Sync sizes when container is resized
    const resizeObserver = new ResizeObserver(() => {
      if (container && textarea && highlight) {
        const height = container.offsetHeight;
        textarea.style.height = `${height}px`;
        highlight.style.height = `${height}px`;
      }
    });

    // Add event listeners
    textarea.addEventListener('scroll', syncScroll);
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      textarea.removeEventListener('scroll', syncScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const highlightSyntax = (text: string) => {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("([^"\\]|\\.)*")/g, '<span class="text-orange-200">$1</span>')
      .replace(/(\*[^*\n]+\*)/g, '<span class="text-blue-300">$1</span>')
      .replace(/(`[^`\n]+`)/g, '<span class="text-orange-300">$1</span>')
      .replace(/(\{\{[^}\n]+\}\})/g, '<span class="text-pink-300">$1</span>')
      .replace(/\n$/g, '\n\n');
  };

  const baseStyles = 'absolute inset-0 w-full h-full overflow-auto whitespace-pre-wrap p-3';

  return (
    <div
      ref={containerRef}
      className={`relative ${className} resize-y overflow-hidden`}
      style={{ minHeight }}
    >
      <div
        ref={highlightRef}
        aria-hidden="true"
        className={`${baseStyles} text-white pointer-events-none`}
        dangerouslySetInnerHTML={{
          __html: highlightSyntax(value || placeholder)
        }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        readOnly={readOnly} // Add this line
        spellCheck={false}
        className={`${baseStyles} bg-transparent text-transparent caret-white`}
      />
    </div>
  );
});

HighlightedTextArea.displayName = 'HighlightedTextArea'; // Optional: for better debugging

export default HighlightedTextArea;