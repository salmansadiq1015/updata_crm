'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, MoreHorizontal, Send, Copy, ArrowRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useQuotations } from '../hooks/use-qop-queries';
import { useQuotationMutations } from '../hooks/use-qop-mutations';
import { QuotationStatusBadge } from './quotation-status-badge';
import { useLanguage } from '@/lib/i18n/language-context';

const fmt = (v) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(v ?? 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-CH') : '—';

export function QuotationsTable() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filters = {};
  if (search.trim()) filters.q = search.trim();
  if (statusFilter) filters.status = statusFilter;

  const { data: quotations = [], isLoading } = useQuotations(filters);
  const { remove, send, convert, duplicate } = useQuotationMutations();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={de ? 'Offerten suchen...' : 'Search quotations...'}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => router.push('/quotes/new')}>
          <Plus className="h-3.5 w-3.5" />
          {de ? 'Offerte' : 'Quotation'}
        </Button>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {de ? 'Lädt...' : 'Loading...'}
          </div>
        ) : quotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-muted-foreground">{de ? 'Keine Offerten gefunden' : 'No quotations found'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {['#', de ? 'Kunde' : 'Customer', de ? 'Gültig bis' : 'Valid until', de ? 'Betrag' : 'Amount', de ? 'Status' : 'Status', ''].map((h, i) => (
                  <th key={i} className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${i === 3 ? 'text-right' : 'text-left'} ${i === 5 ? 'w-10' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {quotations.map((q) => {
                const id = q._id || q.id;
                return (
                  <tr
                    key={id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/quotes/${id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{q.quotationNumber}</td>
                    <td className="px-4 py-3 font-medium">{q.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(q.validUntil)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(q.grandTotal)}</td>
                    <td className="px-4 py-3"><QuotationStatusBadge status={q.status} size="sm" /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => router.push(`/quotes/${id}`)}>
                            {de ? 'Öffnen' : 'Open'}
                          </DropdownMenuItem>
                          {q.status === 'DRAFT' && (
                            <DropdownMenuItem onClick={() => send.mutate(id)}>
                              <Send className="h-3.5 w-3.5 mr-2" />
                              {de ? 'Versenden' : 'Send'}
                            </DropdownMenuItem>
                          )}
                          {q.status === 'ACCEPTED' && (
                            <DropdownMenuItem onClick={() => convert.mutate(id)}>
                              <ArrowRight className="h-3.5 w-3.5 mr-2" />
                              {de ? 'In Auftrag umwandeln' : 'Convert to Order'}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => duplicate.mutate(id)}>
                            <Copy className="h-3.5 w-3.5 mr-2" />
                            {de ? 'Duplizieren' : 'Duplicate'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => { if (confirm(de ? 'Offerte löschen?' : 'Delete quotation?')) remove.mutate(id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            {de ? 'Löschen' : 'Delete'}
                          </DropdownMenuItem>
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
