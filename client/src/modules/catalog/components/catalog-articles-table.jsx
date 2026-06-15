'use client';

import { useState } from 'react';
import { Search, Plus, MoreHorizontal, Pencil, Trash2, ToggleLeft, Upload, History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export function CatalogArticlesTable({ filters: externalFilters = {} }) {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyArticle, setHistoryArticle] = useState(null);

  const queryFilters = { ...externalFilters, limit: 50, cursor };
  if (search.trim()) queryFilters.search = search.trim();

  const { data: result = { data: [], pagination: null }, isLoading, isError } = useArticles(queryFilters);
  const { data: recentSearches = [] } = useRecentCatalogSearches();
  const articles = result.data ?? [];
  const pagination = result.pagination;
  const { removeArticle, updateArticle } = useArticleMutations();

  const handleEdit = (article) => { setEditing(article); setFormOpen(true); };
  const handleNew = () => { setEditing(null); setFormOpen(true); };
  const handleDelete = (id) => {
    if (confirm(de ? 'Artikel löschen?' : 'Delete article?')) removeArticle.mutate(id);
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setCursor(''); }}
            placeholder={de ? 'Artikel suchen...' : 'Search articles...'}
            className="h-8 pl-9 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          {de ? 'Importieren' : 'Bulk Import'}
        </Button>
        <Button size="sm" className="h-8 gap-1.5" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5" />
          {de ? 'Artikel' : 'Article'}
        </Button>
      </div>
      {!search && recentSearches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{de ? 'Zuletzt gesucht:' : 'Recent:'}</span>
          {recentSearches.map((item) => (
            <button
              key={item._id || `${item.query}-${item.filtersHash || ''}`}
              type="button"
              onClick={() => {
                setSearch(item.query);
                setCursor('');
              }}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {item.query}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-12 text-sm text-destructive">
            {de ? 'Artikel konnten nicht geladen werden.' : 'Could not load articles.'}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <p className="text-sm text-muted-foreground">
              {de ? 'Keine Artikel gefunden' : 'No articles found'}
            </p>
            <Button variant="outline" size="sm" onClick={handleNew}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {de ? 'Ersten Artikel erstellen' : 'Create first article'}
            </Button>
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-32 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {de ? 'Art.-Nr.' : 'Art. No.'}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {de ? 'Bezeichnung' : 'Name'}
                </th>
                <th className="w-28 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {de ? 'Typ' : 'Type'}
                </th>
                <th className="w-36 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {de ? 'Basispreis' : 'Base Price'}
                </th>
                <th className="w-28 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {articles.map((article) => {
                const id = article._id || article.id;
                return (
                  <tr key={id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{article.articleNumber}</td>
                    <td className="px-4 py-3">
                      <div className="truncate font-medium">{article.name}</div>
                      {article.description && (
                        <div className="truncate text-xs text-muted-foreground">{article.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3"><ArticleTypeBadge type={article.type} size="sm" /></td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(article.basePrice, article.currency)}</td>
                    <td className="px-4 py-3"><ArticleStatusBadge status={article.status} size="sm" /></td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => handleEdit(article)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            {de ? 'Bearbeiten' : 'Edit'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(article)}>
                            <ToggleLeft className="mr-2 h-3.5 w-3.5" />
                            {article.status === 'ACTIVE'
                              ? (de ? 'Deaktivieren' : 'Deactivate')
                              : (de ? 'Aktivieren' : 'Activate')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHistoryArticle(historyArticle?._id === id || historyArticle?.id === id ? null : article)}>
                            <History className="mr-2 h-3.5 w-3.5" />
                            {de ? 'Verlauf' : 'History'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(id)}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            {de ? 'Loeschen' : 'Delete'}
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

      {(pagination?.hasNext || cursor) && (
        <div className="flex justify-end gap-2">
          {cursor && (
            <Button variant="ghost" size="sm" onClick={() => setCursor('')}>
              {de ? 'Erste Seite' : 'First page'}
            </Button>
          )}
          {pagination?.hasNext && (
            <Button variant="outline" size="sm" onClick={() => setCursor(pagination.nextCursor)}>
              {de ? 'Weitere laden' : 'Load more'}
            </Button>
          )}
        </div>
      )}

      {historyArticle && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-medium">{t('catalog.articles.versions')} - {historyArticle.name}</p>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHistoryArticle(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="h-64 overflow-hidden">
            <ArticleVersionHistoryPanel articleId={historyArticle._id || historyArticle.id} />
          </div>
        </div>
      )}

      <CatalogArticleFormDialog open={formOpen} onOpenChange={setFormOpen} article={editing} />
      <CatalogBulkImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
