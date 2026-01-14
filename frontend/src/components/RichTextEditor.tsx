import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { MarkdownSyntaxHighlighter } from './tiptap/extensions/MarkdownSyntaxHighlighter';
import { MarkdownImage } from './tiptap/extensions/MarkdownImage';
import { htmlToPlainText, markdownToHtml, textToHtmlParagraphs } from '../utils/contentUtils';

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
  const onKeyDownRef = useRef(onKeyDown);

  // Keep onKeyDown handler current without re-triggering useEditor
  useEffect(() => {
    onKeyDownRef.current = onKeyDown;
  }, [onKeyDown]);

  // Pre-process content for initial rendering
  const initialContent = (() => {
    if (!content) return '';

    let processed = content;

    // Convert plain text with newlines to proper HTML paragraphs
    if (!processed.includes('<p>') && !processed.includes('<br>') && processed.includes('\n')) {
      processed = textToHtmlParagraphs(processed);
    }

    // Process markdown images
    if (processed.includes('![')) {
      processed = markdownToHtml(processed);
    }

    return processed;
  })();

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
    }, onUpdate: ({ editor }: { editor: Editor }) => {
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
      handleKeyDown: (_view, event) => {
        // First, call the user's onKeyDown handler if provided
        if (onKeyDownRef.current) {
          onKeyDownRef.current(event as unknown as React.KeyboardEvent<HTMLDivElement>);
          if (event.defaultPrevented) {
            return true;
          }
        }

        return false;
      },
    },
  });  // Update content from props (for external changes)
  // Compare using htmlToPlainText on both sides to ensure consistent normalization
  // This prevents the editor from resetting on every keystroke due to HTML vs plain text mismatch
  useEffect(() => {
    if (!editor) return;

    // Don't reset content while the editor is focused and being actively edited
    // EXCEPT when clearing the content (empty string) - allow that even when focused
    if (editor.isFocused && content !== '') {
      return;
    }

    const editorPlainText = htmlToPlainText(editor.getHTML() || '');
    const contentPlainText = htmlToPlainText(content || '');

    if (editorPlainText !== contentPlainText) {
      // Save current cursor position before updating
      // This block will only be reached if editor is NOT focused,
      // so no need to check editor.isFocused here.
      cursorPosRef.current = editor.state.selection;

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
      // This block will only be reached if editor is NOT focused,
      // so no need to check editor.isFocused here.
      if (cursorPosRef.current) {
        const { from, to } = cursorPosRef.current;
        if (from <= editor.state.doc.content.size && to <= editor.state.doc.content.size) {
          editor.commands.setTextSelection({ from, to });
        }
      }
    }
  }, [content, editor]);

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
      className={`tiptap-editor ${className} performance-contain performance-transform`}
      onClick={handleContainerClick}
      ref={editorContainerRef}
      style={{ cursor: readOnly ? 'default' : 'text' }}
    >
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
