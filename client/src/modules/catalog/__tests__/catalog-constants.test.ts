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
