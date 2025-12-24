import React from 'react';

interface ColorScheme {
  quoted: string;
  asterisked: string;
  bracketed: string;
  default: string;
}

const colors: ColorScheme = {
  quoted: '#90EE90',    // Light green
  asterisked: '#89CFF0', // Light blue
  bracketed: '#FFB6C1',  // Light pink
  default: '#FFFFFF'     // White
};

const SyntaxHighlighter: React.FC<{ text: string }> = ({ text }) => {
  const formatText = (input: string) => {
    if (!input) return '';

    // Split text into segments based on patterns
    const segments = input.split(/(".*?"|\*.*?\*|\{\{.*?\}\})/g);

    return segments.map((segment, index) => {
      if (segment.match(/^".*"$/)) {
        return <span key={index} style={{ color: colors.quoted }}>{segment}</span>;
      }
      if (segment.match(/^\*.*\*$/)) {
        return <span key={index} style={{ color: colors.asterisked }}>{segment}</span>;
      }
      if (segment.match(/^\{\{.*\}\}$/)) {
        return <span key={index} style={{ color: colors.bracketed }}>{segment}</span>;
      }
      return <span key={index} style={{ color: colors.default }}>{segment}</span>;
    });
  };

  return <>{formatText(text)}</>;
};

export default SyntaxHighlighter;