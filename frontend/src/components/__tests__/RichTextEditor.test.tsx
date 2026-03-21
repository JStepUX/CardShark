import { vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock Tiptap — useEditor returns null during initial render in jsdom,
// and EditorContent renders nothing when editor is null.
// We test the wrapper's own behavior, not Tiptap internals.
vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => null),
  EditorContent: vi.fn(({ editor }: { editor: unknown }) => {
    if (!editor) return null;
    return <div data-testid="editor-content" />;
  }),
}));

vi.mock('@tiptap/starter-kit', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('@tiptap/extension-paragraph', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('@tiptap/extension-image', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('@tiptap/extension-placeholder', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('../tiptap/extensions/MarkdownSyntaxHighlighter', () => ({ MarkdownSyntaxHighlighter: {} }));
vi.mock('../tiptap/extensions/MarkdownImage', () => ({ MarkdownImage: {} }));
vi.mock('../tiptap/tiptap.css', () => ({}));

import RichTextEditor from '../RichTextEditor';

describe('RichTextEditor', () => {
  it('renders a container with tiptap-editor class', () => {
    const { container } = render(
      <RichTextEditor content="" onChange={vi.fn()} />
    );

    const wrapper = container.querySelector('.tiptap-editor');
    expect(wrapper).toBeInTheDocument();
  });

  it('sets cursor to text when editable', () => {
    const { container } = render(
      <RichTextEditor content="" onChange={vi.fn()} />
    );

    const wrapper = container.querySelector('.tiptap-editor') as HTMLElement;
    expect(wrapper.style.cursor).toBe('text');
  });

  it('sets cursor to default when readOnly', () => {
    const { container } = render(
      <RichTextEditor content="" onChange={vi.fn()} readOnly />
    );

    const wrapper = container.querySelector('.tiptap-editor') as HTMLElement;
    expect(wrapper.style.cursor).toBe('default');
  });

  it('applies custom className', () => {
    const { container } = render(
      <RichTextEditor content="" onChange={vi.fn()} className="custom-editor" />
    );

    const wrapper = container.querySelector('.tiptap-editor.custom-editor');
    expect(wrapper).toBeInTheDocument();
  });

  it('calls useEditor with editable false when readOnly', async () => {
    const { useEditor } = await import('@tiptap/react');

    render(<RichTextEditor content="hello" onChange={vi.fn()} readOnly />);

    expect(useEditor).toHaveBeenCalledWith(
      expect.objectContaining({ editable: false })
    );
  });
});
