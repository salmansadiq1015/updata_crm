'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Loader2, Lock, Users } from 'lucide-react';
import { scheduleService } from '@/modules/pm/services/schedule-service';
import { useScheduleMutations } from '@/modules/pm/hooks/use-schedule-mutations';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { cn } from '@/lib/utils';

const fmtDate = (v) => (v ? new Date(v).toLocaleString('de-CH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtSize = (b) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/**
 * Protokolle tab: the Terminprotokoll PDFs generated for the project. Create a
 * new internal/external protocol and download existing ones. The same PDFs also
 * appear in the project's Dokumente (they are generatedDocuments).
 */
export function ProjectProtocolsTab({ projectId }) {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('projects:write');
  const [busyId, setBusyId] = useState(null);

  const { data: protocols = [], isLoading } = useQuery({
    queryKey: ['pm', 'schedule', 'protocols', projectId],
    queryFn: () => scheduleService.listProtocols(projectId),
    enabled: !!projectId,
  });
  const { exportSchedule } = useScheduleMutations(projectId);

  const download = async (p) => {
    setBusyId(p.id);
    try {
      const url = await scheduleService.getGeneratedDocumentDownloadUrl(p.id);
      if (url) window.open(url, '_blank', 'noopener');
      else showError(t('pm.protocolNoUrl', 'Kein Download-Link verfügbar'));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Create */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-theme-sm">
        <h3 className="text-sm font-semibold">{t('pm.protocolCreate', 'Protokoll erstellen')}</h3>
        <p className="mb-4 mt-0.5 text-xs text-muted-foreground">
          {t('pm.protocolCreateDesc', 'Jede Terminplanung wird automatisch als PDF gespeichert. Wählen Sie die Art des Protokolls:')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <div className="mb-1 flex items-center gap-2">
              <Lock className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-semibold">{t('pm.protocolInternalTitle', 'Internes Protokoll')}</span>
            </div>
            <ul className="mb-3 space-y-0.5 text-[12px] text-muted-foreground">
              <li>· {t('pm.protocolInternF1', 'Alle beteiligten Mitarbeiter')}</li>
              <li>· {t('pm.protocolInternF2', 'Zuständigkeiten')}</li>
              <li>· {t('pm.protocolInternF3', 'Einsatzplanung & interne Notizen')}</li>
            </ul>
            {canWrite && (
              <Button size="sm" className="w-full gap-1.5" disabled={exportSchedule.isPending} onClick={() => exportSchedule.mutate({ format: 'pdf', variant: 'internal' })}>
                {exportSchedule.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {t('pm.protocolCreateInternal', 'Internes Protokoll erstellen')}
              </Button>
            )}
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="mb-1 flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold">{t('pm.protocolExternalTitle', 'Externes Protokoll')}</span>
            </div>
            <ul className="mb-3 space-y-0.5 text-[12px] text-muted-foreground">
              <li>· MB Boiler & Heizung AG</li>
              <li>· {t('pm.protocolExternF2', 'Verantwortlicher Projektleiter')}</li>
              <li>· {t('pm.protocolExternF3', 'Nur kundenrelevante Informationen')}</li>
            </ul>
            {canWrite && (
              <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={exportSchedule.isPending} onClick={() => exportSchedule.mutate({ format: 'pdf', variant: 'external' })}>
                {exportSchedule.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {t('pm.protocolCreateExternal', 'Externes Protokoll erstellen')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">{t('pm.protocolArchive', 'Gespeicherte Protokolle')}</h3>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
        ) : protocols.length === 0 ? (
          <EmptyState icon={FileText} title={t('pm.protocolEmpty', 'Noch keine Protokolle')} description={t('pm.protocolEmptyDesc', 'Erstellen Sie oben ein internes oder externes Protokoll.')} />
        ) : (
          <div className="space-y-2">
            {protocols.map((p) => {
              const external = p.variant === 'external';
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', external ? 'bg-emerald-500/10' : 'bg-violet-500/10')}>
                    {external ? <Users className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-violet-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{p.fileName}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', external ? 'bg-emerald-500/10 text-emerald-600' : 'bg-violet-500/10 text-violet-600')}>
                        {external ? t('pm.protocolExtBadge', 'Extern') : t('pm.protocolIntBadge', 'Intern')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{fmtDate(p.generatedAt)}{p.fileSizeBytes ? ` · ${fmtSize(p.fileSizeBytes)}` : ''}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busyId === p.id} onClick={() => download(p)} title={t('common.download', 'Herunterladen')}>
                    {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
