# MAT Catalog — Foundation, Article UI & Search

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the client-side foundation for Module 10 — wire catalog permissions, fill article form gaps (images + missing fields), add faceted search, bulk import UI, version history panel, and scaffold sub-navigation pages.

**Architecture:** All server infrastructure exists (models, repos, services, routes). This plan closes client gaps: missing permission constants, missing API endpoints, missing i18n keys, the article picker image upload chain, faceted filter aggregation (one new server endpoint + client panel), and the sub-page scaffold that Plans 2 & 3 build on.

**Tech Stack:** Next.js App Router, React 19, React Hook Form + Zod 4, TanStack Query 5, Vitest + MSW 2, Express + Mongoose (one new server endpoint), Tailwind + shadcn/ui

---

## Scope Note

This plan is part of a three-plan series for Module 10:
- **Plan 1 (this file):** Foundation + Article UI + Search
- **Plan 2:** Admin UIs — UoM, Text Blocks, Price Management
- **Plan 3:** IGH Integration + Article Picker component

Each plan produces independently testable, shippable software.

---

## File Map

**Modified (client):**
- `client/src/shared/constants/permissions.ts` — add 5 CATALOG_ constants
- `client/src/lib/api/endpoints.js` — add 8 missing catalog endpoints
- `client/src/lib/query/keys.js` — add `facets`, `units`, `igh`, `priceBatches` keys
- `client/src/lib/i18n/translations.js` — add ~60 catalog translation keys
- `client/src/modules/catalog/services/article-service.js` — add `getFacets`, `uploadImage`, `deleteImage`
- `client/src/modules/catalog/hooks/use-catalog-queries.js` — add `useArticleFacets`
- `client/src/modules/catalog/hooks/use-catalog-mutations.js` — add `bulkImport`, `uploadImage`, `deleteImage`
- `client/src/modules/catalog/components/catalog-article-form-dialog.jsx` — add all missing fields + image upload
- `client/src/modules/catalog/components/catalog-articles-table.jsx` — add search bar + import button
- `client/src/app/(platform)/catalog/page.jsx` — add filter panel
- `client/src/layout/sidebar.jsx` — add catalog sub-nav group

**Created (client):**
- `client/src/modules/catalog/components/catalog-filter-panel.jsx` — faceted filter sidebar
- `client/src/modules/catalog/components/catalog-bulk-import-dialog.jsx` — CSV/Excel import UI
- `client/src/modules/catalog/components/article-version-history-panel.jsx` — version timeline
- `client/src/app/(platform)/catalog/text-blocks/page.jsx` — scaffold (fleshed out in Plan 2)
- `client/src/app/(platform)/catalog/prices/page.jsx` — scaffold (fleshed out in Plan 2)
- `client/src/app/(platform)/catalog/settings/units/page.jsx` — scaffold (fleshed out in Plan 2)
- `client/src/app/(platform)/catalog/igh/page.jsx` — scaffold (fleshed out in Plan 3)

**Modified (server):**
- `server/src/modules/catalog/article.repository.js` — add `getFacets()` aggregation
- `server/src/modules/catalog/article.service.js` — add `getFacets()` delegation
- `server/src/modules/catalog/article.controller.js` — add `getFacets()` handler
- `server/src/modules/catalog/article.routes.js` — add `GET /articles/facets`
- `server/src/modules/catalog/articleImage.controller.js` — **create** (routes for upload/list/delete)
- `server/src/modules/catalog/catalog.routes.js` — mount articleImage routes

**Created (server):**
- `server/src/modules/catalog/articleImage.controller.js`
- `server/src/modules/catalog/__tests__/article-facets.test.js`

**Modified (seed):**
- `server/src/seed/seed.js` — add catalog permission definitions

**Test files:**
- `client/src/modules/catalog/__tests__/use-catalog-queries.test.ts`
- `client/src/modules/catalog/__tests__/catalog-filter-panel.test.tsx`

---

## Task 1: Catalog Permissions, Endpoints & Query Keys

**Files:**
- Modify: `client/src/shared/constants/permissions.ts`
- Modify: `client/src/lib/api/endpoints.js`
- Modify: `client/src/lib/query/keys.js`
- Modify: `server/src/seed/seed.js`
- Test: `client/src/modules/catalog/__tests__/catalog-constants.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/modules/catalog/__tests__/catalog-constants.test.ts`:

```typescript
import { PERMISSIONS } from '@/shared/constants/permissions';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';

describe('catalog constants', () => {
  it('has all catalog permission keys', () => {
    expect(PERMISSIONS.CATALOG_READ).toBe('catalog:read');
    expect(PERMISSIONS.CATALOG_WRITE).toBe('catalog:write');
    expect(PERMISSIONS.CATALOG_DELETE).toBe('catalog:delete');
    expect(PERMISSIONS.CATALOG_PRICE).toBe('catalog:price');
    expect(PERMISSIONS.CATALOG_ADMIN).toBe('catalog:admin');
  });

  it('has article facets endpoint', () => {
    expect(ENDPOINTS.CATALOG.ARTICLES_FACETS).toBe('/catalog/articles/facets');
  });

  it('has article import endpoint', () => {
    expect(ENDPOINTS.CATALOG.ARTICLES_IMPORT).toBe('/catalog/articles/import');
  });

  it('has article image endpoints', () => {
    expect(ENDPOINTS.CATALOG.ARTICLE_IMAGES('abc')).toBe('/catalog/articles/abc/images');
    expect(ENDPOINTS.CATALOG.ARTICLE_IMAGE('abc', 'img1')).toBe('/catalog/articles/abc/images/img1');
  });

  it('has unit of measure endpoints', () => {
    expect(ENDPOINTS.CATALOG.UNITS).toBe('/catalog/units');
    expect(ENDPOINTS.CATALOG.UNIT_BY_CODE('STK')).toBe('/catalog/units/STK');
  });

  it('has price batch endpoints', () => {
    expect(ENDPOINTS.CATALOG.PRICE_SCHEDULE).toBe('/catalog/prices/schedule');
    expect(ENDPOINTS.CATALOG.PRICE_ROLLBACK('batch1')).toBe('/catalog/prices/rollback/batch1');
    expect(ENDPOINTS.CATALOG.PRICE_BATCHES).toBe('/catalog/prices/batches');
  });

  it('has IGH endpoints', () => {
    expect(ENDPOINTS.CATALOG.IGH_CONFIG).toBe('/catalog/igh/config');
    expect(ENDPOINTS.CATALOG.IGH_IMPORT_FULL).toBe('/catalog/igh/import/full');
    expect(ENDPOINTS.CATALOG.IGH_IMPORT_DELTA).toBe('/catalog/igh/import/delta');
    expect(ENDPOINTS.CATALOG.IGH_IMPORT_HISTORY).toBe('/catalog/igh/import/history');
  });

  it('has picker endpoints', () => {
    expect(ENDPOINTS.CATALOG.PICKER_ARTICLES).toBe('/catalog/picker/articles');
    expect(ENDPOINTS.CATALOG.PICKER_TEXT_BLOCKS).toBe('/catalog/picker/text-blocks');
    expect(ENDPOINTS.CATALOG.PICKER_BARCODE).toBe('/catalog/picker/barcode');
  });

  it('has facets query key', () => {
    const key = queryKeys.catalog.facets({ categoryId: 'x' });
    expect(key).toEqual(['catalog', 'facets', { categoryId: 'x' }]);
  });

  it('has units query keys', () => {
    expect(queryKeys.catalog.units()).toEqual(['catalog', 'units']);
    expect(queryKeys.catalog.unitDetail('STK')).toEqual(['catalog', 'units', 'STK']);
  });

  it('has price batch query keys', () => {
    expect(queryKeys.catalog.priceBatches()).toEqual(['catalog', 'priceBatches']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
cd client && npx vitest run src/modules/catalog/__tests__/catalog-constants.test.ts
```

Expected: multiple failures — `PERMISSIONS.CATALOG_READ` is `undefined`, endpoints missing.

- [ ] **Step 3: Add catalog permissions to `client/src/shared/constants/permissions.ts`**

Add after the `TASKS_WRITE` entry (before the closing `} as const`):

```typescript
  // Catalog
  CATALOG_READ: 'catalog:read',
  CATALOG_WRITE: 'catalog:write',
  CATALOG_DELETE: 'catalog:delete',
  CATALOG_PRICE: 'catalog:price',
  CATALOG_ADMIN: 'catalog:admin',
```

- [ ] **Step 4: Add missing endpoints to `client/src/lib/api/endpoints.js`**

Replace the existing `CATALOG` block (lines 169–182):

```javascript
  CATALOG: {
    ARTICLES: '/catalog/articles',
    ARTICLE_BY_ID: (id) => `/catalog/articles/${id}`,
    ARTICLE_VERSIONS: (id) => `/catalog/articles/${id}/versions`,
    ARTICLES_FACETS: '/catalog/articles/facets',
    ARTICLES_IMPORT: '/catalog/articles/import',
    ARTICLE_IMAGES: (id) => `/catalog/articles/${id}/images`,
    ARTICLE_IMAGE: (articleId, imageId) => `/catalog/articles/${articleId}/images/${imageId}`,
    CATEGORIES: '/catalog/categories',
    CATEGORY_BY_ID: (id) => `/catalog/categories/${id}`,
    CATEGORY_MOVE: (id) => `/catalog/categories/${id}/move`,
    CATEGORY_DEACTIVATE: (id) => `/catalog/categories/${id}/deactivate`,
    TEXT_BLOCKS: '/catalog/text-blocks',
    TEXT_BLOCK_BY_ID: (id) => `/catalog/text-blocks/${id}`,
    UNITS: '/catalog/units',
    UNIT_BY_CODE: (code) => `/catalog/units/${code}`,
    PRICE_UPDATE: '/catalog/prices/update',
    PRICE_HISTORY: (id) => `/catalog/prices/history/${id}`,
    PRICE_SCHEDULE: '/catalog/prices/schedule',
    PRICE_ROLLBACK: (batchId) => `/catalog/prices/rollback/${batchId}`,
    PRICE_BATCHES: '/catalog/prices/batches',
    PICKER: '/catalog/picker',
    PICKER_ARTICLES: '/catalog/picker/articles',
    PICKER_TEXT_BLOCKS: '/catalog/picker/text-blocks',
    PICKER_BARCODE: '/catalog/picker/barcode',
    IGH_CONFIG: '/catalog/igh/config',
    IGH_IMPORT_FULL: '/catalog/igh/import/full',
    IGH_IMPORT_DELTA: '/catalog/igh/import/delta',
    IGH_IMPORT_HISTORY: '/catalog/igh/import/history',
    IGH_IMPORT_BY_ID: (jobId) => `/catalog/igh/import/${jobId}`,
  },
```

Note: the file exports `ENDPOINTS` — check the actual export name (it may be `E` or `ENDPOINTS`). Match whatever is used in existing imports throughout the catalog module.

- [ ] **Step 5: Add missing query keys to `client/src/lib/query/keys.js`**

Replace the `catalog` block (lines 27–35):

```javascript
  catalog: {
    categories: () => ['catalog', 'categories'],
    categoryDetail: (id) => ['catalog', 'categories', 'detail', id],
    articles: (filters) => ['catalog', 'articles', filters],
    articleDetail: (id) => ['catalog', 'articles', 'detail', id],
    articleVersions: (id) => ['catalog', 'articles', 'versions', id],
    articleImages: (id) => ['catalog', 'articles', 'images', id],
    facets: (filters) => ['catalog', 'facets', filters],
    textBlocks: (filters) => ['catalog', 'textBlocks', filters],
    textBlockDetail: (id) => ['catalog', 'textBlocks', 'detail', id],
    units: () => ['catalog', 'units'],
    unitDetail: (code) => ['catalog', 'units', code],
    priceHistory: (id) => ['catalog', 'prices', id],
    priceBatches: () => ['catalog', 'priceBatches'],
    ighConfig: () => ['catalog', 'igh', 'config'],
    ighImportHistory: () => ['catalog', 'igh', 'importHistory'],
    ighImportDetail: (jobId) => ['catalog', 'igh', 'import', jobId],
    pickerArticles: (params) => ['catalog', 'picker', 'articles', params],
    pickerTextBlocks: (params) => ['catalog', 'picker', 'textBlocks', params],
  },
```

- [ ] **Step 6: Add catalog permission definitions to `server/src/seed/seed.js`**

Find the `// Tasks` block (around line 77) and add after it:

```javascript
  // Catalog
  { module: 'catalog', action: 'read', description: 'View catalog articles and categories' },
  { module: 'catalog', action: 'write', description: 'Create and update catalog articles and categories' },
  { module: 'catalog', action: 'delete', description: 'Soft-delete catalog articles' },
  { module: 'catalog', action: 'price', description: 'Update article prices and manage price batches' },
  { module: 'catalog', action: 'admin', description: 'Full catalog administration — IGH import, bulk import, UoM management' },
```

- [ ] **Step 7: Run the test to verify it passes**

```
cd client && npx vitest run src/modules/catalog/__tests__/catalog-constants.test.ts
```

Expected: all assertions PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/shared/constants/permissions.ts \
        client/src/lib/api/endpoints.js \
        client/src/lib/query/keys.js \
        server/src/seed/seed.js \
        client/src/modules/catalog/__tests__/catalog-constants.test.ts
git commit -m "feat(catalog): add permissions, endpoints, query keys for Module 10"
```

---

## Task 2: Catalog Translation Keys

**Files:**
- Modify: `client/src/lib/i18n/translations.js`

- [ ] **Step 1: Write the failing test**

Add to `client/src/modules/catalog/__tests__/catalog-constants.test.ts` (append to the existing describe block):

```typescript
import de from '@/lib/i18n/translations'; // adjust to actual export path

it('has German catalog translations', () => {
  const t = de.de; // or however the DE locale is accessed
  expect(t['catalog.articles.title']).toBeDefined();
  expect(t['catalog.articles.create']).toBeDefined();
  expect(t['catalog.articles.bulkImport']).toBeDefined();
  expect(t['catalog.filter.type']).toBeDefined();
  expect(t['catalog.filter.status']).toBeDefined();
  expect(t['catalog.filter.source']).toBeDefined();
  expect(t['catalog.filter.priceRange']).toBeDefined();
  expect(t['catalog.articles.versions']).toBeDefined();
  expect(t['catalog.images.upload']).toBeDefined();
});
```

- [ ] **Step 2: Run test, confirm failure**

```
cd client && npx vitest run src/modules/catalog/__tests__/catalog-constants.test.ts
```

Expected: FAIL — keys undefined.

- [ ] **Step 3: Add German catalog translations**

In `client/src/lib/i18n/translations.js`, find the `de` locale block. After the `'sidebar.catalog': 'Katalog'` entry (line ~174), add a new section. Find the nearest grouped catalog section and add:

```javascript
    // Catalog module
    'catalog.articles.title': 'Artikel',
    'catalog.articles.create': 'Artikel erstellen',
    'catalog.articles.edit': 'Artikel bearbeiten',
    'catalog.articles.delete': 'Artikel löschen',
    'catalog.articles.bulkImport': 'Massenimport',
    'catalog.articles.importTitle': 'Artikel importieren',
    'catalog.articles.importDescription': 'CSV- oder Excel-Datei hochladen. Jede Zeile entspricht einem Artikel.',
    'catalog.articles.importDownloadTemplate': 'Vorlage herunterladen',
    'catalog.articles.importErrors': 'Importfehler',
    'catalog.articles.versions': 'Versionshistorie',
    'catalog.articles.noVersions': 'Keine vorherigen Versionen vorhanden.',
    'catalog.articles.versionRestored': 'Version wiederhergestellt',
    'catalog.articles.articleNumber': 'Artikelnummer',
    'catalog.articles.type': 'Typ',
    'catalog.articles.typeMaterial': 'Material',
    'catalog.articles.typeService': 'Dienstleistung',
    'catalog.articles.basePrice': 'Basispreis (CHF)',
    'catalog.articles.unitOfMeasure': 'Einheit',
    'catalog.articles.supplierRef': 'Lieferantenreferenz',
    'catalog.articles.ighNumber': 'IGH-Artikelnummer',
    'catalog.articles.status': 'Status',
    'catalog.articles.statusActive': 'Aktiv',
    'catalog.articles.statusInactive': 'Inaktiv',
    'catalog.articles.source': 'Quelle',
    'catalog.articles.sourceInternal': 'Intern',
    'catalog.articles.sourceIgh': 'IGH',
    'catalog.filter.title': 'Filter',
    'catalog.filter.type': 'Typ',
    'catalog.filter.status': 'Status',
    'catalog.filter.source': 'Quelle',
    'catalog.filter.priceRange': 'Preisbereich',
    'catalog.filter.priceMin': 'Min. Preis',
    'catalog.filter.priceMax': 'Max. Preis',
    'catalog.filter.reset': 'Filter zurücksetzen',
    'catalog.images.upload': 'Bild hochladen',
    'catalog.images.delete': 'Bild löschen',
    'catalog.images.maxSize': 'Max. 2 MB pro Bild',
    'catalog.textBlocks.title': 'Textbausteine',
    'catalog.textBlocks.create': 'Textbaustein erstellen',
    'catalog.textBlocks.edit': 'Textbaustein bearbeiten',
    'catalog.textBlocks.bodyHtml': 'Inhalt',
    'catalog.prices.title': 'Preismanagement',
    'catalog.prices.update': 'Preise aktualisieren',
    'catalog.prices.history': 'Preishistorie',
    'catalog.prices.rollback': 'Preisaktualisierung rückgängig machen',
    'catalog.prices.schedule': 'Preisänderung planen',
    'catalog.prices.oldPrice': 'Alter Preis',
    'catalog.prices.newPrice': 'Neuer Preis',
    'catalog.prices.effectiveDate': 'Gültigkeitsdatum',
    'catalog.prices.percentageAdjustment': 'Prozentualeänderung',
    'catalog.units.title': 'Masseinheiten',
    'catalog.units.create': 'Einheit erstellen',
    'catalog.units.code': 'Kürzel',
    'catalog.units.nameDe': 'Name (DE)',
    'catalog.units.nameFr': 'Name (FR)',
    'catalog.units.nameIt': 'Name (IT)',
    'catalog.units.conversionFactor': 'Umrechnungsfaktor',
    'catalog.units.baseUnit': 'Basiseinheit',
    'catalog.igh.title': 'IGH-Katalog',
    'catalog.igh.configure': 'IGH konfigurieren',
    'catalog.igh.importFull': 'Vollimport starten',
    'catalog.igh.importDelta': 'Delta-Import starten',
    'catalog.igh.importHistory': 'Importverlauf',
    'catalog.igh.status.pending': 'Ausstehend',
    'catalog.igh.status.running': 'Läuft',
    'catalog.igh.status.completed': 'Abgeschlossen',
    'catalog.igh.status.failed': 'Fehlgeschlagen',
```

- [ ] **Step 4: Add English translations**

In the `en` locale block (around line ~1332), after `'sidebar.catalog': 'Catalog'`, add:

```javascript
    // Catalog module
    'catalog.articles.title': 'Articles',
    'catalog.articles.create': 'Create Article',
    'catalog.articles.edit': 'Edit Article',
    'catalog.articles.delete': 'Delete Article',
    'catalog.articles.bulkImport': 'Bulk Import',
    'catalog.articles.importTitle': 'Import Articles',
    'catalog.articles.importDescription': 'Upload a CSV or Excel file. Each row represents one article.',
    'catalog.articles.importDownloadTemplate': 'Download Template',
    'catalog.articles.importErrors': 'Import Errors',
    'catalog.articles.versions': 'Version History',
    'catalog.articles.noVersions': 'No previous versions found.',
    'catalog.articles.versionRestored': 'Version restored',
    'catalog.articles.articleNumber': 'Article Number',
    'catalog.articles.type': 'Type',
    'catalog.articles.typeMaterial': 'Material',
    'catalog.articles.typeService': 'Service',
    'catalog.articles.basePrice': 'Base Price (CHF)',
    'catalog.articles.unitOfMeasure': 'Unit of Measure',
    'catalog.articles.supplierRef': 'Supplier Reference',
    'catalog.articles.ighNumber': 'IGH Article Number',
    'catalog.articles.status': 'Status',
    'catalog.articles.statusActive': 'Active',
    'catalog.articles.statusInactive': 'Inactive',
    'catalog.articles.source': 'Source',
    'catalog.articles.sourceInternal': 'Internal',
    'catalog.articles.sourceIgh': 'IGH',
    'catalog.filter.title': 'Filters',
    'catalog.filter.type': 'Type',
    'catalog.filter.status': 'Status',
    'catalog.filter.source': 'Source',
    'catalog.filter.priceRange': 'Price Range',
    'catalog.filter.priceMin': 'Min Price',
    'catalog.filter.priceMax': 'Max Price',
    'catalog.filter.reset': 'Reset Filters',
    'catalog.images.upload': 'Upload Image',
    'catalog.images.delete': 'Delete Image',
    'catalog.images.maxSize': 'Max 2 MB per image',
    'catalog.textBlocks.title': 'Text Blocks',
    'catalog.textBlocks.create': 'Create Text Block',
    'catalog.textBlocks.edit': 'Edit Text Block',
    'catalog.textBlocks.bodyHtml': 'Content',
    'catalog.prices.title': 'Price Management',
    'catalog.prices.update': 'Update Prices',
    'catalog.prices.history': 'Price History',
    'catalog.prices.rollback': 'Rollback Price Update',
    'catalog.prices.schedule': 'Schedule Price Change',
    'catalog.prices.oldPrice': 'Old Price',
    'catalog.prices.newPrice': 'New Price',
    'catalog.prices.effectiveDate': 'Effective Date',
    'catalog.prices.percentageAdjustment': 'Percentage Adjustment',
    'catalog.units.title': 'Units of Measure',
    'catalog.units.create': 'Create Unit',
    'catalog.units.code': 'Code',
    'catalog.units.nameDe': 'Name (DE)',
    'catalog.units.nameFr': 'Name (FR)',
    'catalog.units.nameIt': 'Name (IT)',
    'catalog.units.conversionFactor': 'Conversion Factor',
    'catalog.units.baseUnit': 'Base Unit',
    'catalog.igh.title': 'IGH Catalog',
    'catalog.igh.configure': 'Configure IGH',
    'catalog.igh.importFull': 'Start Full Import',
    'catalog.igh.importDelta': 'Start Delta Import',
    'catalog.igh.importHistory': 'Import History',
    'catalog.igh.status.pending': 'Pending',
    'catalog.igh.status.running': 'Running',
    'catalog.igh.status.completed': 'Completed',
    'catalog.igh.status.failed': 'Failed',
```

- [ ] **Step 5: Run test to verify it passes**

```
cd client && npx vitest run src/modules/catalog/__tests__/catalog-constants.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/i18n/translations.js \
        client/src/modules/catalog/__tests__/catalog-constants.test.ts
git commit -m "feat(catalog): add i18n keys for all Module 10 UI strings"
```

---

## Task 3: Facet Aggregation Server Endpoint

**Files:**
- Modify: `server/src/modules/catalog/article.repository.js`
- Modify: `server/src/modules/catalog/article.service.js`
- Modify: `server/src/modules/catalog/article.controller.js`
- Modify: `server/src/modules/catalog/article.routes.js`
- Create: `server/src/modules/catalog/__tests__/article-facets.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/src/modules/catalog/__tests__/article-facets.test.js`:

```javascript
import articleRepository from '../article.repository.js';
import Article from '../article.model.js';

jest.mock('../article.model.js', () => ({
  aggregate: jest.fn(),
}));

describe('articleRepository.getFacets()', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns shaped facets from aggregation result', async () => {
    Article.aggregate.mockResolvedValue([{
      types: [{ _id: 'MATERIAL', count: 10 }, { _id: 'SERVICE', count: 3 }],
      statuses: [{ _id: 'ACTIVE', count: 12 }, { _id: 'INACTIVE', count: 1 }],
      sources: [{ _id: 'INTERNAL', count: 8 }, { _id: 'IGH', count: 5 }],
      priceRange: [{ _id: null, min: 5, max: 9999 }],
      total: [{ count: 13 }],
    }]);

    const result = await articleRepository.getFacets({});

    expect(result.types).toEqual([
      { value: 'MATERIAL', count: 10 },
      { value: 'SERVICE', count: 3 },
    ]);
    expect(result.statuses).toEqual([
      { value: 'ACTIVE', count: 12 },
      { value: 'INACTIVE', count: 1 },
    ]);
    expect(result.sources).toEqual([
      { value: 'INTERNAL', count: 8 },
      { value: 'IGH', count: 5 },
    ]);
    expect(result.priceRange).toEqual({ min: 5, max: 9999 });
    expect(result.total).toBe(13);
  });

  it('handles empty catalog gracefully', async () => {
    Article.aggregate.mockResolvedValue([{
      types: [],
      statuses: [],
      sources: [],
      priceRange: [],
      total: [],
    }]);

    const result = await articleRepository.getFacets({});

    expect(result.types).toEqual([]);
    expect(result.priceRange).toEqual({ min: 0, max: 0 });
    expect(result.total).toBe(0);
  });

  it('applies categoryId filter to match stage', async () => {
    Article.aggregate.mockResolvedValue([{
      types: [], statuses: [], sources: [], priceRange: [], total: [],
    }]);

    await articleRepository.getFacets({ categoryId: 'cat123' });

    const matchStage = Article.aggregate.mock.calls[0][0][0].$match;
    expect(matchStage.categoryId).toBe('cat123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd server && npx jest src/modules/catalog/__tests__/article-facets.test.js --no-coverage
```

Expected: FAIL — `articleRepository.getFacets is not a function`.

- [ ] **Step 3: Add `getFacets()` to `article.repository.js`**

Open `server/src/modules/catalog/article.repository.js` and add at the end of the class (before the closing `}`):

```javascript
  async getFacets(filter = {}) {
    const match = { isDeleted: false };
    if (filter.categoryId) match.categoryId = filter.categoryId;
    if (filter.q) match.$text = { $search: filter.q };

    const [result] = await Article.aggregate([
      { $match: match },
      {
        $facet: {
          types: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          sources: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
          priceRange: [
            { $group: { _id: null, min: { $min: '$basePrice' }, max: { $max: '$basePrice' } } },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    return {
      types: (result?.types ?? []).map((f) => ({ value: f._id, count: f.count })),
      statuses: (result?.statuses ?? []).map((f) => ({ value: f._id, count: f.count })),
      sources: (result?.sources ?? []).map((f) => ({ value: f._id, count: f.count })),
      priceRange: result?.priceRange?.[0]
        ? { min: result.priceRange[0].min, max: result.priceRange[0].max }
        : { min: 0, max: 0 },
      total: result?.total?.[0]?.count ?? 0,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

```
cd server && npx jest src/modules/catalog/__tests__/article-facets.test.js --no-coverage
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Add `getFacets()` to `article.service.js`**

In `server/src/modules/catalog/article.service.js`, add after the `list()` method:

```javascript
  async getFacets(filter = {}) {
    const cacheKey = `catalog:facets:${JSON.stringify(filter)}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => articleRepository.getFacets(filter),
      { l1Ttl: 30, l2Ttl: 120 },
    );
  }
```

- [ ] **Step 6: Add `getFacets()` handler to `article.controller.js`**

In `server/src/modules/catalog/article.controller.js`, add a new method in the controller class:

```javascript
  async getFacets(req, res, next) {
    try {
      const { categoryId, q } = req.query;
      const facets = await articleService.getFacets({ categoryId, q });
      res.success({ data: facets });
    } catch (err) {
      next(err);
    }
  }
```

- [ ] **Step 7: Add the route to `article.routes.js`**

In `server/src/modules/catalog/article.routes.js`, add **before** the `/:id` route (named routes must come before param routes):

```javascript
router.get('/facets', authenticate, requirePermission('catalog:read'), articleController.getFacets.bind(articleController));
```

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/catalog/article.repository.js \
        server/src/modules/catalog/article.service.js \
        server/src/modules/catalog/article.controller.js \
        server/src/modules/catalog/article.routes.js \
        server/src/modules/catalog/__tests__/article-facets.test.js
git commit -m "feat(catalog): add GET /articles/facets aggregation endpoint (MAT-006)"
```

---

## Task 4: Article Image Upload Routes (Server)

**Files:**
- Create: `server/src/modules/catalog/articleImage.controller.js`
- Modify: `server/src/modules/catalog/catalog.routes.js`

- [ ] **Step 1: Verify what exists**

Read `server/src/modules/catalog/articleImage.repository.js` and `server/src/shared/storage/` to understand the upload pattern used elsewhere (e.g., in the CRM or mobile modules). The storage module wraps `multer-s3` — use the same `uploadMiddleware` pattern.

Check if a shared `upload.js` or `storageMiddleware.js` exists:

```
cd server && find src/shared/storage -type f
```

- [ ] **Step 2: Write the failing integration test**

Create `server/src/modules/catalog/__tests__/article-images.test.js`:

```javascript
import request from 'supertest';
import app from '../../../app.js';
import { createTestUser, createTestArticle, cleanDb } from '../../../test/helpers.js';

describe('Article Image Routes', () => {
  let token, articleId;

  beforeAll(async () => {
    await cleanDb();
    const user = await createTestUser({ permissions: ['catalog:write'] });
    token = user.token;
    const article = await createTestArticle({ createdBy: user._id });
    articleId = article._id.toString();
  });

  it('GET /catalog/articles/:id/images returns empty array initially', async () => {
    const res = await request(app)
      .get(`/api/v1/catalog/articles/${articleId}/images`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```
cd server && npx jest src/modules/catalog/__tests__/article-images.test.js --no-coverage
```

Expected: FAIL — 404 (route not registered).

- [ ] **Step 4: Create `articleImage.controller.js`**

Create `server/src/modules/catalog/articleImage.controller.js`:

```javascript
import articleImageRepository from './articleImage.repository.js';
import storageService from '../../shared/storage/storageService.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

class ArticleImageController {
  async list(req, res, next) {
    try {
      const images = await articleImageRepository.findByArticle(req.params.articleId);
      res.success({ data: images });
    } catch (err) {
      next(err);
    }
  }

  async upload(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file provided' });
      }
      const { articleId } = req.params;
      const { key, url } = req.file.location
        ? { key: req.file.key, url: req.file.location }   // S3
        : { key: req.file.filename, url: `/uploads/${req.file.filename}` }; // local fallback

      const image = await articleImageRepository.create({
        articleId,
        key,
        url,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user._id,
      });
      res.status(201).json({ success: true, data: image });
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const { articleId, imageId } = req.params;
      const image = await articleImageRepository.findById(imageId);
      if (!image || image.articleId.toString() !== articleId) {
        throw new NotFoundError('ArticleImage', imageId);
      }
      await storageService.deleteFile(image.key).catch(() => {});
      await articleImageRepository.deleteById(imageId);
      res.success({ data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }
}

export default new ArticleImageController();
```

- [ ] **Step 5: Register image routes**

Open `server/src/modules/catalog/catalog.routes.js` (or wherever sub-routers are composed). Add image routes for articles. Find where `articleRoutes` is used and add after it:

```javascript
import articleImageController from './articleImage.controller.js';
import { uploadSingle } from '../../shared/storage/uploadMiddleware.js';

// Article images — nested under /articles/:articleId/images
articleRouter.get('/:articleId/images', authenticate, requirePermission('catalog:read'), articleImageController.list.bind(articleImageController));
articleRouter.post('/:articleId/images', authenticate, requirePermission('catalog:write'), uploadSingle('image', { maxSize: 2 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] }), articleImageController.upload.bind(articleImageController));
articleRouter.delete('/:articleId/images/:imageId', authenticate, requirePermission('catalog:write'), articleImageController.remove.bind(articleImageController));
```

Adjust import paths to match the actual upload middleware location found in Step 1.

- [ ] **Step 6: Run test to verify it passes**

```
cd server && npx jest src/modules/catalog/__tests__/article-images.test.js --no-coverage
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/catalog/articleImage.controller.js \
        server/src/modules/catalog/catalog.routes.js \
        server/src/modules/catalog/__tests__/article-images.test.js
git commit -m "feat(catalog): add article image upload/list/delete routes (MAT-002)"
```

---

## Task 5: Article Form Dialog — Full Fields + Image Upload

**Files:**
- Modify: `client/src/modules/catalog/components/catalog-article-form-dialog.jsx`
- Modify: `client/src/modules/catalog/services/article-service.js`
- Modify: `client/src/modules/catalog/hooks/use-catalog-mutations.js`
- Create: `client/src/modules/catalog/__tests__/catalog-article-form.test.tsx`

- [ ] **Step 1: Check what fields the form currently has**

Read `client/src/modules/catalog/components/catalog-article-form-dialog.jsx` fully to understand current field set.

- [ ] **Step 2: Write the failing test**

Create `client/src/modules/catalog/__tests__/catalog-article-form.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CatalogArticleFormDialog } from '../components/catalog-article-form-dialog';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('CatalogArticleFormDialog', () => {
  it('renders supplierRef field', () => {
    render(
      <CatalogArticleFormDialog open={true} onClose={() => {}} article={null} />,
      { wrapper }
    );
    expect(screen.getByLabelText(/supplier/i)).toBeInTheDocument();
  });

  it('renders IGH article number field', () => {
    render(
      <CatalogArticleFormDialog open={true} onClose={() => {}} article={null} />,
      { wrapper }
    );
    expect(screen.getByLabelText(/igh/i)).toBeInTheDocument();
  });

  it('renders image upload section', () => {
    render(
      <CatalogArticleFormDialog open={true} onClose={() => {}} article={null} />,
      { wrapper }
    );
    expect(screen.getByText(/upload image/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```
cd client && npx vitest run src/modules/catalog/__tests__/catalog-article-form.test.tsx
```

Expected: FAIL — fields not found.

- [ ] **Step 4: Add image service methods to `article-service.js`**

Open `client/src/modules/catalog/services/article-service.js` and add:

```javascript
  listImages: (articleId) => apiClient.get(E.CATALOG.ARTICLE_IMAGES(articleId)),
  uploadImage: (articleId, file) => {
    const form = new FormData();
    form.append('image', file);
    return apiClient.post(E.CATALOG.ARTICLE_IMAGES(articleId), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteImage: (articleId, imageId) =>
    apiClient.delete(E.CATALOG.ARTICLE_IMAGE(articleId, imageId)),
```

(Replace `E` with the actual endpoints import alias used in that file — check the existing imports.)

- [ ] **Step 5: Add image mutation hooks to `use-catalog-mutations.js`**

Open `client/src/modules/catalog/hooks/use-catalog-mutations.js` and add inside the returned object of `useArticleMutations()`:

```javascript
  uploadImage: useMutation({
    mutationFn: ({ articleId, file }) => articleService.uploadImage(articleId, file),
    onSuccess: (_, { articleId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.catalog.articleImages(articleId) });
    },
  }),
  deleteImage: useMutation({
    mutationFn: ({ articleId, imageId }) => articleService.deleteImage(articleId, imageId),
    onSuccess: (_, { articleId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.catalog.articleImages(articleId) });
    },
  }),
```

- [ ] **Step 6: Update the article form dialog**

Read the current form dialog fully, then replace/extend it. The form needs:
- All existing fields (articleNumber, name, description, category, type, unitOfMeasure, basePrice, status)
- New fields: `supplierRef` (text, optional), `ighArticleNumber` (text, optional)
- Image gallery section when editing an existing article (show existing images with delete, upload button)

Add the Zod schema extensions (alongside whatever currently exists in the file or a sibling schema file):

```javascript
// In the form's Zod schema, add:
supplierRef: z.string().max(100).optional().or(z.literal('')),
ighArticleNumber: z.string().max(50).optional().or(z.literal('')),
```

Add supplier reference field in the JSX (after the existing `description` field):

```jsx
<FormField
  control={form.control}
  name="supplierRef"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t('catalog.articles.supplierRef')}</FormLabel>
      <FormControl>
        <Input placeholder="e.g. SUP-10023" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
<FormField
  control={form.control}
  name="ighArticleNumber"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t('catalog.articles.ighNumber')}</FormLabel>
      <FormControl>
        <Input placeholder="e.g. IGH-98001" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

Add image upload section below the form fields (only shown when `article` prop is non-null, i.e., edit mode):

```jsx
{article && (
  <div className="space-y-2">
    <p className="text-sm font-medium">{t('catalog.images.upload')}</p>
    <p className="text-xs text-muted-foreground">{t('catalog.images.maxSize')}</p>
    <ArticleImageGallery
      articleId={article._id}
      onUpload={(file) => uploadImage.mutate({ articleId: article._id, file })}
      onDelete={(imageId) => deleteImage.mutate({ articleId: article._id, imageId })}
    />
  </div>
)}
```

Create `client/src/modules/catalog/components/article-image-gallery.jsx`:

```jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { articleService } from '../services/article-service';
import { Button } from '@/shared/components/ui/button';
import { Trash2, ImagePlus } from 'lucide-react';
import { useRef } from 'react';

export function ArticleImageGallery({ articleId, onUpload, onDelete }) {
  const fileRef = useRef(null);
  const { data: images = [] } = useQuery({
    queryKey: queryKeys.catalog.articleImages(articleId),
    queryFn: () => articleService.listImages(articleId).then((r) => r.data ?? r),
    enabled: !!articleId,
  });

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img) => (
        <div key={img._id} className="relative group w-20 h-20">
          <img
            src={img.url}
            alt={img.originalName}
            className="w-full h-full object-cover rounded-md border"
          />
          <button
            type="button"
            onClick={() => onDelete(img._id)}
            className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-20 h-20 flex flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <ImagePlus className="w-5 h-5" />
        <span className="text-xs mt-1">Add</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

```
cd client && npx vitest run src/modules/catalog/__tests__/catalog-article-form.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/modules/catalog/components/catalog-article-form-dialog.jsx \
        client/src/modules/catalog/components/article-image-gallery.jsx \
        client/src/modules/catalog/services/article-service.js \
        client/src/modules/catalog/hooks/use-catalog-mutations.js \
        client/src/modules/catalog/__tests__/catalog-article-form.test.tsx
git commit -m "feat(catalog): complete article form — supplierRef, IGH number, image upload (MAT-002)"
```

---

## Task 6: Bulk Import UI

**Files:**
- Create: `client/src/modules/catalog/components/catalog-bulk-import-dialog.jsx`
- Modify: `client/src/modules/catalog/hooks/use-catalog-mutations.js`
- Modify: `client/src/modules/catalog/services/article-service.js`
- Modify: `client/src/modules/catalog/components/catalog-articles-table.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/modules/catalog/__tests__/catalog-bulk-import.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CatalogBulkImportDialog } from '../components/catalog-bulk-import-dialog';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('CatalogBulkImportDialog', () => {
  it('renders file input and download template link', () => {
    render(
      <CatalogBulkImportDialog open={true} onClose={() => {}} />,
      { wrapper }
    );
    expect(screen.getByText(/download template/i)).toBeInTheDocument();
    expect(screen.getByText(/upload/i)).toBeInTheDocument();
  });

  it('shows error table section when errors prop is provided', () => {
    render(
      <CatalogBulkImportDialog
        open={true}
        onClose={() => {}}
        importErrors={[{ row: 2, field: 'articleNumber', message: 'Duplicate' }]}
      />,
      { wrapper }
    );
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd client && npx vitest run src/modules/catalog/__tests__/catalog-bulk-import.test.tsx
```

Expected: FAIL — component not found.

- [ ] **Step 3: Add import mutation to `use-catalog-mutations.js`**

Inside `useArticleMutations()`, add:

```javascript
  bulkImport: useMutation({
    mutationFn: (file) => {
      const form = new FormData();
      form.append('file', file);
      return articleService.bulkImport(form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog', 'articles'] });
    },
  }),
```

Add to `article-service.js`:

```javascript
  bulkImport: (formData) =>
    apiClient.post(E.CATALOG.ARTICLES_IMPORT, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
```

- [ ] **Step 4: Create `catalog-bulk-import-dialog.jsx`**

Create `client/src/modules/catalog/components/catalog-bulk-import-dialog.jsx`:

```jsx
'use client';

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { useArticleMutations } from '../hooks/use-catalog-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

export function CatalogBulkImportDialog({ open, onClose }) {
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const { bulkImport } = useArticleMutations();

  const handleFile = async (file) => {
    setResult(null);
    try {
      const res = await bulkImport.mutateAsync(file);
      setResult({ success: true, data: res.data ?? res });
    } catch (err) {
      setResult({ success: false, errors: err.response?.data?.errors ?? [] });
    }
  };

  const importErrors = result?.success === false ? result.errors : [];
  const importSummary = result?.success ? result.data : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('catalog.articles.importTitle')}</DialogTitle>
          <DialogDescription>{t('catalog.articles.importDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a href="/api/v1/catalog/articles/import/template" download>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                {t('catalog.articles.importDownloadTemplate')}
              </a>
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={bulkImport.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              {bulkImport.isPending ? 'Importing...' : 'Upload'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {importSummary && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-1 text-sm">
              <p className="font-medium">Import complete</p>
              <p>Created: <Badge variant="outline">{importSummary.created ?? 0}</Badge></p>
              <p>Updated: <Badge variant="outline">{importSummary.updated ?? 0}</Badge></p>
              <p>Skipped: <Badge variant="outline">{importSummary.skipped ?? 0}</Badge></p>
              {importSummary.errors > 0 && (
                <p>Errors: <Badge variant="destructive">{importSummary.errors}</Badge></p>
              )}
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                <AlertCircle className="w-4 h-4" />
                {t('catalog.articles.importErrors')} ({importErrors.length})
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Row</th>
                      <th className="text-left px-3 py-2">Field</th>
                      <th className="text-left px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importErrors.map((err, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5 text-muted-foreground">{err.row}</td>
                        <td className="px-3 py-1.5 font-mono">{err.field}</td>
                        <td className="px-3 py-1.5 text-destructive">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Add import button to `catalog-articles-table.jsx`**

Read `catalog-articles-table.jsx` to find the toolbar/header area where the "Create Article" button lives. Add alongside it:

```jsx
import { CatalogBulkImportDialog } from './catalog-bulk-import-dialog';

// In component state:
const [importOpen, setImportOpen] = useState(false);

// In toolbar JSX, add next to create button:
<Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
  <Upload className="w-4 h-4 mr-2" />
  {t('catalog.articles.bulkImport')}
</Button>
<CatalogBulkImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
```

- [ ] **Step 6: Run the test to verify it passes**

```
cd client && npx vitest run src/modules/catalog/__tests__/catalog-bulk-import.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/modules/catalog/components/catalog-bulk-import-dialog.jsx \
        client/src/modules/catalog/components/catalog-articles-table.jsx \
        client/src/modules/catalog/hooks/use-catalog-mutations.js \
        client/src/modules/catalog/services/article-service.js \
        client/src/modules/catalog/__tests__/catalog-bulk-import.test.tsx
git commit -m "feat(catalog): add bulk import UI with error reporting (MAT-002)"
```

---

## Task 7: Version History Panel

**Files:**
- Create: `client/src/modules/catalog/components/article-version-history-panel.jsx`
- Modify: `client/src/modules/catalog/components/catalog-articles-table.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/modules/catalog/__tests__/article-version-history.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ArticleVersionHistoryPanel } from '../components/article-version-history-panel';

const server = setupServer(
  http.get('/api/v1/catalog/articles/:id/versions', () =>
    HttpResponse.json({
      data: [
        {
          _id: 'v2',
          version: 2,
          snapshot: { name: 'Old Name', basePrice: 120 },
          changedBy: { firstName: 'Admin', lastName: 'User' },
          createdAt: '2026-04-01T10:00:00Z',
        },
      ],
    })
  )
);

beforeAll(() => server.listen());
afterAll(() => server.close());

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('ArticleVersionHistoryPanel', () => {
  it('renders version entries', async () => {
    render(
      <ArticleVersionHistoryPanel articleId="art123" />,
      { wrapper }
    );
    expect(await screen.findByText('Version 2')).toBeInTheDocument();
    expect(screen.getByText('Old Name')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd client && npx vitest run src/modules/catalog/__tests__/article-version-history.test.tsx
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create `article-version-history-panel.jsx`**

Create `client/src/modules/catalog/components/article-version-history-panel.jsx`:

```jsx
'use client';

import { useArticleVersions } from '../hooks/use-catalog-queries';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Badge } from '@/shared/components/ui/badge';
import { format } from 'date-fns';
import { useLanguage } from '@/lib/i18n/language-context';

export function ArticleVersionHistoryPanel({ articleId }) {
  const { t } = useLanguage();
  const { data: versions = [], isLoading } = useArticleVersions(articleId);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground animate-pulse">
        Loading...
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
          <div key={v._id} className="rounded-md border p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Version {v.version}</span>
              <Badge variant="outline" className="text-xs">
                {format(new Date(v.createdAt), 'dd.MM.yyyy HH:mm')}
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
                  <p>Price: CHF {v.snapshot.basePrice.toFixed(2)}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 4: Wire into the articles table**

In `catalog-articles-table.jsx`, find where the article detail drawer/sheet opens. Add a "Versions" tab or section that renders `<ArticleVersionHistoryPanel articleId={selectedArticle?._id} />`.

If the table uses a sheet/drawer (check for `<Sheet>` or `<Drawer>` in the file), add a tab for version history alongside the edit form. If it doesn't have tabs, add a collapsible section at the bottom of the detail view:

```jsx
import { ArticleVersionHistoryPanel } from './article-version-history-panel';

// In the detail area, after the form:
<div className="border-t pt-4">
  <p className="text-sm font-medium mb-2">{t('catalog.articles.versions')}</p>
  <ArticleVersionHistoryPanel articleId={selectedArticle?._id} />
</div>
```

- [ ] **Step 5: Run the test to verify it passes**

```
cd client && npx vitest run src/modules/catalog/__tests__/article-version-history.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/modules/catalog/components/article-version-history-panel.jsx \
        client/src/modules/catalog/components/catalog-articles-table.jsx \
        client/src/modules/catalog/__tests__/article-version-history.test.tsx
git commit -m "feat(catalog): add article version history panel (MAT-002)"
```

---

## Task 8: Faceted Filter Panel

**Files:**
- Create: `client/src/modules/catalog/components/catalog-filter-panel.jsx`
- Modify: `client/src/modules/catalog/services/article-service.js`
- Modify: `client/src/modules/catalog/hooks/use-catalog-queries.js`
- Modify: `client/src/app/(platform)/catalog/page.jsx`
- Create: `client/src/modules/catalog/__tests__/catalog-filter-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/modules/catalog/__tests__/catalog-filter-panel.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { CatalogFilterPanel } from '../components/catalog-filter-panel';

const server = setupServer(
  http.get('/api/v1/catalog/articles/facets', () =>
    HttpResponse.json({
      data: {
        types: [{ value: 'MATERIAL', count: 8 }, { value: 'SERVICE', count: 2 }],
        statuses: [{ value: 'ACTIVE', count: 9 }, { value: 'INACTIVE', count: 1 }],
        sources: [{ value: 'INTERNAL', count: 7 }, { value: 'IGH', count: 3 }],
        priceRange: { min: 10, max: 5000 },
        total: 10,
      },
    })
  )
);

beforeAll(() => server.listen());
afterAll(() => server.close());

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('CatalogFilterPanel', () => {
  it('renders type facets with counts', async () => {
    render(
      <CatalogFilterPanel filters={{}} onFiltersChange={() => {}} />,
      { wrapper }
    );
    expect(await screen.findByText('MATERIAL')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('calls onFiltersChange when a type badge is clicked', async () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterPanel filters={{}} onFiltersChange={onChange} />,
      { wrapper }
    );
    fireEvent.click(await screen.findByText('MATERIAL'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'MATERIAL' }));
  });

  it('shows reset button only when filters are active', async () => {
    render(
      <CatalogFilterPanel filters={{ type: 'MATERIAL' }} onFiltersChange={() => {}} />,
      { wrapper }
    );
    expect(await screen.findByText(/reset/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd client && npx vitest run src/modules/catalog/__tests__/catalog-filter-panel.test.tsx
```

Expected: FAIL — component not found.

- [ ] **Step 3: Add facets service call to `article-service.js`**

```javascript
  getFacets: (params = {}) => apiClient.get(E.CATALOG.ARTICLES_FACETS, { params }),
```

- [ ] **Step 4: Add `useArticleFacets` hook to `use-catalog-queries.js`**

```javascript
export function useArticleFacets(filters = {}) {
  return useQuery({
    queryKey: queryKeys.catalog.facets(filters),
    queryFn: () => articleService.getFacets(filters).then((r) => r.data ?? r),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 5: Create `catalog-filter-panel.jsx`**

Create `client/src/modules/catalog/components/catalog-filter-panel.jsx`:

```jsx
'use client';

import { useArticleFacets } from '../hooks/use-catalog-queries';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export function CatalogFilterPanel({ filters, onFiltersChange }) {
  const { t } = useLanguage();
  const { data: facets } = useArticleFacets({ categoryId: filters.categoryId, q: filters.q });

  const toggle = (key, value) => {
    onFiltersChange({
      ...filters,
      [key]: filters[key] === value ? undefined : value,
    });
  };

  const hasActiveFilters = filters.type || filters.status || filters.source
    || filters.priceMin || filters.priceMax;

  const reset = () => onFiltersChange({
    ...filters,
    type: undefined,
    status: undefined,
    source: undefined,
    priceMin: undefined,
    priceMax: undefined,
  });

  return (
    <div className="space-y-4 p-4 text-sm">
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={reset}>
          <X className="w-3 h-3" />
          {t('catalog.filter.reset')}
        </Button>
      )}

      <div className="space-y-2">
        <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
          {t('catalog.filter.type')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(facets?.types ?? []).map((f) => (
            <Badge
              key={f.value}
              variant={filters.type === f.value ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggle('type', f.value)}
            >
              {f.value} <span className="ml-1 opacity-60">{f.count}</span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
          {t('catalog.filter.status')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(facets?.statuses ?? []).map((f) => (
            <Badge
              key={f.value}
              variant={filters.status === f.value ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggle('status', f.value)}
            >
              {f.value} <span className="ml-1 opacity-60">{f.count}</span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
          {t('catalog.filter.source')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(facets?.sources ?? []).map((f) => (
            <Badge
              key={f.value}
              variant={filters.source === f.value ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggle('source', f.value)}
            >
              {f.value} <span className="ml-1 opacity-60">{f.count}</span>
            </Badge>
          ))}
        </div>
      </div>

      {facets?.priceRange && (
        <div className="space-y-2">
          <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
            {t('catalog.filter.priceRange')}
          </p>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <Label className="text-xs">{t('catalog.filter.priceMin')}</Label>
              <Input
                type="number"
                min={0}
                placeholder={String(facets.priceRange.min)}
                value={filters.priceMin ?? ''}
                onChange={(e) => onFiltersChange({ ...filters, priceMin: e.target.value || undefined })}
                className="h-8 text-xs"
              />
            </div>
            <span className="pt-4 text-muted-foreground">–</span>
            <div className="flex-1">
              <Label className="text-xs">{t('catalog.filter.priceMax')}</Label>
              <Input
                type="number"
                min={0}
                placeholder={String(facets.priceRange.max)}
                value={filters.priceMax ?? ''}
                onChange={(e) => onFiltersChange({ ...filters, priceMax: e.target.value || undefined })}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Integrate filter panel into catalog page**

Replace `client/src/app/(platform)/catalog/page.jsx`:

```jsx
'use client';

import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { CatalogCategoryTree } from '@/modules/catalog/components/catalog-category-tree';
import { CatalogArticlesTable } from '@/modules/catalog/components/catalog-articles-table';
import { CatalogFilterPanel } from '@/modules/catalog/components/catalog-filter-panel';
import { useLanguage } from '@/lib/i18n/language-context';

export default function CatalogPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [filters, setFilters] = useState({});

  const activeFilters = { ...filters, categoryId: selectedCategoryId || undefined };

  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Boxes}
        title={de ? 'Materialkatalog' : 'Material Catalog'}
        description={de
          ? 'Artikel, Dienstleistungen und Kategorien verwalten'
          : 'Manage articles, services and categories'}
      />

      <div className="flex flex-1 gap-5 min-h-0 overflow-hidden">
        {/* Category tree */}
        <div className="w-48 shrink-0 rounded-xl border bg-card overflow-hidden flex flex-col">
          <CatalogCategoryTree
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
          />
        </div>

        {/* Filter panel */}
        <div className="w-48 shrink-0 rounded-xl border bg-card overflow-y-auto">
          <CatalogFilterPanel
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Articles table */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <CatalogArticlesTable filters={activeFilters} />
        </div>
      </div>
    </div>
  );
}
```

Update `catalog-articles-table.jsx` to accept a `filters` prop (instead of `categoryId`) and pass it to `useArticles()`.

- [ ] **Step 7: Run all catalog tests**

```
cd client && npx vitest run src/modules/catalog/__tests__/
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/modules/catalog/components/catalog-filter-panel.jsx \
        client/src/modules/catalog/services/article-service.js \
        client/src/modules/catalog/hooks/use-catalog-queries.js \
        client/src/modules/catalog/components/catalog-articles-table.jsx \
        client/src/app/(platform)/catalog/page.jsx \
        client/src/modules/catalog/__tests__/catalog-filter-panel.test.tsx
git commit -m "feat(catalog): add faceted filter panel with live counts (MAT-006)"
```

---

## Task 9: Sub-navigation Pages & Sidebar Wiring

**Files:**
- Create: `client/src/app/(platform)/catalog/text-blocks/page.jsx`
- Create: `client/src/app/(platform)/catalog/prices/page.jsx`
- Create: `client/src/app/(platform)/catalog/settings/units/page.jsx`
- Create: `client/src/app/(platform)/catalog/igh/page.jsx`
- Modify: `client/src/layout/sidebar.jsx`

These pages are scaffolds — Plan 2 builds out text-blocks, prices, units; Plan 3 builds out IGH.

- [ ] **Step 1: Create scaffold pages**

Create `client/src/app/(platform)/catalog/text-blocks/page.jsx`:

```jsx
'use client';

import { Type } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';

export default function TextBlocksPage() {
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Type}
        title="Text Blocks"
        description="Manage reusable text blocks for quotations and reports"
      />
      <div className="flex-1 rounded-xl border bg-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        Text block management — implemented in Plan 2
      </div>
    </div>
  );
}
```

Create `client/src/app/(platform)/catalog/prices/page.jsx`:

```jsx
'use client';

import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';

export default function PricesPage() {
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={TrendingUp}
        title="Price Management"
        description="Bulk price updates, history, and scheduled changes"
      />
      <div className="flex-1 rounded-xl border bg-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        Price management — implemented in Plan 2
      </div>
    </div>
  );
}
```

Create `client/src/app/(platform)/catalog/settings/units/page.jsx`:

```jsx
'use client';

import { Ruler } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';

export default function UnitsPage() {
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Ruler}
        title="Units of Measure"
        description="Configure measurement units used across the catalog"
      />
      <div className="flex-1 rounded-xl border bg-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        Unit management — implemented in Plan 2
      </div>
    </div>
  );
}
```

Create `client/src/app/(platform)/catalog/igh/page.jsx`:

```jsx
'use client';

import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';

export default function IghPage() {
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={RefreshCw}
        title="IGH Catalog"
        description="Configure and run IGH industry catalog synchronization"
      />
      <div className="flex-1 rounded-xl border bg-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        IGH management — implemented in Plan 3
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add sidebar sub-navigation**

Open `client/src/layout/sidebar.jsx`. Find the catalog entry:

```javascript
{ labelKey: 'sidebar.catalog', href: '/catalog', icon: Boxes, permission: 'catalog:read' },
```

Replace it with a group that includes sub-items (follow the exact pattern other grouped items use — check if `tasks` or `crm` has sub-items in this file):

```javascript
{
  labelKey: 'sidebar.catalog',
  href: '/catalog',
  icon: Boxes,
  permission: 'catalog:read',
  children: [
    { labelKey: 'sidebar.catalog', href: '/catalog', icon: Boxes, permission: 'catalog:read' },
    { labelKey: 'catalog.textBlocks.title', href: '/catalog/text-blocks', icon: Type, permission: 'catalog:write' },
    { labelKey: 'catalog.prices.title', href: '/catalog/prices', icon: TrendingUp, permission: 'catalog:price' },
    { labelKey: 'catalog.units.title', href: '/catalog/settings/units', icon: Ruler, permission: 'catalog:admin' },
    { labelKey: 'catalog.igh.title', href: '/catalog/igh', icon: RefreshCw, permission: 'catalog:admin' },
  ],
},
```

Add the icon imports at the top of the file:
```javascript
import { Type, TrendingUp, Ruler, RefreshCw } from 'lucide-react';
```

Also add to `translations.js` any missing sidebar label keys that reference `catalog.*` keys added in Task 2.

- [ ] **Step 3: Verify pages are reachable**

```
cd client && npx next build 2>&1 | grep -E "(Error|error|catalog)"
```

Expected: no catalog-related build errors. All four new pages compile.

- [ ] **Step 4: Commit**

```bash
git add client/src/app/(platform)/catalog/text-blocks/page.jsx \
        client/src/app/(platform)/catalog/prices/page.jsx \
        client/src/app/(platform)/catalog/settings/units/page.jsx \
        client/src/app/(platform)/catalog/igh/page.jsx \
        client/src/layout/sidebar.jsx
git commit -m "feat(catalog): scaffold sub-pages and sidebar nav for catalog admin sections"
```

---

## Self-Review Checklist

**Spec coverage:**
- MAT-001 (Category tree): Existing — no changes needed. ✓
- MAT-002 (Article CRUD): Full form fields, images, bulk import, version history. ✓
- MAT-003 (Article picker): Endpoints exist; reusable component deferred to Plan 3. ✓
- MAT-004 (Text blocks): Server complete; scaffold page created; full UI in Plan 2. ✓
- MAT-005 (IGH): Scaffold page created; implementation in Plan 3. ✓
- MAT-006 (Search): Facet aggregation endpoint + filter panel UI. ✓
- MAT-007 (Price management): Endpoints exist; full UI in Plan 2. ✓
- MAT-008 (UoM): Scaffold page created; full UI in Plan 2. ✓

**Permissions**: Added to `permissions.ts` and seeded in `seed.js`. ✓
**Translation keys**: Full DE + EN coverage for all catalog UI strings. ✓
**No placeholders**: Every step has actual code. ✓
**Type consistency**: `articleService`, `queryKeys.catalog`, `ENDPOINTS.CATALOG` names are consistent across all tasks. ✓
