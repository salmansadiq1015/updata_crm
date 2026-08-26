import { describe, expect, test } from '@jest/globals';
import customerService, {
  CHANNELS,
  OCCASIONS,
} from '../../src/modules/ai/agents/customer/customer.service.js';

/**
 * What Customer AI writes to a customer, and what it refuses to write.
 *
 * A customer-facing text is where a language model is most tempting and most
 * dangerous: it will promise a date, a price or a remedy nobody agreed to, and
 * the customer will hold the firm to it. So every fact comes from a record,
 * and an occasion whose facts are missing is refused rather than filled in.
 */
const KUNDE = { _id: 'c1', name: 'Weber AG', email: 'ZZTEST@example.invalid' };

describe('Customer AI — how a customer is addressed', () => {
  test('without a recorded salutation the letter says Guten Tag', async () => {
    // Deriving "Herr" or "Frau" from a first name misgenders real people, and
    // a letter that does that is worse than a plain one.
    const draft = await customerService.draft({
      customer: { _id: 'c1', name: 'Müller', ownerName: 'Andrea Müller' },
      occasion: OCCASIONS.ABSCHLUSS,
      channel: CHANNELS.EMAIL,
    });

    expect(draft.body).toContain('Guten Tag Andrea Müller');
    expect(draft.body).not.toMatch(/Sehr geehrte[rn]? (Herr|Frau)/);
  });

  test('a recorded salutation is used as recorded', async () => {
    const cases = [
      ['herr', 'Sehr geehrter Herr Weber'],
      ['frau', 'Sehr geehrte Frau Weber'],
      ['familie', 'Sehr geehrte Familie Weber'],
      ['firma', 'Sehr geehrte Damen und Herren'],
    ];
    for (const [salutation, expected] of cases) {
      const draft = await customerService.draft({
        customer: { _id: 'c1', name: 'Weber', salutation },
        occasion: OCCASIONS.ABSCHLUSS,
        channel: CHANNELS.EMAIL,
      });
      expect(draft.body).toContain(expected);
    }
  });

  test('Swiss business German throughout — never the German ß', async () => {
    const draft = await customerService.draft({
      customer: KUNDE,
      occasion: OCCASIONS.ABSCHLUSS,
      channel: CHANNELS.EMAIL,
    });
    expect(draft.body).toContain('Freundliche Grüsse');
    expect(draft.body).not.toContain('ß');
  });
});

describe('Customer AI — what it refuses to write', () => {
  test('a Terminbestätigung without a date is refused, not invented', async () => {
    const draft = await customerService.draft({
      customer: KUNDE,
      occasion: OCCASIONS.TERMIN,
      channel: CHANNELS.EMAIL,
    });

    expect(draft.ok).toBe(false);
    expect(draft.body).toBeUndefined();
    expect(customerService.compose(draft)).toContain('nicht erfunden');
  });

  test('with a date, the date in the letter is the date it was given', async () => {
    const draft = await customerService.draft({
      customer: KUNDE,
      occasion: OCCASIONS.TERMIN,
      channel: CHANNELS.EMAIL,
      dateTime: new Date('2026-09-14T08:30:00'),
    });

    expect(draft.ok).toBe(true);
    expect(draft.body).toContain('14.09.2026');
  });

  test('an announcement without an occasion is refused', async () => {
    const draft = await customerService.draft({
      customer: KUNDE,
      occasion: OCCASIONS.VERZOEGERUNG,
      channel: CHANNELS.EMAIL,
    });
    expect(draft.ok).toBe(false);
  });

  test('without a recipient there is no draft at all', async () => {
    const draft = await customerService.draft({
      occasion: OCCASIONS.ABSCHLUSS,
      channel: CHANNELS.EMAIL,
    });
    expect(draft.ok).toBe(false);
    expect(draft.blockers).toHaveLength(1);
  });
});

describe('Customer AI — the channel', () => {
  test('an SMS drops the greeting and names the sender instead', async () => {
    // On 160 characters a salutation and a signature crowd out the fact.
    const draft = await customerService.draft({
      customer: KUNDE,
      occasion: OCCASIONS.WARTUNG,
      channel: CHANNELS.SMS,
    });

    expect(draft.body.startsWith('MB Boiler: ')).toBe(true);
    expect(draft.body).not.toContain('Guten Tag');
    expect(draft.body).not.toContain('Freundliche Grüsse');
  });

  test('a draft that will not fit the channel says so rather than being cut', async () => {
    const draft = await customerService.draft({
      customer: KUNDE,
      occasion: OCCASIONS.VERZOEGERUNG,
      channel: CHANNELS.SMS,
      reason: 'x'.repeat(200),
    });

    expect(draft.ok).toBe(true);
    expect(draft.warnings.join(' ')).toContain('160');
    expect(draft.body.length).toBeGreaterThan(160);
  });

  test('the office’s own wording is quoted, and closed off', async () => {
    // Without a full stop the reason ran straight into the next sentence.
    const draft = await customerService.draft({
      customer: KUNDE,
      occasion: OCCASIONS.VERZOEGERUNG,
      channel: CHANNELS.EMAIL,
      reason: 'die Wärmepumpe wird vom Hersteller erst im Oktober geliefert',
    });

    expect(draft.body).toContain('erst im Oktober geliefert.');
  });
});

describe('Customer AI — reading the office’s request', () => {
  test('the occasion and the channel are read out of the sentence', () => {
    expect(customerService.read('Kunde per WhatsApp über die Verzögerung informieren'))
      .toMatchObject({ occasion: OCCASIONS.VERZOEGERUNG, channel: CHANNELS.WHATSAPP });
    expect(customerService.read('Termin per SMS bestätigen'))
      .toMatchObject({ occasion: OCCASIONS.TERMIN, channel: CHANNELS.SMS });
    expect(customerService.read('dem Kunden schreiben, dass die Arbeiten fertig sind'))
      .toMatchObject({ occasion: OCCASIONS.ABSCHLUSS, channel: CHANNELS.EMAIL });
  });

  test('an unrecognised request becomes a general message by e-mail', () => {
    expect(customerService.read('dem Kunden etwas mitteilen'))
      .toMatchObject({ occasion: OCCASIONS.ALLGEMEIN, channel: CHANNELS.EMAIL });
  });
});

describe('Customer AI — nothing leaves the house on its own', () => {
  test('every finished draft says it still needs approval', async () => {
    const draft = await customerService.draft({
      customer: KUNDE,
      occasion: OCCASIONS.ABSCHLUSS,
      channel: CHANNELS.EMAIL,
    });
    expect(customerService.compose(draft)).toContain('Freigabe');
  });
});
