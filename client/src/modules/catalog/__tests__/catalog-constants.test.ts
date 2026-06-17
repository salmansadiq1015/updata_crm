import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { translations } from '@/lib/i18n/translations';

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

function listSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__') continue;
      files.push(...listSourceFiles(fullPath));
    } else if (sourceExtensions.has(extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

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

  it('has recent search endpoint', () => {
    expect(ENDPOINTS.CATALOG.SEARCH_RECENT).toBe('/catalog/search/recent');
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

  it('has connected catalog and markup endpoints', () => {
    expect(ENDPOINTS.CATALOG.CONNECTIONS).toBe('/catalog/connections');
    expect(ENDPOINTS.CATALOG.CONNECTION_SYNC('abc')).toBe('/catalog/connections/abc/sync');
    expect(ENDPOINTS.CATALOG.MARKUPS).toBe('/catalog/markups');
    expect(ENDPOINTS.CATALOG.MARKUP_RESOLVE).toBe('/catalog/markups/resolve');
  });

  it('has facets query key', () => {
    const key = queryKeys.catalog.facets({ categoryId: 'x' });
    expect(key).toEqual(['catalog', 'facets', { categoryId: 'x' }]);
  });

  it('has recent search query key', () => {
    expect(queryKeys.catalog.recentSearches()).toEqual(['catalog', 'search', 'recent']);
  });

  it('has units query keys', () => {
    expect(queryKeys.catalog.units()).toEqual(['catalog', 'units']);
    expect(queryKeys.catalog.unitDetail('STK')).toEqual(['catalog', 'units', 'STK']);
  });

  it('has price batch query keys', () => {
    expect(queryKeys.catalog.priceBatches()).toEqual(['catalog', 'priceBatches']);
  });

  it('has connected catalog query keys', () => {
    expect(queryKeys.catalog.connections({ type: 'SUPPLIER' })).toEqual(['catalog', 'connections', { type: 'SUPPLIER' }]);
    expect(queryKeys.catalog.markups({ scope: 'GLOBAL' })).toEqual(['catalog', 'markups', { scope: 'GLOBAL' }]);
  });

  it('has German catalog translations', () => {
    const t = translations.de;
    expect(t['catalog.articles.title']).toBeDefined();
    expect(t['catalog.articles.create']).toBeDefined();
    expect(t['catalog.articles.bulkImport']).toBeDefined();
    expect(t['catalog.filter.type']).toBeDefined();
    expect(t['catalog.filter.status']).toBeDefined();
    expect(t['catalog.filter.source']).toBeDefined();
    expect(t['catalog.filter.priceRange']).toBeDefined();
    expect(t['catalog.filter.manufacturer']).toBeDefined();
    expect(t['catalog.articles.versions']).toBeDefined();
    expect(t['catalog.images.upload']).toBeDefined();
    expect(t['catalog.connections.title']).toBeDefined();
    expect(t['catalog.markups.title']).toBeDefined();
  });

  it('has English catalog translations', () => {
    const t = translations.en;
    expect(t['catalog.articles.title']).toBeDefined();
    expect(t['catalog.articles.create']).toBeDefined();
    expect(t['catalog.images.upload']).toBeDefined();
    expect(t['catalog.igh.title']).toBeDefined();
    expect(t['catalog.connections.title']).toBeDefined();
    expect(t['catalog.markups.title']).toBeDefined();
  });

  it('has explicit catalog translations in all supported locales', () => {
    const requiredKeys = Object.keys(translations.de).filter((key) =>
      key === 'sidebar.catalog'
      || key.startsWith('features.catalog.')
      || key.startsWith('catalog.')
      || key.startsWith('qop.lineItems.')
      || [
        'common.cancel',
        'common.category',
        'common.delete',
        'common.edit',
        'common.add',
        'common.firstPage',
        'common.loading',
        'common.save',
        'common.saving',
        'common.selectAll',
        'common.status',
        'common.title',
        'common.active',
        'common.inactive',
      ].includes(key)
    );

    for (const locale of ['de', 'en', 'fr', 'it'] as const) {
      for (const key of requiredKeys) {
        expect(translations[locale][key], `${locale}:${key}`).toBeDefined();
      }
    }
  });

  it('does not use German-only locale branches in catalog UI source', () => {
    const roots = [
      join(process.cwd(), 'src', 'modules', 'catalog'),
      join(process.cwd(), 'src', 'app', '(platform)', 'catalog'),
    ];

    const violations = roots
      .flatMap(listSourceFiles)
      .filter((file) => {
        const content = readFileSync(file, 'utf8');
        return /\b(?:const|let|var)\s+de\s*=|(?:language|locale)\s*===\s*['"]de/.test(content);
      })
      .map((file) => file.replace(process.cwd(), ''));

    expect(violations).toEqual([]);
  });
});
