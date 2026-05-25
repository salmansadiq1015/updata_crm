import axios from 'axios';
import config from '../../config/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const MANUFACTURER_HINTS = [
  'Viessmann',
  'Buderus',
  'Vaillant',
  'Stiebel Eltron',
  'Bosch',
  'Elco',
  'Hoval',
  'Oertli',
  'Weishaupt',
  'Wolf',
];

const SERIAL_PATTERNS = [
  /(?:serial|serial no\.?|serien(?:nummer)?|s\/n|sn|nr\.?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{4,})/i,
  /\b([A-Z]{1,4}\d[A-Z0-9._/-]{5,})\b/i,
];

const MODEL_PATTERNS = [
  /(?:model|modell|typ|type|geraetetyp)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 ._/-]{2,})/i,
];

const POWER_PATTERNS = [
  /(?:leistung|power|output|nennleistung)\s*[:#-]?\s*([0-9]+(?:[.,][0-9]+)?)\s*kW/i,
  /\b([0-9]+(?:[.,][0-9]+)?)\s*kW\b/i,
];

const YEAR_PATTERNS = [
  /(?:baujahr|year|manufacture(?:d)?|herstelljahr)\s*[:#-]?\s*((?:19|20)\d{2})/i,
  /\b((?:19|20)\d{2})\b/,
];

const FUEL_PATTERNS = [
  { value: 'gas', pattern: /\b(gas|erdgas)\b/i },
  { value: 'oil', pattern: /\b(oil|oel|heizoel)\b/i },
  { value: 'electric', pattern: /\b(electric|elektrisch|strom)\b/i },
  { value: 'pellet', pattern: /\b(pellet|pellets)\b/i },
];

function textFromPayload(payload) {
  return payload?.rawText || payload?.text || payload?.fullText || payload?.ocrText || '';
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function pickMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function pickManufacturer(text) {
  const lineMatch = text.match(/(?:manufacturer|hersteller|fabrikat|marke)\s*[:#-]?\s*([^\n\r]+)/i)?.[1];
  if (lineMatch) return cleanLine(lineMatch);

  const lowerText = text.toLowerCase();
  return MANUFACTURER_HINTS.find((name) => lowerText.includes(name.toLowerCase())) || '';
}

function pickFuelType(text) {
  return FUEL_PATTERNS.find((entry) => entry.pattern.test(text))?.value || null;
}

function cleanLine(value) {
  return String(value || '').trim().replace(/\s{2,}/g, ' ').slice(0, 100);
}

function buildExtraction(rawText, provider = 'text', rawPayload = null) {
  const serialNumber = pickMatch(rawText, SERIAL_PATTERNS);
  const model = cleanLine(pickMatch(rawText, MODEL_PATTERNS));
  const manufacturer = cleanLine(pickManufacturer(rawText));
  const powerOutputKw = parseNumber(pickMatch(rawText, POWER_PATTERNS));
  const yearOfManufacture = parseNumber(pickMatch(rawText, YEAR_PATTERNS));
  const fuelType = pickFuelType(rawText);

  const confidenceScores = {
    manufacturer: manufacturer ? 0.72 : 0,
    model: model ? 0.7 : 0,
    serialNumber: serialNumber ? 0.78 : 0,
    powerOutputKw: powerOutputKw ? 0.68 : 0,
    yearOfManufacture: yearOfManufacture ? 0.66 : 0,
    fuelType: fuelType ? 0.64 : 0,
  };

  return {
    provider,
    fields: {
      manufacturer,
      model,
      serialNumber,
      powerOutputKw,
      yearOfManufacture,
      fuelType,
    },
    confidenceScores,
    lowConfidenceFields: Object.entries(confidenceScores)
      .filter(([, score]) => score > 0 && score < config.ocr.lowConfidenceThreshold)
      .map(([field]) => field),
    rawText,
    rawPayload,
  };
}

function normalizeProviderResponse(response) {
  const payload = response?.data || response || {};
  const fields = payload.fields || payload.extracted || payload;
  const rawText = textFromPayload(payload);

  const parsed = buildExtraction(rawText, 'http', payload);
  const confidenceScores = payload.confidenceScores || payload.confidence || parsed.confidenceScores;
  return {
    ...parsed,
    fields: {
      ...parsed.fields,
      manufacturer: fields.manufacturer || fields.extractedManufacturer || parsed.fields.manufacturer,
      model: fields.model || fields.extractedModel || parsed.fields.model,
      serialNumber: fields.serialNumber || fields.extractedSerialNumber || parsed.fields.serialNumber,
      powerOutputKw: parseNumber(fields.powerOutputKw ?? fields.extractedPowerOutputKw) || parsed.fields.powerOutputKw,
      yearOfManufacture: parseNumber(fields.yearOfManufacture ?? fields.extractedYearOfManufacture) || parsed.fields.yearOfManufacture,
      fuelType: fields.fuelType || fields.extractedFuelType || parsed.fields.fuelType,
    },
    confidenceScores,
    lowConfidenceFields: Object.entries(confidenceScores)
      .filter(([, score]) => Number(score) > 0 && Number(score) < config.ocr.lowConfidenceThreshold)
      .map(([field]) => field),
  };
}

class NameplateOcrService {
  async extract({ file, installationId = null }) {
    if (!file?.buffer?.length) {
      throw new AppError('Nameplate OCR input is empty', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (file.mimeType === 'text/plain' || config.ocr.provider === 'text') {
      return buildExtraction(file.buffer.toString('utf8'), 'text');
    }

    if (config.ocr.provider !== 'http') {
      throw new AppError(
        'Nameplate OCR provider is not configured',
        503,
        ERROR_CODES.EXTERNAL_SERVICE_ERROR,
        [{ expected: 'OCR_PROVIDER=http or OCR_PROVIDER=text', actual: config.ocr.provider }],
      );
    }

    return this._extractViaHttp(file, installationId);
  }

  async _extractViaHttp(file, installationId) {
    if (!config.ocr.httpEndpoint) {
      throw new AppError('OCR HTTP endpoint is not configured', 503, ERROR_CODES.EXTERNAL_SERVICE_ERROR);
    }

    const response = await axios.post(
      config.ocr.httpEndpoint,
      {
        documentType: 'crm_installation_nameplate',
        installationId,
        fileName: file.originalName,
        mimeType: file.mimeType,
        fileBase64: file.buffer.toString('base64'),
      },
      {
        timeout: config.ocr.timeoutMs,
        headers: config.ocr.httpApiKey
          ? { Authorization: `Bearer ${config.ocr.httpApiKey}` }
          : undefined,
      },
    );

    return normalizeProviderResponse(response);
  }
}

const nameplateOcrService = new NameplateOcrService();
export { buildExtraction as parseNameplateText };
export default nameplateOcrService;
