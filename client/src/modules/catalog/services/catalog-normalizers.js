export function normalizeArticlePayload(input = {}, { partial = false } = {}) {
  const payload = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const set = (key, value) => {
    if (value !== undefined) payload[key] = value;
  };

  if (!partial || has('articleNumber')) set('articleNumber', input.articleNumber);
  if (!partial || has('name')) set('name', input.name);
  if (!partial || has('description')) set('description', input.description ?? '');
  if (!partial || has('categoryId') || has('category')) set('categoryId', input.categoryId || input.category?._id || input.category?.id);
  if (!partial || has('type')) set('type', input.type || 'MATERIAL');
  if (!partial || has('unitOfMeasure') || has('unit')) set('unitOfMeasure', input.unitOfMeasure || input.unit || 'STK');
  if (!partial || has('currency')) set('currency', (input.currency || 'CHF').toUpperCase());

  const hasPurchase = has('purchasePrice') || has('buyPrice');
  const hasSales = has('salesPrice') || has('sellPrice');
  const hasBase = has('basePrice');
  if (!partial || hasPurchase || hasSales || hasBase) {
    const purchasePrice = input.purchasePrice ?? input.buyPrice ?? input.basePrice ?? 0;
    const salesPrice = input.salesPrice ?? input.sellPrice ?? input.basePrice ?? purchasePrice ?? 0;
    const basePrice = input.basePrice ?? salesPrice ?? 0;
    set('basePrice', Number(basePrice) || 0);
    set('purchasePrice', Number(purchasePrice) || 0);
    set('salesPrice', Number(salesPrice) || 0);
  }

  if (!partial || has('catalogConnectionId') || has('connection')) set('catalogConnectionId', input.catalogConnectionId || input.connection?._id || null);
  if (!partial || has('externalCatalogItemId')) set('externalCatalogItemId', input.externalCatalogItemId ?? null);
  if (!partial || has('supplierId') || has('supplier')) set('supplierId', input.supplierId || input.supplier?._id || null);
  if (!partial || has('supplierName') || has('supplier')) set('supplierName', input.supplierName ?? input.supplier?.name ?? null);
  if (!partial || has('supplierReference') || has('supplierRef')) set('supplierReference', input.supplierReference ?? input.supplierRef ?? null);
  if (!partial || has('manufacturerName')) set('manufacturerName', input.manufacturerName ?? null);
  if (!partial || has('manufacturerPartNumber')) set('manufacturerPartNumber', input.manufacturerPartNumber ?? null);
  if (!partial || has('productGroup')) set('productGroup', input.productGroup ?? null);
  if (!partial || has('ighArticleNumber')) set('ighArticleNumber', input.ighArticleNumber ?? null);
  if (!partial || has('source')) set('source', input.source || 'INTERNAL');
  if (!partial || has('status')) set('status', input.status || 'ACTIVE');
  if (!partial || has('availabilityStatus')) set('availabilityStatus', input.availabilityStatus || 'UNKNOWN');
  if (!partial || has('availableQuantity')) set('availableQuantity', input.availableQuantity ?? null);
  if (!partial || has('markupPercent')) set('markupPercent', input.markupPercent ?? null);
  if (!partial || has('marginPercent')) set('marginPercent', input.marginPercent ?? null);

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
    buyPrice: article.purchasePrice ?? article.buyPrice ?? article.basePrice ?? 0,
    sellPrice: article.salesPrice ?? article.sellPrice ?? article.basePrice ?? 0,
    supplierRef: article.supplierReference ?? article.supplierRef ?? '',
    supplierName: article.supplierName || article.supplierId?.name || article.supplierName || '',
    manufacturerName: article.manufacturerName || '',
    manufacturerPartNumber: article.manufacturerPartNumber || '',
    productGroup: article.productGroup || '',
    availabilityStatus: article.availabilityStatus || 'UNKNOWN',
    availableQuantity: article.availableQuantity ?? null,
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
    snapshotPurchasePrice: article.purchasePrice ?? article.buyPrice ?? 0,
    snapshotSalesPrice: article.salesPrice ?? article.sellPrice ?? article.basePrice ?? 0,
    snapshotCurrency: article.currency || 'CHF',
    catalogSource: article.source || article.catalogSource || 'INTERNAL',
    catalogConnectionId: article.catalogConnectionId || null,
    externalCatalogItemId: article.externalCatalogItemId || '',
    supplierId: article.supplierId?._id || article.supplierId || null,
    supplierName: article.supplierName || article.supplierId?.name || '',
    manufacturerName: article.manufacturerName || '',
    manufacturerPartNumber: article.manufacturerPartNumber || '',
    productGroup: article.productGroup || '',
    availabilityStatus: article.availabilityStatus || 'UNKNOWN',
    availableQuantity: article.availableQuantity ?? null,
    appliedMarkupPercent: article.markupPercent ?? null,
    marginPercent: article.marginPercent ?? null,
    manualPriceOverride: false,
    snapshotTakenAt: new Date().toISOString(),
  };
}
