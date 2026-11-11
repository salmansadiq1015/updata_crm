import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const vehicle = {
  _id: 'v1', kennzeichen: 'ZH 128 540', label: 'Servicebus 1', make: 'VW', model: 'Crafter', status: 'available',
  mileageKm: 84200, meterUnit: 'km', alerts: [], health: 'ok',
};
const service = {
  create: jest.fn(async (data) => ({ ...vehicle, ...data, _id: 'new' })),
  update: jest.fn(async (_id, data) => ({ ...vehicle, ...data })),
  getById: jest.fn(async () => vehicle),
  findByPlateOrName: jest.fn(async () => [vehicle]),
  list: jest.fn(async () => ({ items: [vehicle], total: 1 })),
  assignDriver: jest.fn(async () => ({ ...vehicle, currentDriverId: { firstName: 'Thomas', lastName: 'Keller' } })),
  addService: jest.fn(async (_id, data) => ({ _id: 's1', ...data })),
  addCost: jest.fn(async (_id, data) => ({ _id: 'c1', currency: 'CHF', ...data })),
  addBooking: jest.fn(async (_id, data) => ({ _id: 'b1', ...data })),
};
jest.unstable_mockModule('../../src/modules/vehicles/vehicle.service.js', () => ({ default: service }));

const {
  executeFleetCapability, sanitizeVehicleDraft, classifyFleetAction, FLEET_ACTIONS, assetTypeFromText,
} = await import('../../src/modules/ai/capabilities/fleet.capabilities.js');
const { riskLevelFor, ACTION_LABELS } = await import('../../src/modules/ai/governance/agent.risk.js');
const { PLANNER_ACTIONS } = await import('../../src/modules/ai/agent/llmPlanner.service.js');

const helpers = {
  needsFollowUp: (action, missingFields) => ({ action, status: 'needs_follow_up', missingFields }),
  summarizeContext: () => ({}),
};
const run = (action, draft, extra = {}) => executeFleetCapability({
  action,
  input: extra.input || 'x',
  context: { llmDraft: { vehicle: sanitizeVehicleDraft(draft), ...(extra.llm || {}) }, requestContext: extra.requestContext || {}, ...(extra.context || {}) },
  userId: 'u1',
  state: { permissions: extra.permissions || ['vehicles:write'] },
  helpers,
});

beforeEach(() => jest.clearAllMocks());

describe('planner vocabulary and governance', () => {
  test('every fleet action is plannable, low risk and labelled', () => {
    for (const action of Object.values(FLEET_ACTIONS)) {
      expect(PLANNER_ACTIONS).toContain(action);
      expect(riskLevelFor(action)).toBe('LOW');
      expect(ACTION_LABELS[action]).toBeTruthy();
    }
  });

  test('draft sanitising whitelists enums, parses Swiss numbers and drops junk', () => {
    const d = sanitizeVehicleDraft({
      plate: ' ZH 1 ', meterReading: "90'000", year: '2022', assetType: 'Truck', fuelType: 'kerosene',
      nextServiceDate: '2026-12-01', insuranceExpiry: 'next year', currency: 'eur', $where: 'evil', amount: -5,
    });
    expect(d).toMatchObject({ plate: 'ZH 1', meterReading: 90000, year: 2022, assetType: 'truck', fuelType: null, nextServiceDate: '2026-12-01', insuranceExpiry: null, currency: 'EUR', amount: null });
    expect(d).not.toHaveProperty('$where');
    expect(sanitizeVehicleDraft({})).toBeNull();
    expect(sanitizeVehicleDraft('nope')).toBeNull();
  });

  test('keyword fallback routes fleet phrases and leaves others alone', () => {
    expect(classifyFleetAction('Neues Fahrzeug ZH 1 anlegen')).toBe('CREATE_VEHICLE');
    expect(classifyFleetAction('Welche Fahrzeuge sind fällig?')).toBe('FLEET_DUE');
    expect(classifyFleetAction('Fahrzeug ZH 1 getankt 60 Liter')).toBe('LOG_VEHICLE_COST');
    expect(classifyFleetAction('Erstelle eine Aufgabe für Kunde Meier')).toBeNull();
    expect(classifyFleetAction('Fahrzeug BE 1 Ölwechsel bei AMAG')).toBe('LOG_VEHICLE_SERVICE');
  });

  test('a named kind of vehicle filters the search even when the planner left it out', async () => {
    expect(assetTypeFromText('Show me all forklifts')).toBe('forklift');
    expect(assetTypeFromText('Zeig mir alle Lastwagen')).toBe('truck');
    expect(assetTypeFromText('Servicebus 1')).toBeNull();
    const out = await run('SEARCH_VEHICLES', {}, { input: 'Show me all forklifts', llm: { listAll: true } });
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ assetType: 'forklift' }));
    expect(out.status).toBe('completed');
  });
});

describe('execution', () => {
  test('RBAC: readers cannot write, but may search and book', async () => {
    const denied = await run('CREATE_VEHICLE', { plate: 'ZH 9' }, { permissions: ['vehicles:read'] });
    expect(denied).toMatchObject({ status: 'failed', error: { code: 'RBAC_DENIED' } });
    expect(service.create).not.toHaveBeenCalled();
    await expect(run('SEARCH_VEHICLES', { plate: 'ZH' }, { permissions: ['vehicles:read'] })).resolves.toMatchObject({ status: 'completed' });
    expect((await run('UPDATE_VEHICLE', { plate: 'ZH 1', status: 'workshop' }, { permissions: [] })).status).toBe('failed');
  });

  test('create maps planner fields onto the vehicle and links the record', async () => {
    const out = await run('CREATE_VEHICLE', { plate: 'BE 5', make: 'MAN', assetType: 'truck', meterReading: 1200 });
    expect(service.create).toHaveBeenCalledWith(
      { kennzeichen: 'BE 5', make: 'MAN', assetType: 'truck', mileageKm: 1200 }, 'u1', { source: 'ai-agent' },
    );
    expect(out).toMatchObject({ status: 'completed', recordType: 'vehicle', recordId: 'new' });
  });

  test('create without a plate asks for it; a duplicate plate becomes a follow-up', async () => {
    expect(await run('CREATE_VEHICLE', { make: 'VW' })).toMatchObject({ status: 'needs_follow_up', missingFields: ['license plate'] });
    service.create.mockRejectedValueOnce(Object.assign(new Error('exists'), { statusCode: 409, data: { vehicleId: 'v1' } }));
    expect(await run('CREATE_VEHICLE', { plate: 'ZH 128 540' })).toMatchObject({ status: 'needs_follow_up', recordId: 'v1' });
  });

  test('update resolves the vehicle by plate, else from the page being viewed', async () => {
    await run('UPDATE_VEHICLE', { plate: 'ZH128540', meterReading: 90000, status: 'workshop' });
    expect(service.update).toHaveBeenCalledWith('v1', { mileageKm: 90000, status: 'workshop' }, 'u1', { source: 'ai-agent' });

    await run('UPDATE_VEHICLE', { insuranceExpiry: '2027-03-01' }, { requestContext: { contextRecordType: 'vehicle', contextRecordId: 'v1' } });
    expect(service.getById).toHaveBeenCalledWith('v1');
    expect(service.update).toHaveBeenLastCalledWith('v1', { insuranceExpiry: '2027-03-01' }, 'u1', { source: 'ai-agent' });

    expect(await run('UPDATE_VEHICLE', { status: 'workshop' })).toMatchObject({ status: 'needs_follow_up' });
  });

  test('ambiguous or unknown plates ask instead of guessing', async () => {
    service.findByPlateOrName.mockResolvedValueOnce([vehicle, { ...vehicle, _id: 'v2', kennzeichen: 'ZH 128 541' }]);
    const many = await run('UPDATE_VEHICLE', { plate: 'ZH 128', status: 'workshop' });
    expect(many.status).toBe('needs_follow_up');
    expect(many.records).toHaveLength(2);
    service.findByPlateOrName.mockResolvedValueOnce([]);
    expect((await run('UPDATE_VEHICLE', { plate: 'XX', status: 'workshop' })).status).toBe('needs_follow_up');
    expect(service.update).not.toHaveBeenCalled();
  });

  test('driver assignment uses the resolved person and refuses ambiguity', async () => {
    const ok = await run('ASSIGN_VEHICLE_DRIVER', { plate: 'ZH 1' }, { context: { assignee: { _id: 'p1' } } });
    expect(service.assignDriver).toHaveBeenCalledWith('v1', 'p1', 'u1', { source: 'ai-agent' });
    expect(ok.message).toContain('Thomas Keller');
    const amb = await run('ASSIGN_VEHICLE_DRIVER', { plate: 'ZH 1' }, { context: { assigneeCandidates: [{}, {}] } });
    expect(amb.status).toBe('needs_follow_up');
    await run('ASSIGN_VEHICLE_DRIVER', { plate: 'ZH 1', unassignDriver: true });
    expect(service.assignDriver).toHaveBeenLastCalledWith('v1', null, 'u1', { source: 'ai-agent' });
  });

  test('service and cost logs carry meter, garage and energy units', async () => {
    await run('LOG_VEHICLE_SERVICE', { plate: 'ZH 1', meterReading: 85000, amount: 1200, garage: 'AMAG', date: '2026-11-10' }, { llm: { description: 'Grosser Service' } });
    expect(service.addService).toHaveBeenCalledWith('v1', expect.objectContaining({
      type: 'maintenance', date: '2026-11-10', description: 'Grosser Service', mileageKm: 85000, garage: 'AMAG', cost: 1200,
    }), 'u1', { source: 'ai-agent' });

    await run('LOG_VEHICLE_COST', { plate: 'ZH 1', costType: 'charging', amount: 18.5, quantity: 42 });
    expect(service.addCost).toHaveBeenCalledWith('v1', expect.objectContaining({ type: 'charging', amount: 18.5, quantity: 42, quantityUnit: 'kwh' }), 'u1', { source: 'ai-agent' });
    expect((await run('LOG_VEHICLE_COST', { plate: 'ZH 1', costType: 'fuel' })).status).toBe('needs_follow_up');
  });

  test('booking books for the caller unless a manager names someone; clashes become follow-ups', async () => {
    const start = '2026-12-01T08:00:00.000Z';
    await run('BOOK_VEHICLE', { plate: 'ZH 1' }, { permissions: ['vehicles:read'], llm: { dateTime: start, durationHours: 2 }, context: { assignee: { _id: 'p9' } } });
    const [, data, actor] = service.addBooking.mock.calls[0];
    expect(data).toMatchObject({ bookedFor: 'u1' });
    expect(new Date(data.end) - new Date(data.start)).toBe(2 * 3_600_000);
    expect(actor).toEqual({ _id: 'u1', canWrite: false });

    service.addBooking.mockRejectedValueOnce(Object.assign(new Error('already booked'), { statusCode: 409 }));
    expect((await run('BOOK_VEHICLE', { plate: 'ZH 1' }, { llm: { dateTime: start } })).status).toBe('needs_follow_up');
  });
});
