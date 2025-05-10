import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Slice, Fragment } from 'prosemirror-model';

// Regex for markdown image syntax: ![alt text](url)
const MARKDOWN_IMAGE_REGEX = /!\[(.*?)\]\((.*?)\)/g;

/**
 * MarkdownImage extension for TipTap
 * Lightweight extension that transforms Markdown image syntax 
 * into actual image nodes when typing or pasting content
 */
export const MarkdownImage = Extension.create({
  name: 'markdownImage',

  addProseMirrorPlugins() {
    const editor = this.editor;
    
    return [
      new Plugin({
        key: new PluginKey('markdownImage'),
        
        // Process during editing
        appendTransaction: (transactions, _oldState, newState) => {
          // Only proceed if content actually changed
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          // Check for markdown image syntax
          const { doc, schema } = newState;
          let markdownImageFound = false;
          let tr = newState.tr;

          doc.descendants((node, pos) => {
            if (!node.isText) return;
            const text = node.text || '';
            
            // Reset regex state and search for matches
            MARKDOWN_IMAGE_REGEX.lastIndex = 0;
            let match;
            let offset = 0;
            
            while ((match = MARKDOWN_IMAGE_REGEX.exec(text)) !== null) {
              markdownImageFound = true;
              
              const [fullMatch, alt, url] = match;
              const start = pos + match.index - offset;
              const end = start + fullMatch.length;
              
              // Delete markdown syntax and insert image node
              tr = tr.delete(start, end);
              
              if (schema.nodes.image) {
                tr = tr.insert(start, schema.nodes.image.create({ 
                  src: url,
                  alt: alt || '',
                  title: alt || ''
                }));
              }
              
              // Adjust offset for subsequent replacements
              offset += fullMatch.length - 1;
            }
          });

          return markdownImageFound ? tr : null;
        },
        
        // Process during pasting
        transformPasted: (slice: Slice) => {
          if (!editor?.schema.nodes.image) return slice;
          
          // Check if the slice contains text with markdown image syntax
          let hasMarkdownImage = false;
          let transformedFragments: any[] = [];
          
          slice.content.forEach((node) => {
            if (node.isText) {
              const text = node.text || '';
              if (text.match(MARKDOWN_IMAGE_REGEX)) {
                hasMarkdownImage = true;
                
                // Process text to replace markdown images
                let lastIndex = 0;
                let fragments: any[] = [];
                
                // Reset regex state
                MARKDOWN_IMAGE_REGEX.lastIndex = 0;
                let match;
                
                while ((match = MARKDOWN_IMAGE_REGEX.exec(text)) !== null) {
                  const [fullMatch, alt, url] = match;
                  
                  // Add text before the match
                  if (match.index > lastIndex) {
                    fragments.push(
                      editor.schema.text(text.slice(lastIndex, match.index))
                    );
                  }
                  
                  // Add image node
                  fragments.push(
                    editor.schema.nodes.image.create({
                      src: url,
                      alt: alt || '',
                      title: alt || ''
                    })
                  );
                  
                  lastIndex = match.index + fullMatch.length;
                }
                
                // Add remaining text
                if (lastIndex < text.length) {
                  fragments.push(editor.schema.text(text.slice(lastIndex)));
                }
                
                transformedFragments.push(...fragments);
              } else {
                transformedFragments.push(node);
              }
            } else {
              transformedFragments.push(node);
            }
          });
          
          if (hasMarkdownImage) {
            return new Slice(
              Fragment.from(transformedFragments),
              slice.openStart,
              slice.openEnd
            );
          }
          
          return slice;
        }
      }),
    ];
  },

  // Process content when editor is initialized
  onCreate() {
    if (!this.editor) {
      console.error('MarkdownImage: Editor not available in onCreate');
      return;
    }
    if (!this.editor.state) {
      console.error('MarkdownImage: Editor state not available in onCreate');
      return;
    }

    const { doc, schema } = this.editor.state;
    if (!doc || !schema) {
      console.error('MarkdownImage: Doc or schema not available in onCreate');
      return;
    }
    
    let hasChanges = false;
    const tr = this.editor.state.tr;
    if (!tr) {
      console.error('MarkdownImage: Transaction object not available in onCreate');
      return;
    }
    
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      
      const text = node.text;
      MARKDOWN_IMAGE_REGEX.lastIndex = 0;
      let match;
      let offset = 0;
      
      while ((match = MARKDOWN_IMAGE_REGEX.exec(text)) !== null) {
        hasChanges = true;
        
        const [fullMatch, alt, url] = match;
        const start = pos + match.index - offset;
        const end = start + fullMatch.length;
        
        tr.delete(start, end);
        
        if (schema.nodes.image) {
          tr.insert(start, schema.nodes.image.create({
            src: url,
            alt: alt || '',
            title: alt || ''
          }));
        } else {
          console.warn('MarkdownImage: Image node type not available in schema.');
        }
        
        offset += fullMatch.length - (schema.nodes.image ? 1 : 0); // Adjust offset based on whether image was inserted
      }
    });
    
    if (hasChanges) {
      if (!this.editor.view) {
        console.error('MarkdownImage: Editor view not available for dispatch in onCreate');
        return;
      }
      this.editor.view.dispatch(tr);
    }
  }
});