import { describe, expect, jest, test } from '@jest/globals';
import materialService from '../../src/modules/ai/agents/material/material.service.js';

/**
 * What Material AI counts as a part.
 *
 * The agent tells the office what has not been ordered before a site start.
 * Once it listed "Montage Heizkessel, 10 H" as missing material, and a line of
 * labour would have held up a job — nobody orders hours from a supplier.
 */
function orderWith(lineItems) {
  return { orderNumber: 'AUF-2026-0001', lineItems };
}

/** The catalogue lookup is a database read; here it is stated outright. */
function catalogue(types) {
  return jest
    .spyOn(materialService, '_articleTypes')
    .mockResolvedValue(new Map(Object.entries(types)));
}

describe('Material AI — what counts as a part', () => {
  test('labour from the catalogue is never reported as unordered material', async () => {
    catalogue({ 'mo-100': 'SERVICE', 'wp-200': 'MATERIAL' });

    const articles = await materialService.articlesFrom([orderWith([
      { articleNumber: 'MO-100', description: 'Montage Heizkessel', quantity: 10, unit: 'H' },
      { articleNumber: 'WP-200', description: 'Wärmepumpe Hoval Belaria', quantity: 1, unit: 'STK' },
    ])]);

    expect(articles.map((article) => article.articleNumber)).toEqual(['WP-200']);
  });

  test('the catalogue decides even when the unit suggests otherwise', async () => {
    // A part sold by the hour is still a part, and a service sold by the piece
    // is still a service. What the catalogue says outranks the unit.
    catalogue({ 'kb-1': 'MATERIAL', 'sv-1': 'SERVICE' });

    const articles = await materialService.articlesFrom([orderWith([
      { articleNumber: 'KB-1', description: 'Kernbohrung Set', quantity: 2, unit: 'Std' },
      { articleNumber: 'SV-1', description: 'Servicepauschale', quantity: 1, unit: 'STK' },
    ])]);

    expect(articles.map((article) => article.articleNumber)).toEqual(['KB-1']);
  });

  test('outside the catalogue the unit decides, and hours are work', async () => {
    catalogue({});

    const articles = await materialService.articlesFrom([orderWith([
      { articleNumber: 'FREI-1', description: 'Regiearbeit', quantity: 4, unit: 'h' },
      { articleNumber: 'FREI-2', description: 'Pauschale Entsorgung', quantity: 1, unit: 'pausch' },
      { articleNumber: 'FREI-3', description: 'Ausdehnungsgefäss 25 l', quantity: 1, unit: 'STK' },
    ])]);

    expect(articles.map((article) => article.articleNumber)).toEqual(['FREI-3']);
  });

  test('a line with neither article number nor catalogue snapshot is not material', async () => {
    // Free text on an order — a note, a heading — is not something to order.
    catalogue({});

    const articles = await materialService.articlesFrom([orderWith([
      { description: 'Arbeiten gemäss Offerte', quantity: 1, unit: 'STK' },
    ])]);

    expect(articles).toEqual([]);
  });

  test('what the office needs to order carries over from the order', async () => {
    catalogue({ 'wp-200': 'MATERIAL' });

    const [article] = await materialService.articlesFrom([orderWith([{
      articleNumber: 'WP-200',
      description: 'Wärmepumpe Hoval Belaria pro',
      quantity: 2,
      unit: 'STK',
      catalogSnapshot: { supplierName: 'Hoval AG', manufacturerName: 'Hoval', availabilityStatus: 'IN_STOCK' },
    }])]);

    expect(article).toMatchObject({
      orderNumber: 'AUF-2026-0001',
      name: 'Wärmepumpe Hoval Belaria pro',
      quantity: 2,
      unit: 'STK',
      supplier: 'Hoval AG',
    });
  });
});
