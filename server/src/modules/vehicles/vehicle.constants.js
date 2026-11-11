/**
 * Shared vocabulary of the fleet module.
 *
 * The module began as a van list for one Swiss HVAC firm. These lists make it
 * industry-neutral: a logistics firm runs trucks and trailers, a construction
 * firm runs excavators metered in operating hours, a care service runs cars
 * and e-bikes. Every list is additive, so existing records stay valid.
 */

export const VEHICLE_STATUSES = ['available', 'in_use', 'reserved', 'workshop', 'out_of_service', 'retired'];

export const VEHICLE_ASSET_TYPES = [
  'car', 'van', 'truck', 'bus', 'pickup', 'motorcycle', 'trailer',
  'construction', 'forklift', 'agricultural', 'boat', 'ebike', 'other',
];

export const VEHICLE_FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid', 'plugin_hybrid', 'lpg', 'cng', 'hydrogen', 'none', 'other'];

/** km and mi for road vehicles, h (operating hours) for machinery. */
export const VEHICLE_METER_UNITS = ['km', 'mi', 'h'];

export const VEHICLE_TRANSMISSIONS = ['manual', 'automatic', 'none'];

export const VEHICLE_OWNERSHIP_TYPES = ['owned', 'leased', 'financed', 'rented', 'employee_owned'];

export const VEHICLE_SERVICE_TYPES = ['maintenance', 'repair', 'inspection', 'tires', 'bodywork', 'cleaning', 'other'];

export const VEHICLE_COST_TYPES = ['fuel', 'charging', 'toll', 'parking', 'insurance', 'tax', 'leasing', 'fine', 'cleaning', 'accessories', 'other'];

export const VEHICLE_BOOKING_STATUSES = ['confirmed', 'cancelled'];

/** How far ahead a date counts as "due soon". */
export const DUE_SOON_DAYS = 30;

/** Meter distance before the service threshold that counts as "due soon". */
export const DUE_SOON_METER = { km: 1500, mi: 1000, h: 50 };

/** Compliance dates checked for alerts, in display order. */
export const COMPLIANCE_DATE_FIELDS = [
  'nextServiceDate', 'inspectionDue', 'insuranceExpiry', 'registrationExpiry', 'emissionTestDue', 'contractEnd',
];

/** Normalised plate used for duplicate detection and plate search ("ZH 128 540" → "ZH128540"). */
export function plateKeyOf(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
