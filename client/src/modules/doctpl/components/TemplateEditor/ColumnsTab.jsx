'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const LANGS = ['de', 'fr', 'it', 'en'];

export function ColumnsTab({ tableColumns = [], onChange }) {
  const total = tableColumns.reduce((s, c) => s + (c.widthPercent || 0), 0);
  const isValid = Math.abs(total - 100) <= 1;

  const setCol = (i, key, val) => {
    const cols = [...tableColumns];
    cols[i] = { ...cols[i], [key]: key === 'widthPercent' ? Number(val) : val };
    onChange(cols);
  };
  const setLabel = (i, lang, val) => {
    const cols = [...tableColumns];
    cols[i] = { ...cols[i], label: { ...(cols[i].label || {}), [lang]: val } };
    onChange(cols);
  };

  if (!tableColumns.length) return <p className="text-sm text-muted-foreground py-4">No columns defined for this template type.</p>;

  return (
    <div className="space-y-3">
      <p className={`text-xs font-medium ${isValid ? 'text-muted-foreground' : 'text-destructive'}`}>
        Total width: {total}%{!isValid && ' — must equal 100%'}
      </p>
      {tableColumns.map((col, i) => (
        <div key={col.field || i} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded flex-1">{col.field}</span>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Width %</Label>
              <Input type="number" min={1} max={100} className="w-20" value={col.widthPercent || 0} onChange={(e) => setCol(i, 'widthPercent', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {LANGS.map((l) => (
              <div key={l}>
                <Label className="text-xs text-muted-foreground uppercase">{l}</Label>
                <Input value={col.label?.[l] || ''} onChange={(e) => setLabel(i, l, e.target.value)} className="mt-0.5 h-7 text-xs" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
