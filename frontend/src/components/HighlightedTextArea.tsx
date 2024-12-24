import { useRef, useEffect } from 'react';

interface HighlightedTextAreaProps {
  className?: string;
  placeholder?: string;
  value?: string;
  onChange: (value: string) => void;
}

const HighlightedTextArea = ({ 
  value = '', 
  onChange, 
  className = '', 
  placeholder = ''
}: HighlightedTextAreaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    
    if (!textarea || !highlight) return;

    const syncScroll = () => {
      if (highlight) {
        highlight.scrollTop = textarea.scrollTop;
      }
    };

    textarea.addEventListener('scroll', syncScroll);
    return () => textarea.removeEventListener('scroll', syncScroll);
  }, []);

  const highlightSyntax = (text: string) => {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("([^"\\]|\\.)*")/g, '<span class="text-orange-200">$1</span>')
      .replace(/(\*[^*\n]+\*)/g, '<span class="text-blue-300">$1</span>')
      .replace(/(`[^`\n]+`)/g, '<span class="text-yellow-300">$1</span>')
      .replace(/(\{\{[^}\n]+\}\})/g, '<span class="text-pink-300">$1</span>')
      .replace(/\n$/g, '\n\n'); // Ensure there's always a final line
  };

  const baseStyles = 'absolute inset-0 w-full h-full overflow-auto whitespace-pre-wrap p-3';

  return (
    <div className={`relative ${className}`} style={{ minHeight: '100px' }}>
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
        spellCheck={false}
        className={`${baseStyles} bg-transparent text-transparent caret-white`}
        style={{ resize: 'vertical' }}
      />
    </div>
  );
};

export default HighlightedTextArea;