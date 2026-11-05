// SIM payload builder and the "does the server need a new report?" comparison.
import { rangDuringOtherCall } from '../domain/incomingCallDomain';
import { buildSimPayload, needsSimReport, sameSims, simDisplay } from '../domain/simReport';

const sim = (slotIndex: number, displayName: string | null, carrierName: string | null) => ({
  slotIndex,
  displayName,
  carrierName,
});

describe('buildSimPayload', () => {
  it('maps slots, names and carriers, sorted by slot, never the SIM number', () => {
    const native = [
      { ...sim(1, 'Private', 'Salt'), number: '+41790000000', subscriptionId: 4 },
      { ...sim(0, ' Work ', 'Swisscom'), number: null, subscriptionId: 2 },
    ];
    const payload = buildSimPayload(native);
    expect(payload).toEqual([
      { slot: 0, label: 'Work', carrier: 'Swisscom' },
      { slot: 1, label: 'Private', carrier: 'Salt' },
    ]);
    expect(JSON.stringify(payload)).not.toContain('+41');
  });

  it('gives a SIM with an unknown slot the first free slot and keeps one entry per slot', () => {
    expect(buildSimPayload([sim(0, 'A', null), sim(0, 'dup', null), sim(-1, 'eSIM', 'Wingo')])).toEqual([
      { slot: 0, label: 'A', carrier: '' },
      { slot: 1, label: 'eSIM', carrier: 'Wingo' },
    ]);
  });

  it('caps at four SIMs and 80 characters, and handles no SIM', () => {
    const many = [0, 1, 2, 3, 4].map((i) => sim(i, `S${i}`, null));
    expect(buildSimPayload(many).map((s) => s.slot)).toEqual([0, 1, 2, 3]);
    expect(buildSimPayload([sim(0, 'x'.repeat(120), null)])[0]!.label).toHaveLength(80);
    expect(buildSimPayload([])).toEqual([]);
  });
});

describe('needsSimReport', () => {
  const local = [{ slot: 0, label: 'Work', carrier: 'Swisscom' }];
  it('reports when never reported, even an empty list', () => {
    expect(needsSimReport({ sims: [], simsReportedAt: null }, [])).toBe(true);
    expect(needsSimReport({ sims: [], simsReportedAt: null }, local)).toBe(true);
  });
  it('skips when the server already has the same SIMs (order-insensitive)', () => {
    const two = [
      { slot: 1, label: 'B', carrier: '' },
      { slot: 0, label: 'A', carrier: '' },
    ];
    expect(sameSims(two, [...two].reverse())).toBe(true);
    expect(needsSimReport({ sims: local, simsReportedAt: '2026-11-04T10:00:00.000Z' }, local)).toBe(false);
  });
  it('reports when a SIM was added, removed or renamed', () => {
    const at = '2026-11-04T10:00:00.000Z';
    expect(needsSimReport({ sims: local, simsReportedAt: at }, [])).toBe(true);
    expect(needsSimReport({ sims: local, simsReportedAt: at }, [{ ...local[0]!, label: 'Business' }])).toBe(
      true,
    );
    expect(
      needsSimReport({ sims: local, simsReportedAt: at }, [
        ...local,
        { slot: 1, label: '', carrier: 'Salt' },
      ]),
    ).toBe(true);
  });
});

describe('display', () => {
  it('formats a SIM line', () => {
    expect(simDisplay({ slot: 0, label: 'Work', carrier: 'Swisscom' })).toBe('SIM 1 · Work · Swisscom');
    expect(simDisplay({ slot: 1, label: 'Salt', carrier: 'Salt' })).toBe('SIM 2 · Salt');
    expect(simDisplay({ slot: 2, label: '', carrier: '' })).toBe('SIM 3');
  });
  it('recognises a call that rang during another call', () => {
    expect(rangDuringOtherCall({ aiBlockedBy: 'call_waiting' })).toBe(true);
    expect(rangDuringOtherCall({ aiBlockedBy: null, callWaiting: true })).toBe(true);
    expect(rangDuringOtherCall({ aiBlockedBy: 'no_agent' })).toBe(false);
  });
});
