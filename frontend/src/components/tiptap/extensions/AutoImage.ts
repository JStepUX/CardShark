import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Slice, Fragment, Node } from 'prosemirror-model';
import { MARKDOWN_IMAGE_REGEX } from '../../../utils/contentUtils';

// URL regex pattern for detecting image links
const imageUrlRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp)(\?.*)?)/i;

export const AutoImage = Extension.create({
  name: 'autoImage',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('autoImage'),
        props: {
          transformPasted: (slice: Slice) => {
            const { content } = slice;
            let transformed = false;
            
            // Transform plain text image URLs into actual images
            const transformedContent = content.descendants((node: Node, _pos: number, _parent: Node | null) => {
              if (node.isText) {
                const text = node.text || '';
                
                // Check for plain image URLs
                if (imageUrlRegex.test(text)) {
                  transformed = true;
                  // Create image node with the URL
                  return true;
                }
                
                // Check for markdown image syntax
                if (MARKDOWN_IMAGE_REGEX.test(text)) {
                  transformed = true;
                  // Replace markdown syntax with image nodes
                  return true;
                }
              }
              return false;
            });
            
            if (transformed && transformedContent) {
              return new Slice(
                Fragment.from(transformedContent),
                slice.openStart,
                slice.openEnd
              );
            }
            
            return slice;
          },
        },
      }),
    ];
  },
});
