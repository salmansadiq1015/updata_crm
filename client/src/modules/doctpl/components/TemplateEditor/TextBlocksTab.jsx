'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';

export const TEMPLATE_LANGUAGES = [
  ['de', 'Deutsch'],
  ['fr', 'Francais'],
  ['it', 'Italiano'],
  ['en', 'English'],
];
const FIELDS = [
  ['introduction', 'doctpl.editor.introduction', 4],
  ['terms', 'doctpl.editor.terms', 6],
  ['footer', 'doctpl.editor.footer', 3],
  ['emailSubject', 'doctpl.editor.emailSubject', 1],
  ['emailBody', 'doctpl.editor.emailBody', 5],
];

function RichTextEditor({ value, onChange, labelList }) {
  // Tiptap registers onUpdate once, so calling `onChange` directly would capture
  // a stale closure. Route it through a ref so keystrokes always reach the
  // latest handler and are never dropped.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    // Next.js renders this on the server first; Tiptap must defer its initial
    // render to the client to avoid an SSR hydration mismatch (crashes the tab).
    immediatelyRender: false,
    extensions: [StarterKit],
    content: value || '',
    onUpdate: ({ editor: activeEditor }) => onChangeRef.current(activeEditor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    // Only pull in external value changes when the user isn't typing. Resetting
    // while focused (or from a stale/delayed value after save) would wipe what
    // was just entered — the reported "text is lost after saving" bug.
    if (editor.isFocused) return;
    if (editor.getHTML() !== (value || '')) {
      editor.commands.setContent(value || '', false);
    }
  }, [editor, value]);

  return (
    <div className="overflow-hidden rounded-md border border-input">
      <div className="flex gap-1 border-b border-input bg-muted/40 px-2 py-1">
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().toggleBold().run();
          }}
          className={`rounded px-1.5 py-0.5 text-xs font-bold hover:bg-muted ${editor?.isActive('bold') ? 'bg-muted' : ''}`}
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().toggleItalic().run();
          }}
          className={`rounded px-1.5 py-0.5 text-xs italic hover:bg-muted ${editor?.isActive('italic') ? 'bg-muted' : ''}`}
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().toggleBulletList().run();
          }}
          className={`rounded px-1.5 py-0.5 text-xs hover:bg-muted ${editor?.isActive('bulletList') ? 'bg-muted' : ''}`}
        >
          {labelList}
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-2 text-sm focus-within:outline-none [&_.ProseMirror]:min-h-20 [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}

export function TextBlocksTab({ textBlocks = {}, onChange }) {
  const { t } = useLanguage();
  const [lang, setLang] = useState('de');
  const set = (field, value) => onChange({
    ...textBlocks,
    [lang]: { ...(textBlocks[lang] || {}), [field]: value },
  });
  const blocks = textBlocks[lang] || {};

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b pb-3">
        {TEMPLATE_LANGUAGES.map(([code, label]) => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${lang === code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {FIELDS.map(([field, labelKey, rows]) => (
          <div key={field}>
            <Label className="text-sm">{t(labelKey)}</Label>
            {rows === 1 ? (
              <Input value={blocks[field] || ''} onChange={(event) => set(field, event.target.value)} className="mt-1" />
            ) : (
              <div className="mt-1">
                <RichTextEditor
                  value={blocks[field] || ''}
                  onChange={(value) => set(field, value)}
                  labelList={t('doctpl.editor.list')}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
