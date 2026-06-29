import { describe, expect, test } from 'vitest';
import {
  buildVoiceCorrectionPayload,
  getSessionTranscript,
  hasVoiceCorrectionPayload,
} from '../voice-session-transcript';

describe('voice-session-transcript utilities', () => {
  test('prefers corrected transcript while preserving raw transcript metadata', () => {
    const transcript = getSessionTranscript({
      rawTranscript: 'create order for Muller',
      correctedTranscript: 'create order for Mueller',
      transcriptConfidence: 0.58,
    });

    expect(transcript).toEqual({
      text: 'create order for Mueller',
      raw: 'create order for Muller',
      corrected: 'create order for Mueller',
      confidence: 0.58,
    });
  });

  test('normalizes nested transcript shapes from API variants', () => {
    const transcript = getSessionTranscript({
      transcript: {
        raw: '  inspect boiler tomorrow  ',
        confidence: 0.91,
      },
    });

    expect(transcript.text).toBe('inspect boiler tomorrow');
    expect(transcript.confidence).toBe(0.91);
  });

  test('builds a minimal correction payload only when values changed', () => {
    const unchanged = buildVoiceCorrectionPayload({
      entityCorrections: [],
      transcriptText: 'inspect boiler tomorrow',
      originalTranscript: 'inspect boiler tomorrow',
    });

    expect(unchanged).toEqual({});
    expect(hasVoiceCorrectionPayload(unchanged)).toBe(false);

    const changed = buildVoiceCorrectionPayload({
      entityCorrections: [
        { entityId: 'ent-1', correctedValue: '  Boiler A  ' },
        { entityId: null, correctedValue: 'Ignored' },
      ],
      transcriptText: 'inspect boiler today',
      originalTranscript: 'inspect boiler tomorrow',
    });

    expect(changed).toEqual({
      correctedTranscript: 'inspect boiler today',
      entityCorrections: [{ entityId: 'ent-1', correctedValue: 'Boiler A' }],
    });
    expect(hasVoiceCorrectionPayload(changed)).toBe(true);
  });
});
