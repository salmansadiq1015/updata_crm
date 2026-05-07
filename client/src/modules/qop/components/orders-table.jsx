'use client';

import { useState } from 'react';
import {
  Search, MoreHorizontal, Eye, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useOrders } from '../hooks/use-qop-queries';
import { OrderStatusBadge } from './status-badge';
import { AmountDisplay } from './amount-display';
import { OrderDetailDialog } from './order-detail-dialog';

const ORDER_STATUSES = ['', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

function fmtDate(d, lang) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(d));
}

export function OrdersTable() {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [detailId, setDetailId]   = useState(null);

  const filters = {};
  if (search.trim())  filters.q      = search.trim();
  if (statusFilter)   filters.status = statusFilter;

  const { data, isLoading } = useOrders(filters);
  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={de ? 'Auftrag suchen...' : 'Search orders...'}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder={de ? 'Alle Status' : 'All statuses'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{de ? 'Alle Status' : 'All statuses'}</SelectItem>
            {ORDER_STATUSES.filter(Boolean).map((s) => (
              <SelectItem key={s} value={s}><OrderStatusBadge status={s} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[9rem_1fr_8rem_7rem_7rem_8rem_2.5rem] bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
          {[
            de ? 'Nummer' : 'Number',
            de ? 'Kunde' : 'Customer',
            de ? 'Status' : 'Status',
            de ? 'Erstellt' : 'Created',
            de ? 'Quelle' : 'From Quote',
            de ? 'Betrag' : 'Amount',
            '',
          ].map((h, i) => (
            <div key={i} className={`px-3 py-2.5 ${i >= 5 ? 'text-right' : ''}`}>{h}</div>
          ))}
        </div>

        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[9rem_1fr_8rem_7rem_7rem_8rem_2.5rem] border-b border-border px-3 py-3 gap-2">
            {Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} className="h-4 rounded" />)}
          </div>
        ))}

        {!isLoading && items.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {de ? 'Keine Aufträge gefunden.' : 'No orders found.'}
            </p>
          </div>
        )}

        {items.map((order) => {
          const id = order._id ?? order.id;
          return (
            <div
              key={id}
              className="grid grid-cols-[9rem_1fr_8rem_7rem_7rem_8rem_2.5rem] border-b border-border last:border-0 hover:bg-muted/30 transition-colors group cursor-pointer"
              onClick={() => setDetailId(id)}
            >
              <div className="px-3 py-3 text-sm font-mono text-muted-foreground">{order.orderNumber}</div>
              <div className="px-3 py-3 text-sm font-medium truncate">
                {order.customerName ?? order.customer?.name ?? '—'}
              </div>
              <div className="px-3 py-3"><OrderStatusBadge status={order.status} /></div>
              <div className="px-3 py-3 text-sm text-muted-foreground">{fmtDate(order.createdAt, language)}</div>
              <div className="px-3 py-3 text-sm text-muted-foreground font-mono">
                {order.sourceQuotationNumber ?? '—'}
              </div>
              <div className="px-3 py-3 text-sm text-right">
                <AmountDisplay amount={order.grandTotalRounded ?? order.grandTotal} currency={order.currency} />
              </div>
              <div className="px-1 py-2 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => setDetailId(id)}>
                      <Eye className="h-4 w-4 mr-2" />{de ? 'Details' : 'View Details'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      <OrderDetailDialog
        open={!!detailId}
        onClose={() => setDetailId(null)}
        orderId={detailId}
      />
    </div>
  );
}
