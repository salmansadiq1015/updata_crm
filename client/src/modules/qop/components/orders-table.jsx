'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrders } from '../hooks/use-qop-queries';
import { useOrderMutations } from '../hooks/use-qop-mutations';
import { OrderStatusBadge } from './order-status-badge';
import { ORDER_STATUSES } from '../constants/qop-constants';
import { useLanguage } from '@/lib/i18n/language-context';

const fmt = (v) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(v ?? 0);

export function OrdersTable() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filters = {};
  if (search.trim()) filters.q = search.trim();
  if (statusFilter) filters.status = statusFilter;

  const { data: orders = [], isLoading } = useOrders(filters);
  const { updateStatus } = useOrderMutations();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={de ? 'Aufträge suchen...' : 'Search orders...'}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {['', ...ORDER_STATUSES].map((s) => (
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
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">{de ? 'Keine Aufträge gefunden' : 'No orders found'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {['#', de ? 'Kunde' : 'Customer', de ? 'Titel' : 'Title', de ? 'Betrag' : 'Amount', de ? 'Status' : 'Status', ''].map((h, i) => (
                  <th key={i} className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${i === 3 ? 'text-right' : 'text-left'} ${i === 5 ? 'w-10' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => {
                const id = o._id || o.id;
                return (
                  <tr
                    key={id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/quotes/orders/${id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.orderNumber}</td>
                    <td className="px-4 py-3 font-medium">{o.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">{o.title}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(o.grandTotal)}</td>
                    <td className="px-4 py-3"><OrderStatusBadge status={o.status} size="sm" /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => router.push(`/quotes/orders/${id}`)}>
                            {de ? 'Öffnen' : 'Open'}
                          </DropdownMenuItem>
                          {['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => s !== o.status && (
                            <DropdownMenuItem key={s} onClick={() => updateStatus.mutate({ id, status: s })}>
                              → {s}
                            </DropdownMenuItem>
                          ))}
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
