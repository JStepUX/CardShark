import { Node, mergeAttributes, NodeConfig } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

interface ImageAttributes {
  src: string;
  alt?: string;
  title?: string;
  isExpanded?: boolean;
}

export const ImageHandler = Node.create<NodeConfig<ImageAttributes>>({
  name: 'customImage',
  group: 'block',
  inline: false,
  draggable: true,
  
  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      isExpanded: {
        default: false,
        parseHTML: () => false,
        renderHTML: () => null,
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    const { isExpanded, ...attrs } = HTMLAttributes as ImageAttributes;
    return ['img', mergeAttributes(attrs, {
      class: isExpanded ? 'expanded-image' : 'normal-image'
    })];
  },
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('customImageHandler'),
        props: {
          handleDOMEvents: {
            click: (view: EditorView, event: MouseEvent) => {
              const { target } = event;
              if (target instanceof HTMLImageElement) {
                // Toggle image expansion
                const pos = view.posAtDOM(target, 0);
                const node = view.state.doc.nodeAt(pos);
                
                if (node && node.type.name === this.name) {
                  const isCurrentlyExpanded = node.attrs.isExpanded;
                  
                  const transaction = view.state.tr.setNodeAttribute(
                    pos,
                    'isExpanded',
                    !isCurrentlyExpanded
                  );
                  
                  view.dispatch(transaction);
                  return true;
                }
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
