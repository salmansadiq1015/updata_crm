// SIM cards of THIS phone, reported to the paired device it belongs to. Over Bluetooth HFP the
// bridge cannot tell which SIMs a phone has, so the Updata app on that phone reports them
// (PUT /inbound-calls/devices/:id/sims). Only slot, SIM name and carrier are sent: never the
// SIM's phone number, which the platform reports unreliably anyway.
import type { SimInfo } from '@/services/telephony/types';

import type { ReportedSim } from '../types';

export const MAX_SIMS = 4;
const MAX_SLOT = 4;
const MAX_TEXT = 80;

const clean = (value: string | null | undefined) => (value ?? '').trim().slice(0, MAX_TEXT);

/**
 * Native SIM list → the server payload. Slots come from Android (0-based); a SIM whose slot is
 * unknown (-1, some eSIMs) gets the first free slot so it is still listed. One entry per slot,
 * sorted, at most four (the server's limit).
 */
export function buildSimPayload(
  sims: Pick<SimInfo, 'slotIndex' | 'displayName' | 'carrierName'>[],
): ReportedSim[] {
  const bySlot = new Map<number, ReportedSim>();
  const pending: ReportedSim[] = [];
  for (const sim of sims) {
    const entry = { slot: -1, label: clean(sim.displayName), carrier: clean(sim.carrierName) };
    if (Number.isInteger(sim.slotIndex) && sim.slotIndex >= 0 && sim.slotIndex <= MAX_SLOT) {
      if (!bySlot.has(sim.slotIndex)) bySlot.set(sim.slotIndex, { ...entry, slot: sim.slotIndex });
    } else {
      pending.push(entry);
    }
  }
  for (const entry of pending) {
    let slot = 0;
    while (bySlot.has(slot) && slot <= MAX_SLOT) slot += 1;
    if (slot > MAX_SLOT) break;
    bySlot.set(slot, { ...entry, slot });
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot).slice(0, MAX_SIMS);
}

const key = (sims: ReportedSim[]) =>
  JSON.stringify(
    [...sims].sort((a, b) => a.slot - b.slot).map((s) => [s.slot, clean(s.label), clean(s.carrier)]),
  );

export function sameSims(a: ReportedSim[], b: ReportedSim[]): boolean {
  return key(a) === key(b);
}

/** Report when this device never received SIMs, or what is stored differs from this phone. */
export function needsSimReport(
  device: { sims: ReportedSim[]; simsReportedAt: string | null },
  local: ReportedSim[],
): boolean {
  return !device.simsReportedAt || !sameSims(device.sims, local);
}

/** "SIM 1 · Swisscom" — slot first, then the SIM's name and carrier when they add something. */
export function simDisplay(sim: ReportedSim): string {
  const parts = [
    `SIM ${sim.slot + 1}`,
    sim.label,
    sim.carrier && sim.carrier !== sim.label ? sim.carrier : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
