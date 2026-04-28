'use client';

import { Skeleton } from 'boneyard-js/react';
import { cn } from '@/lib/utils';
import { ALLOCATION_PERCENT_COLORS } from '@/modules/deploy/constants/deploy-constants';

const WEEKS = Array.from({ length: 12 }, (_, i) => i + 18);

const EMPLOYEES = [
  { name: 'Max Müller', allocations: { 18: 100, 19: 100, 20: 75, 21: 50, 22: 50 } },
  { name: 'Anna Fischer', allocations: { 19: 50, 20: 50, 21: 75, 22: 75, 23: 100, 24: 100 } },
  { name: 'Thomas Weber', allocations: { 18: 25, 19: 25, 20: 50, 23: 75 } },
  { name: 'Sarah Keller', allocations: { 20: 100, 21: 100, 22: 100, 25: 50, 26: 50 } },
  { name: 'Peter Brunner', allocations: { 18: 75, 19: 75, 24: 25, 25: 25, 26: 50 } },
];

export default function CoarseFixture() {
  return (
    <Skeleton name="deploy-coarse-matrix" loading={false}>
      <div className="border rounded-lg overflow-auto bg-background">
        {/* Header row */}
        <div className="flex sticky top-0 z-10 bg-muted/30 border-b">
          <div className="w-[200px] shrink-0 px-3 py-2 text-xs font-semibold border-r sticky left-0 bg-muted/30">
            Mitarbeiter
          </div>
          {WEEKS.map((w) => (
            <div key={w} className="min-w-[60px] flex-1 text-center py-2 text-xs font-medium border-r last:border-r-0">
              KW {w}
            </div>
          ))}
        </div>

        {/* Employee rows */}
        {EMPLOYEES.map((emp) => (
          <div key={emp.name} className="flex border-b last:border-b-0">
            <div className="w-[200px] shrink-0 px-3 py-2 border-r flex items-center sticky left-0 bg-background">
              <span className="text-xs font-medium truncate">{emp.name}</span>
            </div>
            {WEEKS.map((w) => {
              const pct = emp.allocations[w] || 0;
              const colors = ALLOCATION_PERCENT_COLORS[pct];
              return (
                <div key={w} className="min-w-[60px] flex-1">
                  <div className={cn(
                    'w-full h-full min-h-[36px] border-r border-b flex items-center justify-center',
                    'text-[10px] font-bold',
                    pct ? [colors?.bg, colors?.text] : ''
                  )}>
                    {pct ? `${pct}%` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Skeleton>
  );
}
