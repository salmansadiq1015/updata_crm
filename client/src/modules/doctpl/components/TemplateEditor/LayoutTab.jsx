'use client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export function LayoutTab({ layout = {}, onChange }) {
  const margins = layout.margins || { top: 25, bottom: 20, left: 20, right: 15 };

  const setMargin = (side, val) => onChange({
    ...layout,
    margins: { ...margins, [side]: Number(val) },
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium mb-3">Page Margins (mm)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['top', 'bottom', 'left', 'right']).map((side) => (
            <div key={side}>
              <Label className="text-xs capitalize text-muted-foreground">{side}</Label>
              <Input
                type="number" min={5} max={50} step={1}
                value={margins[side] ?? 0}
                onChange={(e) => setMargin(side, e.target.value)}
                className="mt-1"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Default: top 25mm, bottom 20mm, left 20mm, right 15mm</p>
      </div>
    </div>
  );
}
