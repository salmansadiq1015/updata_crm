import type { TranslateFn } from './lead-ui-kit';

/** Who/what produced an answer; null = provenance not recorded (older versions). */
const SOURCE_FALLBACK: Record<string, string> = {
  user: 'Entered by user',
  ai_proposed_user_confirmed: 'AI-suggested, user-confirmed',
  sms_agent: 'Lead reply via AI SMS agent (validated)',
  ai_call_agent: 'AI call agent (from the call)',
  user_correction: 'Corrected by user',
};

export function answerSourceLabel(source: string | null, t: TranslateFn): string {
  if (!source) return t('leads.answerHistory.sourceUnknown', 'Source not recorded');
  return t(`leads.mobileComm.answerSource.${source}`, SOURCE_FALLBACK[source] ?? source);
}

const STATUS_FALLBACK: Record<string, string> = {
  answered: 'Answered', unknown: 'Unknown', refused: 'Refused', not_applicable: 'Not applicable',
};

/** Display a stored qualification value (choice options translated, status for non-answers). */
export function formatQualificationValue(value: unknown, status: string | null | undefined, t: TranslateFn): string {
  if (status && status !== 'answered') return t(`leads.mobileComm.answerStatus.${status}`, STATUS_FALLBACK[status] ?? status);
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? t('leads.answerHistory.yes', 'Yes') : t('leads.answerHistory.no', 'No');
  const text = String(value);
  return /^[a-z][a-z0-9_]*$/.test(text) ? t(`leads.qualification.option.${text}`, text.replace(/_/g, ' ')) : text;
}
