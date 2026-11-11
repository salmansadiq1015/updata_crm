import { COMPLIANCE_DATE_FIELDS, DUE_SOON_DAYS, DUE_SOON_METER } from './vehicle.constants.js';

const DAY_MS = 86_400_000;

/**
 * What needs attention on one vehicle, most urgent first.
 *
 * Pure: the list, the detail page, the stats tiles and the AI agent all read
 * the same answer. Each alert is { kind, field, level: 'overdue'|'due_soon',
 * dueDate?, daysLeft?, remaining? }.
 */
export function vehicleAlerts(vehicle, now = new Date()) {
  if (!vehicle || vehicle.status === 'retired') return [];
  const alerts = [];
  const today = now.getTime();

  for (const field of COMPLIANCE_DATE_FIELDS) {
    const value = vehicle[field];
    if (!value) continue;
    const due = new Date(value).getTime();
    if (Number.isNaN(due)) continue;
    const daysLeft = Math.ceil((due - today) / DAY_MS);
    if (daysLeft > DUE_SOON_DAYS) continue;
    alerts.push({
      kind: field === 'nextServiceDate' ? 'service' : field,
      field,
      level: daysLeft < 0 ? 'overdue' : 'due_soon',
      dueDate: new Date(due).toISOString(),
      daysLeft,
    });
  }

  if (vehicle.nextServiceKm != null && vehicle.mileageKm != null) {
    const unit = vehicle.meterUnit || 'km';
    const remaining = Number(vehicle.nextServiceKm) - Number(vehicle.mileageKm);
    if (remaining <= (DUE_SOON_METER[unit] ?? DUE_SOON_METER.km)) {
      alerts.push({
        kind: 'service',
        field: 'nextServiceKm',
        level: remaining < 0 ? 'overdue' : 'due_soon',
        remaining,
        unit,
      });
    }
  }

  const rank = (a) => (a.level === 'overdue' ? 0 : 1);
  // Meter alerts have no date; they follow the dated ones of the same level.
  const days = (a) => (a.daysLeft ?? Number.MAX_SAFE_INTEGER);
  return alerts.sort((a, b) => rank(a) - rank(b) || days(a) - days(b));
}

/** 'overdue' | 'due_soon' | 'ok' — the worst level among a vehicle's alerts. */
export function healthOf(alerts) {
  if (alerts.some((a) => a.level === 'overdue')) return 'overdue';
  if (alerts.length) return 'due_soon';
  return 'ok';
}

/**
 * Mongo filter matching vehicles with something due within the window, by
 * date or by meter. Used for the "needs attention" list filter and stats.
 */
export function attentionFilter(now = new Date()) {
  const horizon = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
  return {
    status: { $ne: 'retired' },
    $or: [
      ...COMPLIANCE_DATE_FIELDS.map((field) => ({ [field]: { $ne: null, $lte: horizon } })),
      {
        $expr: {
          $and: [
            { $ne: [{ $ifNull: ['$nextServiceKm', null] }, null] },
            {
              $lte: [
                { $subtract: ['$nextServiceKm', { $ifNull: ['$mileageKm', 0] }] },
                { $switch: { branches: [{ case: { $eq: ['$meterUnit', 'h'] }, then: DUE_SOON_METER.h }, { case: { $eq: ['$meterUnit', 'mi'] }, then: DUE_SOON_METER.mi }], default: DUE_SOON_METER.km } },
              ],
            },
          ],
        },
      },
    ],
  };
}
