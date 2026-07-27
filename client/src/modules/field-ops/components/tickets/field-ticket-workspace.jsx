'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';
import { useFieldTickets, useFieldTicketDetail } from '@/modules/field-ops/hooks/use-field-ticket-queries';
import { useFieldTicketMutations } from '@/modules/field-ops/hooks/use-field-ticket-mutations';
import {
  FIELD_TICKET_PRIORITIES,
  FIELD_TICKET_PRIORITY_CONFIG,
  FIELD_TICKET_STATUS_CONFIG,
  FIELD_TICKET_STATUSES,
  FIELD_TICKET_TYPE_LABELS,
  FIELD_TICKET_TYPES,
  isTicketOverdue,
  labelFor,
  userDisplayName,
} from '@/modules/field-ops/utils/field-ticket-utils';

const DEFAULT_PAGE_SIZE = 25;
const ALL = 'all';
const UNASSIGNED = 'unassigned';

const EMPTY_FORM = {
  title: '',
  description: '',
  type: 'TECHNICAL_NOTIFICATION',
  priority: 'MEDIUM',
  status: 'OPEN',
  dueAt: '',
  assignedTo: UNASSIGNED,
  teamName: '',
  customerName: '',
  projectName: '',
  assetName: '',
  jobNumber: '',
};

function localDateTimeToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toTicketPayload(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    type: form.type,
    priority: form.priority,
    status: form.status,
    dueAt: localDateTimeToIso(form.dueAt),
    assignedTo: form.assignedTo === UNASSIGNED ? null : form.assignedTo,
    teamName: form.teamName.trim() || null,
    customerName: form.customerName.trim() || null,
    projectName: form.projectName.trim() || null,
    assetName: form.assetName.trim() || null,
    jobNumber: form.jobNumber.trim() || null,
  };
}

function StatusBadge({ status, locale }) {
  const config = FIELD_TICKET_STATUS_CONFIG[status] || FIELD_TICKET_STATUS_CONFIG.OPEN;
  return (
    <Badge variant="outline" className={cn('gap-1 border px-2 py-0.5 text-xs', config.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {labelFor(FIELD_TICKET_STATUS_CONFIG, status, locale)}
    </Badge>
  );
}

function PriorityBadge({ priority, locale }) {
  const config = FIELD_TICKET_PRIORITY_CONFIG[priority] || FIELD_TICKET_PRIORITY_CONFIG.MEDIUM;
  return (
    <Badge variant="outline" className={cn('gap-1 border px-2 py-0.5 text-xs', config.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {labelFor(FIELD_TICKET_PRIORITY_CONFIG, priority, locale)}
    </Badge>
  );
}

function SummaryCards({ summary, locale }) {
  const statusTotal = summary?.byStatus || {};
  const priorityTotal = summary?.byPriority || {};
  const cards = [
    { key: 'total', label: locale === 'de' ? 'Gesamt' : 'Total', value: summary?.total || 0, icon: MessageSquare },
    { key: 'critical', label: locale === 'de' ? 'Kritisch' : 'Critical', value: priorityTotal.CRITICAL || 0, icon: AlertTriangle },
    { key: 'open', label: locale === 'de' ? 'Offen' : 'Open', value: statusTotal.OPEN || 0, icon: Clock },
    { key: 'overdue', label: locale === 'de' ? 'Überfällig' : 'Overdue', value: summary?.overdue || 0, icon: AlertTriangle },
    { key: 'completed', label: locale === 'de' ? 'Erledigt' : 'Completed', value: statusTotal.COMPLETED || 0, icon: CheckCircle2 },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.key} className="rounded-lg border border-border/70 bg-card px-3 py-3 shadow-theme-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function TicketSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((item) => (
        <Skeleton key={item} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

function TicketTable({ tickets, selectedId, onSelect, locale }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="w-32 px-3 py-2 text-left font-medium">{locale === 'de' ? 'Ticket' : 'Ticket'}</th>
            <th className="px-3 py-2 text-left font-medium">{locale === 'de' ? 'Meldung' : 'Issue'}</th>
            <th className="w-28 px-3 py-2 text-left font-medium">{locale === 'de' ? 'Priorität' : 'Priority'}</th>
            <th className="w-32 px-3 py-2 text-left font-medium">{locale === 'de' ? 'Status' : 'Status'}</th>
            <th className="w-40 px-3 py-2 text-left font-medium">{locale === 'de' ? 'Techniker' : 'Technician'}</th>
            <th className="w-32 px-3 py-2 text-left font-medium">{locale === 'de' ? 'Fällig' : 'Due'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {tickets.map((ticket) => {
            const overdue = isTicketOverdue(ticket);
            const typeLabel = FIELD_TICKET_TYPE_LABELS[ticket.type];
            return (
              <tr
                key={ticket._id}
                onClick={() => onSelect(ticket._id)}
                className={cn(
                  'cursor-pointer bg-background transition-colors hover:bg-muted/40',
                  selectedId === ticket._id && 'bg-primary/5',
                )}
              >
                <td className="px-3 py-3 align-top">
                  <div className="font-mono text-xs font-semibold">{ticket.ticketNumber}</div>
                  {ticket.escalated && (
                    <div className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-300">
                      {locale === 'de' ? 'Eskaliert' : 'Escalated'}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="line-clamp-1 font-medium">{ticket.title}</div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {typeLabel ? (locale === 'de' ? typeLabel.de : typeLabel.en) : ticket.type}
                    {ticket.customerName ? ` · ${ticket.customerName}` : ''}
                    {ticket.projectName ? ` · ${ticket.projectName}` : ''}
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <PriorityBadge priority={ticket.priority} locale={locale} />
                </td>
                <td className="px-3 py-3 align-top">
                  <StatusBadge status={ticket.status} locale={locale} />
                </td>
                <td className="truncate px-3 py-3 align-top text-muted-foreground">
                  {userDisplayName(ticket.assignedTo, locale === 'de' ? 'Nicht zugewiesen' : 'Unassigned')}
                </td>
                <td className={cn('px-3 py-3 align-top text-xs', overdue ? 'font-semibold text-red-600 dark:text-red-300' : 'text-muted-foreground')}>
                  {ticket.dueAt ? formatDate(ticket.dueAt) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreateTicketDialog({ open, onOpenChange, users, onSubmit, isPending, locale }) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) setForm(EMPTY_FORM);
  }, [open]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    onSubmit(toTicketPayload(form));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{locale === 'de' ? 'Techniker-Meldung erstellen' : 'Create Technician Ticket'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">{locale === 'de' ? 'Titel' : 'Title'}</span>
              <Input value={form.title} onChange={(event) => update('title', event.target.value)} required maxLength={200} />
            </label>
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">{locale === 'de' ? 'Beschreibung' : 'Description'}</span>
              <Textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows={4} maxLength={5000} />
            </label>
            <TicketSelect label={locale === 'de' ? 'Typ' : 'Type'} value={form.type} onChange={(value) => update('type', value)} items={FIELD_TICKET_TYPES.map((type) => ({ value: type, label: FIELD_TICKET_TYPE_LABELS[type]?.[locale] || type }))} />
            <TicketSelect label={locale === 'de' ? 'Priorität' : 'Priority'} value={form.priority} onChange={(value) => update('priority', value)} items={FIELD_TICKET_PRIORITIES.map((priority) => ({ value: priority, label: labelFor(FIELD_TICKET_PRIORITY_CONFIG, priority, locale) }))} />
            <TicketSelect label={locale === 'de' ? 'Status' : 'Status'} value={form.status} onChange={(value) => update('status', value)} items={FIELD_TICKET_STATUSES.map((status) => ({ value: status, label: labelFor(FIELD_TICKET_STATUS_CONFIG, status, locale) }))} />
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{locale === 'de' ? 'Fällig' : 'Due'}</span>
              <Input type="datetime-local" value={form.dueAt} onChange={(event) => update('dueAt', event.target.value)} />
            </label>
            <TicketSelect
              label={locale === 'de' ? 'Techniker' : 'Technician'}
              value={form.assignedTo}
              onChange={(value) => update('assignedTo', value)}
              items={[
                { value: UNASSIGNED, label: locale === 'de' ? 'Nicht zugewiesen' : 'Unassigned' },
                ...users.map((user) => ({ value: user._id, label: userDisplayName(user) })),
              ]}
            />
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{locale === 'de' ? 'Team' : 'Team'}</span>
              <Input value={form.teamName} onChange={(event) => update('teamName', event.target.value)} maxLength={120} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{locale === 'de' ? 'Kunde' : 'Customer'}</span>
              <Input value={form.customerName} onChange={(event) => update('customerName', event.target.value)} maxLength={200} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{locale === 'de' ? 'Projekt' : 'Project'}</span>
              <Input value={form.projectName} onChange={(event) => update('projectName', event.target.value)} maxLength={200} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{locale === 'de' ? 'Komponente' : 'Asset'}</span>
              <Input value={form.assetName} onChange={(event) => update('assetName', event.target.value)} maxLength={200} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{locale === 'de' ? 'Jobnummer' : 'Job Number'}</span>
              <Input value={form.jobNumber} onChange={(event) => update('jobNumber', event.target.value)} maxLength={80} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{locale === 'de' ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={isPending || !form.title.trim()}>
              {isPending ? (locale === 'de' ? 'Erstellen...' : 'Creating...') : (locale === 'de' ? 'Erstellen' : 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketSelect({ label, value, onChange, items }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function DetailPanel({ ticket, isLoading, users, mutations, locale }) {
  const [status, setStatus] = useState('OPEN');
  const [assignedTo, setAssignedTo] = useState(UNASSIGNED);
  const [teamName, setTeamName] = useState('');
  const [comment, setComment] = useState('');
  const [attachment, setAttachment] = useState({ url: '', originalName: '', kind: 'DOCUMENT' });

  useEffect(() => {
    if (!ticket) return;
    setStatus(ticket.status || 'OPEN');
    setAssignedTo((ticket.assignedTo?._id || ticket.assignedTo) || UNASSIGNED);
    setTeamName(ticket.teamName || '');
    setComment('');
    setAttachment({ url: '', originalName: '', kind: 'DOCUMENT' });
  }, [ticket]);

  if (isLoading) {
    return <div className="rounded-lg border border-border/70 p-4"><TicketSkeleton /></div>;
  }

  if (!ticket) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-border/80 p-6 text-center text-sm text-muted-foreground">
        {locale === 'de' ? 'Ticket auswählen' : 'Select a ticket'}
      </div>
    );
  }

  const submitComment = async () => {
    if (!comment.trim()) return;
    await mutations.addComment.mutateAsync({ id: ticket._id, data: { body: comment.trim(), visibility: 'INTERNAL' } });
    setComment('');
    toast.success(locale === 'de' ? 'Kommentar gespeichert' : 'Comment saved');
  };

  const submitAttachment = async () => {
    if (!attachment.url.trim()) return;
    await mutations.addAttachment.mutateAsync({ id: ticket._id, data: { ...attachment, url: attachment.url.trim(), originalName: attachment.originalName.trim() || null } });
    setAttachment({ url: '', originalName: '', kind: 'DOCUMENT' });
    toast.success(locale === 'de' ? 'Anhang verknüpft' : 'Attachment linked');
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{ticket.ticketNumber}</div>
          <h2 className="mt-1 text-lg font-semibold leading-tight">{ticket.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{ticket.description || (locale === 'de' ? 'Keine Beschreibung' : 'No description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PriorityBadge priority={ticket.priority} locale={locale} />
          <StatusBadge status={ticket.status} locale={locale} />
        </div>
      </div>

      <div className="grid gap-2 text-sm md:grid-cols-2">
        <Info label={locale === 'de' ? 'Techniker' : 'Technician'} value={userDisplayName(ticket.assignedTo, locale === 'de' ? 'Nicht zugewiesen' : 'Unassigned')} />
        <Info label={locale === 'de' ? 'Team' : 'Team'} value={ticket.teamName || '—'} />
        <Info label={locale === 'de' ? 'Kunde' : 'Customer'} value={ticket.customerName || '—'} />
        <Info label={locale === 'de' ? 'Projekt' : 'Project'} value={ticket.projectName || '—'} />
        <Info label={locale === 'de' ? 'Komponente' : 'Asset'} value={ticket.assetName || '—'} />
        <Info label={locale === 'de' ? 'Fällig' : 'Due'} value={ticket.dueAt ? formatDate(ticket.dueAt) : '—'} />
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <TicketSelect
          label={locale === 'de' ? 'Status aktualisieren' : 'Update Status'}
          value={status}
          onChange={setStatus}
          items={FIELD_TICKET_STATUSES.map((value) => ({ value, label: labelFor(FIELD_TICKET_STATUS_CONFIG, value, locale) }))}
        />
        <Button
          className="self-end"
          disabled={status === ticket.status || mutations.changeStatus.isPending}
          onClick={async () => {
            await mutations.changeStatus.mutateAsync({ id: ticket._id, status });
            toast.success(locale === 'de' ? 'Status aktualisiert' : 'Status updated');
          }}
        >
          {locale === 'de' ? 'Speichern' : 'Save'}
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <TicketSelect
          label={locale === 'de' ? 'Zuweisen' : 'Assign'}
          value={assignedTo}
          onChange={setAssignedTo}
          items={[
            { value: UNASSIGNED, label: locale === 'de' ? 'Nicht zugewiesen' : 'Unassigned' },
            ...users.map((user) => ({ value: user._id, label: userDisplayName(user) })),
          ]}
        />
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">{locale === 'de' ? 'Team' : 'Team'}</span>
          <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={120} />
        </label>
        <Button
          className="self-end"
          variant="outline"
          disabled={mutations.assignTicket.isPending}
          onClick={async () => {
            await mutations.assignTicket.mutateAsync({
              id: ticket._id,
              data: { assignedTo: assignedTo === UNASSIGNED ? null : assignedTo, teamName: teamName.trim() || null },
            });
            toast.success(locale === 'de' ? 'Zuweisung aktualisiert' : 'Assignment updated');
          }}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {locale === 'de' ? 'Zuweisen' : 'Assign'}
        </Button>
      </div>

      <div className="rounded-lg border border-border/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4 text-primary" />
            {locale === 'de' ? 'AI Empfehlung' : 'AI Recommendation'}
          </div>
          <Button size="sm" variant="outline" disabled={mutations.analyzeTicket.isPending} onClick={() => mutations.analyzeTicket.mutate(ticket._id)}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            {locale === 'de' ? 'Analysieren' : 'Analyze'}
          </Button>
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <Info label={locale === 'de' ? 'Kategorie' : 'Category'} value={ticket.ai?.category || '—'} />
          <Info label={locale === 'de' ? 'Empfohlene Priorität' : 'Recommended Priority'} value={ticket.ai?.recommendedPriority || '—'} />
        </div>
        {ticket.ai?.nextActions?.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {ticket.ai.nextActions.map((action) => <li key={action}>- {action}</li>)}
          </ul>
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-lg border border-border/70 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4" />
            {locale === 'de' ? 'Interne Kommentare' : 'Internal Comments'}
          </div>
          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {(ticket.comments || []).slice().reverse().map((item) => (
              <div key={item._id} className="rounded-md bg-muted/50 p-2 text-xs">
                <div className="font-medium">{userDisplayName(item.authorId, locale === 'de' ? 'System' : 'System')}</div>
                <div className="mt-0.5 text-muted-foreground">{item.body}</div>
              </div>
            ))}
            {(ticket.comments || []).length === 0 && <p className="text-xs text-muted-foreground">{locale === 'de' ? 'Keine Kommentare' : 'No comments'}</p>}
          </div>
          <Textarea className="mt-2" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={5000} />
          <Button className="mt-2 w-full" size="sm" disabled={!comment.trim() || mutations.addComment.isPending} onClick={submitComment}>
            {locale === 'de' ? 'Kommentar speichern' : 'Save Comment'}
          </Button>
        </div>

        <div className="rounded-lg border border-border/70 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Paperclip className="h-4 w-4" />
            {locale === 'de' ? 'Medien & Dokumente' : 'Media & Documents'}
          </div>
          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {(ticket.attachments || []).slice().reverse().map((item) => (
              <a key={item._id} href={item.url || '#'} target="_blank" rel="noreferrer" className="block rounded-md bg-muted/50 p-2 text-xs hover:bg-muted">
                <div className="font-medium">{item.originalName || item.url || item.kind}</div>
                <div className="mt-0.5 text-muted-foreground">{item.kind}</div>
              </a>
            ))}
            {(ticket.attachments || []).length === 0 && <p className="text-xs text-muted-foreground">{locale === 'de' ? 'Keine Anhänge' : 'No attachments'}</p>}
          </div>
          <div className="mt-2 grid gap-2">
            <Input value={attachment.url} onChange={(event) => setAttachment((prev) => ({ ...prev, url: event.target.value }))} placeholder="https://..." />
            <div className="grid grid-cols-[1fr_130px] gap-2">
              <Input value={attachment.originalName} onChange={(event) => setAttachment((prev) => ({ ...prev, originalName: event.target.value }))} placeholder={locale === 'de' ? 'Dateiname' : 'Filename'} />
              <Select value={attachment.kind} onValueChange={(value) => setAttachment((prev) => ({ ...prev, kind: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['PHOTO', 'VIDEO', 'DOCUMENT', 'OTHER'].map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" disabled={!attachment.url.trim() || mutations.addAttachment.isPending} onClick={submitAttachment}>
              {locale === 'de' ? 'Anhang verknüpfen' : 'Link Attachment'}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 p-3">
        <div className="mb-2 text-sm font-medium">{locale === 'de' ? 'Aktivität & Audit' : 'Activity & Audit'}</div>
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {(ticket.activity || []).slice().reverse().map((item) => (
            <div key={item._id} className="flex gap-2 text-xs">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
              <div>
                <div className="font-medium">{item.message || item.type}</div>
                <div className="text-muted-foreground">{formatDate(item.at)} · {userDisplayName(item.actorId, locale === 'de' ? 'System' : 'System')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate">{value}</div>
    </div>
  );
}

export function FieldTicketWorkspace() {
  const searchParams = useSearchParams();
  const initialTicketId = searchParams.get('ticketId');
  const { locale, t } = useLanguage();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialTicketId || null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [assignedTo, setAssignedTo] = useState(ALL);
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [cursorStack, setCursorStack] = useState([]);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const debouncedSearch = useDebounce(search, 300);
  const cursor = cursorStack[cursorStack.length - 1];

  const { data: users = [] } = useUserDirectory({ limit: 120 });
  const mutations = useFieldTicketMutations();

  const filters = useMemo(() => {
    const next = {
      limit: pageSize,
      sortBy: overdue ? 'dueAt' : 'createdAt',
      sortOrder: overdue ? 'asc' : 'desc',
    };
    if (cursor) next.cursor = cursor;
    if (debouncedSearch) next.q = debouncedSearch;
    if (status !== ALL) next.status = status;
    if (priority !== ALL) next.priority = priority;
    if (assignedTo !== ALL) next.assignedTo = assignedTo;
    if (customerId.trim()) next.customerId = customerId.trim();
    if (projectId.trim()) next.projectId = projectId.trim();
    if (overdue) next.overdue = true;
    return next;
  }, [assignedTo, cursor, customerId, debouncedSearch, overdue, pageSize, priority, projectId, status]);

  const resetPaging = useCallback(() => setCursorStack([]), []);
  const ticketsQuery = useFieldTickets(filters);
  const detailQuery = useFieldTicketDetail(selectedId);
  const tickets = ticketsQuery.data?.items || [];
  const pagination = ticketsQuery.data?.pagination || {};
  const summary = ticketsQuery.data?.summary || {};

  const clearFilters = () => {
    setSearch('');
    setStatus(ALL);
    setPriority(ALL);
    setAssignedTo(ALL);
    setCustomerId('');
    setProjectId('');
    setOverdue(false);
    resetPaging();
  };

  const createTicket = async (payload) => {
    const ticket = await mutations.createTicket.mutateAsync(payload);
    setCreateOpen(false);
    setSelectedId(ticket._id);
    toast.success(locale === 'de' ? 'Ticket erstellt' : 'Ticket created');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('fieldTickets.title', locale === 'de' ? 'Techniker-Meldungen' : 'Technician Tickets')}
        description={t('fieldTickets.subtitle', locale === 'de' ? 'Serviceanfragen, Vorfälle und Wartungsthemen priorisieren und verfolgen' : 'Prioritize and track service requests, incidents, and maintenance issues')}
      >
        <Button variant="outline" onClick={() => ticketsQuery.refetch()} disabled={ticketsQuery.isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {locale === 'de' ? 'Aktualisieren' : 'Refresh'}
        </Button>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {locale === 'de' ? 'Neu' : 'New'}
        </Button>
      </PageHeader>

      <SummaryCards summary={summary} locale={locale} />

      <div className="grid gap-3 rounded-lg border border-border/70 bg-card p-3 lg:grid-cols-[1.4fr_repeat(4,minmax(140px,0.6fr))_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => { setSearch(event.target.value); resetPaging(); }} className="pl-9" placeholder={locale === 'de' ? 'Suchen...' : 'Search...'} />
        </label>
        <Select value={status} onValueChange={(value) => { setStatus(value); resetPaging(); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{locale === 'de' ? 'Alle Status' : 'All Statuses'}</SelectItem>
            {FIELD_TICKET_STATUSES.map((value) => <SelectItem key={value} value={value}>{labelFor(FIELD_TICKET_STATUS_CONFIG, value, locale)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(value) => { setPriority(value); resetPaging(); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{locale === 'de' ? 'Alle Prioritäten' : 'All Priorities'}</SelectItem>
            {FIELD_TICKET_PRIORITIES.map((value) => <SelectItem key={value} value={value}>{labelFor(FIELD_TICKET_PRIORITY_CONFIG, value, locale)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={assignedTo} onValueChange={(value) => { setAssignedTo(value); resetPaging(); }}>
          <SelectTrigger><SelectValue placeholder={locale === 'de' ? 'Techniker' : 'Technician'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{locale === 'de' ? 'Alle Techniker' : 'All Technicians'}</SelectItem>
            {users.map((user) => <SelectItem key={user._id} value={user._id}>{userDisplayName(user)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={overdue ? 'default' : 'outline'} onClick={() => { setOverdue((value) => !value); resetPaging(); }}>
          <AlertTriangle className="mr-2 h-4 w-4" />
          {locale === 'de' ? 'Überfällig' : 'Overdue'}
        </Button>
        <Button variant="ghost" onClick={clearFilters}>{locale === 'de' ? 'Zurücksetzen' : 'Reset'}</Button>
        <Input value={customerId} onChange={(event) => { setCustomerId(event.target.value); resetPaging(); }} placeholder={locale === 'de' ? 'Kunden-ID' : 'Customer ID'} />
        <Input value={projectId} onChange={(event) => { setProjectId(event.target.value); resetPaging(); }} placeholder={locale === 'de' ? 'Projekt-ID' : 'Project ID'} />
        <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); resetPaging(); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((value) => <SelectItem key={value} value={String(value)}>{value} / page</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.9fr)]">
        <div className="space-y-3">
          {ticketsQuery.isLoading ? (
            <TicketSkeleton />
          ) : ticketsQuery.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
              {ticketsQuery.error?.message || (locale === 'de' ? 'Tickets konnten nicht geladen werden.' : 'Tickets could not be loaded.')}
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
              {locale === 'de' ? 'Keine Tickets gefunden' : 'No tickets found'}
            </div>
          ) : (
            <TicketTable tickets={tickets} selectedId={selectedId} onSelect={setSelectedId} locale={locale} />
          )}

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" disabled={cursorStack.length === 0 || ticketsQuery.isFetching} onClick={() => setCursorStack((stack) => stack.slice(0, -1))}>
              {locale === 'de' ? 'Zurück' : 'Previous'}
            </Button>
            <span className="text-xs text-muted-foreground">{tickets.length} {locale === 'de' ? 'Einträge' : 'items'}</span>
            <Button variant="outline" disabled={!pagination.hasNext || ticketsQuery.isFetching} onClick={() => setCursorStack((stack) => [...stack, pagination.nextCursor])}>
              {locale === 'de' ? 'Weiter' : 'Next'}
            </Button>
          </div>
        </div>

        <DetailPanel ticket={detailQuery.data} isLoading={detailQuery.isLoading && !!selectedId} users={users} mutations={mutations} locale={locale} />
      </div>

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} users={users} onSubmit={createTicket} isPending={mutations.createTicket.isPending} locale={locale} />
    </div>
  );
}
