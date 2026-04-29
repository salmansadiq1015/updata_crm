'use client';

import { useFieldOpsInstallations } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';

export function FieldOpsInstallationsTable({ siteId }) {
  const { language } = useLanguage();
  const { data: installations = [], isLoading } = useFieldOpsInstallations(siteId);

  if (isLoading) return <div className="space-y-2">{[1,2].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}</div>;
  if (!installations.length) return <p className="text-sm text-muted-foreground py-4">{language === 'de' ? 'Keine Anlagen gefunden.' : 'No installations found.'}</p>;

  return (
    <div className="space-y-2">
      {installations.map((inst) => (
        <div key={inst._id} className="border rounded-lg px-4 py-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{inst.model || inst.type || '—'}</p>
            <span className="text-xs font-mono text-muted-foreground">{inst.serialNumber || inst.serial_number}</span>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            {inst.installationDate && <span>{language === 'de' ? 'Eingebaut' : 'Installed'}: {formatDate(inst.installationDate)}</span>}
            {inst.warrantyExpiry && <span>{language === 'de' ? 'Garantie bis' : 'Warranty'}: {formatDate(inst.warrantyExpiry)}</span>}
            {inst.lastServiceDate && <span>{language === 'de' ? 'Letzter Service' : 'Last service'}: {formatDate(inst.lastServiceDate)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
