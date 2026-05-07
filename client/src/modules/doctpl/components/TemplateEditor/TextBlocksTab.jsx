'use client';
import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

const LANGS = [['de', 'Deutsch'], ['fr', 'Français'], ['it', 'Italiano'], ['en', 'English']];
const FIELDS = [
  ['introduction', 'Introduction Text', 4],
  ['terms',        'Terms & Conditions', 6],
  ['footer',       'Footer Text',        3],
  ['emailSubject', 'Email Subject',      1],
  ['emailBody',    'Email Body',         5],
];

function RichTextEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync external value changes (language switch)
  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value || '', false);
    }
  }, [value]); // eslint-disable-line

  return (
    <div className="border border-input rounded-md overflow-hidden">
      <div className="flex gap-1 px-2 py-1 border-b border-input bg-muted/40">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-muted font-bold ${editor?.isActive('bold') ? 'bg-muted' : ''}`}>B</button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-muted italic ${editor?.isActive('italic') ? 'bg-muted' : ''}`}>I</button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-muted ${editor?.isActive('bulletList') ? 'bg-muted' : ''}`}>• List</button>
      </div>
      <EditorContent editor={editor} className="prose prose-sm max-w-none p-2 min-h-20 focus-within:outline-none text-sm [&_.ProseMirror]:outline-none" />
    </div>
  );
}

export function TextBlocksTab({ textBlocks = {}, onChange }) {
  const [lang, setLang] = useState('de');
  const set = (field, val) => onChange({ ...textBlocks, [lang]: { ...(textBlocks[lang] || {}), [field]: val } });
  const blocks = textBlocks[lang] || {};

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b pb-3">
        {LANGS.map(([code, label]) => (
          <button
            key={code} onClick={() => setLang(code)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${lang === code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >{label}</button>
        ))}
      </div>
      <div className="space-y-4">
        {FIELDS.map(([field, label, rows]) => (
          <div key={field}>
            <Label className="text-sm">{label}</Label>
            {rows === 1
              ? <Input value={blocks[field] || ''} onChange={(e) => set(field, e.target.value)} className="mt-1" />
              : <div className="mt-1"><RichTextEditor value={blocks[field] || ''} onChange={(v) => set(field, v)} /></div>
            }
          </div>
        ))}
      </div>
    </div>
  );
}
