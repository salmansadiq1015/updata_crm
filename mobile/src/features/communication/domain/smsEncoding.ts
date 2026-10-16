// SMS encoding + segment preview (3GPP TS 23.038). Mirrors the intent of the CRM's
// server/src/modules/messaging/personalization.js smsSegments, but counts the GSM-7
// extension table (`{ } [ ] ~ \ ^ | €` and form feed) as two septets and treats ASCII
// characters missing from GSM-7 (e.g. backtick) as UCS-2, so the preview errs high, not low.
// This is a preview: the carrier/OS performs the real split.

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENSION = '\f^{}\\[~]|€';

const BASIC = new Set([...GSM7_BASIC]);
const EXTENSION = new Set([...GSM7_EXTENSION]);

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export type SmsSegmentInfo = {
  encoding: SmsEncoding;
  /** User-visible characters (code points). */
  characters: number;
  /** Encoding units: septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number;
  segments: number;
  /** Units left in the current segment before another one starts. */
  remainingInSegment: number;
};

export function analyzeSms(text: string): SmsSegmentInfo {
  const chars = [...text];
  const gsm = chars.every((char) => BASIC.has(char) || EXTENSION.has(char));
  const encoding: SmsEncoding = gsm ? 'GSM-7' : 'UCS-2';
  const units = gsm ? chars.reduce((sum, char) => sum + (EXTENSION.has(char) ? 2 : 1), 0) : text.length; // UTF-16 code units: emoji and other astral characters take two.
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  const capacity = segments <= 1 ? single : segments * multi;
  return { encoding, characters: chars.length, units, segments, remainingInSegment: capacity - units };
}
