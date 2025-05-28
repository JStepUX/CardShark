import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { MarkdownSyntaxHighlighter } from './tiptap/extensions/MarkdownSyntaxHighlighter';
import { MarkdownImage } from './tiptap/extensions/MarkdownImage';
import { markdownToHtml, textToHtmlParagraphs } from '../utils/contentUtils';

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
  
  // Pre-process content for initial rendering
  const initialContent = content?.includes('![') 
    ? markdownToHtml(content)
    : content;
    const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable built-in markdown parsing features
        // and remove paragraph from starter kit to configure it separately
        paragraph: false,
        hardBreak: {}, // Keep HardBreak for within-paragraph line breaks
        bold: false,
        italic: false,
        code: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
      }),
      Paragraph.configure({
        HTMLAttributes: {
          class: preserveWhitespace ? 'preserve-whitespace' : '',
        }
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      MarkdownImage, // Add the fixed MarkdownImage extension
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
    content: initialContent,
    editable: !readOnly,
    autofocus,
    parseOptions: {
      preserveWhitespace: preserveWhitespace ? 'full' : undefined, // Use undefined for default behavior when false
    },onUpdate: ({ editor }: { editor: Editor }) => {
      // Save cursor position before content update
      cursorPosRef.current = editor.state.selection;
      
      // Get HTML content directly - let TipTap handle proper paragraph structure
      const html = editor.getHTML();
      
      onChange(html);
    },
    // Ensure newlines are properly preserved when pasting
    editorProps: {
      transformPastedText(text) {
        // Preserve newlines in pasted text
        return text;
      },
    },
  });  // Update content from props (for external changes)
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      // Save current cursor position before updating
      if (editor.isFocused) {
        cursorPosRef.current = editor.state.selection;
      }
      
      // Process content for update
      let contentToSet = content;
      
      // Convert plain text with newlines to proper HTML paragraphs
      if (!contentToSet.includes('<p>') && !contentToSet.includes('<br>') && contentToSet.includes('\n')) {
        contentToSet = textToHtmlParagraphs(contentToSet);
      }
      
      // Process markdown images
      if (contentToSet.includes('![')) {
        contentToSet = markdownToHtml(contentToSet);
      }
      
      // Set content
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
  // Handle clicks on the container to focus the editor seamlessly
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editor && !readOnly) {
      // Always focus the editor when clicking anywhere in the container
      if (!editor.isFocused) {
        editor.commands.focus();
      }
      // Allow clicks to propagate to set cursor position
      e.stopPropagation();
    }
  };
  return (
    <div 
      className={`tiptap-editor ${className}`}
      onKeyDown={handleKeyDown}
      onClick={handleContainerClick}
      ref={editorContainerRef}
      style={{ cursor: readOnly ? 'default' : 'text' }}
    >
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
