import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fleetTranslations } from '../fleet-translations';
import {
  VEHICLE_STATUSES, VEHICLE_ASSET_TYPES, VEHICLE_FUEL_TYPES, VEHICLE_OWNERSHIP_TYPES,
  VEHICLE_SERVICE_TYPES, VEHICLE_COST_TYPES, VEHICLE_TRANSMISSIONS, VEHICLE_METER_UNITS,
} from '../../../modules/vehicles/lib/fleet-meta';

/** Fleet module: complete locales, intact placeholders, every literal key used in the module defined. */
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
const en = fleetTranslations.en;

function sources(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(js|jsx)$/.test(f) ? [readFileSync(p, 'utf8')] : [];
  });
}

describe('fleet translations', () => {
  it.each(['de', 'fr', 'ar'])('%s has every key, non-empty, with the same placeholders', (locale) => {
    const dict = fleetTranslations[locale];
    for (const [key, value] of Object.entries(en)) {
      expect(dict[key], `${locale}:${key}`).toBeTruthy();
      expect(placeholders(dict[key]), `${locale}:${key}`).toEqual(placeholders(value));
    }
  });

  it('defines every literal fleet.* key the module uses', () => {
    const code = sources(path.resolve(__dirname, '../../../modules/vehicles')).join('\n');
    const used = [...code.matchAll(/t\(\s*'(fleet\.[\w.]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(100);
    expect(used.filter((k) => !en[k])).toEqual([]);
  });

  it('labels every enum value the server accepts', () => {
    const groups = {
      status: VEHICLE_STATUSES, type: VEHICLE_ASSET_TYPES, fuel: VEHICLE_FUEL_TYPES, ownership: VEHICLE_OWNERSHIP_TYPES,
      serviceType: VEHICLE_SERVICE_TYPES, cost: VEHICLE_COST_TYPES, transmission: VEHICLE_TRANSMISSIONS, unit: VEHICLE_METER_UNITS,
    };
    const missing = Object.entries(groups).flatMap(([g, values]) => values.map((v) => `fleet.${g}.${v}`)).filter((k) => !en[k]);
    expect(missing).toEqual([]);
  });
});
