import config from '../../config/index.js';

/**
 * Default maintenance interval templates per installation type.
 *
 * Single source of truth for the intervals auto-created when an installation
 * is created (CRM-005 AC-5 / CRM-007 AC-4). Each template is
 * `{ maintenanceType, frequencyMonths }`.
 *
 * These can be overridden — per installation type — without code changes via
 * the `MAINTENANCE_TEMPLATES_JSON` env var (parsed into `config.maintenance.templates`).
 * An override for a given type fully replaces the built-in list for that type;
 * types not present in the override keep their built-in defaults.
 */
export const DEFAULT_MAINTENANCE_TEMPLATES = Object.freeze({
  boiler: [{ maintenanceType: 'annual_service', frequencyMonths: 12 }],
  heat_pump: [{ maintenanceType: 'annual_service', frequencyMonths: 12 }],
  solar_thermal: [{ maintenanceType: 'general_inspection', frequencyMonths: 12 }],
  radiator_system: [{ maintenanceType: 'general_inspection', frequencyMonths: 24 }],
  ventilation: [{ maintenanceType: 'filter_change', frequencyMonths: 6 }],
  hot_water: [{ maintenanceType: 'annual_service', frequencyMonths: 12 }],
});

/**
 * Resolve the effective maintenance templates, merging any configured override
 * (keyed by installation type) over the built-in defaults. Returns a plain
 * object keyed by installation type. When no override is configured the result
 * is behaviourally identical to {@link DEFAULT_MAINTENANCE_TEMPLATES}.
 */
export function getMaintenanceTemplates() {
  const overrides = config.maintenance?.templates;
  if (!overrides) return { ...DEFAULT_MAINTENANCE_TEMPLATES };
  return { ...DEFAULT_MAINTENANCE_TEMPLATES, ...overrides };
}

/**
 * Resolve the template list for a single installation type (empty array if none).
 */
export function getTemplatesForType(type) {
  return getMaintenanceTemplates()[type] || [];
}

export default getMaintenanceTemplates;
