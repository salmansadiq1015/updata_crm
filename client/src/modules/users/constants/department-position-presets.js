const ROLE_NAMES = Object.freeze({
  PROJECT_LEAD: 'Projektleiter',
  TECHNICIAN: 'Techniker',
  ACCOUNTANT: 'Buchhalter',
  DISPATCHER: 'Disponent',
  APPRENTICE: 'Lehrling',
  USER: 'User',
});

export const DEPARTMENT_POSITION_PRESETS = Object.freeze([
  {
    value: 'Projektleitung',
    label: 'Projektleitung',
    positions: [
      { value: 'Projektleiter', label: 'Projektleiter', roleName: ROLE_NAMES.PROJECT_LEAD },
    ],
  },
  {
    value: 'Technik',
    label: 'Technik',
    positions: [
      { value: 'Servicetechniker', label: 'Servicetechniker', roleName: ROLE_NAMES.TECHNICIAN },
      { value: 'Monteur', label: 'Monteur', roleName: ROLE_NAMES.TECHNICIAN },
      { value: 'Lehrling', label: 'Lehrling', roleName: ROLE_NAMES.APPRENTICE },
    ],
  },
  {
    value: 'Disposition',
    label: 'Disposition',
    positions: [
      { value: 'Disponent', label: 'Disponent', roleName: ROLE_NAMES.DISPATCHER },
      { value: 'Einsatzplaner', label: 'Einsatzplaner', roleName: ROLE_NAMES.DISPATCHER },
    ],
  },
  {
    value: 'Finanzen',
    label: 'Finanzen',
    positions: [
      { value: 'Buchhalter', label: 'Buchhalter', roleName: ROLE_NAMES.ACCOUNTANT },
      { value: 'Sachbearbeiter Finanzen', label: 'Sachbearbeiter Finanzen', roleName: ROLE_NAMES.ACCOUNTANT },
    ],
  },
  {
    value: 'Administration',
    label: 'Administration',
    positions: [
      { value: 'Mitarbeiter Administration', label: 'Mitarbeiter Administration', roleName: ROLE_NAMES.USER },
      { value: 'Backoffice', label: 'Backoffice', roleName: ROLE_NAMES.USER },
    ],
  },
]);

export function getDepartmentPreset(department) {
  return DEPARTMENT_POSITION_PRESETS.find((preset) => preset.value === department) || null;
}

export function getPositionPresets(department) {
  return getDepartmentPreset(department)?.positions || [];
}

export function getPositionPreset(department, position) {
  return getPositionPresets(department).find((preset) => preset.value === position) || null;
}

export function getRoleByPresetName(roles, roleName) {
  if (!roleName) return null;
  if (!Array.isArray(roles)) return null;
  const normalizedRoleName = roleName.trim().toLowerCase();
  return roles.find((role) => role?.name?.trim().toLowerCase() === normalizedRoleName) || null;
}
