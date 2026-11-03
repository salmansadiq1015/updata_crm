import { ADDITIONAL_AGENT_LANGUAGES } from './aiCalling.languageCatalog.js';

/**
 * AI agent languages — the single source of truth for which conversation
 * languages a campaign's AI agent (`agentConfig.language`) may use.
 *
 * Codes are BCP-47. `support` is honest about quality:
 *   - 'full'    — in the documented OpenAI Whisper / Realtime language set
 *                 (speech recognition quality is published for these).
 *   - 'limited' — the model can usually understand and speak it, but recognition
 *                 and voice quality are not documented and may be noticeably worse.
 * `auto` is not a language: the agent mirrors whatever language the callee speaks,
 * opening in the deployment default (AI_CALLING_DEFAULT_LANGUAGE, else English).
 *
 * Consumers: aiCalling.validation.js (allow-list), engine/leadContext.js (the
 * prompt names the language), GET /api/v1/ai-calling/languages (web + mobile pickers).
 */

export const AUTO_LANGUAGE = 'auto';

const L = (code, name, nativeName, support = 'full', rtl = false) => Object.freeze({ code, name, nativeName, support, rtl });

export const AI_AGENT_LANGUAGES = Object.freeze([
  Object.freeze({ code: AUTO_LANGUAGE, name: "Automatic (match the lead's language)", nativeName: 'Auto', support: 'full', rtl: false }),
  L('af', 'Afrikaans', 'Afrikaans'),
  L('am', 'Amharic', 'አማርኛ', 'limited'),
  L('ar', 'Arabic', 'العربية', 'full', true),
  L('ar-MA', 'Arabic (Morocco, Moroccan Darija)', 'العربية المغربية — الدارجة المغربية', 'limited', true),
  L('hy', 'Armenian', 'Հայերեն'),
  L('az', 'Azerbaijani', 'Azərbaycan dili'),
  L('be', 'Belarusian', 'Беларуская'),
  L('bn', 'Bengali', 'বাংলা', 'limited'),
  L('bs', 'Bosnian', 'Bosanski'),
  L('bg', 'Bulgarian', 'Български'),
  L('ca', 'Catalan', 'Català'),
  L('zh', 'Chinese (Mandarin)', '中文（普通话）'),
  L('yue', 'Chinese (Cantonese)', '粵語', 'limited'),
  L('hr', 'Croatian', 'Hrvatski'),
  L('cs', 'Czech', 'Čeština'),
  L('da', 'Danish', 'Dansk'),
  L('nl', 'Dutch', 'Nederlands'),
  L('en', 'English', 'English'),
  L('en-US', 'English (United States)', 'English (US)'),
  L('en-GB', 'English (United Kingdom)', 'English (UK)'),
  L('et', 'Estonian', 'Eesti'),
  L('fil', 'Filipino (Tagalog)', 'Filipino'),
  L('fi', 'Finnish', 'Suomi'),
  L('fr', 'French', 'Français'),
  L('fr-CA', 'French (Canada)', 'Français (Canada)'),
  L('gl', 'Galician', 'Galego'),
  L('de', 'German', 'Deutsch'),
  L('de-CH', 'German (Switzerland)', 'Deutsch (Schweiz)'),
  L('el', 'Greek', 'Ελληνικά'),
  L('gu', 'Gujarati', 'ગુજરાતી', 'limited'),
  L('he', 'Hebrew', 'עברית', 'full', true),
  L('hi', 'Hindi', 'हिन्दी'),
  L('hu', 'Hungarian', 'Magyar'),
  L('is', 'Icelandic', 'Íslenska'),
  L('id', 'Indonesian', 'Bahasa Indonesia'),
  L('it', 'Italian', 'Italiano'),
  L('ja', 'Japanese', '日本語'),
  L('kn', 'Kannada', 'ಕನ್ನಡ'),
  L('kk', 'Kazakh', 'Қазақ тілі'),
  L('ko', 'Korean', '한국어'),
  L('lv', 'Latvian', 'Latviešu'),
  L('lt', 'Lithuanian', 'Lietuvių'),
  L('mk', 'Macedonian', 'Македонски'),
  L('ms', 'Malay', 'Bahasa Melayu'),
  L('ml', 'Malayalam', 'മലയാളം', 'limited'),
  L('mi', 'Maori', 'Te Reo Māori'),
  L('mr', 'Marathi', 'मराठी'),
  L('ne', 'Nepali', 'नेपाली'),
  L('no', 'Norwegian', 'Norsk'),
  L('ps', 'Pashto', 'پښتو', 'limited', true),
  L('fa', 'Persian', 'فارسی', 'full', true),
  L('pl', 'Polish', 'Polski'),
  L('pt', 'Portuguese', 'Português'),
  L('pt-BR', 'Portuguese (Brazil)', 'Português (Brasil)'),
  L('pt-PT', 'Portuguese (Portugal)', 'Português (Portugal)'),
  L('pa', 'Punjabi', 'ਪੰਜਾਬੀ', 'limited'),
  L('ro', 'Romanian', 'Română'),
  L('ru', 'Russian', 'Русский'),
  L('sr', 'Serbian', 'Српски'),
  L('sd', 'Sindhi', 'سنڌي', 'limited', true),
  L('sk', 'Slovak', 'Slovenčina'),
  L('sl', 'Slovenian', 'Slovenščina'),
  L('es', 'Spanish', 'Español'),
  L('es-MX', 'Spanish (Mexico)', 'Español (México)'),
  L('sw', 'Swahili', 'Kiswahili'),
  L('sv', 'Swedish', 'Svenska'),
  L('ta', 'Tamil', 'தமிழ்'),
  L('te', 'Telugu', 'తెలుగు', 'limited'),
  L('th', 'Thai', 'ไทย'),
  L('tr', 'Turkish', 'Türkçe'),
  L('uk', 'Ukrainian', 'Українська'),
  L('ur', 'Urdu', 'اردو', 'full', true),
  L('vi', 'Vietnamese', 'Tiếng Việt'),
  L('cy', 'Welsh', 'Cymraeg'),
  ...ADDITIONAL_AGENT_LANGUAGES.map(([code, name, nativeName, rtl = false]) => L(code, name, nativeName, 'limited', rtl)),
].sort((a, b) => a.code === AUTO_LANGUAGE ? -1 : b.code === AUTO_LANGUAGE ? 1 : a.name.localeCompare(b.name, 'en')));

const BY_LOWER_CODE = new Map(AI_AGENT_LANGUAGES.map((lang) => [lang.code.toLowerCase(), lang]));

/** Case-insensitive lookup with locale separators and the Moroccan Arabic ISO alias. */
export function findAgentLanguage(code) {
  if (typeof code !== 'string') return null;
  const normalized = code.trim().replaceAll('_', '-').toLowerCase();
  // ISO 639-3 'ary' identifies Moroccan Arabic; store the existing ar-MA code.
  return BY_LOWER_CODE.get(normalized === 'ary' ? 'ar-ma' : normalized) || null;
}

/**
 * Resolve a stored/submitted code to a list entry. A regional variant that is not
 * listed (e.g. a legacy 'de-AT' or 'es-AR') resolves to its base language, so
 * campaigns stored before this list existed stay valid.
 */
export function resolveAgentLanguage(code) {
  const exact = findAgentLanguage(code);
  if (exact) return exact;
  if (typeof code !== 'string') return null;
  const base = code.trim().split(/[-_]/)[0];
  if (!base || base.length > 3) return null;
  return findAgentLanguage(base);
}

export function isSupportedAgentLanguage(code) {
  return resolveAgentLanguage(code) !== null;
}

/** Canonical spelling of a listed code ('PT-br' → 'pt-BR'); unlisted regional variants keep base-lower/REGION-upper form. */
export function canonicalAgentLanguage(code) {
  const exact = findAgentLanguage(code);
  if (exact) return exact.code;
  const [base, ...rest] = String(code).trim().split(/[-_]/);
  return [base.toLowerCase(), ...rest.map((part) => (part.length === 2 ? part.toUpperCase() : part))].join('-');
}

/** Deployment default used for `auto` (open the call) and as the last resort. */
export function defaultAgentLanguage(env = process.env) {
  const configured = resolveAgentLanguage(env.AI_CALLING_DEFAULT_LANGUAGE || '');
  return configured && configured.code !== AUTO_LANGUAGE ? configured : findAgentLanguage('en');
}
