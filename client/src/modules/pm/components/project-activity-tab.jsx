'use client';

import { useQuery } from '@tanstack/react-query';
import { projectService } from '@/modules/pm/services/project-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { EmptyState } from '@/shared/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  FilePlus2, FileText, Pencil, Trash2, ArchiveRestore, Archive,
  ArrowRightLeft, CalendarClock, ClipboardList, Mail, Activity,
} from 'lucide-react';

// Humanized labels + icon per audit eventType (PROJ-005 AC-6 activity log).
const EVENT_CONFIG = {
  'project.created': { label: 'Project created', labelDe: 'Projekt erstellt', icon: FilePlus2, tone: 'text-emerald-500' },
  'project.created_from_template': { label: 'Created from template', labelDe: 'Aus Vorlage erstellt', icon: FilePlus2, tone: 'text-emerald-500' },
  'project.updated': { label: 'Project updated', labelDe: 'Projekt aktualisiert', icon: Pencil, tone: 'text-blue-500' },
  'project.deleted': { label: 'Project deleted', labelDe: 'Projekt gelöscht', icon: Trash2, tone: 'text-destructive' },
  'project.restored': { label: 'Project restored', labelDe: 'Projekt wiederhergestellt', icon: ArchiveRestore, tone: 'text-emerald-500' },
  'project.archived': { label: 'Project archived', labelDe: 'Projekt archiviert', icon: Archive, tone: 'text-amber-500' },
  'project.duplicated': { label: 'Project duplicated', labelDe: 'Projekt dupliziert', icon: FileText, tone: 'text-blue-500' },
  'project.status.changed': { label: 'Status changed', labelDe: 'Status geändert', icon: ArrowRightLeft, tone: 'text-blue-500' },
  'project.status.overridden': { label: 'Status overridden', labelDe: 'Status übersteuert', icon: ArrowRightLeft, tone: 'text-amber-500' },
  'project_document.uploaded': { label: 'Document uploaded', labelDe: 'Dokument hochgeladen', icon: FileText, tone: 'text-blue-500' },
  'project_document.generated': { label: 'Document generated', labelDe: 'Dokument generiert', icon: FileText, tone: 'text-brand-500' },
  'project_document.updated': { label: 'Document updated', labelDe: 'Dokument aktualisiert', icon: Pencil, tone: 'text-blue-500' },
  'project_document.deleted': { label: 'Document deleted', labelDe: 'Dokument gelöscht', icon: Trash2, tone: 'text-destructive' },
  'project_document.restored': { label: 'Document restored', labelDe: 'Dokument wiederhergestellt', icon: ArchiveRestore, tone: 'text-emerald-500' },
  'project_document.draft_saved': { label: 'Draft saved', labelDe: 'Entwurf gespeichert', icon: FileText, tone: 'text-muted-foreground' },
  'project_document.emailed': { label: 'Document emailed', labelDe: 'Dokument per E-Mail gesendet', icon: Mail, tone: 'text-blue-500' },
  'partner_confirmation.sent': { label: 'Confirmation sent', labelDe: 'Bestätigung gesendet', icon: CalendarClock, tone: 'text-blue-500' },
  'partner_confirmation.response': { label: 'Confirmation response', labelDe: 'Bestätigungsantwort', icon: CalendarClock, tone: 'text-emerald-500' },
};

function labelFor(eventType, language) {
  const cfg = EVENT_CONFIG[eventType];
  if (cfg) return language === 'de' ? cfg.labelDe : cfg.label;
  // Fallback: prefix prep_action.* / schedule.* nicely.
  return eventType.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ProjectActivityTab({ projectId }) {
  const { language } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['pm', 'projects', 'activity', projectId],
    queryFn: () => projectService.getActivity(projectId),
    enabled: !!projectId,
  });

  const entries = Array.isArray(data) ? data : [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title={language === 'de' ? 'Keine Aktivität' : 'No activity'}
        description={language === 'de'
          ? 'Aktionen an diesem Projekt erscheinen hier.'
          : 'Actions taken on this project will appear here.'}
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-2 shadow-theme-sm">
      <ul className="divide-y divide-border/40">
        {entries.map((e, idx) => {
          const cfg = EVENT_CONFIG[e.eventType];
          const Icon = cfg?.icon || Activity;
          const when = e.timestamp || e.createdAt;
          return (
            <li key={e._id || idx} className="flex items-start gap-3 px-3 py-2.5">
              <div className="mt-0.5 h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                <Icon className={cn('h-3.5 w-3.5', cfg?.tone || 'text-muted-foreground')} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {labelFor(e.eventType, language)}
                  {e.userName && (
                    <span className="text-muted-foreground font-normal"> · {e.userName}</span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {when ? formatDate(when) : ''}
                  {e.result && e.result !== 'success' && (
                    <span className="ml-2 text-destructive">{e.result}</span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
