const ROLE_LABEL_KEYS = Object.freeze({
  Admin: 'users.roles.admin',
  Projektleiter: 'users.roles.projectLead',
  Techniker: 'users.roles.technician',
  Buchhalter: 'users.roles.accountant',
  Disponent: 'users.roles.dispatcher',
  Lehrling: 'users.roles.apprentice',
  User: 'users.roles.user',
});

const NORMALIZED_ROLE_LABEL_KEYS = new Map(
  Object.entries(ROLE_LABEL_KEYS).map(([name, key]) => [name.toLowerCase(), key]),
);

export function getUserRoleLabel(roleName, t) {
  const normalizedRoleName = typeof roleName === 'string' ? roleName.trim() : '';
  if (!normalizedRoleName) return '';

  const labelKey = NORMALIZED_ROLE_LABEL_KEYS.get(normalizedRoleName.toLowerCase());
  return labelKey ? t(labelKey, normalizedRoleName) : normalizedRoleName;
}

export function getPresetDisplayLabel(option, t) {
  if (!option) return '';
  const fallback = option.label || option.value || '';
  return option.labelKey ? t(option.labelKey, fallback) : fallback;
}

export function getUserDateLocale(locale) {
  if (locale === 'en') return 'en-GB';
  if (locale === 'fr') return 'fr-CH';
  if (locale === 'it') return 'it-CH';
  return 'de-CH';
}
