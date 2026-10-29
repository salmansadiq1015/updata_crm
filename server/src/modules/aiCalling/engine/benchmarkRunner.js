import * as engine from './questionEngine.js';
import { isConfirmation, validateAnswer } from './answerValidation.js';
import { scoreExtraction, scoreFields, wordErrorRate } from './benchmarkScoring.js';

/**
 * Text-level benchmark runner.
 *
 * Replays a case's lead utterances through the same deterministic pipeline a live
 * call uses (questionEngine decides which question a reply answers; answerValidation
 * normalises it), then scores the final answers against reviewed ground truth. The
 * optional extractor (Calling-A's post-call extraction, when present) is scored on
 * expected extraction items. Nothing here calls a model unless an extractor is passed in.
 *
 * Replay assumes the disclosure was accepted (the benchmark measures answer capture).
 * Which field a lead turn answers, in order of precedence:
 *   1. the lead turn's own `fieldKey` (a volunteered answer),
 *   2. the `fieldKey` of the agent turn it replies to (the question the transcript shows was asked),
 *   3. the engine's current question, exactly as on a live call.
 */
export function replayCase(questionnaire, turns, { now = new Date() } = {}) {
  const questions = questionnaire?.questions || [];
  const byKey = new Map(questions.map(q => [q.fieldKey, q]));
  let state = engine.markDisclosed(engine.initConversationState());
  const trace = [];
  let asked = null;
  turns.forEach((turn, turnIndex) => {
    if (turn.speaker !== 'lead') { asked = turn.fieldKey || null; return; }
    const text = String(turn.text || '').trim();
    const action = engine.nextAction(questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS });
    const fieldKey = turn.fieldKey || asked || (['ask', 'clarify', 'confirm'].includes(action.type) ? action.question.fieldKey : null);
    if (!fieldKey || !byKey.has(fieldKey)) { trace.push({ turnIndex, action: action.type, fieldKey: fieldKey || null, result: 'not_applied' }); return; }
    if (!text) {
      state = engine.applyNoResponse(state, fieldKey, { requestId: `turn-${turnIndex}`, reason: 'silence', confirming: action.type === 'confirm' });
      trace.push({ turnIndex, action: action.type, fieldKey, result: 'no_response' });
      return;
    }
    if (action.type === 'confirm' && !turn.fieldKey && action.question.fieldKey === fieldKey && !asked) {
      if (isConfirmation(text)) {
        state = engine.markConfirmed(state, fieldKey);
        trace.push({ turnIndex, action: 'confirm', fieldKey, result: 'confirmed' });
        return;
      }
      // A correction in the reply replaces the value; otherwise the read-back is skipped.
      const corrected = validateAnswer(byKey.get(fieldKey), text, now);
      if (corrected.validation === 'valid') {
        state = engine.applyAnswer(state, fieldKey, { ...corrected, rawAnswer: text });
        trace.push({ turnIndex, action: 'confirm', fieldKey, result: 'corrected', validation: corrected.validation, normalizedValue: corrected.normalizedValue });
      } else {
        state = { ...state, answers: { ...state.answers, [fieldKey]: { ...state.answers[fieldKey], confirmSkipped: true } } };
        trace.push({ turnIndex, action: 'confirm', fieldKey, result: 'not_confirmed' });
      }
      return;
    }
    const result = validateAnswer(byKey.get(fieldKey), text, now);
    state = engine.applyAnswer(state, fieldKey, { ...result, rawAnswer: text });
    trace.push({ turnIndex, action: action.type, fieldKey, result: 'answered', validation: result.validation, normalizedValue: result.normalizedValue, reason: result.reason || null });
  });
  const predicted = Object.fromEntries(Object.entries(state.answers || {}).map(([k, v]) => [k, { validation: v.validation, normalizedValue: v.normalizedValue }]));
  return { predicted, trace };
}

/** Items from whatever shape the extractor returns (CallRecord.intelligence contract). */
export function extractedItems(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.intelligence?.items)) return result.intelligence.items;
  return [];
}

/**
 * Run one case. `extractor` (optional) is an async fn({ transcript, questionnaire, language });
 * `transcribe` (optional) is an async fn(caseDoc) → { text, language, provider }.
 */
export async function runCase(caseDoc, questionnaire, { extractor = null, transcribe = null, now = new Date() } = {}) {
  const turns = caseDoc.turns || [];
  const { predicted, trace } = replayCase(questionnaire, turns, { now });
  const fields = scoreFields(questionnaire?.questions || [], caseDoc.groundTruth?.answers || [], predicted);

  let extraction = { status: 'skipped' };
  if (extractor) {
    try {
      const transcript = turns.map((t, i) => ({ role: t.speaker === 'lead' ? 'customer' : 'assistant', text: t.text, turnIndex: i }));
      const out = await extractor({ transcript, questionnaire, language: caseDoc.language });
      const items = extractedItems(out);
      extraction = {
        status: 'ok', extracted: items.length, needsReview: out?.needsReview ?? null, rejectedByEvidence: out?.rejected ?? null,
        ...scoreExtraction(caseDoc.groundTruth?.extraction || [], items),
      };
    } catch (error) {
      extraction = { status: 'error', error: String(error?.message || error).slice(0, 300) };
    }
  }

  let audio = { status: caseDoc.audio?.fileId ? 'skipped' : 'no_audio' };
  if (transcribe && caseDoc.audio?.fileId) {
    if (!caseDoc.audio.referenceTranscript) audio = { status: 'error', error: 'No reviewed reference transcript for this audio' };
    else {
      try {
        const stt = await transcribe(caseDoc);
        audio = { status: 'ok', hypothesis: String(stt.text || '').slice(0, 4000), sttLanguage: stt.language || null, provider: stt.provider || null, ...wordErrorRate(caseDoc.audio.referenceTranscript, stt.text || '') };
      } catch (error) {
        audio = { status: 'error', error: String(error?.message || error).slice(0, 300) };
      }
    }
  }

  return {
    caseId: caseDoc._id, caseRevision: caseDoc.revision || 1, title: caseDoc.title,
    language: caseDoc.language, conditions: caseDoc.conditions || [],
    scored: Boolean(caseDoc.reviewed), sample: Boolean(caseDoc.sample),
    fields, trace, extraction, audio,
  };
}
