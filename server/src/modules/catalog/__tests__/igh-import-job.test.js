import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

const mockBulkWrite = jest.fn();

jest.unstable_mockModule('../article.model.js', () => ({
  default: { bulkWrite: mockBulkWrite },
}));

let parseIghCsv, parseIghJson, parseIghXml, batchUpsertArticles;

beforeAll(async () => {
  const mod = await import('../igh-import-adapters.js');
  parseIghCsv = mod.parseIghCsv;
  parseIghJson = mod.parseIghJson;
  parseIghXml = mod.parseIghXml;
  batchUpsertArticles = mod.batchUpsertArticles;
});

describe('IGH import adapters', () => {
  afterEach(() => jest.clearAllMocks());

  describe('parseIghCsv()', () => {
    it('parses valid CSV rows into article objects', async () => {
      const csv = `IGH_NR;BEZEICHNUNG;EINHEIT;PREIS_CHF\n12345;Rohr 28mm;m;15.50\n67890;Winkel 90;Stk;3.20`;
      const articles = await parseIghCsv(csv);
      expect(articles).toHaveLength(2);
      expect(articles[0]).toMatchObject({
        ighArticleNumber: '12345',
        name: 'Rohr 28mm',
        unitOfMeasure: 'M',
        basePrice: 15.5,
        source: 'IGH',
      });
    });

    it('skips rows with missing IGH_NR', async () => {
      const csv = `IGH_NR;BEZEICHNUNG;EINHEIT;PREIS_CHF\n;Bad row;m;10.00\n12345;Good;m;5.00`;
      const articles = await parseIghCsv(csv);
      expect(articles).toHaveLength(1);
      expect(articles[0].ighArticleNumber).toBe('12345');
    });
  });

  describe('parseIghJson()', () => {
    it('parses JSON array into article objects', () => {
      const json = [
        { ighNr: 'A001', name: 'Fitting', unit: 'Stk', price: 4.80 },
      ];
      const articles = parseIghJson(json);
      expect(articles[0]).toMatchObject({
        ighArticleNumber: 'A001',
        name: 'Fitting',
        unitOfMeasure: 'STK',
        basePrice: 4.8,
        source: 'IGH',
      });
    });

    it('parses XML article blocks into canonical units', () => {
      const xml = `
        <catalog>
          <article><IGH_NR>X001</IGH_NR><BEZEICHNUNG>Pumpe</BEZEICHNUNG><EINHEIT>Stk</EINHEIT><PREIS_CHF>25,40</PREIS_CHF></article>
        </catalog>
      `;
      const articles = parseIghXml(xml);
      expect(articles).toHaveLength(1);
      expect(articles[0]).toMatchObject({
        ighArticleNumber: 'X001',
        name: 'Pumpe',
        unitOfMeasure: 'STK',
        basePrice: 25.4,
      });
    });
  });

  describe('batchUpsertArticles()', () => {
    it('calls Article.bulkWrite with upsert operations', async () => {
      mockBulkWrite.mockResolvedValue({ upsertedCount: 2, modifiedCount: 0 });
      const articles = [
        { ighArticleNumber: 'A001', name: 'Fitting', unitOfMeasure: 'STK', basePrice: 4.8 },
        { ighArticleNumber: 'A002', name: 'Pipe', unitOfMeasure: 'M', basePrice: 12.0 },
      ];
      const result = await batchUpsertArticles(articles, 'admin-user-id');
      expect(mockBulkWrite).toHaveBeenCalledTimes(1);
      const ops = mockBulkWrite.mock.calls[0][0];
      expect(ops).toHaveLength(2);
      expect(ops[0].updateOne.filter).toMatchObject({ ighArticleNumber: 'A001' });
      expect(ops[0].updateOne.upsert).toBe(true);
      expect(result).toMatchObject({ upsertedCount: 2, modifiedCount: 0 });
    });

    it('splits into batches of 500', async () => {
      mockBulkWrite.mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 });
      const articles = Array.from({ length: 1100 }, (_, i) => ({
        ighArticleNumber: `A${i}`,
        name: `Article ${i}`,
        unitOfMeasure: 'STK',
        basePrice: 1,
      }));
      await batchUpsertArticles(articles, 'admin-user-id');
      expect(mockBulkWrite).toHaveBeenCalledTimes(3); // 500 + 500 + 100
    });
  });
});
