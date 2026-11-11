/**
 * Fleet capabilities of the ERP agent: the assistant (chat, voice orb, voice
 * sessions) creates, updates and looks up vehicles through the same planner →
 * governance gate → capability path as every other action.
 *
 * Everything the agent writes goes through vehicleService, so plate
 * de-duplication, audit trail, meter syncing and booking overlap rules are the
 * same as in the UI. The planner fills `params.vehicle`; this module validates
 * it against the fleet vocabulary before anything is written.
 */
import {
  VEHICLE_STATUSES, VEHICLE_ASSET_TYPES, VEHICLE_FUEL_TYPES, VEHICLE_METER_UNITS,
  VEHICLE_SERVICE_TYPES, VEHICLE_COST_TYPES, plateKeyOf,
} from '../../vehicles/vehicle.constants.js';

export const FLEET_ACTIONS = Object.freeze({
  CREATE_VEHICLE: 'CREATE_VEHICLE',
  UPDATE_VEHICLE: 'UPDATE_VEHICLE',
  SEARCH_VEHICLES: 'SEARCH_VEHICLES',
  FLEET_DUE: 'FLEET_DUE',
  ASSIGN_VEHICLE_DRIVER: 'ASSIGN_VEHICLE_DRIVER',
  LOG_VEHICLE_SERVICE: 'LOG_VEHICLE_SERVICE',
  LOG_VEHICLE_COST: 'LOG_VEHICLE_COST',
  BOOK_VEHICLE: 'BOOK_VEHICLE',
});

/** Planner rules appended to the system prompt. */
export const FLEET_PLANNER_RULES = `- Fleet / vehicles / machines (Fahrzeug, Auto, Lieferwagen, LKW, Bus, Anhänger, Bagger, Stapler, Flotte, Kennzeichen, véhicule, veicolo):
  - Create one ("Neues Fahrzeug ZH 123 456, VW Crafter Diesel 2022", "Add a truck BE 12345") → CREATE_VEHICLE.
  - Change one ("Kilometerstand von ZH 128 540 auf 90'000", "Set BE 245 118 to workshop", "Versicherung läuft am 1.3. ab") → UPDATE_VEHICLE.
  - Find / list ("Welche Fahrzeuge sind verfügbar?", "Zeig mir den VW Crafter", "Wer fährt ZH 128 540?", "Show me all forklifts") → SEARCH_VEHICLES; set vehicle.status when a status is asked for and vehicle.assetType when a kind of vehicle is named (forklifts → forklift, Lastwagen → truck, Bagger → construction).
  - What is due ("Welche Fahrzeuge brauchen Service?", "Läuft eine Versicherung bald ab?", "fleet alerts") → FLEET_DUE.
  - Give / take a car to a person ("Thomas fährt ab jetzt ZH 128 540", "Fahrer von BE 245 118 entfernen") → ASSIGN_VEHICLE_DRIVER with assigneeName, or vehicle.unassignDriver=true.
  - A completed service, repair, inspection or tyre change on a named vehicle ("ZH 128 540 war heute im Service bei AMAG, 1200 CHF, 85'000 km", "BE 1 was serviced today at AMAG, oil change, 640 CHF", "Reifenwechsel beim Bagger") → LOG_VEHICLE_SERVICE, never SERVICE_DUE, CREATE_REPORT or GENERAL; description = the work done in the user's words, vehicle.garage = the workshop, vehicle.amount = the cost.
  - A fuel fill, charge, toll, parking, fine… ("Getankt 60 Liter für 110 CHF bei 86'000 km") → LOG_VEHICLE_COST.
  - Reserve a pool vehicle ("Reservier mir die Zoe morgen 8 bis 12") → BOOK_VEHICLE with dateTime = start and durationHours.
  - params.vehicle fields: plate (the plate as said, used to find the vehicle), newPlate (only when renaming the plate), label, make, model, assetType (${VEHICLE_ASSET_TYPES.join('|')}), fuelType (${VEHICLE_FUEL_TYPES.join('|')}), year, meterReading (number, odometer or operating hours), meterUnit (km|mi|h), status (${VEHICLE_STATUSES.join('|')}), vin, color, department, location, date (YYYY-MM-DD of a service or cost, default today), nextServiceDate, nextServiceKm, inspectionDue, insuranceExpiry, registrationExpiry (all dates YYYY-MM-DD), serviceType (${VEHICLE_SERVICE_TYPES.join('|')}), costType (${VEHICLE_COST_TYPES.join('|')}), amount (money, number), currency (ISO, default CHF), quantity (litres or kWh), garage (workshop or vendor name), unassignDriver (boolean). Swiss thousands separators ("90'000") are numbers. Never invent values; unknown fields stay null.`;

const PERMISSIONS = {
  read: ['vehicles:read', 'vehicles:write'],
  write: ['vehicles:write'],
};

const CAPABILITIES = Object.freeze({
  [FLEET_ACTIONS.CREATE_VEHICLE]: { access: 'write', fields: ['license plate'], execute: createVehicle },
  [FLEET_ACTIONS.UPDATE_VEHICLE]: { access: 'write', fields: ['vehicle (license plate)', 'field to change'], execute: updateVehicle },
  [FLEET_ACTIONS.SEARCH_VEHICLES]: { access: 'read', fields: ['vehicle search term'], execute: searchVehicles },
  [FLEET_ACTIONS.FLEET_DUE]: { access: 'read', fields: [], execute: fleetDue },
  [FLEET_ACTIONS.ASSIGN_VEHICLE_DRIVER]: { access: 'write', fields: ['vehicle (license plate)', 'driver'], execute: assignDriver },
  [FLEET_ACTIONS.LOG_VEHICLE_SERVICE]: { access: 'write', fields: ['vehicle (license plate)', 'work done'], execute: logService },
  [FLEET_ACTIONS.LOG_VEHICLE_COST]: { access: 'write', fields: ['vehicle (license plate)', 'cost type and amount'], execute: logCost },
  [FLEET_ACTIONS.BOOK_VEHICLE]: { access: 'read', fields: ['vehicle (license plate)', 'start date and time'], execute: bookVehicle },
});

export function isFleetCapabilityAction(action) {
  return Boolean(CAPABILITIES[action]);
}

export function getFleetCapabilityFields(action) {
  return CAPABILITIES[action]?.fields || ['details'];
}

/** Keyword fallback when the LLM planner is unavailable. */
const FLEET_WORDS = ['fahrzeug', 'vehicle', 'véhicule', 'vehicule', 'veicolo', 'flotte', 'fleet', 'kennzeichen', 'license plate', 'licence plate', 'nummernschild', 'lieferwagen', 'firmenwagen', 'firmenauto', 'poolfahrzeug', 'lkw', 'bagger', 'stapler', 'anhänger', 'excavator', 'forklift', 'trailer'];

export function classifyFleetAction(text) {
  const t = String(text || '').toLowerCase();
  if (!FLEET_WORDS.some((w) => t.includes(w))) return null;
  const has = (words) => words.some((w) => t.includes(w));
  if (has(['fällig', 'faellig', 'due', 'overdue', 'überfällig', 'abläuft', 'ablauf', 'expir', 'alerts', 'warnung'])) return FLEET_ACTIONS.FLEET_DUE;
  if (has(['reservier', 'buche ', 'book ', 'booking', 'reserve'])) return FLEET_ACTIONS.BOOK_VEHICLE;
  if (has(['getankt', 'tank', 'fuel', 'geladen', 'charging', 'maut', 'toll', 'parking', 'parkgebühr', 'busse'])) return FLEET_ACTIONS.LOG_VEHICLE_COST;
  if (has(['service erfass', 'im service', 'repariert', 'repaired', 'repair', 'serviced', 'wartung erfass', 'ölwechsel', 'oil change', 'reifenwechsel'])) return FLEET_ACTIONS.LOG_VEHICLE_SERVICE;
  if (has(['fahrer', 'driver', 'fährt ab', 'zuweisen', 'assign'])) return FLEET_ACTIONS.ASSIGN_VEHICLE_DRIVER;
  if (has(['neues fahrzeug', 'neuen fahrzeug', 'fahrzeug anlegen', 'fahrzeug erfassen', 'add vehicle', 'new vehicle', 'create vehicle', 'add a truck', 'add a car', 'add a van'])) return FLEET_ACTIONS.CREATE_VEHICLE;
  if (has(['ändere', 'aendere', 'aktualisier', 'update', 'set ', 'setze', 'kilometerstand', 'mileage', 'status'])) return FLEET_ACTIONS.UPDATE_VEHICLE;
  return FLEET_ACTIONS.SEARCH_VEHICLES;
}

// ── Draft sanitising ───────────────────────────────────────────────────────

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/['’\s]/g, '').replace(/,(?=\d{3}\b)/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const str = (v, max = 160) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const oneOf = (v, list) => (typeof v === 'string' && list.includes(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null);
const isoDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v.trim())) return null;
  const d = new Date(`${v.trim().slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/** Whitelists and types the planner's `vehicle` object. */
export function sanitizeVehicleDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const draft = {
    plate: str(raw.plate, 30),
    newPlate: str(raw.newPlate, 30),
    label: str(raw.label, 120),
    make: str(raw.make, 80),
    model: str(raw.model, 120),
    assetType: oneOf(raw.assetType, VEHICLE_ASSET_TYPES),
    fuelType: oneOf(raw.fuelType, VEHICLE_FUEL_TYPES),
    year: (() => { const y = num(raw.year); return y && y >= 1950 && y <= 2100 ? Math.round(y) : null; })(),
    meterReading: num(raw.meterReading),
    meterUnit: oneOf(raw.meterUnit, VEHICLE_METER_UNITS),
    status: oneOf(raw.status, VEHICLE_STATUSES),
    vin: str(raw.vin, 40),
    color: str(raw.color, 40),
    department: str(raw.department, 120),
    location: str(raw.location, 160),
    date: isoDate(raw.date),
    nextServiceDate: isoDate(raw.nextServiceDate),
    nextServiceKm: num(raw.nextServiceKm),
    inspectionDue: isoDate(raw.inspectionDue),
    insuranceExpiry: isoDate(raw.insuranceExpiry),
    registrationExpiry: isoDate(raw.registrationExpiry),
    serviceType: oneOf(raw.serviceType, VEHICLE_SERVICE_TYPES),
    costType: oneOf(raw.costType, VEHICLE_COST_TYPES),
    amount: num(raw.amount),
    currency: typeof raw.currency === 'string' && /^[A-Za-z]{3}$/.test(raw.currency.trim()) ? raw.currency.trim().toUpperCase() : null,
    quantity: num(raw.quantity),
    garage: str(raw.garage, 160),
    unassignDriver: raw.unassignDriver === true,
  };
  return Object.values(draft).some((v) => v !== null && v !== false) ? draft : null;
}

// ── Execution ──────────────────────────────────────────────────────────────

export async function executeFleetCapability({ action, input, context, userId, state = {}, helpers }) {
  const capability = CAPABILITIES[action];
  if (!capability) return helpers.needsFollowUp(action, ['action'], context);

  const permissions = state.permissions || [];
  const allowed = permissions.includes('*') || PERMISSIONS[capability.access].some((p) => permissions.includes(p));
  if (!allowed) {
    const required = PERMISSIONS[capability.access][0];
    return {
      action,
      status: 'failed',
      error: { code: 'RBAC_DENIED', message: `Missing permission '${required}'` },
      message: 'Für diese Aktion fehlt Ihnen die Berechtigung.',
      missingFields: ['permission'],
      requiredPermission: required,
    };
  }

  const service = (await import('../../vehicles/vehicle.service.js')).default;
  const draft = context.llmDraft?.vehicle || sanitizeVehicleDraft(heuristicDraft(input)) || {};
  return capability.execute({ action, input, context, userId, state, helpers, service, draft });
}

/** Without the planner, at least the plate and a meter reading can be read off the text. */
function heuristicDraft(input) {
  const text = String(input || '');
  const plate = text.match(/\b([A-Z]{1,3}[-\s]?\d{1,3}(?:[\s']?\d{3}){0,2})\b/)?.[1] || null;
  const meter = text.match(/(\d{1,3}(?:['’.\s]?\d{3})+|\d{4,7})\s*(km|kilometer|h\b|stunden)/i);
  return {
    plate,
    meterReading: meter ? meter[1] : null,
    meterUnit: meter && /^h|stunden/i.test(meter[2]) ? 'h' : null,
  };
}

const NUMBER_FMT = (n) => Number(n).toLocaleString('de-CH');
const unitOf = (v) => v?.meterUnit || 'km';

function compactVehicle(v) {
  if (!v) return null;
  const driver = v.currentDriverId && typeof v.currentDriverId === 'object'
    ? [v.currentDriverId.firstName, v.currentDriverId.lastName].filter(Boolean).join(' ') || null
    : null;
  return {
    id: v._id,
    plate: v.kennzeichen,
    label: v.label || null,
    vehicle: [v.make, v.model].filter(Boolean).join(' ') || null,
    assetType: v.assetType || null,
    status: v.status,
    meter: v.mileageKm != null ? `${NUMBER_FMT(v.mileageKm)} ${unitOf(v)}` : null,
    driver,
    nextServiceDate: v.nextServiceDate || null,
    alerts: (v.alerts || []).map((a) => `${a.kind}:${a.level}`),
  };
}

const vehicleName = (v) => [v.kennzeichen, v.label || [v.make, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

/**
 * Finds the one vehicle meant: the plate said, else the page the person is
 * standing on. Returns { vehicle } or a follow-up result.
 */
async function resolveVehicle({ action, draft, context, helpers, service }) {
  const requestContext = context.requestContext || {};
  const term = draft.plate || context.llmDraft?.searchTerm || null;
  if (!term && String(requestContext.contextRecordType || '').toLowerCase() === 'vehicle' && requestContext.contextRecordId) {
    try {
      return { vehicle: await service.getById(requestContext.contextRecordId) };
    } catch { /* fall through to asking */ }
  }
  if (!term) return { followUp: helpers.needsFollowUp(action, ['vehicle (license plate)'], context) };

  const matches = await service.findByPlateOrName(term, 5);
  if (matches.length === 1) return { vehicle: matches[0] };
  if (!matches.length) {
    return {
      followUp: {
        action,
        status: 'needs_follow_up',
        message: `Ich habe kein Fahrzeug „${term}“ gefunden.`,
        followUpQuestions: ['Welches Kennzeichen hat das Fahrzeug?'],
        missingFields: ['vehicle (license plate)'],
      },
    };
  }
  return {
    followUp: {
      action,
      status: 'needs_follow_up',
      message: `Mehrere Fahrzeuge passen zu „${term}“.`,
      followUpQuestions: [`Welches meinen Sie: ${matches.map(vehicleName).join(', ')}?`],
      missingFields: ['vehicle (license plate)'],
      records: matches.map(compactVehicle),
    },
  };
}

/** Vehicle fields the agent may set, from the sanitised draft. */
function vehicleFieldsFrom(draft) {
  const out = {};
  const map = {
    label: 'label', make: 'make', model: 'model', assetType: 'assetType', fuelType: 'fuelType', year: 'year',
    meterReading: 'mileageKm', meterUnit: 'meterUnit', status: 'status', vin: 'vin', color: 'color',
    department: 'department', location: 'location', nextServiceDate: 'nextServiceDate', nextServiceKm: 'nextServiceKm',
    inspectionDue: 'inspectionDue', insuranceExpiry: 'insuranceExpiry', registrationExpiry: 'registrationExpiry', currency: 'currency',
  };
  for (const [from, to] of Object.entries(map)) {
    if (draft[from] !== null && draft[from] !== undefined) out[to] = draft[from];
  }
  return out;
}

function conflictResult(action, err) {
  return {
    action,
    status: 'needs_follow_up',
    message: err.message,
    followUpQuestions: ['Möchten Sie stattdessen das bestehende Fahrzeug ändern oder ein anderes Kennzeichen verwenden?'],
    missingFields: ['license plate'],
    ...(err.data?.vehicleId ? { recordType: 'vehicle', recordId: err.data.vehicleId } : {}),
  };
}

async function createVehicle({ action, draft, context, userId, helpers, service }) {
  const plate = draft.newPlate || draft.plate;
  if (!plate) return helpers.needsFollowUp(action, ['license plate'], context);
  try {
    const vehicle = await service.create({ kennzeichen: plate, ...vehicleFieldsFrom(draft) }, userId, { source: 'ai-agent' });
    return {
      action,
      status: 'completed',
      message: `Fahrzeug ${vehicleName(vehicle)} erfasst.`,
      recordType: 'vehicle',
      recordId: vehicle._id,
      record: compactVehicle(vehicle),
    };
  } catch (err) {
    if (err.statusCode === 409) return conflictResult(action, err);
    throw err;
  }
}

async function updateVehicle({ action, draft, context, userId, helpers, service }) {
  const resolved = await resolveVehicle({ action, draft, context, helpers, service });
  if (resolved.followUp) return resolved.followUp;
  const updates = vehicleFieldsFrom(draft);
  if (draft.newPlate && plateKeyOf(draft.newPlate) !== plateKeyOf(resolved.vehicle.kennzeichen)) updates.kennzeichen = draft.newPlate;
  if (!Object.keys(updates).length) {
    return helpers.needsFollowUp(action, ['what to change (meter reading, status, service date, insurance, …)'], context);
  }
  try {
    const vehicle = await service.update(resolved.vehicle._id, updates, userId, { source: 'ai-agent' });
    return {
      action,
      status: 'completed',
      message: `Fahrzeug ${vehicleName(vehicle)} aktualisiert (${Object.keys(updates).join(', ')}).`,
      recordType: 'vehicle',
      recordId: vehicle._id,
      record: compactVehicle(vehicle),
    };
  } catch (err) {
    if (err.statusCode === 409) return conflictResult(action, err);
    throw err;
  }
}

const TYPE_WORDS = [
  ['forklift', ['forklift', 'stapler', 'chariot']],
  ['construction', ['excavator', 'bagger', 'baumaschine', 'digger', 'pelle']],
  ['truck', ['truck', 'lastwagen', 'lkw', 'camion']],
  ['van', ['van', 'lieferwagen', 'transporter', 'fourgon']],
  ['bus', ['bus', 'coach', 'car postal']],
  ['trailer', ['trailer', 'anhänger', 'remorque']],
  ['motorcycle', ['motorcycle', 'motorrad', 'moto']],
  ['agricultural', ['tractor', 'traktor', 'tracteur']],
  ['boat', ['boat', 'boot', 'bateau']],
  ['ebike', ['e-bike', 'ebike', 'velo']],
  ['pickup', ['pickup', 'pick-up']],
];

/** A kind of vehicle named in the request, when the planner did not set one. */
export function assetTypeFromText(text) {
  const words = String(text || '').toLowerCase();
  for (const [type, list] of TYPE_WORDS) {
    if (list.some((w) => new RegExp(`(^|[^a-zäöüé])${w.replace('-', '\\-')}(s|en|n|e)?([^a-zäöüé]|$)`).test(words))) return type;
  }
  return null;
}

async function searchVehicles({ action, input, draft: rawDraft, context, service }) {
  const inferredType = rawDraft.assetType || assetTypeFromText(`${context.llmDraft?.searchTerm || ''} ${input}`);
  const draft = { ...rawDraft, assetType: inferredType };
  // A type word is a filter, not a plate or name to search for.
  const termIsType = inferredType && assetTypeFromText(context.llmDraft?.searchTerm || '') === inferredType;
  const term = draft.plate || (termIsType ? null : context.llmDraft?.searchTerm) || null;
  const listAll = context.llmDraft?.listAll || !term;
  const params = { limit: 15 };
  if (draft.status) params.status = draft.status;
  if (draft.assetType) params.assetType = draft.assetType;
  const vehicles = listAll
    ? (await service.list(params)).items
    : await service.findByPlateOrName(term, 15);
  const filtered = listAll ? vehicles : vehicles.filter((v) => (!draft.status || v.status === draft.status) && (!draft.assetType || v.assetType === draft.assetType));
  return {
    action,
    status: 'completed',
    message: filtered.length ? `${filtered.length} Fahrzeug${filtered.length === 1 ? '' : 'e'} gefunden.` : 'Keine Fahrzeuge gefunden.',
    ...(filtered.length === 1 ? { recordType: 'vehicle', recordId: filtered[0]._id } : {}),
    records: filtered.map(compactVehicle),
    query: input,
  };
}

const ALERT_LABEL = {
  service: 'Service', inspectionDue: 'Prüfung/MFK', insuranceExpiry: 'Versicherung',
  registrationExpiry: 'Zulassung', emissionTestDue: 'Abgaswartung', contractEnd: 'Vertragsende',
};

async function fleetDue({ action, service }) {
  const { items } = await service.list({ attention: true, limit: 50, sort: 'nextService' });
  const lines = items.map((v) => ({
    ...compactVehicle(v),
    due: v.alerts.map((a) => {
      const what = ALERT_LABEL[a.kind] || a.kind;
      if (a.field === 'nextServiceKm') return `${what} ${a.remaining < 0 ? `seit ${NUMBER_FMT(-a.remaining)}` : `in ${NUMBER_FMT(a.remaining)}`} ${a.unit}`;
      return `${what} ${a.daysLeft < 0 ? `seit ${-a.daysLeft} Tagen überfällig` : `in ${a.daysLeft} Tagen`}`;
    }),
  }));
  const overdue = items.filter((v) => v.health === 'overdue').length;
  return {
    action,
    status: 'completed',
    message: items.length
      ? `${items.length} Fahrzeug${items.length === 1 ? '' : 'e'} brauchen Aufmerksamkeit${overdue ? `, ${overdue} davon überfällig` : ''}.`
      : 'Bei keinem Fahrzeug ist in den nächsten 30 Tagen etwas fällig.',
    records: lines,
  };
}

async function assignDriver({ action, draft, context, userId, helpers, service }) {
  const resolved = await resolveVehicle({ action, draft, context, helpers, service });
  if (resolved.followUp) return resolved.followUp;
  let driverId = null;
  if (!draft.unassignDriver) {
    if (context.assigneeCandidates?.length > 1) return helpers.needsFollowUp(action, ['driver'], context);
    if (!context.assignee) return helpers.needsFollowUp(action, ['driver'], context);
    driverId = context.assignee._id;
  }
  const vehicle = await service.assignDriver(resolved.vehicle._id, driverId, userId, { source: 'ai-agent' });
  const record = compactVehicle(vehicle);
  return {
    action,
    status: 'completed',
    message: driverId ? `${record.driver} fährt jetzt ${vehicleName(vehicle)}.` : `Fahrer von ${vehicleName(vehicle)} entfernt.`,
    recordType: 'vehicle',
    recordId: vehicle._id,
    record,
  };
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });

async function logService({ action, input, draft, context, userId, helpers, service }) {
  const resolved = await resolveVehicle({ action, draft, context, helpers, service });
  if (resolved.followUp) return resolved.followUp;
  const description = context.llmDraft?.description || context.llmDraft?.title || null;
  if (!description) return helpers.needsFollowUp(action, ['work done'], context);
  const entry = await service.addService(resolved.vehicle._id, {
    type: draft.serviceType || 'maintenance',
    date: draft.date || today(),
    description,
    ...(draft.meterReading != null ? { mileageKm: draft.meterReading } : {}),
    ...(draft.garage ? { garage: draft.garage } : {}),
    ...(draft.amount != null ? { cost: draft.amount } : {}),
    ...(draft.currency ? { currency: draft.currency } : {}),
    ...(draft.nextServiceDate ? { nextServiceDate: draft.nextServiceDate } : {}),
    ...(draft.nextServiceKm != null ? { nextServiceKm: draft.nextServiceKm } : {}),
  }, userId, { source: 'ai-agent' });
  return {
    action,
    status: 'completed',
    message: `Service für ${vehicleName(resolved.vehicle)} erfasst: ${entry.description}.`,
    recordType: 'vehicle',
    recordId: resolved.vehicle._id,
    record: { id: entry._id, date: entry.date, type: entry.type, cost: entry.cost, garage: entry.garage, input },
  };
}

async function logCost({ action, draft, context, userId, helpers, service }) {
  const resolved = await resolveVehicle({ action, draft, context, helpers, service });
  if (resolved.followUp) return resolved.followUp;
  if (!draft.costType || draft.amount == null) return helpers.needsFollowUp(action, ['cost type and amount'], context);
  const isEnergy = ['fuel', 'charging'].includes(draft.costType);
  const entry = await service.addCost(resolved.vehicle._id, {
    type: draft.costType,
    date: draft.date || today(),
    amount: draft.amount,
    ...(draft.currency ? { currency: draft.currency } : {}),
    ...(isEnergy && draft.quantity != null ? { quantity: draft.quantity, quantityUnit: draft.costType === 'charging' ? 'kwh' : 'l' } : {}),
    ...(draft.meterReading != null ? { meterReading: draft.meterReading } : {}),
    ...(draft.garage ? { vendor: draft.garage } : {}),
  }, userId, { source: 'ai-agent' });
  return {
    action,
    status: 'completed',
    message: `${entry.amount.toFixed(2)} ${entry.currency} (${entry.type}) für ${vehicleName(resolved.vehicle)} erfasst.`,
    recordType: 'vehicle',
    recordId: resolved.vehicle._id,
    record: { id: entry._id, type: entry.type, amount: entry.amount, currency: entry.currency, date: entry.date },
  };
}

async function bookVehicle({ action, draft, context, userId, state, helpers, service }) {
  const resolved = await resolveVehicle({ action, draft, context, helpers, service });
  if (resolved.followUp) return resolved.followUp;
  const start = context.llmDraft?.dateTime ? new Date(context.llmDraft.dateTime) : null;
  if (!start || Number.isNaN(start.getTime())) return helpers.needsFollowUp(action, ['start date and time'], context);
  const hours = Number(context.llmDraft?.durationHours) || 4;
  const end = new Date(start.getTime() + hours * 3_600_000);
  const permissions = state.permissions || [];
  const canWrite = permissions.includes('*') || permissions.includes('vehicles:write');
  const bookedFor = canWrite && context.assignee?._id ? context.assignee._id : userId;
  try {
    const booking = await service.addBooking(resolved.vehicle._id, {
      start, end, bookedFor, purpose: context.llmDraft?.description || context.llmDraft?.title || null,
    }, { _id: userId, canWrite }, { source: 'ai-agent' });
    return {
      action,
      status: 'completed',
      message: `${vehicleName(resolved.vehicle)} reserviert.`,
      recordType: 'vehicle',
      recordId: resolved.vehicle._id,
      record: { id: booking._id, start: booking.start, end: booking.end, vehicle: resolved.vehicle.kennzeichen },
    };
  } catch (err) {
    if (err.statusCode === 409) {
      return {
        action,
        status: 'needs_follow_up',
        message: err.message,
        followUpQuestions: ['Soll ich einen anderen Zeitraum oder ein anderes Fahrzeug nehmen?'],
        missingFields: ['start date and time'],
      };
    }
    throw err;
  }
}
