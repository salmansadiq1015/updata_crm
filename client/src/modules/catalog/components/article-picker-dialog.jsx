'use client';

import { useState } from 'react';
import { Search, Package, ArrowLeft, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { articleService } from '../services/article-service';
import { buildCatalogSnapshot } from '../services/catalog-normalizers';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';

function toSnapshot(article, options = {}) {
  const { includeDescription = true, includePrice = true } = options;
  const catalogSnapshot = buildCatalogSnapshot(article);
  return {
    catalogArticleId: article._id || article.id || article.catalogArticleId,
    articleNumber: article.articleNumber,
    name: article.name,
    description: includeDescription ? (article.description ?? '') : '',
    unitOfMeasure: article.unitOfMeasure,
    snapshotPrice: includePrice ? (article.salesPrice ?? article.basePrice) : 0,
    type: article.type,
    source: article.source,
    catalogSnapshot: includePrice ? catalogSnapshot : {
      ...catalogSnapshot,
      snapshotBasePrice: 0,
      snapshotPurchasePrice: 0,
      snapshotSalesPrice: 0,
    },
  };
}

export function ArticlePickerDialog({ open, onClose, onSelect }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [includeDescription, setIncludeDescription] = useState(true);
  const [includePrice, setIncludePrice] = useState(true);
  const debouncedQuery = useDebounce(query, 250);

  const closeDialog = () => {
    setQuery('');
    setSelectedArticle(null);
    setIncludeDescription(true);
    setIncludePrice(true);
    onClose();
  };

  const { data: articles = [], isLoading } = useQuery({
    queryKey: queryKeys.catalog.pickerArticles({ q: debouncedQuery }),
    queryFn: () =>
      articleService
        .picker(debouncedQuery)
        .then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    enabled: open && debouncedQuery.trim().length > 0,
    staleTime: 15_000,
  });

  const handleArticleClick = (article) => {
    setSelectedArticle(article);
  };

  const handleConfirm = () => {
    if (!selectedArticle) return;
    onSelect(toSnapshot(selectedArticle, { includeDescription, includePrice }));
    // Fire-and-forget: update lastUsedAt (don't block UI)
    const articleId = selectedArticle._id || selectedArticle.id || selectedArticle.catalogArticleId;
    if (articleId) {
      articleService.recordUse(articleId).catch(() => {});
    }
    closeDialog();
  };

  const handleBack = () => {
    setSelectedArticle(null);
  };

  const handleFreeText = () => {
    onSelect({
      catalogArticleId: null,
      articleNumber: null,
      name: query,
      description: '',
      unitOfMeasure: '',
      snapshotPrice: 0,
      type: null,
      source: null,
      catalogSnapshot: null,
    });
    closeDialog();
  };

  const fmt = (n) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle>{t('catalog.picker.articleTitle')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('catalog.picker.articleDescription')}
          </DialogDescription>
        </DialogHeader>

        {selectedArticle ? (
          /* ── Import options step ── */
          <div className="px-4 pt-3 pb-4 space-y-4">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('catalog.picker.backToSearch', 'Zurück zur Suche')}
            </button>

            {/* Article summary */}
            <div className="rounded-lg border border-border p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm truncate">{selectedArticle.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 ml-6">
                <span className="text-xs text-muted-foreground font-mono">{selectedArticle.articleNumber}</span>
                {selectedArticle.unitOfMeasure && (
                  <span className="text-xs text-muted-foreground">/ {selectedArticle.unitOfMeasure}</span>
                )}
                <span className="text-xs font-medium ml-auto">
                  CHF {fmt(Number(selectedArticle.salesPrice ?? selectedArticle.basePrice) || 0)}
                </span>
              </div>
            </div>

            {/* Import options */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('catalog.picker.importOptions', 'Welche Daten übernehmen?')}</p>

              <div className="space-y-2.5 pt-1">
                {/* Name — always imported */}
                <div className="flex items-center gap-2.5">
                  <Checkbox id="import-name" checked disabled />
                  <Label htmlFor="import-name" className="text-sm text-muted-foreground">
                    {t('catalog.picker.optionName', 'Artikelname & Nummer')}
                  </Label>
                </div>

                {/* Description */}
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="import-description"
                    checked={includeDescription}
                    onCheckedChange={setIncludeDescription}
                  />
                  <Label htmlFor="import-description" className="text-sm cursor-pointer">
                    {t('catalog.picker.optionDescription', 'Beschreibung')}
                    {selectedArticle.description && (
                      <span className="text-muted-foreground ml-1">
                        — {selectedArticle.description.length > 60
                          ? `${selectedArticle.description.slice(0, 60)}…`
                          : selectedArticle.description}
                      </span>
                    )}
                  </Label>
                </div>

                {/* Price */}
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="import-price"
                    checked={includePrice}
                    onCheckedChange={setIncludePrice}
                  />
                  <Label htmlFor="import-price" className="text-sm cursor-pointer">
                    {t('catalog.picker.optionPrice', 'Preis übernehmen')}
                    <span className="text-muted-foreground ml-1">
                      — VK {fmt(Number(selectedArticle.salesPrice ?? selectedArticle.basePrice) || 0)}
                    </span>
                  </Label>
                </div>
              </div>
            </div>

            <Button onClick={handleConfirm} className="w-full gap-2">
              <Check className="h-4 w-4" />
              {t('catalog.picker.confirmImport', 'Artikel übernehmen')}
            </Button>
          </div>
        ) : (
          /* ── Search step ── */
          <>
            <div className="px-4 pt-3 pb-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  className="pl-8"
                  placeholder={t('catalog.picker.articleSearchPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            <ScrollArea className="max-h-80">
              {isLoading && (
                <div className="px-4 py-6 text-sm text-center text-muted-foreground animate-pulse">
                  {t('catalog.picker.searching')}
                </div>
              )}

              {!isLoading && articles.length === 0 && !query && (
                <div className="px-4 py-6 text-sm text-center text-muted-foreground">
                  {t('catalog.picker.startArticleSearch')}
                </div>
              )}

              {!isLoading && articles.length === 0 && query && (
                <div className="px-4 py-4 text-sm text-muted-foreground">
                  <p className="mb-3">{t('catalog.picker.noArticlesFor', null, { query })}</p>
                  <Button variant="outline" size="sm" onClick={handleFreeText}>
                    {t('catalog.picker.addFreeText', null, { query })}
                  </Button>
                </div>
              )}

              <div className="py-1">
                {articles.map((article) => (
                  <button
                    key={article._id}
                    type="button"
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 text-left transition-colors"
                    onClick={() => handleArticleClick(article)}
                  >
                    <Package className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{article.name}</span>
                        {article.type && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {article.type}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">
                          {article.articleNumber}
                        </span>
                        {article.unitOfMeasure && (
                          <span className="text-xs text-muted-foreground">/ {article.unitOfMeasure}</span>
                        )}
                      </div>
                      {(article.supplierName || article.manufacturerName || article.availabilityStatus) && (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[article.supplierName || article.manufacturerName, article.availabilityStatus].filter(Boolean).join(' | ')}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-medium">
                        CHF {(Number(article.salesPrice ?? article.basePrice) || 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {t('catalog.articles.purchaseShort')} {(Number(article.purchasePrice) || 0).toFixed(2)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {articles.length > 0 && query && (
                <div className="px-4 py-2 border-t">
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleFreeText}>
                    + {t('catalog.picker.addFreeText', null, { query })}
                  </Button>
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
