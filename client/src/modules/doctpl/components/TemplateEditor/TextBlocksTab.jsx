'use client';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

const LANGS = [['de', 'Deutsch'], ['fr', 'Français'], ['it', 'Italiano'], ['en', 'English']];
const FIELDS = [
  ['introduction', 'Introduction Text', 4],
  ['terms',        'Terms & Conditions', 6],
  ['footer',       'Footer Text',        3],
  ['emailSubject', 'Email Subject',      1],
  ['emailBody',    'Email Body',         5],
];

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
              : <Textarea rows={rows} value={blocks[field] || ''} onChange={(e) => set(field, e.target.value)} className="mt-1" />
            }
          </div>
        ))}
      </div>
    </div>
  );
}
