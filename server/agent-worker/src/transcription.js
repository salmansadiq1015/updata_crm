/** Speech recognition is separate from the voice model and needs its own context. */
const languageCode = value => {
  const code = String(value || '').trim().toLowerCase();
  if (code === 'roman_ur') return 'ur';
  if (code === 'fil') return 'tl';
  return /^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(code) ? code.split('-')[0] : null;
};

export const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-transcribe';
export const DEFAULT_SILENCE_MS = 1000;

export function turnDetection(env = process.env) {
  if (env.OPENAI_REALTIME_TURN_DETECTION === 'semantic') {
    return { type: 'semantic_vad', eagerness: env.OPENAI_REALTIME_EAGERNESS || 'high', create_response: true, interrupt_response: true };
  }
  const configured = Number(env.OPENAI_REALTIME_SILENCE_MS);
  return {
    type: 'server_vad', threshold: 0.5, prefix_padding_ms: 500,
    silence_duration_ms: Number.isFinite(configured) && configured >= 200 && configured <= 5000 ? configured : DEFAULT_SILENCE_MS,
    create_response: true, interrupt_response: true,
  };
}

export function transcription(language, env = process.env, context = {}) {
  const model = String(env.OPENAI_REALTIME_TRANSCRIBE_MODEL || '').trim() || DEFAULT_TRANSCRIPTION_MODEL;
  const modern = ['gpt-transcribe', 'gpt-live-transcribe'].includes(model);
  const forced = languageCode(env.OPENAI_REALTIME_TRANSCRIBE_LANGUAGE);
  const configured = String(env.OPENAI_REALTIME_TRANSCRIBE_LANGUAGES || '').split(',').map(languageCode).filter(Boolean);
  const primary = languageCode(language);
  const languages = [...new Set(configured.length ? configured : forced ? [forced] : primary ? [primary, ...(primary === 'en' ? [] : ['en'])] : [])];
  const questions = (context.questions || []).slice(0, 40).map(q => {
    // Only question wording/types, never stored answers, to avoid prompting ASR
    // to fill missing speech with a known or expected personal detail.
    return `${String(q.text || q.label || '').replace(/\s+/g, ' ').slice(0, 140)} (${q.answerType || q.type || 'text'})`;
  }).join('; ').slice(0, 1800);
  const prompt = [
    'A customer answering a CRM questionnaire on a voice call.',
    'Transcribe only the words actually spoken, in the original language, including language switches. Do not translate, answer questions, or invent missing or inaudible speech.',
    'Preserve personal names, spelled letters, email addresses, phone digits and dates exactly. The caller may pause between letters or digits. Keep corrections and unfinished phrases.',
    languages.length ? `Expected language hints: ${languages.join(', ')}. The caller may switch languages.` : 'Detect the spoken language; the caller may switch languages.',
    questions ? `Questionnaire topics (context only, never answers to insert): ${questions}` : '',
  ].filter(Boolean).join(' ');
  return {
    model, prompt,
    ...(modern ? (languages.length ? { languages } : {}) : (forced ? { language: forced } : {})),
  };
}
