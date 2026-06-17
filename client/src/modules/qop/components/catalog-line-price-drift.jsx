'use client';

import { PriceDriftBadge } from '@/modules/catalog/components/price-drift-badge';
import { useArticleDetail } from '@/modules/catalog/hooks/use-catalog-queries';

function getCatalogArticleId(item = {}) {
  return item.catalogItemId || item.catalogArticleId || item.catalogSnapshot?.catalogArticleId || null;
}

export function CatalogLinePriceDrift({ item }) {
  const articleId = getCatalogArticleId(item);
  const { data } = useArticleDetail(articleId);
  const article = data?.data ?? data;
  const snapshotPrice = Number(
    item?.catalogSnapshot?.snapshotSalesPrice
    ?? item?.catalogSnapshot?.snapshotBasePrice
    ?? item?.unitPrice
    ?? 0,
  );
  const currentPrice = article?.salesPrice ?? article?.basePrice;

  if (!articleId || !snapshotPrice || currentPrice == null) return null;

  return <PriceDriftBadge snapshotPrice={snapshotPrice} currentPrice={Number(currentPrice)} />;
}
