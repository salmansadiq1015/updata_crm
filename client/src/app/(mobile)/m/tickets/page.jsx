'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, MessageSquare, Plus } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useTickets, useTicketMutations } from '@/modules/mobile/hooks/use-ticket-queries';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

const ALL = 'all';
const EMPTY_FORM = {
  title: '',
  description: '',
  type: 'TECHNICAL_NOTIFICATION',
  priority: 'MEDIUM',
  dueAt: '',
  customerName: '',
  projectName: '',
  assetName: '',
};

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function MobilePriority({ value, locale }) {
  const config = FIELD_TICKET_PRIORITY_CONFIG[value] || FIELD_TICKET_PRIORITY_CONFIG.MEDIUM;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', config.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {labelFor(FIELD_TICKET_PRIORITY_CONFIG, value, locale)}
    </span>
  );
}

function MobileStatus({ value, locale }) {
  const config = FIELD_TICKET_STATUS_CONFIG[value] || FIELD_TICKET_STATUS_CONFIG.OPEN;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', config.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {labelFor(FIELD_TICKET_STATUS_CONFIG, value, locale)}
    </span>
  );
}

function CreateDialog({ open, onOpenChange, locale, onSubmit, isPending }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    await onSubmit({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      dueAt: toIso(form.dueAt),
      customerName: form.customerName.trim() || null,
      projectName: form.projectName.trim() || null,
      assetName: form.assetName.trim() || null,
    });
    setForm(EMPTY_FORM);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh]">
        <DialogHeader>
          <DialogTitle>{locale === 'de' ? 'Ticket erstellen' : 'Create Ticket'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder={locale === 'de' ? 'Titel' : 'Title'} required maxLength={200} />
          <Textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder={locale === 'de' ? 'Beschreibung' : 'Description'} rows={4} maxLength={5000} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.type} onValueChange={(value) => update('type', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TICKET_TYPES.map((type) => <SelectItem key={type} value={type}>{FIELD_TICKET_TYPE_LABELS[type]?.[locale] || type}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.priority} onValueChange={(value) => update('priority', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TICKET_PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{labelFor(FIELD_TICKET_PRIORITY_CONFIG, priority, locale)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input type="datetime-local" value={form.dueAt} onChange={(event) => update('dueAt', event.target.value)} />
          <Input value={form.customerName} onChange={(event) => update('customerName', event.target.value)} placeholder={locale === 'de' ? 'Kunde' : 'Customer'} maxLength={200} />
          <Input value={form.projectName} onChange={(event) => update('projectName', event.target.value)} placeholder={locale === 'de' ? 'Projekt' : 'Project'} maxLength={200} />
          <Input value={form.assetName} onChange={(event) => update('assetName', event.target.value)} placeholder={locale === 'de' ? 'Anlage' : 'Asset'} maxLength={200} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{locale === 'de' ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={isPending || !form.title.trim()}>{locale === 'de' ? 'Erstellen' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketCard({ ticket, locale, expanded, onExpand, mutations }) {
  const [status, setStatus] = useState(ticket.status);
  const [comment, setComment] = useState('');
  const overdue = isTicketOverdue(ticket);

  const saveStatus = async () => {
    await mutations.changeStatus.mutateAsync({ id: ticket._id, status });
    toast.success(locale === 'de' ? 'Status aktualisiert' : 'Status updated');
  };

  const saveComment = async () => {
    if (!comment.trim()) return;
    await mutations.addComment.mutateAsync({ id: ticket._id, data: { body: comment.trim(), visibility: 'INTERNAL' } });
    setComment('');
    toast.success(locale === 'de' ? 'Kommentar gespeichert' : 'Comment saved');
  };

  return (
    <div className="border-b border-border bg-background">
      <button onClick={onExpand} className="w-full px-4 py-3 text-left active:bg-muted/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[11px] text-muted-foreground">{ticket.ticketNumber}</div>
            <div className="mt-0.5 line-clamp-2 text-sm font-semibold">{ticket.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {ticket.customerName || ticket.projectName || userDisplayName(ticket.assignedTo, locale === 'de' ? 'Nicht zugewiesen' : 'Unassigned')}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <MobilePriority value={ticket.priority} locale={locale} />
            <MobileStatus value={ticket.status} locale={locale} />
          </div>
        </div>
        <div className={cn('mt-2 flex items-center gap-2 text-xs', overdue ? 'text-red-600 dark:text-red-300' : 'text-muted-foreground')}>
          {overdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {ticket.dueAt ? formatDate(ticket.dueAt) : (locale === 'de' ? 'Kein Fälligkeitsdatum' : 'No due date')}
        </div>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-border/70 bg-muted/20 px-4 py-3">
          {ticket.description && <p className="text-sm text-muted-foreground">{ticket.description}</p>}
          {ticket.ai?.nextActions?.length > 0 && (
            <div className="rounded-lg bg-background p-3 text-xs">
              <div className="mb-1 font-medium">{locale === 'de' ? 'AI nächste Schritte' : 'AI Next Actions'}</div>
              <ul className="space-y-1 text-muted-foreground">
                {ticket.ai.nextActions.slice(0, 3).map((action) => <li key={action}>- {action}</li>)}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TICKET_STATUSES.map((value) => <SelectItem key={value} value={value}>{labelFor(FIELD_TICKET_STATUS_CONFIG, value, locale)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={status === ticket.status || mutations.changeStatus.isPending} onClick={saveStatus}>
              {locale === 'de' ? 'Status' : 'Status'}
            </Button>
          </div>
          <Textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder={locale === 'de' ? 'Interner Kommentar' : 'Internal comment'} />
          <Button size="sm" variant="outline" disabled={!comment.trim() || mutations.addComment.isPending} onClick={saveComment} className="w-full">
            <MessageSquare className="mr-2 h-4 w-4" />
            {locale === 'de' ? 'Kommentieren' : 'Comment'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function MobileTicketsPage() {
  const { locale, t } = useLanguage();
  const [createOpen, setCreateOpen] = useState(false);
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [expandedId, setExpandedId] = useState(null);
  const mutations = useTicketMutations();

  const filters = useMemo(() => {
    const next = { limit: 50, sortBy: 'dueAt', sortOrder: 'asc' };
    if (status !== ALL) next.status = status;
    if (priority !== ALL) next.priority = priority;
    return next;
  }, [priority, status]);

  const { data, isLoading, isError, refetch } = useTickets(filters);
  const tickets = data?.items || [];

  const createTicket = async (payload) => {
    await mutations.createTicket.mutateAsync(payload);
    setCreateOpen(false);
    toast.success(locale === 'de' ? 'Ticket erstellt' : 'Ticket created');
  };

  return (
    <div className="flex min-h-full flex-col">
      <MobileHeader
        title={t('mobile.tickets.title', locale === 'de' ? 'Tickets' : 'Tickets')}
        right={(
          <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8">
            <Plus className="h-4 w-4" />
          </Button>
        )}
      />

      <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{locale === 'de' ? 'Alle Status' : 'All Statuses'}</SelectItem>
            {FIELD_TICKET_STATUSES.map((value) => <SelectItem key={value} value={value}>{labelFor(FIELD_TICKET_STATUS_CONFIG, value, locale)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{locale === 'de' ? 'Alle Prioritäten' : 'All Priorities'}</SelectItem>
            {FIELD_TICKET_PRIORITIES.map((value) => <SelectItem key={value} value={value}>{labelFor(FIELD_TICKET_PRIORITY_CONFIG, value, locale)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : isError ? (
          <div className="p-4">
            <EmptyState
              variant="error"
              title={locale === 'de' ? 'Tickets konnten nicht geladen werden' : 'Tickets could not be loaded'}
              action={<button onClick={() => refetch()} className="text-sm text-primary underline underline-offset-2">{locale === 'de' ? 'Erneut versuchen' : 'Retry'}</button>}
            />
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-4">
            <EmptyState
              variant="empty"
              title={locale === 'de' ? 'Keine Tickets' : 'No Tickets'}
              description={locale === 'de' ? 'Neue Meldungen erscheinen hier.' : 'New tickets appear here.'}
            />
          </div>
        ) : (
          <div>
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket._id}
                ticket={ticket}
                locale={locale}
                expanded={expandedId === ticket._id}
                onExpand={() => setExpandedId((current) => (current === ticket._id ? null : ticket._id))}
                mutations={mutations}
              />
            ))}
          </div>
        )}
      </div>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} locale={locale} onSubmit={createTicket} isPending={mutations.createTicket.isPending} />
    </div>
  );
}
