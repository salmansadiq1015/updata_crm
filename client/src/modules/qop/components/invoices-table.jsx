'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MoreHorizontal, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInvoices } from '../hooks/use-qop-queries';
import { useInvoiceMutations } from '../hooks/use-qop-mutations';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { INVOICE_STATUSES } from '../constants/qop-constants';
import { useLanguage } from '@/lib/i18n/language-context';

const fmt = (v) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(v ?? 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-CH') : '—';

export function InvoicesTable() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filters = {};
  if (search.trim()) filters.q = search.trim();
  if (statusFilter) filters.status = statusFilter;

  const { data: invoices = [], isLoading } = useInvoices(filters);
  const { finalize, send } = useInvoiceMutations();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={de ? 'Rechnungen suchen...' : 'Search invoices...'}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {['', ...INVOICE_STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              }`}
            >
              {s || (de ? 'Alle' : 'All')}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {de ? 'Lädt...' : 'Loading...'}
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">{de ? 'Keine Rechnungen gefunden' : 'No invoices found'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {['#', de ? 'Kunde' : 'Customer', de ? 'Fälligkeit' : 'Due', de ? 'Offen' : 'Due Amt', de ? 'Gesamt' : 'Total', de ? 'Status' : 'Status', ''].map((h, i) => (
                  <th key={i} className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${i === 3 || i === 4 ? 'text-right' : 'text-left'} ${i === 6 ? 'w-10' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((inv) => {
                const id = inv._id || inv.id;
                const isOverdue = inv.status === 'OVERDUE';
                return (
                  <tr
                    key={id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/quotes/invoices/${id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 font-medium">{inv.customerName}</td>
                    <td className={`px-4 py-3 ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {fmtDate(inv.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(inv.amountDue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(inv.grandTotal)}</td>
                    <td className="px-4 py-3"><InvoiceStatusBadge status={inv.status} size="sm" /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => router.push(`/quotes/invoices/${id}`)}>
                            {de ? 'Öffnen' : 'Open'}
                          </DropdownMenuItem>
                          {inv.status === 'DRAFT' && (
                            <DropdownMenuItem onClick={() => finalize.mutate(id)}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                              {de ? 'Finalisieren' : 'Finalize'}
                            </DropdownMenuItem>
                          )}
                          {(inv.status === 'DRAFT' || inv.status === 'SENT') && (
                            <DropdownMenuItem onClick={() => send.mutate(id)}>
                              <Send className="h-3.5 w-3.5 mr-2" />
                              {de ? 'Versenden' : 'Send'}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
