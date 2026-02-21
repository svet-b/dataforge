import { useEffect, useRef } from 'react';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';

interface SqlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onRunPreview?: () => void;
  placeholder?: string;
}

export default function SqlEditor({ value, onChange, onRunPreview, placeholder = 'SELECT * FROM ...' }: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const suppressUpdateRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onRunPreviewRef = useRef(onRunPreview);

  onChangeRef.current = onChange;
  onRunPreviewRef.current = onRunPreview;

  useEffect(() => {
    if (!containerRef.current) return;

    const keys = [];
    keys.push({
      key: 'Mod-Enter',
      run: () => {
        onRunPreviewRef.current?.();
        return true;
      },
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of(keys),
          basicSetup,
          sql(),
          cmPlaceholder(placeholder),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !suppressUpdateRef.current) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { fontSize: '13px' },
            '.cm-scroller': { overflow: 'auto' },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only mount/unmount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into the editor
  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      suppressUpdateRef.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      suppressUpdateRef.current = false;
    }
  }, [value]);

  return (
    <div ref={containerRef} className="min-h-[120px] overflow-hidden rounded border border-gray-300" />
  );
}
