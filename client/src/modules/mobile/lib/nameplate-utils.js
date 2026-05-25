import { generateThumbnail } from './photo-utils';

const SERIAL_PATTERNS = [
  /(?:serial|serien(?:nummer)?|sn|s\/n|nr)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{4,})/i,
  /\b([A-Z]{1,4}\d[A-Z0-9._/-]{5,})\b/i,
];

const MODEL_PATTERNS = [
  /(?:model|modell|typ|type)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 ._/-]{2,})/i,
];

export async function prepareNameplateCapture(file, processedPhoto) {
  if (!file) return null;

  const compressed = processedPhoto?.compressed || file;
  const thumbnail = processedPhoto?.thumbnail || await generateThumbnail(file);
  const hints = extractNameplateHints(file.name);

  return {
    file: compressed,
    thumbnail,
    fileName: file.name,
    fileSizeBytes: compressed.size,
    capturedAt: new Date().toISOString(),
    hints,
  };
}

export function extractNameplateHints(text = '') {
  const normalized = String(text).replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ');
  return {
    serialNumber: findFirst(normalized, SERIAL_PATTERNS),
    model: findFirst(normalized, MODEL_PATTERNS),
    rawText: normalized,
    confidence: normalized ? 0.35 : 0,
  };
}

function findFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}
