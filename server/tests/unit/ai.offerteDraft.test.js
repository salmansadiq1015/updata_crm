import { describe, expect, test } from '@jest/globals';
import offerteService, { OFFERTE_BLOCKS } from '../../src/modules/ai/agents/offerte/offerte.service.js';

/**
 * What Offerte AI keeps from what the language model gave it.
 *
 * The model is asked for nine blocks and a list of positions, and it answers
 * with whatever it feels like: a missing block, a quantity as the string
 * "zwei", sixty pages of positions, a price nobody asked for. This is the
 * layer that decides what survives — and the one rule it must never break is
 * the specification's own: Offerte AI does not set prices. A quotation that
 * leaves the house with an invented figure is a number the firm is held to.
 */
describe('the nine blocks are always all nine', () => {
  test('a block the model skipped is present and empty, never missing', () => {
    // The office works through them in order; a hole in the middle would read
    // as "nothing to say here" rather than "the model did not answer".
    const draft = offerteService._normalize({ blocks: { ausgangslage: 'Ölheizung von 1998.' } });

    expect(Object.keys(draft.blocks).sort()).toEqual([...OFFERTE_BLOCKS].sort());
    expect(draft.blocks.ausgangslage).toBe('Ölheizung von 1998.');
    expect(draft.blocks.optionen).toBe('');
  });

  test('nothing at all still produces the nine', () => {
    const draft = offerteService._normalize();
    expect(Object.keys(draft.blocks)).toHaveLength(9);
    expect(draft.positions).toEqual([]);
    expect(draft.title).toBe('');
  });

  test('a block that came back as a number or an object is dropped, not printed', () => {
    const draft = offerteService._normalize({ blocks: { ausgangslage: 42, kundenziel: { text: 'x' } } });
    expect(draft.blocks.ausgangslage).toBe('');
    expect(draft.blocks.kundenziel).toBe('');
  });
});

describe('the positions the office will price', () => {
  test('a quantity that is not a number becomes one, not zero', () => {
    // Zero would read as "none needed" and quietly drop the line from the
    // total; one is the smallest honest guess and stays visible.
    const draft = offerteService._normalize({
      positions: [
        { description: 'Wärmepumpe', quantity: 'zwei' },
        { description: 'Kernbohrung', quantity: -3 },
        { description: 'Ausdehnungsgefäss', quantity: 2 },
      ],
    });

    expect(draft.positions.map((p) => p.quantity)).toEqual([1, 1, 2]);
  });

  test('a position without a description is not a position', () => {
    const draft = offerteService._normalize({
      positions: [{ description: '   ', quantity: 5 }, { quantity: 2 }, { description: 'Montage' }],
    });
    expect(draft.positions).toHaveLength(1);
    expect(draft.positions[0].description).toBe('Montage');
  });

  test('an option stays marked as an option', () => {
    // The client's own template has an Optionen section; a line that lands in
    // the total instead is money the customer never agreed to.
    const draft = offerteService._normalize({
      positions: [{ description: 'PUROTAP MICRO', isOption: true }, { description: 'Montage', isOption: 'ja' }],
    });
    expect(draft.positions[0].isOption).toBe(true);
    // Only a real boolean counts — "ja" is the model being conversational.
    expect(draft.positions[1].isOption).toBe(false);
  });

  test('a missing unit becomes Stk rather than nothing', () => {
    const draft = offerteService._normalize({ positions: [{ description: 'Wärmepumpe' }] });
    expect(draft.positions[0].unit).toBe('Stk');
  });

  test('a runaway answer is cut rather than written whole', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ description: `Position ${i}` }));
    expect(offerteService._normalize({ positions: many }).positions).toHaveLength(60);
    expect(offerteService._normalize({ openPoints: many.map((p) => p.description) }).openPoints).toHaveLength(30);
  });

  test('no price ever comes back, whatever the model offered', () => {
    // The specification puts "Preise festlegen" on this agent's forbidden
    // list. The shape is the enforcement: there is nowhere to put one.
    const draft = offerteService._normalize({
      positions: [{ description: 'Wärmepumpe', unitPrice: 24000, price: 24000, total: 24000 }],
    });

    expect(Object.keys(draft.positions[0]).sort())
      .toEqual(['catalogueMatch', 'description', 'isOption', 'quantity', 'unit']);
  });
});

describe('what the customer reads, and what stays inside', () => {
  const draft = () => offerteService._normalize({
    blocks: {
      ausgangslage: 'Ölheizung von 1998, Verbrauch hoch.',
      kundenziel: 'Ersatz vor dem Winter.',
      technischeLoesung: 'Luft-Wasser-Wärmepumpe, aussen aufgestellt.',
      leistungsumfang: 'Demontage, Montage, Inbetriebnahme.',
      ausschluesse: 'Elektroarbeiten bauseits.',
      versandbereitschaft: 'Preise Elektro fehlen noch.',
    },
    openPoints: ['Aufstellort noch offen'],
    missingPrices: ['Elektroanschluss'],
    recognizedWork: ['Luft-Wasser-Wärmepumpe', 'Demontage'],
  });

  test('the introduction is the situation, the goal and the solution — in that order', () => {
    const intro = offerteService.composeIntroduction(draft().blocks);
    expect(intro).toBe('Ölheizung von 1998, Verbrauch hoch.\n\nErsatz vor dem Winter.\n\nLuft-Wasser-Wärmepumpe, aussen aufgestellt.');
  });

  test('what is unresolved never reaches the customer-facing introduction', () => {
    // An open point printed in the introduction reads as a promise to the
    // customer that somebody will handle it.
    const intro = offerteService.composeIntroduction(draft().blocks);
    for (const inside of ['Aufstellort', 'Elektroanschluss', 'Preise Elektro fehlen']) {
      expect(intro).not.toContain(inside);
    }
  });

  test('the internal note gathers everything still to decide', () => {
    const note = offerteService.composeInternalNotes(draft());
    expect(note).toContain('Aufstellort noch offen');
    expect(note).toContain('Elektroanschluss');
    expect(note).toContain('Elektroarbeiten bauseits');
    expect(note).toContain('Luft-Wasser-Wärmepumpe');
  });

  test('an empty draft leaves an empty note, not a page of headings', () => {
    expect(offerteService.composeInternalNotes(offerteService._normalize())).toBe('');
  });

  test('an introduction with nothing to say is empty, not whitespace', () => {
    expect(offerteService.composeIntroduction({})).toBe('');
    expect(offerteService.composeIntroduction({ ausgangslage: '   ' })).toBe('');
  });
});
