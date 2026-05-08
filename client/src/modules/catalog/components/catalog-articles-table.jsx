'use client';

import { useState } from 'react';
import { Search, Plus, MoreHorizontal, Pencil, Trash2, ToggleLeft, Upload, History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useArticles } from '../hooks/use-catalog-queries';
import { useArticleMutations } from '../hooks/use-catalog-mutations';
import { ArticleTypeBadge } from './article-type-badge';
import { ArticleStatusBadge } from './article-status-badge';
import { CatalogArticleFormDialog } from './catalog-article-form-dialog';
import { CatalogBulkImportDialog } from './catalog-bulk-import-dialog';
import { ArticleVersionHistoryPanel } from './article-version-history-panel';
import { useLanguage } from '@/lib/i18n/language-context';

const fmt = (v, currency = 'CHF') =>
  new Intl.NumberFormat('de-CH', { style: 'currency', currency }).format(v ?? 0);

export function CatalogArticlesTable({ categoryId }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyArticle, setHistoryArticle] = useState(null);

  const filters = {};
  if (categoryId) filters.categoryId = categoryId;
  if (search.trim()) filters.q = search.trim();

  const { data: articles = [], isLoading } = useArticles(filters);
  const { removeArticle, updateArticle } = useArticleMutations();

  const handleEdit = (article) => { setEditing(article); setFormOpen(true); };
  const handleNew = () => { setEditing(null); setFormOpen(true); };
  const handleDelete = (id) => { if (confirm(de ? 'Artikel löschen?' : 'Delete article?')) removeArticle.mutate(id); };
  const handleToggleStatus = (a) => {
    const id = a._id || a.id;
    updateArticle.mutate({ id, data: { status: a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={de ? 'Artikel suchen...' : 'Search articles...'}
            className="pl-9 h-8 text-sm"
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

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {de ? 'Lädt...' : 'Loading...'}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-muted-foreground">
              {de ? 'Keine Artikel gefunden' : 'No articles found'}
            </p>
            <Button variant="outline" size="sm" onClick={handleNew}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {de ? 'Ersten Artikel erstellen' : 'Create first article'}
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {de ? 'Art.-Nr.' : 'Art. No.'}
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {de ? 'Bezeichnung' : 'Name'}
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {de ? 'Typ' : 'Type'}
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {de ? 'EK-Preis' : 'Buy Price'}
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {de ? 'VK-Preis' : 'Sell Price'}
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {de ? 'Status' : 'Status'}
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {articles.map((a) => {
                const id = a._id || a.id;
                return (
                  <tr key={id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.articleNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{a.name}</div>
                      {a.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-xs">{a.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ArticleTypeBadge type={a.type} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(a.buyPrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(a.sellPrice)}</td>
                    <td className="px-4 py-3">
                      <ArticleStatusBadge status={a.status} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => handleEdit(a)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            {de ? 'Bearbeiten' : 'Edit'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(a)}>
                            <ToggleLeft className="h-3.5 w-3.5 mr-2" />
                            {a.status === 'ACTIVE'
                              ? (de ? 'Deaktivieren' : 'Deactivate')
                              : (de ? 'Aktivieren' : 'Activate')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHistoryArticle(historyArticle?._id === id || historyArticle?.id === id ? null : a)}>
                            <History className="h-3.5 w-3.5 mr-2" />
                            {de ? 'Verlauf' : 'History'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(id)}
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

      {historyArticle && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-medium">
              {de ? 'Versionshistorie' : 'Version History'} — {historyArticle.name}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setHistoryArticle(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="max-h-64 overflow-hidden">
            <ArticleVersionHistoryPanel
              articleId={historyArticle._id || historyArticle.id}
            />
          </div>
        </div>
      )}

      <CatalogArticleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        article={editing}
      />
      <CatalogBulkImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
