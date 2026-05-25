import { z } from 'zod';

export const INSTALLATION_TYPE_OPTIONS = [
  { value: 'boiler', de: 'Boiler', en: 'Boiler' },
  { value: 'heat_pump', de: 'Waermepumpe', en: 'Heat pump' },
  { value: 'solar_thermal', de: 'Solarthermie', en: 'Solar thermal' },
  { value: 'radiator_system', de: 'Radiator-System', en: 'Radiator system' },
  { value: 'ventilation', de: 'Lüftung', en: 'Ventilation' },
  { value: 'hot_water', de: 'Warmwasser', en: 'Hot water' },
  { value: 'other', de: 'Sonstige', en: 'Other' },
];

export const FUEL_TYPE_OPTIONS = [
  { value: 'gas', de: 'Gas', en: 'Gas' },
  { value: 'oil', de: 'Oel', en: 'Oil' },
  { value: 'electric', de: 'Elektrisch', en: 'Electric' },
  { value: 'pellet', de: 'Pellet', en: 'Pellet' },
  { value: 'other', de: 'Sonstige', en: 'Other' },
];

const optionalDate = z.preprocess(blankToNull, z.string().optional().nullable());
const optionalText = (max) => z.preprocess(blankToNull, z.string().trim().max(max).optional().nullable());
const optionalNumber = z.preprocess(
  blankToNull,
  z.coerce.number().positive().optional().nullable(),
);
const optionalYear = z.preprocess(
  blankToNull,
  z.coerce.number().int().min(1900).max(2100).optional().nullable(),
);
const optionalFuel = z.preprocess(
  blankToNull,
  z.enum(FUEL_TYPE_OPTIONS.map((option) => option.value)).optional().nullable(),
);

export const installationCaptureSchema = z.object({
  type: z.enum(INSTALLATION_TYPE_OPTIONS.map((option) => option.value)),
  manufacturer: z.string().trim().min(1, 'Hersteller ist erforderlich').max(100),
  model: z.string().trim().min(1, 'Modell ist erforderlich').max(100),
  serialNumber: optionalText(100),
  commissioningDate: optionalDate,
  warrantyEndDate: optionalDate,
  powerOutputKw: optionalNumber,
  fuelType: optionalFuel,
  yearOfManufacture: optionalYear,
  technicalNotes: optionalText(5000),
});

export function normalizeInstallationCaptureForm(data) {
  return {
    type: data.type,
    manufacturer: data.manufacturer?.trim(),
    model: data.model?.trim(),
    serialNumber: blankToNull(data.serialNumber),
    commissioningDate: blankToNull(data.commissioningDate),
    warrantyEndDate: blankToNull(data.warrantyEndDate),
    powerOutputKw: data.powerOutputKw === '' || data.powerOutputKw == null ? null : Number(data.powerOutputKw),
    fuelType: blankToNull(data.fuelType),
    yearOfManufacture: data.yearOfManufacture === '' || data.yearOfManufacture == null ? null : Number(data.yearOfManufacture),
    technicalNotes: blankToNull(data.technicalNotes),
  };
}

function blankToNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}
