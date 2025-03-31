import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';
import { Node as ProsemirrorNode } from 'prosemirror-model';

export const MarkdownSyntax = Extension.create({
  name: 'markdownSyntax',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('markdownSyntax'),
        props: {
          decorations(state: EditorState) {
            const { doc } = state;
            const decorations: Decoration[] = [];
            
            // Function to add decorations for patterns like *italic*, **bold**, `code`
            const addDecoration = (from: number, to: number, className: string) => {
              decorations.push(
                Decoration.inline(from, to, { class: className })
              );
            };

            // Process each text node in the document
            doc.descendants((node: ProsemirrorNode, pos: number) => {
              if (node.isText) {
                const text = node.text || '';
                
                // Match *italic* pattern
                const italicRegex = /\*([^*\n]+)\*/g;
                let italicMatch;
                while ((italicMatch = italicRegex.exec(text)) !== null) {
                  addDecoration(
                    pos + italicMatch.index,
                    pos + italicMatch.index + italicMatch[0].length,
                    'markdown-italic'
                  );
                }
                
                // Match **bold** pattern
                const boldRegex = /\*\*([^*\n]+)\*\*/g;
                let boldMatch;
                while ((boldMatch = boldRegex.exec(text)) !== null) {
                  addDecoration(
                    pos + boldMatch.index,
                    pos + boldMatch.index + boldMatch[0].length,
                    'markdown-bold'
                  );
                }
                
                // Match `code` pattern
                const codeRegex = /`([^`\n]+)`/g;
                let codeMatch;
                while ((codeMatch = codeRegex.exec(text)) !== null) {
                  addDecoration(
                    pos + codeMatch.index,
                    pos + codeMatch.index + codeMatch[0].length,
                    'markdown-code'
                  );
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
