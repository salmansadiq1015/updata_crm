'use client';
import { useState } from 'react';
import { LayoutTab }     from './LayoutTab';
import { TextBlocksTab } from './TextBlocksTab';
import { ColumnsTab }    from './ColumnsTab';
import { SectionsTab }   from './SectionsTab';

const TABS = [
  ['layout',     'Layout'],
  ['textBlocks', 'Text Blocks'],
  ['columns',    'Columns'],
  ['sections',   'Sections'],
];

export function TemplateEditor({ template, onChange }) {
  const [tab, setTab] = useState('layout');
  if (!template) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b pb-2">
        {TABS.map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >{label}</button>
        ))}
      </div>
      {tab === 'layout'     && <LayoutTab     layout={template.layout}           onChange={(v) => onChange({ ...template, layout: v })} />}
      {tab === 'textBlocks' && <TextBlocksTab textBlocks={template.textBlocks}   onChange={(v) => onChange({ ...template, textBlocks: v })} />}
      {tab === 'columns'    && <ColumnsTab    tableColumns={template.tableColumns} onChange={(v) => onChange({ ...template, tableColumns: v })} />}
      {tab === 'sections'   && <SectionsTab   sections={template.sections}        onChange={(v) => onChange({ ...template, sections: v })} />}
    </div>
  );
}
