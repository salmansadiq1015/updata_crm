'use client';

import { useState } from 'react';
import { Search, Plus, MoreHorizontal, Pencil, Trash2, ToggleLeft, Upload, History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useArticles, useRecentCatalogSearches } from '../hooks/use-catalog-queries';
import { useArticleMutations } from '../hooks/use-catalog-mutations';
import { ArticleTypeBadge } from './article-type-badge';
import { ArticleStatusBadge } from './article-status-badge';
import { CatalogArticleFormDialog } from './catalog-article-form-dialog';
import { CatalogBulkImportDialog } from './catalog-bulk-import-dialog';
import { ArticleVersionHistoryPanel } from './article-version-history-panel';
import { useLanguage } from '@/lib/i18n/language-context';

const fmt = (value, currency = 'CHF') =>
  new Intl.NumberFormat('de-CH', { style: 'currency', currency }).format(value ?? 0);

const toPlainText = (value = '') =>
  String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export function CatalogArticlesTable({ filters: externalFilters = {} }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [cursor, setCursor] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyArticle, setHistoryArticle] = useState(null);

  const queryFilters = { ...externalFilters, limit: 50, cursor };
  if (search.trim()) {
    queryFilters.search = search.trim();
    if (searchField !== 'all') queryFilters.searchField = searchField;
  }

  const { data: result = { data: [], pagination: null }, isLoading, isError } = useArticles(queryFilters);
  const { data: recentSearches = [] } = useRecentCatalogSearches();
  const articles = result.data ?? [];
  const pagination = result.pagination;
  const { removeArticle, updateArticle } = useArticleMutations();

  const handleEdit = (article) => { setEditing(article); setFormKey((key) => key + 1); setFormOpen(true); };
  const handleNew = () => { setEditing(null); setFormKey((key) => key + 1); setFormOpen(true); };
  const handleDelete = (id) => {
    if (confirm(t('catalog.articles.deleteConfirm'))) removeArticle.mutate(id);
  };
  const handleToggleStatus = (article) => {
    const id = article._id || article.id;
    updateArticle.mutate({
      id,
      data: {
        status: article.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        version: article.version,
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/70 bg-card/80 px-4 py-4 backdrop-blur sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setCursor(''); }}
              placeholder={t('catalog.articles.searchPlaceholder')}
              className="h-11 rounded-xl border-border/80 bg-background/70 pl-10 text-sm shadow-sm"
            />
          </div>
          {/* Scope the search to a single field (precision on large catalogs) */}
          <Select value={searchField} onValueChange={(v) => { setSearchField(v); setCursor(''); }}>
            <SelectTrigger className="h-11 w-40 shrink-0 rounded-xl border-border/80 bg-background/70 text-sm shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('catalog.search.all', 'Alle Felder')}</SelectItem>
              <SelectItem value="name">{t('catalog.search.name', 'Nur Titel')}</SelectItem>
              <SelectItem value="number">{t('catalog.search.number', 'Nur Artikel-Nr.')}</SelectItem>
              <SelectItem value="ean">{t('catalog.search.ean', 'Nur EAN')}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" className="h-10 gap-2 rounded-xl" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              {t('catalog.articles.bulkImport')}
            </Button>
            <Button className="h-10 gap-2 rounded-xl" onClick={handleNew}>
              <Plus className="h-4 w-4" />
              {t('catalog.article')}
            </Button>
          </div>
        </div>
        {!search && recentSearches.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-muted-foreground">{t('catalog.articles.recentSearches')}</span>
            {recentSearches.map((item) => (
              <button
                key={item._id || `${item.query}-${item.filtersHash || ''}`}
                type="button"
                onClick={() => {
                  setSearch(item.query);
                  setCursor('');
                }}
                className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
              >
                {item.query}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="overflow-hidden rounded-xl border border-border/70 bg-background/55 shadow-sm">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 9 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex min-h-[22rem] flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-sm font-medium text-destructive">{t('catalog.articles.loadError')}</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {t('catalog.articles.loadErrorHint', 'Refresh the page or adjust the filters and try again.')}
              </p>
            </div>
          ) : articles.length === 0 ? (
            <div className="flex min-h-[22rem] flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Plus className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">{t('catalog.articles.empty')}</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  {t('catalog.articles.emptyHint', 'Create the first catalog article or import a prepared CSV template.')}
                </p>
              </div>
              <Button variant="outline" className="gap-2 rounded-xl" onClick={handleNew}>
                <Plus className="h-4 w-4" />
                {t('catalog.articles.createFirst')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b bg-muted/60 backdrop-blur">
                    <th className="w-32 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('catalog.articles.articleNumberShort')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('catalog.articles.name')}
                    </th>
                    <th className="w-28 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('catalog.articles.type')}
                    </th>
                    <th className="w-44 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('catalog.articles.source')}
                    </th>
                    <th className="w-36 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('catalog.articles.prices')}
                    </th>
                    <th className="w-32 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('catalog.articles.availability')}
                    </th>
                    <th className="w-28 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('catalog.articles.status')}
                    </th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {articles.map((article) => {
                    const id = article._id || article.id;
                    const description = toPlainText(article.description);
                    return (
                      <tr key={id} className="transition-colors hover:bg-muted/35">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{article.articleNumber}</td>
                        <td className="px-4 py-3">
                          <div className="truncate font-medium">{article.name}</div>
                          {description && (
                            <div className="truncate text-xs text-muted-foreground">{description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3"><ArticleTypeBadge type={article.type} size="sm" /></td>
                        <td className="px-4 py-3">
                          <div className="truncate text-xs font-medium">{article.supplierName || article.manufacturerName || article.source}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[article.manufacturerName, article.manufacturerPartNumber].filter(Boolean).join(' / ') || article.supplierRef || article.source}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <div className="font-medium">{fmt(article.salesPrice ?? article.basePrice, article.currency)}</div>
                          <div className="text-xs text-muted-foreground">
                            {t('catalog.articles.purchaseShort')} {' '}
                            {fmt(article.purchasePrice ?? article.buyPrice ?? 0, article.currency)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium">{article.availabilityStatus || 'UNKNOWN'}</div>
                          {article.availableQuantity !== null && article.availableQuantity !== undefined && (
                            <div className="text-xs text-muted-foreground">{article.availableQuantity} {article.unit}</div>
                          )}
                        </td>
                        <td className="px-4 py-3"><ArticleStatusBadge status={article.status} size="sm" /></td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => handleEdit(article)}>
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                {t('common.edit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleStatus(article)}>
                                <ToggleLeft className="mr-2 h-3.5 w-3.5" />
                                {article.status === 'ACTIVE'
                                  ? t('catalog.articles.deactivate')
                                  : t('catalog.articles.activate')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setHistoryArticle(historyArticle?._id === id || historyArticle?.id === id ? null : article)}>
                                <History className="mr-2 h-3.5 w-3.5" />
                                {t('catalog.articles.history')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(id)}>
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                {t('common.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {(pagination?.hasNext || cursor) && (
          <div className="mt-4 flex justify-end gap-2">
            {cursor && (
              <Button variant="ghost" size="sm" onClick={() => setCursor('')}>
                {t('common.firstPage')}
              </Button>
            )}
            {pagination?.hasNext && (
              <Button variant="outline" size="sm" onClick={() => setCursor(pagination.nextCursor)}>
                {t('catalog.articles.loadMore')}
              </Button>
            )}
          </div>
        )}

        {historyArticle && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border/70 bg-background/55 shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-medium">{t('catalog.articles.versions')} - {historyArticle.name}</p>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setHistoryArticle(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-64 overflow-hidden">
              <ArticleVersionHistoryPanel articleId={historyArticle._id || historyArticle.id} />
            </div>
          </div>
        )}
      </div>

      <CatalogArticleFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} article={editing} />
      <CatalogBulkImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
