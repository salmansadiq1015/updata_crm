/**
 * Thin client for the CRM AI-calling agent tool API.
 *
 * Every call carries the per-call bearer token that LiveKit handed the worker in
 * the job metadata. The token is scoped to exactly one call, so this worker can
 * only read that call's context and invoke the constrained tools — it cannot
 * touch other leads, change lead status directly, or start new calls. The CRM
 * backend validates and persists everything.
 */
export class ToolApi {
  constructor({ apiBase, token, callId }) {
    this.apiBase = apiBase.replace(/\/$/, '');
    this.token = token;
    this.callId = callId;
  }

  async _post(path, body = {}) {
    const res = await fetch(`${this.apiBase}/${this.callId}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `tool call failed (${res.status})`);
    return json.data ?? json;
  }

  async context() {
    const res = await fetch(`${this.apiBase}/${this.callId}/context`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `context failed (${res.status})`);
    return json.data ?? json;
  }

  answered() { return this._post('/answered'); }
  disclose() { return this._post('/disclose'); }
  recordAnswer(fieldKey, rawAnswer) { return this._post('/record-answer', { fieldKey, rawAnswer }); }
  markUnknown(fieldKey) { return this._post('/mark-unknown', { fieldKey }); }
  confirm(fieldKey, reply = null) { return this._post('/confirm', { fieldKey, reply }); }
  requestCallback(when, note, human = false) { return this._post('/request-callback', { when, note, human }); }
  doNotContact() { return this._post('/do-not-contact'); }
  decline() { return this._post('/decline'); }
  end(payload) { return this._post('/end', payload); }
  transcript(role, text, itemId) { return this._post('/transcript', { role, text, itemId }); }
}

/** Render the engine's next action into a short instruction for the model. */
/** Standing instructions + the step the backend wants now (refreshed after every tool call). */
export function withCurrentStep(base, instruction) {
  return `${base}\n\nCURRENT STEP (follow exactly; nothing else): ${instruction}`;
}

/**
 * How to pass an answer so the server can validate it whatever language was spoken:
 * choices as one of the listed options, numbers as digits. The server still decides.
 */
function answerFormat(question) {
  const options = (question.options || []).map((o) => (o && typeof o === 'object' ? o.value : o)).filter(Boolean);
  if (options.length) return ` Pass the listed option that matches what they said (translate if they answered in another language), written exactly as one of: ${options.join(' | ')}.`;
  if (['integer', 'number', 'decimal', 'currency', 'rating'].includes(question.type)) return ' Pass numbers as digits (e.g. "2000"), even if they said it in words or in Urdu.';
  return '';
}

export function actionToInstruction(action) {
  if (!action) return 'Wait for the backend.';
  switch (action.type) {
    case 'disclose':
      return 'Say the disclosure (above) and ask if they have a moment. As soon as they agree (yes, sure, okay, go ahead), ' +
        'call the disclose tool before saying anything else. Do not ask any other question first.';
    case 'ask':
      return `Ask this question naturally (you may rephrase, keep the meaning): "${action.question.text}". ` +
        `When they answer, call record_answer with fieldKey="${action.question.fieldKey}" and their answer.${answerFormat(action.question)}`;
    case 'clarify':
      return `Their last answer to "${action.question.text}" was unclear. Ask ONE brief clarifying question, then call record_answer with fieldKey="${action.question.fieldKey}" again.${answerFormat(action.question)}`;
    case 'confirm':
      return `Read back their answer to confirm it is correct. If they say yes, call confirm with fieldKey="${action.question.fieldKey}"; ` +
        'if they correct it, call record_answer with the corrected value.';
    case 'finish':
      return 'All questions are done. Briefly thank them, say goodbye, then call finish_call.';
    case 'end':
      return `End the call politely (reason: ${action.reason}). Then call finish_call.`;
    default:
      return 'Continue.';
  }
}
