'use client';

import { useArticleVersions } from '../hooks/use-catalog-queries';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/lib/i18n/language-context';

export function ArticleVersionHistoryPanel({ articleId }) {
  const { t } = useLanguage();
  const { data: versions = [], isLoading } = useArticleVersions(articleId);

  const fmtDate = (raw) => {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('de-CH', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground animate-pulse">
        {t('catalog.articles.versions') || 'Lädt...'}
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('catalog.articles.noVersions')}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {versions.map((v) => (
          <div key={v._id ?? v.id} className="rounded-md border p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Version {v.version}</span>
              <Badge variant="outline" className="text-xs">
                {fmtDate(v.createdAt)}
              </Badge>
            </div>
            {v.changedBy && (
              <p className="text-xs text-muted-foreground">
                {v.changedBy.firstName} {v.changedBy.lastName}
              </p>
            )}
            {v.snapshot && (
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
                {v.snapshot.name && <p>Name: {v.snapshot.name}</p>}
                {v.snapshot.basePrice != null && (
                  <p>Price: CHF {Number(v.snapshot.basePrice).toFixed(2)}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
