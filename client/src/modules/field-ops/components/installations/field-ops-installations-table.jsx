'use client';

import { useFieldOpsInstallations } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { Wrench, CalendarDays, ShieldCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

function InfoChip({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="text-muted-foreground/70">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

export function FieldOpsInstallationsTable({ siteId }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { data: installations = [], isLoading } = useFieldOpsInstallations(siteId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  if (!siteId || !installations.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-20 w-20 rounded-full bg-muted/60 animate-ping opacity-20" />
          <div className="relative flex items-center justify-center h-16 w-16 rounded-full bg-muted">
            <Wrench className="h-7 w-7 text-muted-foreground/50 animate-bounce" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground/70">
            {de ? 'Keine Anlagen gefunden' : 'No installations found'}
          </p>
          <p className="text-xs text-muted-foreground">
            {de
              ? 'Anlagen werden im CRM-Modul gepflegt und dem Standort zugeordnet.'
              : 'Installations are managed in the CRM module and linked to a site.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {installations.map((inst) => (
        <div key={inst.id || inst._id} className="border border-border rounded-xl px-4 py-3.5 space-y-2 hover:bg-muted/30 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary shrink-0">
                <Wrench className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{inst.model || inst.system_type || inst.type || inst.name || '—'}</p>
                {(inst.manufacturer || inst.brand) && (
                  <p className="text-xs text-muted-foreground">{inst.manufacturer || inst.brand}</p>
                )}
              </div>
            </div>
            {(inst.serialNumber || inst.serial_number) && (
              <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
                {inst.serialNumber || inst.serial_number}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 pl-10">
            <InfoChip
              icon={CalendarDays}
              label={de ? 'Eingebaut' : 'Installed'}
              value={(inst.commissioning_date || inst.installationDate) ? formatDate(inst.commissioning_date || inst.installationDate) : null}
            />
            <InfoChip
              icon={ShieldCheck}
              label={de ? 'Garantie bis' : 'Warranty'}
              value={(inst.warranty_until || inst.warrantyExpiry) ? formatDate(inst.warranty_until || inst.warrantyExpiry) : null}
            />
            <InfoChip
              icon={Clock}
              label={de ? 'Letzter Service' : 'Last service'}
              value={inst.lastServiceDate ? formatDate(inst.lastServiceDate) : null}
            />
          </div>

          {inst.location && (
            <p className="text-xs text-muted-foreground pl-10">{inst.location}</p>
          )}
        </div>
      ))}
    </div>
  );
}
