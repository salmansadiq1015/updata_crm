'use client';

import { Skeleton } from 'boneyard-js/react';
import { cn } from '@/lib/utils';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

const CONFLICTS = [
  { severity: 'HARD', type: 'Doppelbuchung', desc: 'Max Müller ist bereits um 09:00-11:00 für Serviceeinsatz #1234 eingeteilt.', date: '24.04.2026 08:30' },
  { severity: 'SOFT', type: 'Fahrzeit', desc: 'Nur 15 Min. zwischen Standorten — empfohlene Fahrzeit 45 Min.', date: '24.04.2026 10:00' },
  { severity: 'HARD', type: 'Abwesenheit', desc: 'Anna Fischer ist am 25.04.2026 als krank gemeldet.', date: '25.04.2026 07:00' },
  { severity: 'SOFT', type: 'Arbeitszeiten', desc: 'Einsatz endet um 19:30 — ausserhalb der regulären Arbeitszeit.', date: '23.04.2026 17:00' },
];

const SEV = {
  HARD: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500' },
  SOFT: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500' },
};

export default function ConflictsFixture() {
  return (
    <Skeleton name="deploy-conflict-list" loading={false}>
      <div className="space-y-3">
        {CONFLICTS.map((c, i) => {
          const sev = SEV[c.severity];
          return (
            <div key={i} className={cn('rounded-lg border p-4 space-y-2', sev.bg)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {c.severity === 'HARD'
                    ? <ShieldAlert className={cn('h-4 w-4 mt-0.5 shrink-0', sev.color)} />
                    : <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', sev.color)} />
                  }
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className={sev.color}>{c.severity === 'HARD' ? 'Hart' : 'Weich'}</span>
                      <span className="text-muted-foreground">{c.type}</span>
                    </div>
                    <p className="text-xs text-foreground mt-0.5">{c.desc}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Erkannt: {c.date}</p>
                  </div>
                </div>
                <button className="text-xs shrink-0 border rounded px-2 py-1">Lösen</button>
              </div>
            </div>
          );
        })}
      </div>
    </Skeleton>
  );
}
