import mongoose from 'mongoose';

/**
 * Standard units seeded on first deploy.
 * isSystem = true prevents deletion or code change.
 */
export const STANDARD_UNITS = [
  { code: 'STK', nameDe: 'Stück', nameFr: 'Pièce', nameIt: 'Pezzo', isSystem: true },
  { code: 'M', nameDe: 'Meter', nameFr: 'Mètre', nameIt: 'Metro', isSystem: true },
  { code: 'M2', nameDe: 'Quadratmeter', nameFr: 'Mètre carré', nameIt: 'Metro quadrato', isSystem: true },
  { code: 'M3', nameDe: 'Kubikmeter', nameFr: 'Mètre cube', nameIt: 'Metro cubo', isSystem: true },
  { code: 'KG', nameDe: 'Kilogramm', nameFr: 'Kilogramme', nameIt: 'Chilogrammo', isSystem: true },
  { code: 'L', nameDe: 'Liter', nameFr: 'Litre', nameIt: 'Litro', isSystem: true },
  { code: 'H', nameDe: 'Stunde', nameFr: 'Heure', nameIt: 'Ora', isSystem: true },
  { code: 'PAU', nameDe: 'Pauschale', nameFr: 'Forfait', nameIt: 'Forfait', isSystem: true },
  { code: 'SET', nameDe: 'Set', nameFr: 'Set', nameIt: 'Set', isSystem: true },
];

const unitOfMeasureSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      maxlength: 10,
      immutable: true,
    },
    nameDe: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    nameFr: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    nameIt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    baseUnitCode: {
      type: String,
      maxlength: 10,
      default: null,
    },
    conversionFactor: {
      type: Number,
      default: null,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

const UnitOfMeasure = mongoose.model('UnitOfMeasure', unitOfMeasureSchema);
export default UnitOfMeasure;
