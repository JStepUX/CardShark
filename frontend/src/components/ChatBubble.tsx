import React, { useState, useRef, useEffect } from 'react';
import {
  Edit,
  Check,
  X,
  RotateCw,
  ArrowRight,
  ArrowLeft,
  Pause,
  Trash2} from 'lucide-react';
import HighlightedTextArea from './HighlightedTextArea';


interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  variations?: string[];
  currentVariation?: number;
}

interface ChatBubbleProps {
  message: Message;
  isGenerating: boolean;
  onEdit: (content: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onStop?: () => void;
  onTryAgain: () => void;
  onNextVariation: () => void;
  onPrevVariation: () => void;
  currentUser?: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isGenerating,
  onEdit,
  onCancel,
  onDelete,
  onStop,
  onTryAgain,
  onNextVariation,
  onPrevVariation,
  currentUser
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleCancelClick = () => {
    setIsEditing(false);
    setEditContent(message.content);
    onCancel();
  };

  const handleSaveClick = () => {
    setIsEditing(false);
    onEdit(editContent);
  };

  const handleTextareaChange = (value: string) => {
    setEditContent(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault(); // Prevent newline
      handleSaveClick();
    }
  };

  // Highlighting function (copied from HighlightedTextArea)
  const highlightSyntax = (text: string, userName?: string) => {
    const replacedText = userName ? text.replace(/\{\{user\}\}/gi, userName) : text;
    return replacedText
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("([^"\\]|\\.)*")/g, '<span class="text-orange-200">$1</span>')
      .replace(/(\*[^*\n]+\*)/g, '<span class="text-blue-300">$1</span>')
      .replace(/(`[^`\n]+`)/g, '<span class="text-yellow-300">$1</span>')
      .replace(/(\{\{[^}\n]+\}\})/g, '<span class="text-pink-300">$1</span>')
      .replace(/\n$/g, '\n\n');
  };

  // Display component for highlighted text
  const HighlightedTextDisplay: React.FC<{ text: string }> = ({ text }) => {
    return (
      <div
        className="whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: highlightSyntax(text, currentUser) }}
      />
    );
  };

  const renderMessageContent = () => {
    if (isEditing) {
      return (
        <HighlightedTextArea
          ref={textareaRef} // Changed textAreaRef to ref
          value={editContent}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          readOnly={isGenerating}
          className="w-full h-48 p-2 bg-gray-900 text-white rounded focus:outline-none"
        />
      );
    } else {
      return (
        <HighlightedTextDisplay text={message.content} />
      );
    }
  };

  const renderActions = () => {
    if (isEditing) {
      return (
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCancelClick}
            className="px-4 py-2 text-gray-300 rounded hover:bg-gray-900 focus:outline-none"
            disabled={isGenerating}
          >
            <X size={16} />

          </button>
          <button
            onClick={handleSaveClick}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none"
            disabled={isGenerating}
          >
            <Check size={16} />

          </button>
        </div>
      );
    } else {
      return (
        <div className="flex justify-end gap-2">
          {message.variations && message.variations.length > 0 && (
            <>
              <button
                onClick={onPrevVariation}
                className="px-4 py-2 text-gray-300 rounded hover:bg-gray-700 focus:outline-none"
                disabled={isGenerating}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                onClick={onNextVariation}
                className="px-4 py-2 text-gray-300 rounded hover:bg-gray-700 focus:outline-none"
                disabled={isGenerating}
              >
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {isGenerating && onStop && (
            <button
              onClick={onStop}
              className="px-4 py-2 text-gray-300 rounded hover:bg-gray-700 focus:outline-none"
            >
              <Pause size={16} />

            </button>
          )}
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-400 transition-colors"
            disabled={isGenerating}
          >
            <Trash2 size={16} />

          </button>
          {!isGenerating && onTryAgain && (
            
            <button
              onClick={onTryAgain}
              className="px-4 py-2 text-gray-300 rounded hover:text-orange-400 focus:outline-none"
            >
              <RotateCw size={16} />

            </button>
          )}
          <button
            onClick={handleEditClick}
            className="px-4 py-2 text-gray-300 rounded hover:text-orange-400 focus:outline-none"
            disabled={isGenerating}
          >
            <Edit size={16} />

          </button>
          
        </div>
      );
    }
  };

  return (
    <div className={`w-full p-4 rounded-lg ${message.role === 'user' ? 'bg-stone-900 text-white self-end' : 'bg-stone-900 text-gray-300 self-start'}`}>
      {currentUser && message.role === 'user' && (
        <div className="text-sm text-gray-500">{currentUser}</div>
      )}
      {renderMessageContent()}
      {renderActions()}
    </div>
  );
};

export default ChatBubble;