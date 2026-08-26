import { describe, expect, test } from '@jest/globals';
import {
  DOCUMENT_TYPES,
  matchDocumentType,
} from '../../src/modules/ai/agents/document/documentTypes.js';

/**
 * File names as the office actually writes them.
 *
 * The vocabulary is only worth anything against the names people type at
 * eleven at night: scans, copies, drafts, versions, two words in one name,
 * and the same word spelled two ways. Three agents read this — a document
 * filed as OTHER is invisible to all three, and one filed as the wrong type
 * is worse, because nobody goes looking for it again.
 */
describe('names the office really types', () => {
  test.each([
    ['Bohrbewilligung_PRJ-2026-00001.pdf', 'BOHRBEWILLIGUNG'],
    ['2026_08_25_MB_Bohrbewilligung_V1.pdf', 'BOHRBEWILLIGUNG'],
    ['Kopie Bohrgesuch Kanton BE.pdf', 'BOHRBEWILLIGUNG'],
    ['IBN-Protokoll_2026.pdf', 'IBN_PROTOKOLL'],
    ['scan_ibn protokoll weber.PDF', 'IBN_PROTOKOLL'],
    ['Schallschutznachweis Aussenaufstellung.pdf', 'SCHALLSCHUTZ'],
    ['Lärmgutachten Nachbargrenze.pdf', 'SCHALLSCHUTZ'],
    ['WPSM Einverständniserklärung Kunde.pdf', 'WPSM'],
    ['Baugesuch Gemeinde Bern.pdf', 'BAUMELDUNG'],
    ['Lieferschein Tobler 4711.pdf', 'LIEFERSCHEIN'],
    ['Garantieschein Hoval.pdf', 'GARANTIE'],
    ['Entsorgungsnachweis Altheizung.pdf', 'ENTSORGUNG'],
  ])('%s is read as %s', (fileName, expected) => {
    expect(matchDocumentType(fileName)?.key).toBe(expected);
  });

  test('a version suffix does not change what a document is', () => {
    for (const suffix of ['_V1', '_V2', ' (2)', '_final', '_ALT', ' - Kopie']) {
      expect(matchDocumentType(`Schallschutznachweis${suffix}.pdf`)?.key).toBe('SCHALLSCHUTZ');
    }
  });

  test('the Swiss spelling and the German one land on the same type', () => {
    // Half the office types umlauts and half types ae/oe/ue.
    for (const [a, b] of [
      ['Förderabschluss.pdf', 'Foerderabschluss.pdf'],
      ['Einverständniserklärung.pdf', 'Einverstaendniserklaerung.pdf'],
      ['Lärmgutachten.pdf', 'Laermgutachten.pdf'],
    ]) {
      const first = matchDocumentType(a)?.key;
      expect(first).toBeTruthy();
      expect(matchDocumentType(b)?.key).toBe(first);
    }
  });
});

describe('where two readings are possible, the specific one wins', () => {
  test('a Förderabschluss is never filed as a Fördergesuch', () => {
    // Both names carry "foerder". One is filed to start a job, the other to
    // close it, and swapping them loses the subsidy.
    expect(matchDocumentType('Foerderabschluss eingereicht.pdf').key).toBe('FOERDERABSCHLUSS');
    expect(matchDocumentType('Schlussabrechnung Foerderung.pdf').key).toBe('FOERDERABSCHLUSS');
    expect(matchDocumentType('Foerdergesuch Kanton AG.pdf').key).toBe('FOERDERGESUCH');
  });

  test('the covering letter for a permit is the permit, not correspondence', () => {
    // An office attaches everything to one name; the permit is what matters.
    expect(matchDocumentType('Schreiben Bohrbewilligung Gemeinde.pdf').key).toBe('BOHRBEWILLIGUNG');
  });

  test('a name carrying two types resolves to one, and always the same one', () => {
    // Not a judgement about which is right — a judgement that the reading is
    // deterministic, so the same file never lands in two places on two days.
    const name = 'Rechnung zur Bohrbewilligung.pdf';
    const first = matchDocumentType(name)?.key;
    expect(first).toBeTruthy();
    for (let i = 0; i < 5; i += 1) expect(matchDocumentType(name)?.key).toBe(first);
  });
});

describe('what it refuses to read', () => {
  test.each([
    'scan0001.pdf',
    'Dokument.pdf',
    'neu.pdf',
    'Anhang 3.pdf',
    '',
    '   ',
  ])('%s says nothing, so nothing is claimed', (fileName) => {
    expect(matchDocumentType(fileName)).toBeNull();
  });

  test('a camera file name is a photo, which is the one thing a name can say alone', () => {
    // The exception to saying nothing: IMG_ and DSC_ come off a camera, and
    // photos of the finished plant are on every closing checklist.
    expect(matchDocumentType('IMG_4821.pdf').key).toBe('FOTOS');
    expect(matchDocumentType('Baustelle Weber 3.pdf').key).toBe('FOTOS');
  });

  test('a customer name that happens to contain a term is not a document type', () => {
    // There is no "Bau AG" rule; this is a check that a bare company name
    // does not trip a match on its own.
    expect(matchDocumentType('Weber AG.pdf')).toBeNull();
    expect(matchDocumentType('Meier und Söhne.pdf')).toBeNull();
  });
});

describe('the vocabulary itself holds together', () => {
  test('no term is a prefix of a later term, which is how drift starts', () => {
    // "foerder" sits in the Fördergesuch entry and matches Förderabschluss
    // too — safe only because Förderabschluss is declared first. Any pair in
    // the wrong order would repeat the original bug silently.
    const flat = DOCUMENT_TYPES.flatMap((type, index) => type.terms.map((term) => ({ term, index, key: type.key })));
    const offenders = [];
    for (const a of flat) {
      for (const b of flat) {
        if (a.key === b.key) continue;
        // a is a fragment of b, and a is declared first → b is unreachable.
        if (b.term.includes(a.term) && a.index < b.index) offenders.push(`${a.key}:${a.term} shadows ${b.key}:${b.term}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('every term is folded the way a file name is', () => {
    // Terms are matched against a folded name, so a term with an umlaut or a
    // capital could never match anything.
    for (const type of DOCUMENT_TYPES) {
      for (const term of type.terms) {
        expect(term).toBe(term.toLowerCase());
        expect(term).not.toMatch(/[äöüß]/);
      }
    }
  });
});
