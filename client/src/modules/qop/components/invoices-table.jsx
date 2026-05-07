'use client';

import { useState } from 'react';
import {
  Search, Plus, MoreHorizontal, FileText, CheckCircle,
  Send, DollarSign, History,
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useInvoices, useInvoiceHistory } from '../hooks/use-qop-queries';
import { useInvoiceMutations } from '../hooks/use-qop-mutations';
import { InvoiceStatusBadge, InvoiceTypeBadge } from './status-badge';
import { AmountDisplay } from './amount-display';
import { DocumentHistoryTimeline } from './document-history-timeline';
import { InvoiceFormDialog } from './invoice-form-dialog';
import { RecordPaymentDialog } from './record-payment-dialog';

const INV_STATUSES = ['', 'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];

function fmtDate(d, lang) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(d));
}

function HistoryDrawer({ open, onClose, invoiceId }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { data: history = [], isLoading } = useInvoiceHistory(open ? invoiceId : null);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{de ? 'Verlauf' : 'History'}</DialogTitle></DialogHeader>
        {isLoading ? <Skeleton className="h-32 w-full" /> : <DocumentHistoryTimeline history={history} className="mt-2" />}
      </DialogContent>
    </Dialog>
  );
}

export function InvoicesTable() {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [formOpen, setFormOpen]     = useState(false);
  const [formType, setFormType]     = useState('STANDARD');
  const [payingInvoice, setPaying]  = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  const filters = {};
  if (search.trim())  filters.search = search.trim();
  if (statusFilter)   filters.status = statusFilter;

  const { data, isLoading } = useInvoices(filters);
  const items = data?.items ?? [];

  const { finalizeInvoice, sendInvoice } = useInvoiceMutations();

  const handleFinalize = (id) => {
    if (confirm(de ? 'Rechnung finalisieren? Dies kann nicht rückgängig gemacht werden.' : 'Finalize invoice? This cannot be undone.')) {
      finalizeInvoice.mutate(id);
    }
  };
  const handleSend = (id) => sendInvoice.mutate(id);

  const openNewForm = (type) => { setFormType(type); setFormOpen(true); };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={de ? 'Rechnung suchen...' : 'Search invoices...'}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter || 'ALL'} onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder={de ? 'Alle Status' : 'All statuses'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Status' : 'All statuses'}</SelectItem>
            {INV_STATUSES.filter(Boolean).map((s) => (
              <SelectItem key={s} value={s}><InvoiceStatusBadge status={s} /></SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* New Invoice dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-9 gap-1.5 ml-auto">
              <Plus className="h-3.5 w-3.5" />
              {de ? 'Neue Rechnung' : 'New Invoice'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openNewForm('STANDARD')}>
              <FileText className="h-4 w-4 mr-2" />{de ? 'Rechnung' : 'Standard Invoice'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openNewForm('ADVANCE')}>
              <DollarSign className="h-4 w-4 mr-2" />{de ? 'Akontorechnung' : 'Advance Invoice'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openNewForm('FINAL')}>
              <CheckCircle className="h-4 w-4 mr-2" />{de ? 'Schlussrechnung' : 'Final Invoice'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[9rem_6rem_1fr_8rem_7rem_7rem_8rem_2.5rem] bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
          {[
            de ? 'Nummer' : 'Number',
            de ? 'Typ' : 'Type',
            de ? 'Kunde' : 'Customer',
            de ? 'Status' : 'Status',
            de ? 'Fällig' : 'Due Date',
            de ? 'Erstellt' : 'Created',
            de ? 'Betrag' : 'Amount',
            '',
          ].map((h, i) => (
            <div key={i} className={`px-3 py-2.5 ${i >= 6 ? 'text-right' : ''}`}>{h}</div>
          ))}
        </div>

        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[9rem_6rem_1fr_8rem_7rem_7rem_8rem_2.5rem] border-b border-border px-3 py-3 gap-2">
            {Array.from({ length: 7 }).map((_, j) => <Skeleton key={j} className="h-4 rounded" />)}
          </div>
        ))}

        {!isLoading && items.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {de ? 'Keine Rechnungen gefunden.' : 'No invoices found.'}
            </p>
          </div>
        )}

        {items.map((inv) => {
          const id = inv._id ?? inv.id;
          const canFinalize = inv.status === 'DRAFT';
          const canSend     = inv.status === 'DRAFT'; // after finalize, also 'FINALIZED' if you have that
          const canPay      = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status);

          return (
            <div
              key={id}
              className="grid grid-cols-[9rem_6rem_1fr_8rem_7rem_7rem_8rem_2.5rem] border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
            >
              <div className="px-3 py-3 text-sm font-mono text-muted-foreground">{inv.invoiceNumber}</div>
              <div className="px-3 py-3"><InvoiceTypeBadge type={inv.invoiceType} /></div>
              <div className="px-3 py-3 text-sm font-medium truncate">
                {inv.customerName ?? inv.customer?.name ?? '—'}
              </div>
              <div className="px-3 py-3"><InvoiceStatusBadge status={inv.status} /></div>
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {fmtDate(inv.dueDate, language)}
              </div>
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {fmtDate(inv.createdAt, language)}
              </div>
              <div className="px-3 py-3 text-sm text-right">
                <AmountDisplay amount={inv.grandTotalRounded ?? inv.grandTotal} currency={inv.currency} />
              </div>
              <div className="px-1 py-2 flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {canFinalize && (
                      <DropdownMenuItem onClick={() => handleFinalize(id)}>
                        <CheckCircle className="h-4 w-4 mr-2" />{de ? 'Finalisieren' : 'Finalize'}
                      </DropdownMenuItem>
                    )}
                    {canSend && (
                      <DropdownMenuItem onClick={() => handleSend(id)}>
                        <Send className="h-4 w-4 mr-2" />{de ? 'Senden' : 'Send'}
                      </DropdownMenuItem>
                    )}
                    {canPay && (
                      <DropdownMenuItem onClick={() => setPaying(inv)}>
                        <DollarSign className="h-4 w-4 mr-2" />{de ? 'Zahlung erfassen' : 'Record Payment'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setHistoryFor(id)}>
                      <History className="h-4 w-4 mr-2" />{de ? 'Verlauf' : 'History'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      <InvoiceFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        type={formType}
      />
      <RecordPaymentDialog
        open={!!payingInvoice}
        onClose={() => setPaying(null)}
        invoiceId={payingInvoice?._id ?? payingInvoice?.id}
        outstandingAmount={payingInvoice?.outstandingAmount ?? payingInvoice?.grandTotal}
        currency={payingInvoice?.currency ?? 'CHF'}
      />
      <HistoryDrawer
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        invoiceId={historyFor}
      />
    </div>
  );
}
