'use client';

import { useState } from 'react';
import { TrendingUp, RotateCcw } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  const { data: articleResult = { data: [] }, isLoading: articlesLoading } = useArticles({ limit: 50 });
  const { data: batchResult = { data: [] } } = usePriceBatches();
  const articles = articleResult.data ?? [];
  const batches = batchResult.data ?? [];
  const { rollbackBatch } = usePriceMutations();
  const [selected, setSelected] = useState(new Set());
  const [updateOpen, setUpdateOpen] = useState(false);
  const [historyArticleId, setHistoryArticleId] = useState(null);
  const [now] = useState(() => Date.now());

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const allSelected = articles.length > 0 && selected.size === articles.length;
  const someSelected = selected.size > 0 && selected.size < articles.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(articles.map((a) => a._id || a.id)));
  const selectedArticles = articles.filter((a) => selected.has(a._id || a.id));

  const recentBatches = batches.filter((b) => b.status === 'APPLIED').slice(0, 5);

  const canRollback = (batch) => {
    const diff = (now - new Date(batch.appliedAt).getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  };

  return (
    <div className="space-y-6">
      {/* Article price table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('catalog.articles.title')}</p>
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
                  <Checkbox checked={allSelected ? true : someSelected ? 'indeterminate' : false} onCheckedChange={toggleAll} aria-label={t('common.selectAll')} />
                </TableHead>
                <TableHead>{t('catalog.articles.articleNumber')}</TableHead>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead className="text-right">{t('catalog.priceChf')}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {articlesLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t('common.loading')}</TableCell>
                </TableRow>
              ) : articles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t('catalog.articles.empty')}</TableCell>
                </TableRow>
              ) : articles.map((article) => (
                <TableRow key={article._id || article.id} className={selected.has(article._id || article.id) ? 'bg-muted/30' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(article._id || article.id)}
                      onCheckedChange={() => toggleSelect(article._id || article.id)}
                      aria-label={t('catalog.prices.selectArticle', null, { articleNumber: article.articleNumber })}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{article.articleNumber}</TableCell>
                  <TableCell>{article.name}</TableCell>
                  <TableCell className="text-right font-medium">
                    {(Number(article.basePrice) || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="sm" className="text-xs h-7"
                      onClick={() => setHistoryArticleId(historyArticleId === (article._id || article.id) ? null : (article._id || article.id))}
                    >
                      {t('catalog.articles.history')}
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
          <p className="text-sm font-medium">{t('catalog.prices.recentUpdates')}</p>
          <div className="space-y-2">
            {recentBatches.map((batch) => (
              <div key={batch._id} className="flex items-center gap-4 rounded-md border px-4 py-3 text-sm">
                <Badge variant="outline">{batch.type ?? 'UPDATE'}</Badge>
                <span className="text-muted-foreground">{t('catalog.prices.articleCount', null, { count: batch.articleCount ?? 0 })}</span>
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
                          <AlertDialogTitle>{t('catalog.prices.rollbackTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('catalog.prices.rollbackDesc', { count: batch.articleCount ?? 0 })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => rollbackBatch.mutate(batch._id)}>
                            {t('catalog.prices.rollback')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('catalog.prices.rollbackExpired')}</span>
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
