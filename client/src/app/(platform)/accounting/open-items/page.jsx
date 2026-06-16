'use client';

import { useState } from 'react';
import { FileText, Merge, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useOpenItems, useOpenItemsAging } from '@/modules/accounting/hooks/use-accounting-queries';
import { useOpenItemMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { formatDate, formatMoney } from '@/modules/accounting/utils/accounting-ui';

const TYPE_LABELS = {
  AR: { de: 'Forderung', en: 'Receivable', badge: 'bg-emerald-100 text-emerald-700' },
  AP: { de: 'Verbindlichkeit', en: 'Payable', badge: 'bg-orange-100 text-orange-700' },
};

function selectedByType(items, selectedIds, type) {
  return items.filter((item) => item.type === type && selectedIds.has(String(item._id)));
}

export default function OpenItemsPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [entityType, setEntityType] = useState('ALL');
  const [search, setSearch] = useState('');
  const [cursorStack, setCursorStack] = useState([null]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const cursor = cursorStack[cursorStack.length - 1];
  const params = {
    entityType,
    limit: 50,
    ...(search && { q: search }),
    ...(cursor && { cursor }),
  };
  const { data: { items = [], pagination } = {}, isLoading } = useOpenItems(params);
  const { data: aging } = useOpenItemsAging({ entityType });
  const { generateStatement, netItems } = useOpenItemMutations();

  const selectedAr = selectedByType(items, selectedIds, 'AR');
  const selectedAp = selectedByType(items, selectedIds, 'AP');
  const selectedTotal = [...selectedIds].length;

  const toggle = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(String(id)) ? next.delete(String(id)) : next.add(String(id));
      return next;
    });
  };

  const handleStatement = (item) => {
    generateStatement.mutate({
      entityId: item.entityId,
      params: { entityType: item.type === 'AR' ? 'customer' : 'supplier' },
      data: { format: 'pdf' },
    });
  };

  const handleNetting = () => {
    if (!selectedAr.length || !selectedAp.length) return;
    netItems.mutate({
      customerId: selectedAr[0].entityId,
      supplierId: selectedAp[0].entityId,
      arInvoiceIds: selectedAr.map((item) => item._id),
      apInvoiceIds: selectedAp.map((item) => item._id),
      reason: 'Manual open-item netting',
    });
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de ? 'Offene Posten' : 'Open Items'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {de ? 'Forderungen und Verbindlichkeiten in einer Sicht.' : 'Receivables and payables in one view.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 w-60 pl-9"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setCursorStack([null]); setSelectedIds(new Set()); }}
              placeholder={de ? 'Suchen...' : 'Search...'}
            />
          </div>
          <Select value={entityType} onValueChange={(value) => { setEntityType(value); setCursorStack([null]); setSelectedIds(new Set()); }}>
            <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{de ? 'Alle Posten' : 'All Items'}</SelectItem>
              <SelectItem value="AR">{de ? 'Nur Forderungen' : 'Receivables'}</SelectItem>
              <SelectItem value="AP">{de ? 'Nur Verbindlichkeiten' : 'Payables'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: de ? 'AR offen' : 'AR Open', value: aging?.ar?.totalOutstanding, count: aging?.ar?.invoiceCount },
          { label: de ? 'AP offen' : 'AP Open', value: aging?.ap?.totalOutstanding, count: aging?.ap?.invoiceCount },
          { label: de ? 'Netto Position' : 'Net Position', value: Number(aging?.ar?.totalOutstanding || 0) - Number(aging?.ap?.totalOutstanding || 0), count: null },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(tile.value)}</p>
            {tile.count != null && <p className="text-xs text-muted-foreground">{tile.count} {de ? 'Posten' : 'items'}</p>}
          </div>
        ))}
      </div>

      {selectedTotal > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
          <span className="text-sm font-medium">{selectedTotal} {de ? 'ausgewaehlt' : 'selected'}</span>
          <Button size="sm" onClick={handleNetting} disabled={!selectedAr.length || !selectedAp.length || netItems.isPending}>
            <Merge className="h-4 w-4 mr-1.5" />
            {de ? 'Verrechnen' : 'Net Items'}
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 w-8" />
              <th className="px-3 py-2.5 text-left">{de ? 'Typ' : 'Type'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Partner' : 'Entity'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Referenz' : 'Reference'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Faellig' : 'Due'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Offen' : 'Outstanding'}</th>
              <th className="px-3 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <tr key={index} className="border-b border-border/50">
                  {Array.from({ length: 7 }).map((__, cellIndex) => <td key={cellIndex} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))
            ) : items.map((item) => {
              const typeCfg = TYPE_LABELS[item.type] || TYPE_LABELS.AR;
              return (
                <tr key={`${item.type}-${item._id}`} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selectedIds.has(String(item._id))} onChange={() => toggle(item._id)} />
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeCfg.badge}`}>{de ? typeCfg.de : typeCfg.en}</span>
                  </td>
                  <td className="px-3 py-3 font-medium">{item.entityName || '-'}</td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{item.reference || '-'}</td>
                  <td className="px-3 py-3">{formatDate(item.dueDate)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">{formatMoney(item.outstandingAmount)}</td>
                  <td className="px-3 py-3 text-right">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleStatement(item)}>
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      PDF
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">{de ? 'Keine offenen Posten.' : 'No open items.'}</td></tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button size="sm" variant="outline" onClick={() => setCursorStack((current) => current.length > 1 ? current.slice(0, -1) : current)} disabled={cursorStack.length <= 1}>{de ? 'Zurueck' : 'Previous'}</Button>
          <span className="text-xs text-muted-foreground">Page {cursorStack.length}</span>
          <Button size="sm" variant="outline" onClick={() => pagination?.nextCursor && setCursorStack((current) => [...current, pagination.nextCursor])} disabled={!pagination?.hasNext}>{de ? 'Weiter' : 'Next'}</Button>
        </div>
      </div>
    </div>
  );
}
