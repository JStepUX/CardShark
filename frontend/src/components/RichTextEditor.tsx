import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { MarkdownSyntaxHighlighter } from './tiptap/extensions/MarkdownSyntaxHighlighter';

// Import the CSS file
import './tiptap/tiptap.css';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  autofocus?: boolean;
  preserveWhitespace?: boolean;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  onKeyDown,
  placeholder = 'Type something...',
  readOnly = false,
  className = '',
  autofocus = false,
  preserveWhitespace = false
}) => {
  const cursorPosRef = useRef<{ from: number, to: number } | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: {
          HTMLAttributes: {
            class: preserveWhitespace ? 'preserve-whitespace' : '',
          },
        },
        // Disable built-in markdown parsing features
        bold: false,
        italic: false,
        code: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
      }),
      Image,
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: true,
        linkOnPaste: true,
      }),
      // Use only the consolidated markdown highlighter
      MarkdownSyntaxHighlighter,
    ],
    content,
    editable: !readOnly,
    autofocus,
    onUpdate: ({ editor }: { editor: Editor }) => {
      // Save cursor position before content update
      cursorPosRef.current = editor.state.selection;
      
      // Get HTML with preserved newlines
      let html = editor.getHTML();
      
      // If we're editing plain text without HTML tags, handle newlines specially
      if (!html.includes('<p>') && html.includes('<br>')) {
        // Convert <br> tags to newlines for plain text editing
        html = html.replace(/<br>/g, '\n');
      }
      
      onChange(html);
    },
    // Ensure newlines are properly preserved when pasting
    editorProps: {
      transformPastedText(text) {
        // Preserve newlines in pasted text
        return text;
      },
    },
  });

  // Update content from props (for external changes)
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      // Save current cursor position before updating
      if (editor.isFocused) {
        cursorPosRef.current = editor.state.selection;
      }
      
      // Handle content with newlines but no HTML
      let contentToSet = content;
      
      // If content has newlines but no HTML tags, convert newlines to <br> tags
      // This helps TipTap properly display them in the editor
      if (!contentToSet.includes('<p>') && !contentToSet.includes('<br>') && contentToSet.includes('\n')) {
        contentToSet = contentToSet.replace(/\n/g, '<br>');
      }
      
      // Set content with proper newline handling
      editor.commands.setContent(contentToSet);
      
      // Restore cursor position after content update
      if (cursorPosRef.current && editor.isFocused) {
        const { from, to } = cursorPosRef.current;
        if (from <= editor.state.doc.content.size && to <= editor.state.doc.content.size) {
          editor.commands.setTextSelection({ from, to });
        }
      }
    }
  }, [content, editor]);

  // Handle key events
  const handleKeyDown = (_e: React.KeyboardEvent) => {
    if (onKeyDown) {
      onKeyDown(_e);
    }
  };

  // Handle clicks on the container to focus the editor
  const handleContainerClick = (_e: React.MouseEvent<HTMLDivElement>) => {
    if (editor && !readOnly && !editor.isFocused) {
      editor.commands.focus();
    }
  };

  return (
    <div 
      className={`tiptap-editor ${className}`}
      onKeyDown={handleKeyDown}
      onClick={handleContainerClick}
      ref={editorContainerRef}
    >
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
