import { describe, expect, test } from '@jest/globals';
import documentService from '../../src/modules/ai/agents/document/document.service.js';
import serviceService from '../../src/modules/ai/agents/service/service.service.js';

/**
 * Document AI reads a file name; Service AI reads a plant record. Neither
 * reads the thing itself, and both are only useful as long as they say so.
 *
 * These run without a database on purpose: the reading is the logic, and the
 * lookup that follows it is not what goes wrong.
 */

describe('Document AI — reading a file name', () => {
  test('a record number is found even when an underscore sits in front of it', async () => {
    // "\bPRJ" never matched inside "Bohrbewilligung_PRJ-2026-00001.pdf",
    // because an underscore is a word character — and that is exactly how the
    // office names a file.
    const result = await documentService.classify({ fileName: 'Bohrbewilligung_PRJ-2026-00001.pdf' });

    expect(result.references.projectNumber).toBe('PRJ-2026-00001');
    expect(result.type.key).toBe('BOHRBEWILLIGUNG');
  });

  test('each kind of record number is recognised for what it is', async () => {
    const result = await documentService.classify({
      fileName: 'Rechnung_RE-2026-0042_zu_AUF-2026-0052_aus_OFF-2026-0104.pdf',
    });

    expect(result.references).toMatchObject({
      invoiceNumber: 'RE-2026-0042',
      orderNumber: 'AUF-2026-0052',
      quotationNumber: 'OFF-2026-0104',
      projectNumber: null,
    });
  });

  test('an image is a photo whatever it was named', async () => {
    // The one thing the file tells us without being read.
    const result = await documentService.classify({
      fileName: 'IMG_4821.jpg',
      mimeType: 'image/jpeg',
    });

    expect(result.type.key).toBe('FOTOS');
  });

  test('a name that says nothing is left unclassified rather than guessed', async () => {
    // Filing an invoice as a Bohrbewilligung is worse than filing it nowhere.
    const result = await documentService.classify({ fileName: 'scan0001.pdf' });

    expect(result.type).toBeNull();
    expect(result.category).toBe('OTHER');
    expect(result.ok).toBe(false);
    expect(result.suggestedName).toBeNull();
  });

  test('the word that led to the reading comes back with it', async () => {
    const result = await documentService.classify({ fileName: 'Bohrgesuch Kanton BE.pdf' });

    // Right answer, unobvious route — so the route is shown, in the wording
    // the vocabulary matches on.
    expect(result.type.key).toBe('BOHRBEWILLIGUNG');
    expect(result.evidence.join(' ')).toContain('bohrgesuch');
  });

  test('every proposal says the content was not read', async () => {
    const result = await documentService.classify({ fileName: 'IBN-Protokoll_2026.pdf' });

    expect(result.warnings.join(' ')).toContain('der Inhalt wird nicht gelesen');
  });
});

describe('Service AI — what a monteur is told to check', () => {
  const HEIZKESSEL = { type: 'boiler', fuelType: 'oil', serialNumber: 'SN-4711' };

  test('an old fossil boiler raises the replacement conversation, through the office', () => {
    const hints = serviceService._hints(HEIZKESSEL, 18, []).join(' ');

    expect(hints).toContain('Fördergelder');
    // The monteur does not quote on site — the office does.
    expect(hints).toContain('über das Büro');
  });

  test('a young plant raises nothing about replacement', () => {
    const hints = serviceService._hints(HEIZKESSEL, 4, []).join(' ');
    expect(hints).not.toContain('Fördergelder');
  });

  test('an unknown age raises nothing rather than assuming the worst', () => {
    const hints = serviceService._hints(HEIZKESSEL, null, []).join(' ');
    expect(hints).not.toContain('Fördergelder');
  });

  test('each point comes from a fact on the record', () => {
    expect(serviceService._hints({ type: 'boiler', fuelType: 'oil', serialNumber: 'x' }, 2, []).join(' '))
      .toContain('Öltank');
    expect(serviceService._hints({ type: 'heat_pump', fuelType: 'electric', serialNumber: 'x' }, 2, []).join(' '))
      .toContain('Verdampfer');
    expect(serviceService._hints({ type: 'heat_pump', fuelType: 'electric', serialNumber: 'x' }, 2, []).join(' '))
      .not.toContain('Abgaswerte');
  });

  test('an open ticket is folded into the same visit', () => {
    const hints = serviceService._hints(HEIZKESSEL, 2, [{ _id: 't1' }]).join(' ');
    expect(hints).toContain('zweite Anfahrt');
  });

  test('a gap in the record becomes something to bring back', () => {
    const hints = serviceService._hints({ type: 'boiler', fuelType: 'gas' }, 2, []).join(' ');
    expect(hints).toContain('Serienummer');
  });
});
