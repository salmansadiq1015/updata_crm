'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2, CalendarClock, CheckCircle2, CircleAlert, ClipboardList,
  FolderKanban, MessageSquarePlus, MessagesSquare, Pencil, Trash2, User,
} from 'lucide-react';
import { contactLogService } from '@/modules/crm/services/contact-log-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconActionButton } from '@/shared/components/icon-action-button';
import { showError, showSuccess } from '@/lib/toast';
import { formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { CONTACT_CHANNEL_META } from '@/modules/crm/constants/contact-log-constants';
import { ContactLogDialog } from './contact-log-dialog';

const ALL = 'all';

/**
 * Kundenkontakthistorie list. On a customer it is the central view (`scope`
 * carries only customerId); on an object / project / order / assignment it
 * shows the exchanges naming that record, and new entries are pre-linked to it
 * through `links`.
 */
export function ContactLogPanel({ customerId, scope, links = {}, title, compact = false }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const currentUser = useAuthStore((s) => s.user);
  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const [channel, setChannel] = useState(ALL);
  const [view, setView] = useState(ALL); // all | openPoints | followUps
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const params = useMemo(() => ({
    ...(channel !== ALL ? { channel } : {}),
    ...(view === 'openPoints' ? { onlyOpenPoints: true } : {}),
    ...(view === 'followUps' ? { onlyFollowUps: true } : {}),
  }), [channel, view]);

  const isCustomerScope = !!scope?.customerId && Object.keys(scope).length === 1;
  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'contact-log', scope, params],
    queryFn: () => (isCustomerScope
      ? contactLogService.listByCustomer(scope.customerId, params)
      : contactLogService.list({ ...scope, ...params })),
    enabled: Object.values(scope || {}).some(Boolean),
    staleTime: 20_000,
  });
  const entries = Array.isArray(data) ? data : (data?.items || []);

  const remove = useMutation({
    mutationFn: (id) => contactLogService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'contact-log'] });
      showSuccess(t('crm.contactLog.deleted', 'Kontakteintrag gelöscht'));
      setDeleteTarget(null);
    },
    onError: (err) => showError(err),
  });

  const openNew = () => { setEditEntry(null); setDialogOpen(true); };
  const openEdit = (entry) => { setEditEntry(entry); setDialogOpen(true); };

  // Edits stay with the author and inside the 24h window the server enforces —
  // don't offer a button that would only bounce back with an error.
  const canEdit = (entry) => canWrite
    && String(entry.createdBy) === String(currentUser?._id)
    && new Date(entry.editableUntil) > new Date();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{title || t('crm.contactLog.title', 'Kontakthistorie')}</h3>
          <span className="text-xs text-muted-foreground">({entries.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={view} onValueChange={setView}>
            <SelectTrigger className={cn('h-8 w-44 text-xs', view !== ALL && 'border-primary/40')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('crm.contactLog.viewAll', 'Alle Einträge')}</SelectItem>
              <SelectItem value="openPoints">{t('crm.contactLog.viewOpenPoints', 'Nur offene Punkte')}</SelectItem>
              <SelectItem value="followUps">{t('crm.contactLog.viewFollowUps', 'Nur Wiedervorlagen')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className={cn('h-8 w-40 text-xs', channel !== ALL && 'border-primary/40')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('crm.contactLog.allChannels', 'Alle Kontaktarten')}</SelectItem>
              {Object.entries(CONTACT_CHANNEL_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{t(`crm.contactLog.channel.${key}`, meta.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canWrite && (
            <Button size="sm" className="h-8 gap-1.5" onClick={openNew}>
              <MessageSquarePlus className="h-3.5 w-3.5" /> {t('crm.contactLog.new', 'Kontakt erfassen')}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={t('crm.contactLog.empty', 'Keine Kontakteinträge')}
          description={t('crm.contactLog.emptyDesc', 'Halten Sie hier fest, wann und worüber mit dem Kunden gesprochen wurde.')}
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <ContactLogRow
              key={entry._id}
              entry={entry}
              compact={compact}
              t={t}
              onEdit={canEdit(entry) ? () => openEdit(entry) : null}
              onDelete={canDelete ? () => setDeleteTarget(entry) : null}
            />
          ))}
        </ul>
      )}

      <ContactLogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customerId={customerId}
        entry={editEntry}
        links={links}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={t('crm.contactLog.deleteTitle', 'Kontakteintrag löschen')}
        description={t('crm.contactLog.deleteDesc', 'Der Eintrag wird aus der Kontakthistorie entfernt.')}
        confirmText={t('common.delete', 'Löschen')}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(deleteTarget._id)}
      />
    </div>
  );
}

function ContactLogRow({ entry, compact, t, onEdit, onDelete }) {
  const meta = CONTACT_CHANNEL_META[entry.channel] || CONTACT_CHANNEL_META.other;
  const Icon = meta.icon;
  const employee = entry.employeeId
    ? [entry.employeeId.firstName, entry.employeeId.lastName].filter(Boolean).join(' ') || entry.employeeId.email
    : null;
  const contactPerson = entry.contactId
    ? [entry.contactId.firstName, entry.contactId.lastName].filter(Boolean).join(' ')
    : null;
  const followUpDue = entry.followUpAt && new Date(entry.followUpAt) <= new Date();

  return (
    <li className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.bg)}>
          <Icon className={cn('h-4 w-4', meta.color)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-foreground">
              {entry.channel === 'other' && entry.channelLabel
                ? entry.channelLabel
                : t(`crm.contactLog.channel.${entry.channel}`, meta.label)}
            </span>
            {entry.subject && <span className="text-[13px] text-foreground">· {entry.subject}</span>}
            <span className="text-[11px] text-muted-foreground">{formatDateTime(entry.occurredAt)}</span>
            {employee && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <User className="h-3 w-3" /> {employee}
              </span>
            )}
            {contactPerson && (
              <span className="text-[11px] text-muted-foreground">
                {t('crm.contactLog.withPerson', 'mit')} {contactPerson}
              </span>
            )}
          </div>

          <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-foreground">{entry.note}</p>

          {(entry.agreements || entry.openPoints) && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {entry.agreements && (
                <Block
                  icon={CheckCircle2}
                  tone="text-emerald-600"
                  label={t('crm.contactLog.agreements', 'Vereinbarungen')}
                  value={entry.agreements}
                />
              )}
              {entry.openPoints && (
                <Block
                  icon={CircleAlert}
                  tone="text-amber-600"
                  label={t('crm.contactLog.openPoints', 'Offene Punkte')}
                  value={entry.openPoints}
                />
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {entry.followUpAt && (
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                followUpDue ? 'bg-red-500/10 text-red-600' : 'bg-sky-500/10 text-sky-600',
              )}>
                <CalendarClock className="h-3 w-3" />
                {t('crm.contactLog.followUp', 'Wiedervorlage')} {new Date(entry.followUpAt).toLocaleDateString('de-CH')}
              </span>
            )}
            {entry.followUpTaskId && (
              <Link
                href={`/tasks/${entry.followUpTaskId.listId}/${entry.followUpTaskId._id}`}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <ClipboardList className="h-3 w-3" /> {entry.followUpTaskId.title}
              </Link>
            )}
            {!compact && entry.siteId && (
              <LinkChip href={`/crm/sites/${entry.siteId._id}`} icon={Building2} label={entry.siteId.name} />
            )}
            {!compact && entry.projectId && (
              <LinkChip href={`/projects/${entry.projectId._id}`} icon={FolderKanban} label={entry.projectId.name} />
            )}
          </div>
        </div>

        {(onEdit || onDelete) && (
          <div className="flex shrink-0 items-start gap-0.5">
            {onEdit && <IconActionButton label={t('common.edit', 'Bearbeiten')} icon={Pencil} onClick={onEdit} />}
            {onDelete && <IconActionButton label={t('common.delete', 'Löschen')} icon={Trash2} destructive onClick={onDelete} />}
          </div>
        )}
      </div>
    </li>
  );
}

function Block({ icon: Icon, tone, label, value }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2">
      <p className={cn('mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide', tone)}>
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="whitespace-pre-wrap text-[12px] text-foreground">{value}</p>
    </div>
  );
}

function LinkChip({ href, icon: Icon, label }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
    >
      <Icon className="h-3 w-3" /> {label}
    </Link>
  );
}
