'use client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const TYPE_COLORS = { header:'bg-blue-100 text-blue-700', body:'bg-purple-100 text-purple-700', table:'bg-green-100 text-green-700', totals:'bg-yellow-100 text-yellow-700', deductions:'bg-orange-100 text-orange-700', qr_bill:'bg-pink-100 text-pink-700', footer:'bg-gray-100 text-gray-600', custom:'bg-muted text-muted-foreground' };

export function SectionsTab({ sections = [], onChange }) {
  const sorted = [...sections].sort((a, b) => a.position - b.position);
  const toggle = (id, val) => onChange(sections.map((s) => s.id === id ? { ...s, isVisible: val } : s));

  return (
    <div className="space-y-2">
      {sorted.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg border px-4 py-3 gap-3">
          <div className="flex items-center gap-3">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[s.type] || TYPE_COLORS.custom}`}>{s.type}</span>
            <div>
              <p className="text-sm font-medium">{s.name}</p>
              {s.isConditional && <p className="text-xs text-muted-foreground">conditional: {s.conditionField}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label className="text-xs text-muted-foreground">Visible</Label>
            <Switch checked={s.isVisible !== false} onCheckedChange={(v) => toggle(s.id, v)} />
          </div>
        </div>
      ))}
    </div>
  );
}
