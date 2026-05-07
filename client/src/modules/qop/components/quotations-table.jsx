'use client';

import { useState } from 'react';
import {
  Search, Plus, MoreHorizontal, Copy, Send, CheckCircle, XCircle,
  ArrowRight, Trash2, History, RefreshCw, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useQuotations, useQuotationHistory } from '../hooks/use-qop-queries';
import { useQuotationMutations } from '../hooks/use-qop-mutations';
import { QuotationStatusBadge } from './status-badge';
import { AmountDisplay } from './amount-display';
import { DocumentHistoryTimeline } from './document-history-timeline';
import { QuotationFormDialog } from './quotation-form-dialog';
import { VALID_QUOTATION_TRANSITIONS } from '../constants/qop-constants';

const STATUSES = ['', 'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CONVERTED'];

function fmtDate(d, lang) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(d));
}

function StatusTransitionDialog({ open, onClose, quotation, onConfirm }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const current = quotation?.status ?? '';
  const allowed = VALID_QUOTATION_TRANSITIONS[current] ?? [];
  const [targetStatus, setTargetStatus] = useState(allowed[0] ?? '');
  const [reason, setReason] = useState('');

  const STATUS_LABELS_DE = {
    SENT: 'Gesendet', VIEWED: 'Gesehen', ACCEPTED: 'Angenommen',
    DECLINED: 'Abgelehnt', EXPIRED: 'Abgelaufen', CANCELLED: 'Storniert', CONVERTED: 'Konvertiert',
  };

  if (!allowed.length) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{de ? 'Status ändern' : 'Change Status'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>{de ? 'Neuer Status' : 'New Status'}</Label>
            <Select value={targetStatus} onValueChange={setTargetStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowed.map((s) => (
                  <SelectItem key={s} value={s}>
                    {de ? (STATUS_LABELS_DE[s] ?? s) : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(targetStatus === 'DECLINED' || targetStatus === 'CANCELLED') && (
            <div className="flex flex-col gap-1.5">
              <Label>{de ? 'Grund (optional)' : 'Reason (optional)'}</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="resize-none text-sm"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button onClick={() => onConfirm(targetStatus, reason)}>
            {de ? 'Bestätigen' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDrawer({ open, onClose, quotationId }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { data: history = [], isLoading } = useQuotationHistory(open ? quotationId : null);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{de ? 'Statusverlauf' : 'Status History'}</DialogTitle>
        </DialogHeader>
        {isLoading
          ? <Skeleton className="h-32 w-full" />
          : <DocumentHistoryTimeline history={history} className="mt-2" />}
      </DialogContent>
    </Dialog>
  );
}

export function QuotationsTable() {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [formOpen, setFormOpen]     = useState(false);
  const [editing, setEditing]       = useState(null);
  const [transitioning, setTrans]   = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  const filters = {};
  if (search.trim())    filters.search = search.trim();
  if (statusFilter)     filters.status = statusFilter;

  const { data, isLoading } = useQuotations(filters);
  const items = data?.items ?? [];

  const {
    deleteQuotation, duplicateQuotation, sendQuotation,
    convertQuotation, transitionQuotationStatus,
  } = useQuotationMutations();

  const handleDelete   = (id) => {
    if (confirm(de ? 'Offerte löschen?' : 'Delete quotation?')) deleteQuotation.mutate(id);
  };
  const handleDuplicate = (id) => duplicateQuotation.mutate(id);
  const handleSend      = (id) => sendQuotation.mutate(id);
  const handleConvert   = (id) => {
    if (confirm(de ? 'Zu Auftrag konvertieren?' : 'Convert to order?')) convertQuotation.mutate(id);
  };
  const handleTransitionConfirm = (targetStatus, reason) => {
    transitionQuotationStatus.mutate({
      id: transitioning._id ?? transitioning.id,
      targetStatus,
      reason,
    });
    setTrans(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={de ? 'Offerte suchen...' : 'Search quotations...'}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter || 'ALL'} onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder={de ? 'Alle Status' : 'All statuses'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Status' : 'All statuses'}</SelectItem>
            {STATUSES.filter(Boolean).map((s) => (
              <SelectItem key={s} value={s}><QuotationStatusBadge status={s} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 gap-1.5 ml-auto" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" />
          {de ? 'Neue Offerte' : 'New Quotation'}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[9rem_1fr_8rem_7rem_7rem_8rem_2.5rem] bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
          {[
            de ? 'Nummer' : 'Number',
            de ? 'Kunde' : 'Customer',
            de ? 'Status' : 'Status',
            de ? 'Gültig bis' : 'Valid Until',
            de ? 'Erstellt' : 'Created',
            de ? 'Betrag' : 'Amount',
            '',
          ].map((h, i) => (
            <div key={i} className={`px-3 py-2.5 ${i >= 5 ? 'text-right' : ''}`}>{h}</div>
          ))}
        </div>

        {/* Loading */}
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[9rem_1fr_8rem_7rem_7rem_8rem_2.5rem] border-b border-border last:border-0 px-3 py-2.5 gap-0">
            {Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} className="h-4 w-full rounded" />)}
          </div>
        ))}

        {/* Empty */}
        {!isLoading && items.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {de ? 'Keine Offerten gefunden.' : 'No quotations found.'}
            </p>
          </div>
        )}

        {/* Rows */}
        {items.map((q) => {
          const id = q._id ?? q.id;
          return (
            <div
              key={id}
              className="grid grid-cols-[9rem_1fr_8rem_7rem_7rem_8rem_2.5rem] border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
            >
              <div className="px-3 py-3 text-sm font-mono text-muted-foreground">
                {q.quotationNumber}
              </div>
              <div className="px-3 py-3 text-sm font-medium truncate">
                {q.customerName ?? q.customer?.name ?? '—'}
              </div>
              <div className="px-3 py-3">
                <QuotationStatusBadge status={q.status} />
              </div>
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {fmtDate(q.validUntil, language)}
              </div>
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {fmtDate(q.createdAt, language)}
              </div>
              <div className="px-3 py-3 text-sm text-right">
                <AmountDisplay amount={q.grandTotalRounded ?? q.grandTotal} currency={q.currency} />
              </div>
              <div className="px-1 py-2 flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => { setEditing(q); setFormOpen(true); }}>
                      <FileText className="h-4 w-4 mr-2" />{de ? 'Bearbeiten' : 'Edit'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicate(id)}>
                      <Copy className="h-4 w-4 mr-2" />{de ? 'Duplizieren' : 'Duplicate'}
                    </DropdownMenuItem>
                    {q.status === 'DRAFT' && (
                      <DropdownMenuItem onClick={() => handleSend(id)}>
                        <Send className="h-4 w-4 mr-2" />{de ? 'Senden' : 'Send'}
                      </DropdownMenuItem>
                    )}
                    {q.status === 'ACCEPTED' && (
                      <DropdownMenuItem onClick={() => handleConvert(id)}>
                        <ArrowRight className="h-4 w-4 mr-2" />{de ? 'In Auftrag konvertieren' : 'Convert to Order'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setTrans(q)}>
                      <RefreshCw className="h-4 w-4 mr-2" />{de ? 'Status ändern' : 'Change Status'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryFor(id)}>
                      <History className="h-4 w-4 mr-2" />{de ? 'Verlauf' : 'History'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {q.status === 'DRAFT' && (
                      <DropdownMenuItem
                        onClick={() => handleDelete(id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />{de ? 'Löschen' : 'Delete'}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      <QuotationFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        quotation={editing}
      />
      <StatusTransitionDialog
        open={!!transitioning}
        onClose={() => setTrans(null)}
        quotation={transitioning}
        onConfirm={handleTransitionConfirm}
      />
      <HistoryDrawer
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        quotationId={historyFor}
      />
    </div>
  );
}
