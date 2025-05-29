import React from 'react';
import { Message } from '../types/messages';

interface ThoughtBubbleProps {
  message: Message;
  isGenerating: boolean;
  onContentChange: (content: string) => void;
  onDelete: () => void;
  characterName?: string;
}

const ThoughtBubble: React.FC<ThoughtBubbleProps> = ({
  message,
  isGenerating,
  onContentChange,
  characterName
}) => {  return (
    <div className="w-full rounded-lg transition-colors bg-stone-800 text-gray-300 self-start
                    border border-dashed border-stone-600 relative mt-6 mb-0 performance-contain performance-transform">
      {/* Bubble decorations */}
      <div className="absolute -top-6 left-4 flex performance-contain">
        <div className="w-2 h-2 bg-stone-800 border border-dashed border-stone-600 rounded-full"></div>
        <div className="w-3 h-3 bg-stone-800 border border-dashed border-stone-600 rounded-full ml-1"></div>
        <div className="w-4 h-4 bg-stone-800 border border-dashed border-stone-600 rounded-full ml-1"></div>
      </div>
      
      {/* Header */}
      <div className="px-4 pt-2 flex justify-between items-center performance-contain">
        <div className="text-sm text-gray-500">
          {characterName}'s thoughts
        </div>
      </div>

      {/* Content */}
      <div className="p-4 performance-contain">
        {isGenerating ? (
          <div className="whitespace-pre-wrap break-words performance-contain performance-transform">
            {message.content}
            <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse"></span>
          </div>
        ) : (
          <div
            contentEditable={true}
            suppressContentEditableWarning
            onBlur={(e) => onContentChange(e.currentTarget.textContent || '')}
            className="whitespace-pre-wrap break-words focus:outline-none cursor-text performance-contain performance-transform"
            dangerouslySetInnerHTML={{ __html: message.content }}
          />
        )}
      </div>
    </div>
  );
};

export default ThoughtBubble;