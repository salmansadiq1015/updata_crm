import { describe, expect, test } from '@jest/globals';
import dispoService from '../../src/modules/ai/agents/dispo/dispo.service.js';
import controllingService from '../../src/modules/ai/agents/controlling/controlling.service.js';

/**
 * Dispo AI decides who may drive out, and Controlling AI decides what may be
 * said about the money. Both are covered here for the same reason: what they
 * refuse is as load-bearing as what they answer.
 */

describe('Dispo AI — what the plant demands of whoever turns up', () => {
  test('the plant type sets the qualification, the fuel only recommends one', () => {
    const requirements = dispoService.requirementsFor({ type: 'heat_pump', fuelType: 'electric' });

    expect(requirements.requiredSkills).toEqual(['heat_pump']);
    expect(requirements.recommendedSkills).toEqual(['electric']);
  });

  test('an unknown plant type demands nothing rather than inventing a skill', () => {
    // A made-up requirement would exclude every monteur from a job.
    expect(dispoService.requirementsFor({ type: 'etwas_neues' }).requiredSkills).toEqual([]);
    expect(dispoService.requirementsFor({ type: 'boiler', fuelType: 'holz' }).recommendedSkills).toEqual([]);
  });

  test('without a plant there is nothing to demand', () => {
    expect(dispoService.requirementsFor(null)).toEqual({
      requiredSkills: [],
      recommendedSkills: [],
      requiredCertifications: [],
      recommendedCertifications: [],
    });
  });
});

describe('Dispo AI — conflicts, in the words the office uses', () => {
  test('a hard conflict stays hard and a soft one stays soft', () => {
    expect(dispoService._name({ conflictType: 'ABSENCE', description: '' }).hard).toBe(true);
    expect(dispoService._name({ conflictType: 'DOUBLE_BOOKING', description: '' }).hard).toBe(false);
  });

  test('the useful specifics are carried over from the English text', () => {
    // The scheduling module writes in English; the parts worth keeping are
    // re-expressed rather than shown as they are.
    expect(dispoService._name({
      conflictType: 'DOUBLE_BOOKING',
      description: "Overlaps with 'Wartung Weber' (08:00 - 12:00)",
    }).detail).toBe('Doppelbelegung: Wartung Weber (08:00 - 12:00)');

    expect(dispoService._name({
      conflictType: 'SKILL_MISMATCH',
      description: 'Employee lacks skills: heat_pump',
    }).detail).toBe('Qualifikation fehlt: heat_pump');

    expect(dispoService._name({
      conflictType: 'TRAVEL_TIME',
      description: 'Only 5 min gap between assignments',
    }).detail).toBe('Zu wenig Fahrzeit: nur 5 Minuten zwischen zwei Einsätzen');
  });

  test('an absence is named by its kind and its Swiss date', () => {
    expect(dispoService._name({
      conflictType: 'ABSENCE',
      description: 'Employee is on VACATION on 2026-09-14',
    }).detail).toBe('Ferien am 14.09.2026');
  });

  test('a conflict the module adds later still reaches the office', () => {
    // An unknown type is shown by its code rather than swallowed, and its
    // severity is taken from the module instead of guessed.
    const named = dispoService._name({ conflictType: 'ETWAS_NEUES', severity: 'HARD', description: '' });

    expect(named.detail).toBe('ETWAS_NEUES');
    expect(named.hard).toBe(true);
  });
});

describe('Controlling AI — the figures, and what is missing under them', () => {
  const FIGURES = {
    verified: true,
    currency: 'CHF',
    project: { name: 'ZZTEST Heizungsersatz', customerName: 'Weber AG', status: 'IN_PROGRESS' },
    budget: 40000,
    ordered: 38000,
    invoiced: 20000,
    openToInvoice: 18000,
    outstanding: 12000,
    orders: 1,
    invoices: 2,
    hoursWorked: 62,
    hoursValue: 8680,
    billingRate: 140,
    gaps: [
      'Kein Kostensatz pro Stunde im System — eine Marge ist damit nicht berechenbar, nur der Leistungsfortschritt.',
      'Bestellungen tragen keinen Projektbezug — Materialkosten sind diesem Projekt nicht zuweisbar.',
    ],
  };

  test('every gap is printed under the figures, never left out', () => {
    const answer = controllingService.compose(FIGURES);

    expect(answer).toContain('Womit diese Zahlen zu lesen sind');
    for (const gap of FIGURES.gaps) expect(answer).toContain(gap);
  });

  test('hours are valued at the billing rate, and said to be', () => {
    // The system holds a billing rate and no cost rate. Passing one off as the
    // other would produce a normal-looking figure the office would price the
    // next job with.
    const answer = controllingService.compose(FIGURES);

    expect(answer).toContain('Verrechnungssatz');
    expect(answer).not.toMatch(/Gewinn|Deckungsbeitrag|Rendite/);
  });

  test('what cannot be read is said plainly rather than shown as zero', () => {
    expect(controllingService.compose({ verified: false, gaps: [] }))
      .toContain('konnten nicht ermittelt werden');
  });

  test('the answer says it is a running total, not an accounting statement', () => {
    expect(controllingService.compose(FIGURES)).toContain('keine Buchhaltungsauswertung');
  });
});
