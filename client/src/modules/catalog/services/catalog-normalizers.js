export function normalizeArticlePayload(input = {}) {
  const basePrice = input.basePrice ?? input.buyPrice ?? input.sellPrice ?? 0;
  const payload = {
    articleNumber: input.articleNumber,
    name: input.name,
    description: input.description ?? '',
    categoryId: input.categoryId || input.category?._id || input.category?.id,
    type: input.type || 'MATERIAL',
    unitOfMeasure: input.unitOfMeasure || input.unit || 'STK',
    basePrice: Number(basePrice) || 0,
    currency: (input.currency || 'CHF').toUpperCase(),
    supplierReference: input.supplierReference ?? input.supplierRef ?? null,
    ighArticleNumber: input.ighArticleNumber ?? null,
    source: input.source || 'INTERNAL',
    status: input.status || 'ACTIVE',
  };

  if (input.version !== undefined) {
    payload.version = input.version;
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

export function normalizeArticle(article = {}) {
  return {
    ...article,
    id: article.id || article._id,
    categoryId: article.categoryId?._id || article.categoryId || '',
    categoryName: article.categoryId?.name || article.categoryName || '',
    unit: article.unitOfMeasure || article.unit || '',
    buyPrice: article.basePrice ?? article.buyPrice ?? 0,
    sellPrice: article.basePrice ?? article.sellPrice ?? 0,
    supplierRef: article.supplierReference ?? article.supplierRef ?? '',
  };
}

export function normalizeListResponse(response) {
  const data = Array.isArray(response) ? response : (response?.data ?? response?.items ?? []);
  return {
    data: data.map(normalizeArticle),
    pagination: response?.pagination ?? null,
  };
}

export function buildCatalogSnapshot(article = {}) {
  const id = article.catalogArticleId || article.id || article._id;
  return article.snapshot || {
    catalogArticleId: id,
    articleNumber: article.articleNumber,
    articleName: article.name,
    articleDescription: article.description || '',
    unitOfMeasure: article.unitOfMeasure || article.unit,
    snapshotBasePrice: article.basePrice ?? article.buyPrice ?? article.sellPrice ?? 0,
    snapshotCurrency: article.currency || 'CHF',
    catalogSource: article.source || article.catalogSource || 'INTERNAL',
    snapshotTakenAt: new Date().toISOString(),
  };
}
