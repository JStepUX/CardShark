import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';
import { Node as ProsemirrorNode } from 'prosemirror-model';

export const MarkdownSyntaxHighlighter = Extension.create({
  name: 'markdownSyntaxHighlighter',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('markdownSyntaxHighlighter'),
        props: {
          decorations(state: EditorState) {
            const { doc } = state;
            const decorations: Decoration[] = [];
            
            // Process each text node in the document
            doc.descendants((node: ProsemirrorNode, pos: number) => {
              if (node.isText) {
                const text = node.text || '';
                
                // Bold (**text**)
                const boldRegex = /\*\*([^*\n]+)\*\*/g;
                let match;
                while ((match = boldRegex.exec(text)) !== null) {
                  decorations.push(
                    Decoration.inline(
                      pos + match.index,
                      pos + match.index + match[0].length,
                      { 
                        class: 'md-bold-syntax',
                        style: 'font-weight: bold; color: #f97316;' 
                      }
                    )
                  );
                }
                
                // Italic (*text*) - avoid matches inside **bold**
                const italicRegex = /(?<!\*)\*([^*\n]+)\*(?!\*)/g;
                while ((match = italicRegex.exec(text)) !== null) {
                  decorations.push(
                    Decoration.inline(
                      pos + match.index,
                      pos + match.index + match[0].length,
                      { 
                        class: 'md-italic-syntax',
                        style: 'font-style: italic; color: #3b82f6;' 
                      }
                    )
                  );
                }
                
                // Code (`text`)
                const codeRegex = /`([^`\n]+)`/g;
                while ((match = codeRegex.exec(text)) !== null) {
                  decorations.push(
                    Decoration.inline(
                      pos + match.index,
                      pos + match.index + match[0].length,
                      { 
                        class: 'md-code-syntax',
                        style: 'font-family: monospace; color: #a3e635; background-color: rgba(30, 41, 59, 0.5); padding: 0.125rem 0.25rem; border-radius: 0.25rem;'
                      }
                    )
                  );
                }
                
                // Quotes ("text")
                const quoteRegex = /"([^"\\]|\\.)*"/g;
                while ((match = quoteRegex.exec(text)) !== null) {
                  decorations.push(
                    Decoration.inline(
                      pos + match.index,
                      pos + match.index + match[0].length,
                      { 
                        class: 'md-quote-syntax',
                        style: 'color: #f59e0b;'
                      }
                    )
                  );
                }
                
                // Headers (# text)
                const headerRegex = /^(#{1,6})\s+(.+)$/gm;
                while ((match = headerRegex.exec(text)) !== null) {
                  decorations.push(
                    Decoration.inline(
                      pos + match.index,
                      pos + match.index + match[0].length,
                      { 
                        class: 'md-header-syntax',
                        style: 'color: #818cf8; font-weight: bold;'
                      }
                    )
                  );
                }
                
                // Lists (- text or 1. text)
                const listRegex = /^(\s*)([-*+]|\d+\.)\s+(.+)$/gm;
                while ((match = listRegex.exec(text)) !== null) {
                  decorations.push(
                    Decoration.inline(
                      pos + match.index,
                      pos + match.index + match[0].length,
                      { 
                        class: 'md-list-syntax',
                        style: 'color: #fb7185;'
                      }
                    )
                  );
                }
                
                // Variables like {{var}}
                const variableRegex = /\{\{([^}]+)\}\}/g;
                while ((match = variableRegex.exec(text)) !== null) {
                  const variableName = match[1];
                  
                  // Only highlight standard variables
                  if (variableName === 'user' || variableName === 'char') {
                    decorations.push(
                      Decoration.inline(
                        pos + match.index,
                        pos + match.index + match[0].length,
                        { 
                          class: 'md-variable-syntax',
                          style: 'color: #ec4899; background-color: rgba(236, 72, 153, 0.1); border-radius: 0.25rem; padding: 0 0.25rem;',
                          'data-variable': 'true',
                          'data-variable-name': variableName
                        }
                      )
                    );
                  }
                }
              }
              return true;
            });
            
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
