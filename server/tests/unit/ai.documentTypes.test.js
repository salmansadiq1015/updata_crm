import { describe, expect, test } from '@jest/globals';
import {
  DOCUMENT_TYPES,
  documentTypeLabel,
  looksLikeImage,
  matchDocumentType,
} from '../../src/modules/ai/agents/document/documentTypes.js';

describe('AI document vocabulary', () => {
  test('a Förderabschluss is never read as a Fördergesuch', () => {
    // The list this replaced matched a Fördergesuch on the fragment "foerder",
    // which also appears in Förderabschluss — so the paper filed at the end of
    // a job was read as the one filed at the start.
    expect(matchDocumentType('Foerderabschluss eingereicht.pdf').key).toBe('FOERDERABSCHLUSS');
    expect(matchDocumentType('Förderabschluss eingereicht.pdf').key).toBe('FOERDERABSCHLUSS');
    expect(matchDocumentType('Foerdergesuch Kanton AG.pdf').key).toBe('FOERDERGESUCH');
  });

  test('Swiss and German spellings land on the same type', () => {
    for (const [a, b] of [
      ['Förderabschluss.pdf', 'Foerderabschluss.pdf'],
      ['Schallschutznachweis.pdf', 'Schallschutznachweis.pdf'],
      ['Einverständniserklärung.pdf', 'Einverstaendniserklaerung.pdf'],
    ]) {
      expect(matchDocumentType(a)?.key).toBe(matchDocumentType(b)?.key);
    }
  });

  test('separators used in file names do not hide a term', () => {
    expect(matchDocumentType('IBN-Protokoll_2026.pdf').key).toBe('IBN_PROTOKOLL');
    expect(matchDocumentType('2026_08_25_MB_Bohrbewilligung_V1.pdf').key).toBe('BOHRBEWILLIGUNG');
  });

  test('a name that says nothing matches nothing', () => {
    expect(matchDocumentType('scan.png')).toBeNull();
    expect(matchDocumentType('test pdf.pdf')).toBeNull();
    expect(matchDocumentType('')).toBeNull();
  });

  test('the matched term is returned so the reading can be checked', () => {
    const match = matchDocumentType('Bohrgesuch Kanton.pdf');
    expect(match.key).toBe('BOHRBEWILLIGUNG');
    expect(match.matchedTerm).toBe('bohrgesuch');
  });

  test('images are recognised by extension, because no MIME type is stored', () => {
    expect(looksLikeImage({ fileName: 'scan.png' })).toBe(true);
    expect(looksLikeImage({ fileName: 'IMG_4831.HEIC' })).toBe(true);
    expect(looksLikeImage({ fileName: 'Offerte.pdf' })).toBe(false);
    expect(looksLikeImage({ fileName: 'ohne-endung', mimeType: 'image/jpeg' })).toBe(true);
  });

  test('the search can be narrowed to the types a checklist expects', () => {
    const only = ['FOTOS', 'GARANTIE'];
    expect(matchDocumentType('Bohrbewilligung.pdf', { only })).toBeNull();
    expect(matchDocumentType('Garantieschein.pdf', { only }).key).toBe('GARANTIE');
  });

  test('every type is complete and uniquely keyed', () => {
    const keys = DOCUMENT_TYPES.map((type) => type.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const type of DOCUMENT_TYPES) {
      expect(type.label).toBeTruthy();
      expect(type.terms.length).toBeGreaterThan(0);
      expect(documentTypeLabel(type.key)).toBe(type.label);
    }
  });
});
