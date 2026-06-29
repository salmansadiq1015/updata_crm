export function normalizeTranscriptValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getSessionTranscript(session) {
  const raw = normalizeTranscriptValue(
    session?.rawTranscript
      ?? session?.transcript?.raw
      ?? session?.transcript?.text
      ?? session?.transcript?.final
      ?? '',
  );
  const corrected = normalizeTranscriptValue(
    session?.correctedTranscript
      ?? session?.transcript?.corrected
      ?? '',
  );

  return {
    text: corrected || raw,
    raw,
    corrected,
    confidence: session?.transcriptConfidence ?? session?.transcript?.confidence ?? null,
  };
}

export function buildVoiceCorrectionPayload({
  entityCorrections = [],
  transcriptText,
  originalTranscript,
} = {}) {
  const payload = {};
  const normalizedEntityCorrections = entityCorrections
    .filter((correction) => correction.entityId && correction.correctedValue !== undefined)
    .map((correction) => ({
      entityId: correction.entityId,
      correctedValue: normalizeTranscriptValue(correction.correctedValue),
    }))
    .filter((correction) => correction.correctedValue.length > 0);

  if (normalizedEntityCorrections.length > 0) {
    payload.entityCorrections = normalizedEntityCorrections;
  }

  const editedTranscript = normalizeTranscriptValue(transcriptText);
  const previousTranscript = normalizeTranscriptValue(originalTranscript);
  if (editedTranscript && editedTranscript !== previousTranscript) {
    payload.correctedTranscript = editedTranscript;
  }

  return payload;
}

export function hasVoiceCorrectionPayload(payload = {}) {
  return Boolean(
    payload.correctedTranscript ||
    (Array.isArray(payload.entityCorrections) && payload.entityCorrections.length > 0),
  );
}
