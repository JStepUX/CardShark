import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';
import { Node as ProsemirrorNode } from 'prosemirror-model';

export const VariableHighlighter = Extension.create({
  name: 'variableHighlighter',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('variableHighlighter'),
        props: {
          decorations(state: EditorState) {
            const { doc } = state;
            const decorations: Decoration[] = [];
            
            // Function to add decorations for variable patterns like {{var}}
            const addDecoration = (from: number, to: number, variable: string) => {
              decorations.push(
                Decoration.inline(from, to, { 
                  class: 'variable-syntax',
                  'data-variable': 'true',
                  'data-variable-name': variable
                })
              );
            };

            // Process each text node in the document
            doc.descendants((node: ProsemirrorNode, pos: number) => {
              if (node.isText) {
                const text = node.text || '';
                
                // Match {{variable}} pattern - but only if not already substituted
                const variableRegex = /\{\{([^}]+)\}\}/g;
                let match;
                while ((match = variableRegex.exec(text)) !== null) {
                  const variableName = match[1];
                  
                  // Only highlight if the variable is one of the standard variables
                  // This prevents highlighting substituted variables
                  if (variableName === 'user' || variableName === 'char') {
                    addDecoration(
                      pos + match.index,
                      pos + match.index + match[0].length,
                      variableName
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
