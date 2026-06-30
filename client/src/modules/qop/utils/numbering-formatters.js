import {
  NUMBERING_LIMITS,
  NUMBERING_TYPES,
  YEAR_FORMAT_OPTIONS,
} from '@/modules/qop/data/numbering-config';

const YEAR_FORMAT_VALUES = new Set(YEAR_FORMAT_OPTIONS.map((option) => option.value));

function toInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

export function getNumberingTypeConfig(documentType) {
  return NUMBERING_TYPES.find((type) => type.id === documentType) || {
    id: documentType,
    labelKey: `numbering.type.${documentType}`,
    fallback: documentType,
    descriptionKey: `numbering.type.${documentType}Desc`,
    description: 'Document number sequence.',
    accent: 'violet',
  };
}

export function normalizeSequenceForm(sequence = {}) {
  return {
    prefix: sequence.prefix || '',
    separator: sequence.separator ?? NUMBERING_LIMITS.defaultSeparator,
    yearFormat: YEAR_FORMAT_VALUES.has(sequence.yearFormat)
      ? sequence.yearFormat
      : NUMBERING_LIMITS.defaultYearFormat,
    paddingLength: toInteger(sequence.paddingLength, NUMBERING_LIMITS.defaultPadding),
    resetsAnnually: sequence.resetsAnnually ?? true,
    isActive: sequence.isActive ?? true,
  };
}

export function sanitizeSequenceForm(form) {
  const padding = toInteger(form.paddingLength, NUMBERING_LIMITS.defaultPadding);

  return {
    prefix: String(form.prefix || '').trim().slice(0, NUMBERING_LIMITS.prefixMaxLength),
    separator: String(form.separator ?? '').slice(0, NUMBERING_LIMITS.separatorMaxLength),
    yearFormat: YEAR_FORMAT_VALUES.has(form.yearFormat) ? form.yearFormat : NUMBERING_LIMITS.defaultYearFormat,
    paddingLength: Math.min(
      NUMBERING_LIMITS.paddingMax,
      Math.max(NUMBERING_LIMITS.paddingMin, padding),
    ),
    resetsAnnually: Boolean(form.resetsAnnually),
    isActive: Boolean(form.isActive),
  };
}

export function validateSequenceForm(form) {
  const errors = {};
  const prefix = String(form.prefix || '').trim();
  const separator = String(form.separator ?? '');
  const padding = Number(form.paddingLength);

  if (!prefix) {
    errors.prefix = 'required';
  } else if (prefix.length > NUMBERING_LIMITS.prefixMaxLength) {
    errors.prefix = 'maxLength';
  }

  if (separator.length > NUMBERING_LIMITS.separatorMaxLength) {
    errors.separator = 'maxLength';
  }

  if (!Number.isInteger(padding)) {
    errors.paddingLength = 'integer';
  } else if (padding < NUMBERING_LIMITS.paddingMin || padding > NUMBERING_LIMITS.paddingMax) {
    errors.paddingLength = 'range';
  }

  if (!YEAR_FORMAT_VALUES.has(form.yearFormat)) {
    errors.yearFormat = 'invalid';
  }

  return errors;
}

export function getYearSegment(yearFormat, date = new Date()) {
  const fullYear = String(date.getFullYear());
  if (yearFormat === 'YYYY') return fullYear;
  if (yearFormat === 'YY') return fullYear.slice(-2);
  return '';
}

export function getNextSequenceValue(currentValue = 0, paddingLength = NUMBERING_LIMITS.defaultPadding) {
  const nextValue = Math.max(0, toInteger(currentValue, 0)) + 1;
  return String(nextValue).padStart(toInteger(paddingLength, NUMBERING_LIMITS.defaultPadding), '0');
}

export function getSequencePreviewParts(form, currentValue = 0, date = new Date()) {
  const sanitized = sanitizeSequenceForm(form);
  const year = getYearSegment(sanitized.yearFormat, date);
  const number = getNextSequenceValue(currentValue, sanitized.paddingLength);

  return [
    { id: 'prefix', label: 'Prefix', value: sanitized.prefix },
    ...(year ? [{ id: 'year', label: 'Year', value: year }] : []),
    { id: 'number', label: 'Number', value: number },
  ];
}

export function buildSequencePreview(form, currentValue = 0, date = new Date()) {
  const sanitized = sanitizeSequenceForm(form);
  return getSequencePreviewParts(sanitized, currentValue, date)
    .map((part) => part.value)
    .join(sanitized.separator);
}

export function isSequenceFormDirty(sequence, form) {
  const initial = sanitizeSequenceForm(normalizeSequenceForm(sequence));
  const current = sanitizeSequenceForm(form);
  return Object.keys(initial).some((key) => initial[key] !== current[key]);
}

export function getSequenceCapacity(paddingLength) {
  const padding = Math.min(
    NUMBERING_LIMITS.paddingMax,
    Math.max(NUMBERING_LIMITS.paddingMin, toInteger(paddingLength, NUMBERING_LIMITS.defaultPadding)),
  );
  return (10 ** padding) - 1;
}

export function getSequenceUsagePercent(currentValue = 0, paddingLength = NUMBERING_LIMITS.defaultPadding) {
  const capacity = getSequenceCapacity(paddingLength);
  if (!capacity) return 0;
  return Math.min(100, Math.round((Math.max(0, Number(currentValue) || 0) / capacity) * 100));
}

export function getNumberingSummary(sequences = []) {
  const totalIssued = sequences.reduce((total, sequence) => total + (Number(sequence.currentValue) || 0), 0);
  const activeCount = sequences.filter((sequence) => sequence.isActive !== false).length;
  const annualResetCount = sequences.filter((sequence) => sequence.resetsAnnually !== false).length;

  return {
    total: sequences.length,
    activeCount,
    inactiveCount: sequences.length - activeCount,
    annualResetCount,
    totalIssued,
  };
}
