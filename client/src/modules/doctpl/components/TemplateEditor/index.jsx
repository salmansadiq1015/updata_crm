'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { LayoutTab }     from './LayoutTab';
import { TEMPLATE_LANGUAGES, TextBlocksTab } from './TextBlocksTab';
import { ColumnsTab }    from './ColumnsTab';
import { SectionsTab }   from './SectionsTab';
import { useLanguage } from '@/lib/i18n/language-context';

const TABS = [
  ['layout', 'doctpl.editor.layout'],
  ['textBlocks', 'doctpl.editor.textBlocks'],
  ['columns', 'doctpl.editor.columns'],
  ['sections', 'doctpl.editor.sections'],
];

export function getTemplateEditorIssues(template) {
  if (!template || template.isActive === false) return [];
  const issues = [];
  const languages = TEMPLATE_LANGUAGES.map(([code]) => code);
  const columns = template.tableColumns || [];
  const totalWidth = columns.reduce((sum, column) => sum + Number(column.widthPercent || 0), 0);
  if (columns.length > 0 && Math.abs(totalWidth - 100) > 1) {
    issues.push('doctpl.editor.issueColumnWidth');
  }
  for (const [index, column] of columns.entries()) {
    for (const lang of languages) {
      if (!`${column.label?.[lang] || ''}`.trim()) {
        issues.push(`doctpl.editor.issueColumnLabel:${index + 1}:${lang}`);
      }
    }
  }
  for (const lang of languages) {
    if (!`${template.textBlocks?.[lang]?.footer || ''}`.trim()) {
      issues.push(`doctpl.editor.issueFooter:${lang}`);
    }
  }
  return issues;
}

function formatIssue(t, issue) {
  const [key, a, b] = issue.split(':');
  return t(key, null, { value: a, lang: b });
}

export function TemplateEditor({ template, onChange, onValidationChange }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState('layout');
  const issues = useMemo(() => getTemplateEditorIssues(template), [template]);

  useEffect(() => {
    onValidationChange?.(issues);
  }, [issues, onValidationChange]);

  if (!template) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b pb-2">
        {TABS.map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >{t(label)}</button>
        ))}
      </div>
      {issues.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {t('doctpl.editor.validationTitle')}
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {issues.slice(0, 6).map((issue) => (
              <li key={issue}>{formatIssue(t, issue)}</li>
            ))}
          </ul>
        </div>
      )}
      {tab === 'layout'     && <LayoutTab     layout={template.layout}           onChange={(v) => onChange({ ...template, layout: v })} />}
      {tab === 'textBlocks' && <TextBlocksTab textBlocks={template.textBlocks}   onChange={(v) => onChange({ ...template, textBlocks: v })} />}
      {tab === 'columns'    && <ColumnsTab    tableColumns={template.tableColumns} onChange={(v) => onChange({ ...template, tableColumns: v })} />}
      {tab === 'sections'   && <SectionsTab   sections={template.sections}        onChange={(v) => onChange({ ...template, sections: v })} />}
    </div>
  );
}
