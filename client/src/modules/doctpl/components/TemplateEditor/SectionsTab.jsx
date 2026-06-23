'use client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { GripVertical } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLanguage } from '@/lib/i18n/language-context';

const TYPE_COLORS = {
  header:     'bg-blue-100 text-blue-700',
  body:       'bg-purple-100 text-purple-700',
  table:      'bg-green-100 text-green-700',
  totals:     'bg-yellow-100 text-yellow-700',
  deductions: 'bg-orange-100 text-orange-700',
  terms:      'bg-cyan-100 text-cyan-700',
  qr_bill:    'bg-pink-100 text-pink-700',
  report:     'bg-teal-100 text-teal-700',
  footer:     'bg-gray-100 text-gray-600',
  custom:     'bg-muted text-muted-foreground',
};

function SortableSection({ section, onToggle }) {
  const { t } = useLanguage();
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 bg-card"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${TYPE_COLORS[section.type] || TYPE_COLORS.custom}`}>
        {section.type}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{section.name}</p>
        {section.isConditional && (
          <p className="text-xs text-muted-foreground">{t('doctpl.editor.conditional')}: {section.conditionField}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Label className="text-xs text-muted-foreground">{t('doctpl.visible')}</Label>
        <Switch
          checked={section.isVisible !== false}
          onCheckedChange={(v) => onToggle(section.id, v)}
        />
      </div>
    </div>
  );
}

export function SectionsTab({ sections = [], onChange }) {
  const sensors = useSensors(useSensor(PointerSensor));

  const sorted = [...sections].sort((a, b) => a.position - b.position);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIdx = sorted.findIndex(s => s.id === active.id);
      const newIdx = sorted.findIndex(s => s.id === over.id);
      const reordered = arrayMove(sorted, oldIdx, newIdx).map((s, i) => ({ ...s, position: i + 1 }));
      onChange(reordered);
    }
  };

  const handleToggle = (id, visible) => {
    onChange(sections.map(s => s.id === id ? { ...s, isVisible: visible } : s));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sorted.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {sorted.map(s => (
            <SortableSection key={s.id} section={s} onToggle={handleToggle} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
