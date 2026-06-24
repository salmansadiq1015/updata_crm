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
    labelKey: 'users.department.projectManagement',
    positions: [
      { value: 'Projektleiter', label: 'Projektleiter', labelKey: 'users.position.projectLead', roleName: ROLE_NAMES.PROJECT_LEAD },
    ],
  },
  {
    value: 'Technik',
    label: 'Technik',
    labelKey: 'users.department.technical',
    positions: [
      { value: 'Servicetechniker', label: 'Servicetechniker', labelKey: 'users.position.serviceTechnician', roleName: ROLE_NAMES.TECHNICIAN },
      { value: 'Monteur', label: 'Monteur', labelKey: 'users.position.installer', roleName: ROLE_NAMES.TECHNICIAN },
      { value: 'Lehrling', label: 'Lehrling', labelKey: 'users.position.apprentice', roleName: ROLE_NAMES.APPRENTICE },
    ],
  },
  {
    value: 'Disposition',
    label: 'Disposition',
    labelKey: 'users.department.dispatch',
    positions: [
      { value: 'Disponent', label: 'Disponent', labelKey: 'users.position.dispatcher', roleName: ROLE_NAMES.DISPATCHER },
      { value: 'Einsatzplaner', label: 'Einsatzplaner', labelKey: 'users.position.scheduler', roleName: ROLE_NAMES.DISPATCHER },
    ],
  },
  {
    value: 'Finanzen',
    label: 'Finanzen',
    labelKey: 'users.department.finance',
    positions: [
      { value: 'Buchhalter', label: 'Buchhalter', labelKey: 'users.position.accountant', roleName: ROLE_NAMES.ACCOUNTANT },
      { value: 'Sachbearbeiter Finanzen', label: 'Sachbearbeiter Finanzen', labelKey: 'users.position.financeClerk', roleName: ROLE_NAMES.ACCOUNTANT },
    ],
  },
  {
    value: 'Administration',
    label: 'Administration',
    labelKey: 'users.department.administration',
    positions: [
      { value: 'Mitarbeiter Administration', label: 'Mitarbeiter Administration', labelKey: 'users.position.adminEmployee', roleName: ROLE_NAMES.USER },
      { value: 'Backoffice', label: 'Backoffice', labelKey: 'users.position.backoffice', roleName: ROLE_NAMES.USER },
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
