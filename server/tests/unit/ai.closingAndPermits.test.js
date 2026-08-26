import { describe, expect, test } from '@jest/globals';
import qualityService from '../../src/modules/ai/agents/quality/quality.service.js';
import behoerdenService from '../../src/modules/ai/agents/behoerden/behoerden.service.js';

/**
 * The two agents that hang on the plant type: what a finished job must leave
 * behind, and what has to be filed before it may start.
 *
 * Both read from the client's own checklists, and both are wrong in a way
 * that costs real money if the plant type is read loosely — an Erdsonde needs
 * a Bohrbewilligung, a Boilerersatz needs no permit at all, and claiming
 * either the other way round stops a job or starts one it should not.
 */
const NOTHING_FILED = [];
const NO_PLACE = { postalCode: null, city: null, canton: null, street: null };

describe('Quality AI — the closing checklist per plant type', () => {
  test('an Erdsonde cannot close without its Bohrbewilligung and IBN-Protokoll', () => {
    const blocking = qualityService
      .requirementsFor({ projectType: 'NEW_INSTALLATION' }, { key: 'ERDSONDEN_WP' })
      .filter((requirement) => requirement.blocking)
      .map((requirement) => requirement.key);

    expect(blocking).toEqual(expect.arrayContaining(['BOHRBEWILLIGUNG', 'IBN_PROTOKOLL', 'FOERDERABSCHLUSS']));
  });

  test('a Luft-Wasser-Wärmepumpe is held by its Baumeldung and Schallschutz, not by a Bohrbewilligung', () => {
    const requirements = qualityService.requirementsFor({}, { key: 'LUFT_WASSER_WP' });
    const keys = requirements.map((requirement) => requirement.key);

    expect(keys).toEqual(expect.arrayContaining(['BAUMELDUNG', 'SCHALLSCHUTZ']));
    expect(keys).not.toContain('BOHRBEWILLIGUNG');
  });

  test('a Boilerersatz asks for no permit at all', () => {
    const keys = qualityService.requirementsFor({}, { key: 'BOILER_SPEICHER' }).map((r) => r.key);

    expect(keys).not.toContain('BOHRBEWILLIGUNG');
    expect(keys).not.toContain('BAUMELDUNG');
    expect(keys).toContain('FOTOS');
  });

  test('an unrecognised plant falls back on the project type', () => {
    const maintenance = qualityService.requirementsFor({ projectType: 'MAINTENANCE' }, null);
    expect(maintenance.map((r) => r.key)).toContain('RAPPORT');
  });

  test('an unknown project type still has a checklist rather than none', () => {
    // No checklist would read as "nothing is missing" — the wrong answer.
    expect(qualityService.requirementsFor({ projectType: 'SOMETHING_NEW' }, null).length).toBeGreaterThan(0);
    expect(qualityService.requirementsFor(null, null).length).toBeGreaterThan(0);
  });

  test('every requirement carries wording the office can read', () => {
    for (const requirement of qualityService.requirementsFor({}, { key: 'ERDSONDEN_WP' })) {
      expect(typeof requirement.label).toBe('string');
      expect(requirement.label.length).toBeGreaterThan(0);
    }
  });
});

describe('Behörden AI — which procedures apply', () => {
  test('an Erdsonde is blocked from starting by its Bohrbewilligung', () => {
    const procedures = behoerdenService._procedures(
      { key: 'ERDSONDEN_WP' }, {}, NO_PLACE, [], NOTHING_FILED,
    );
    const blocking = procedures.filter((procedure) => procedure.blocksStart);

    expect(blocking.map((procedure) => procedure.key)).toEqual(['BOHRBEWILLIGUNG']);
    expect(procedures.every((procedure) => procedure.status === 'offen')).toBe(true);
  });

  test('a Boilerersatz has no procedure — which is an answer, not a gap', () => {
    expect(behoerdenService._procedures({ key: 'BOILER_SPEICHER' }, {}, NO_PLACE, [], NOTHING_FILED)).toEqual([]);
  });

  test('an unrecognised plant type produces no procedure rather than a guessed one', () => {
    expect(behoerdenService._procedures(null, {}, NO_PLACE, [], NOTHING_FILED)).toEqual([]);
    expect(behoerdenService._procedures({ key: 'ETWAS_NEUES' }, {}, NO_PLACE, [], NOTHING_FILED)).toEqual([]);
  });

  test('a filed document closes its procedure', () => {
    const procedures = behoerdenService._procedures(
      { key: 'ERDSONDEN_WP' }, {}, NO_PLACE, [],
      [{ fileName: 'Bohrbewilligung_PRJ-2026-00001.pdf' }],
    );

    expect(procedures.find((procedure) => procedure.key === 'BOHRBEWILLIGUNG').status).toBe('eingereicht');
    expect(procedures.find((procedure) => procedure.key === 'WPSM').status).toBe('offen');
  });

  test('a Förderabschluss does not close a Fördergesuch', () => {
    // Both file names carry "foerder"; the paper filed at the end of a job was
    // once read as the one filed at the start.
    const procedures = behoerdenService._procedures(
      { key: 'ERDSONDEN_WP' }, {}, NO_PLACE, [],
      [{ fileName: 'Foerderabschluss eingereicht.pdf' }],
    );

    expect(procedures.find((procedure) => procedure.key === 'FOERDERGESUCH').status).toBe('offen');
    expect(procedures.find((procedure) => procedure.key === 'FOERDERABSCHLUSS').status).toBe('eingereicht');
  });
});

describe('Behörden AI — what the system cannot supply', () => {
  const procedure = {
    key: 'FOERDERGESUCH',
    needs: ['Kanton', 'Anlagetyp', 'Leistung in kW', 'bisheriges Heizsystem'],
  };

  test('it names the fields it holds and stays silent about the ones it never holds', () => {
    // The parcel, the borehole depth and the customer's bank details are never
    // in the ERP; listing them as errors would drown the ones that are fixable.
    const missing = behoerdenService._missingData(procedure, NO_PLACE, null, []);

    expect(missing).toEqual(['Kanton', 'Anlagetyp', 'Leistung in kW']);
    expect(missing).not.toContain('bisheriges Heizsystem');
  });

  test('nothing is missing once the records hold it', () => {
    const missing = behoerdenService._missingData(
      procedure,
      { postalCode: '3011', city: 'Bern', canton: 'BE' },
      12,
      [{ type: 'heat_pump', manufacturer: 'Hoval', model: 'Belaria' }],
    );

    expect(missing).toEqual([]);
  });

  test('the canton is derived from the postal code, not asked for twice', () => {
    expect(behoerdenService._place({ postalCode: '3011', city: 'Bern' }).canton).toBe('BE');
    expect(behoerdenService._place({ postalCode: '4001', city: 'Basel' }).canton).toBe('BS');
    expect(behoerdenService._place(null).canton).toBeNull();
  });
});
