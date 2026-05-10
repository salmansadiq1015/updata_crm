'use client';

import { useState, useEffect } from 'react';
import { Search, Package } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useDebounce } from '@/shared/hooks/use-debounce';

function toSnapshot(article) {
  return {
    catalogArticleId: article._id,
    articleNumber: article.articleNumber,
    name: article.name,
    description: article.description ?? '',
    unitOfMeasure: article.unitOfMeasure,
    snapshotPrice: article.basePrice,
    type: article.type,
    source: article.source,
  };
}

export function ArticlePickerDialog({ open, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: queryKeys.catalog.pickerArticles({ q: debouncedQuery }),
    queryFn: () =>
      apiClient
        .get(ENDPOINTS.CATALOG.PICKER_ARTICLES, { params: { q: debouncedQuery } })
        .then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    enabled: open,
    staleTime: 15_000,
  });

  const handleSelect = (article) => {
    onSelect(toSnapshot(article));
    onClose();
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
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle>Select Article</DialogTitle>
        </DialogHeader>

        <div className="px-4 pt-3 pb-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-8"
              placeholder="Search by name or article number..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="max-h-80">
          {isLoading && (
            <div className="px-4 py-6 text-sm text-center text-muted-foreground animate-pulse">
              Searching...
            </div>
          )}

          {!isLoading && articles.length === 0 && !query && (
            <div className="px-4 py-6 text-sm text-center text-muted-foreground">
              Start typing to search the catalog.
            </div>
          )}

          {!isLoading && articles.length === 0 && query && (
            <div className="px-4 py-4 text-sm text-muted-foreground">
              <p className="mb-3">No articles found for &ldquo;{query}&rdquo;.</p>
              <Button variant="outline" size="sm" onClick={handleFreeText}>
                Add as free text: &ldquo;{query}&rdquo;
              </Button>
            </div>
          )}

          <div className="py-1">
            {articles.map((article) => (
              <button
                key={article._id}
                type="button"
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 text-left transition-colors"
                onClick={() => handleSelect(article)}
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
                </div>
                <div className="text-sm font-medium shrink-0">
                  CHF {(Number(article.basePrice) || 0).toFixed(2)}
                </div>
              </button>
            ))}
          </div>

          {articles.length > 0 && query && (
            <div className="px-4 py-2 border-t">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleFreeText}>
                + Add as free text: &ldquo;{query}&rdquo;
              </Button>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
