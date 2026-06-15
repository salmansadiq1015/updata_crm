'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { TEMPLATE_LANGUAGES } from './TextBlocksTab';

export function ColumnsTab({ tableColumns = [], onChange }) {
  const { t } = useLanguage();
  const total = tableColumns.reduce((sum, column) => sum + (column.widthPercent || 0), 0);
  const isValid = Math.abs(total - 100) <= 1;

  const setCol = (index, key, value) => {
    const cols = [...tableColumns];
    cols[index] = { ...cols[index], [key]: key === 'widthPercent' ? Number(value) : value };
    onChange(cols);
  };

  const setLabel = (index, lang, value) => {
    const cols = [...tableColumns];
    cols[index] = { ...cols[index], label: { ...(cols[index].label || {}), [lang]: value } };
    onChange(cols);
  };

  if (!tableColumns.length) {
    return <p className="py-4 text-sm text-muted-foreground">{t('doctpl.editor.noColumns')}</p>;
  }

  return (
    <div className="space-y-3">
      <p className={`text-xs font-medium ${isValid ? 'text-muted-foreground' : 'text-destructive'}`}>
        {t('doctpl.editor.totalWidth')}: {total}%{!isValid && ` - ${t('doctpl.editor.mustEqual100')}`}
      </p>
      {tableColumns.map((column, index) => (
        <div key={column.field || index} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <span className="flex-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{column.field}</span>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('doctpl.editor.widthPercent')}</Label>
              <Input
                type="number"
                min={1}
                max={100}
                className="w-20"
                value={column.widthPercent || 0}
                onChange={(event) => setCol(index, 'widthPercent', event.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATE_LANGUAGES.map(([lang, label]) => (
              <div key={lang}>
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  value={column.label?.[lang] || ''}
                  onChange={(event) => setLabel(index, lang, event.target.value)}
                  className="mt-0.5 h-7 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
