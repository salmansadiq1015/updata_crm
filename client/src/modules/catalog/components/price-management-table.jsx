'use client';

import { useState } from 'react';
import { TrendingUp, RotateCcw } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Badge } from '@/shared/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { useArticles } from '../hooks/use-catalog-queries';
import { usePriceBatches } from '../hooks/use-price-queries';
import { usePriceMutations } from '../hooks/use-price-mutations';
import { PriceUpdateDialog } from './price-update-dialog';
import { PriceHistoryPanel } from './price-history-panel';
import { useLanguage } from '@/lib/i18n/language-context';

function fmtDateTime(val) {
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('de-CH');
}

export function PriceManagementTable() {
  const { t } = useLanguage();
  const { data: articles = [], isLoading: articlesLoading } = useArticles({});
  const { data: batches = [] } = usePriceBatches();
  const { rollbackBatch } = usePriceMutations();
  const [selected, setSelected] = useState(new Set());
  const [updateOpen, setUpdateOpen] = useState(false);
  const [historyArticleId, setHistoryArticleId] = useState(null);

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const allSelected = articles.length > 0 && selected.size === articles.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(articles.map((a) => a._id)));
  const selectedArticles = articles.filter((a) => selected.has(a._id));

  const recentBatches = batches.filter((b) => b.status === 'APPLIED').slice(0, 5);

  const canRollback = (batch) => {
    const diff = (Date.now() - new Date(batch.appliedAt).getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  };

  return (
    <div className="space-y-6">
      {/* Article price table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Articles</p>
          <Button size="sm" disabled={selected.size === 0} onClick={() => setUpdateOpen(true)}>
            <TrendingUp className="w-4 h-4 mr-2" />
            {t('catalog.prices.update')} ({selected.size})
          </Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead>{t('catalog.articles.articleNumber')}</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Price (CHF)</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {articlesLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : articles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No articles found.</TableCell>
                </TableRow>
              ) : articles.map((article) => (
                <TableRow key={article._id} className={selected.has(article._id) ? 'bg-muted/30' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(article._id)}
                      onCheckedChange={() => toggleSelect(article._id)}
                      aria-label={`Select ${article.articleNumber}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{article.articleNumber}</TableCell>
                  <TableCell>{article.name}</TableCell>
                  <TableCell className="text-right font-medium">
                    {Number(article.basePrice).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="sm" className="text-xs h-7"
                      onClick={() => setHistoryArticleId(historyArticleId === article._id ? null : article._id)}
                    >
                      History
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {historyArticleId && (
          <div className="rounded-md border bg-muted/20">
            <PriceHistoryPanel articleId={historyArticleId} />
          </div>
        )}
      </div>

      {/* Recent batches with rollback */}
      {recentBatches.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Recent Updates</p>
          <div className="space-y-2">
            {recentBatches.map((batch) => (
              <div key={batch._id} className="flex items-center gap-4 rounded-md border px-4 py-3 text-sm">
                <Badge variant="outline">{batch.type ?? 'UPDATE'}</Badge>
                <span className="text-muted-foreground">{batch.articleCount ?? 0} articles</span>
                <span className="text-muted-foreground">{fmtDateTime(batch.appliedAt)}</span>
                <div className="ml-auto">
                  {canRollback(batch) ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <RotateCcw className="w-3 h-3" />
                          {t('catalog.prices.rollback')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Rollback price update?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will restore previous prices for {batch.articleCount ?? 0} article{(batch.articleCount ?? 0) !== 1 ? 's' : ''}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => rollbackBatch.mutate(batch._id)}>
                            Rollback
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <span className="text-xs text-muted-foreground">Rollback expired</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PriceUpdateDialog
        open={updateOpen}
        onClose={() => { setUpdateOpen(false); setSelected(new Set()); }}
        selectedArticles={selectedArticles}
      />
    </div>
  );
}
