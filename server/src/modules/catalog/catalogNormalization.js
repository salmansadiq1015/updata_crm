const UNIT_ALIASES = new Map([
  ['STUCK', 'STK'],
  ['STUECK', 'STK'],
  ['STUCKE', 'STK'],
  ['STUECKE', 'STK'],
  ['STK.', 'STK'],
  ['PCS', 'STK'],
  ['PIECE', 'STK'],
  ['PIECES', 'STK'],
  ['METER', 'M'],
  ['METRE', 'M'],
  ['LFM.', 'LFM'],
  ['LAUFMETER', 'LFM'],
  ['LITER', 'L'],
  ['LITRE', 'L'],
  ['HOUR', 'H'],
  ['HOURS', 'H'],
  ['STUNDE', 'H'],
  ['KILOGRAMM', 'KG'],
  ['KG.', 'KG'],
  ['M²', 'M2'],
  ['QM', 'M2'],
  ['M³', 'M3'],
  ['CBM', 'M3'],
  ['SET.', 'SET'],
]);

const TOKEN_MIN_LENGTH = 3;

export function normalizeUnitCode(value, fallback = 'STK') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const upper = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return UNIT_ALIASES.get(upper) ?? upper;
}

export function normalizeSearchTerm(queryParams = {}) {
  return String(queryParams.search ?? queryParams.q ?? '').trim();
}

export function normalizeSearchText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function buildSearchTokens(value = '') {
  const normalized = normalizeSearchText(value);
  const tokens = new Set();
  for (const word of normalized.split(' ').filter(Boolean)) {
    tokens.add(word);
    if (word.length >= TOKEN_MIN_LENGTH) {
      for (let index = 0; index <= word.length - TOKEN_MIN_LENGTH; index += 1) {
        tokens.add(word.slice(index, index + TOKEN_MIN_LENGTH));
      }
    }
  }
  return [...tokens].slice(0, 100);
}

export function buildArticleSearchTokens(article = {}) {
  return buildSearchTokens([
    article.articleNumber,
    article.name,
    article.description,
    article.supplierName,
    article.supplierReference,
    article.manufacturerName,
    article.manufacturerPartNumber,
    article.productGroup,
    article.externalCatalogItemId,
    article.ighArticleNumber,
  ].filter(Boolean).join(' '));
}

export function sanitizeCatalogHtml(html = '') {
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<(iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
}

export function normalizeArticlePayload(data = {}) {
  const normalized = { ...data };
  const trimFields = [
    'supplierName',
    'supplierReference',
    'manufacturerName',
    'manufacturerPartNumber',
    'productGroup',
    'externalCatalogItemId',
    'ighArticleNumber',
  ];
  for (const field of trimFields) {
    if (normalized[field] !== undefined) {
      const value = String(normalized[field] ?? '').trim();
      normalized[field] = value || null;
    }
  }
  if (normalized.unitOfMeasure !== undefined) {
    normalized.unitOfMeasure = normalizeUnitCode(normalized.unitOfMeasure);
  }
  if (normalized.currency !== undefined) {
    normalized.currency = String(normalized.currency || 'CHF').trim().toUpperCase();
  }
  if (normalized.source !== undefined) {
    normalized.source = String(normalized.source || 'INTERNAL').trim().toUpperCase();
  }
  if (normalized.type !== undefined) {
    normalized.type = String(normalized.type || 'MATERIAL').trim().toUpperCase();
  }
  if (normalized.availabilityStatus !== undefined) {
    normalized.availabilityStatus = String(normalized.availabilityStatus || 'UNKNOWN').trim().toUpperCase();
  }
  if (normalized.salesPrice === undefined && normalized.basePrice !== undefined) {
    normalized.salesPrice = normalized.basePrice;
  }
  if (normalized.basePrice === undefined && normalized.salesPrice !== undefined) {
    normalized.basePrice = normalized.salesPrice;
  }
  const hasSearchFields = [
    'articleNumber',
    'name',
    'description',
    'supplierName',
    'supplierReference',
    'manufacturerName',
    'manufacturerPartNumber',
    'productGroup',
    'externalCatalogItemId',
    'ighArticleNumber',
  ].some((field) => normalized[field] !== undefined);
  if (hasSearchFields) {
    normalized.searchTokens = buildArticleSearchTokens(normalized);
  }
  return normalized;
}
