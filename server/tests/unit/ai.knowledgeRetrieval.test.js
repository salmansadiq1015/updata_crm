import { describe, expect, jest, test } from '@jest/globals';
import knowledgeService from '../../src/modules/ai/agents/knowledge/knowledge.service.js';

/**
 * What Knowledge AI finds, and what it admits it cannot find.
 *
 * The specification asks it to point at uncertainty rather than guess, so the
 * two failures worth locking down are opposite: missing an answer that is
 * plainly there, and returning one that only looks related.
 */
const CORPUS = [
  {
    kind: 'Textbaustein',
    title: 'Zahlungsbedingungen',
    body: 'Rechnungen sind innert 30 Tagen netto zu begleichen. Bei Akontorechnungen gelten 10 Tage.',
    source: 'Textbaustein „Zahlungsbedingungen"',
  },
  {
    kind: 'Checkliste',
    title: 'Luft-Wasser-Wärmepumpe',
    body: 'Aufgaben: Baumeldung einreichen, Schallschutznachweis erstellen, Fördergesuch stellen.',
    source: 'Checkliste „Luft-Wasser-Wärmepumpe"',
  },
  {
    kind: 'Dokumenttyp',
    title: 'Bohrbewilligung',
    body: 'Wird abgelegt unter PERMITS. Erkannt an: bohrbewilligung, bohrgesuch.',
    source: 'Dokumenttyp „Bohrbewilligung"',
  },
];

function corpus(entries = CORPUS) {
  return jest.spyOn(knowledgeService, 'corpus').mockResolvedValue(entries);
}

describe('Knowledge AI — finding what the firm wrote down', () => {
  test('a compound asked about by another compound is still found', async () => {
    // German glues words together: the office asks about "Zahlungsfrist" where
    // the text block says "Zahlungsbedingungen". Whole-word matching found
    // neither in the other, and a question with an obvious answer came back
    // empty.
    corpus();
    const result = await knowledgeService.find('Wie lange ist unsere Zahlungsfrist?');

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].title).toBe('Zahlungsbedingungen');
  });

  test('a shared fragment is not a shared subject', async () => {
    // At five characters "Wasserschaden" matched "Luft-Wasser-Wärmepumpe", and
    // a question about insurance was answered with heat-pump subsidies —
    // precisely the guessing the specification forbids.
    corpus();
    const result = await knowledgeService.find('Was tun wir bei einem Wasserschaden?');

    expect(result.hits).toHaveLength(0);
  });

  test('a word in the title outranks the same word in a body', async () => {
    corpus();
    const result = await knowledgeService.find('Bohrbewilligung');

    expect(result.hits[0].title).toBe('Bohrbewilligung');
  });

  test('the words that produced the hit come back with it', async () => {
    // An answer whose source cannot be checked is not what was asked for.
    corpus();
    const result = await knowledgeService.find('Schallschutznachweis');

    expect(result.hits[0].matched).toContain('schallschutznachweis');
  });

  test('a question made only of filler words searches for nothing', async () => {
    corpus();
    const result = await knowledgeService.find('was ist es');

    expect(result.words).toHaveLength(0);
    expect(result.hits).toHaveLength(0);
  });
});

describe('Knowledge AI — what it says when it finds nothing', () => {
  test('it says nothing is stored, and says it does not guess', async () => {
    corpus();
    const question = 'Wie hoch ist die Prämie unserer Betriebshaftpflicht?';
    const answer = knowledgeService.compose(question, await knowledgeService.find(question));

    expect(answer).toContain('Dazu ist im System nichts hinterlegt');
    expect(answer).toContain('rate nicht');
  });

  test('an answer names its source', async () => {
    corpus();
    const question = 'Zahlungsfrist';
    const answer = knowledgeService.compose(question, await knowledgeService.find(question));

    expect(answer).toContain('Textbaustein „Zahlungsbedingungen"');
    expect(answer).toContain('nicht aus dem Sprachmodell');
  });

  test('material that calls itself incomplete is flagged before use', async () => {
    corpus([{
      kind: 'Textbaustein',
      title: 'Garantiebedingungen',
      body: 'Zwei Jahre auf Arbeit. Die Herstellergarantie ist noch zu prüfen.',
      source: 'Textbaustein „Garantiebedingungen"',
    }]);
    const question = 'Garantiebedingungen';
    const answer = knowledgeService.compose(question, await knowledgeService.find(question));

    expect(answer).toContain('als unvollständig gekennzeichnet');
  });
});
