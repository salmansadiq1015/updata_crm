const VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g;

export const ALLOWED_VARIABLES = Object.freeze([
  'firstName', 'lastName', 'fullName', 'businessName', 'email', 'phone', 'city',
  'country', 'category', 'rating', 'assignedUserName', 'companyName', 'senderName', 'link',
  'qualificationStatus', 'callSummary', 'customField',
]);

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function extractVariables(...values) {
  const found = new Set();
  for (const value of values) {
    for (const match of String(value || '').matchAll(VARIABLE_PATTERN)) found.add(match[1]);
  }
  return [...found];
}

export function leadVariables(lead, context = {}) {
  const displayName = String(lead?.name || '').trim();
  const parts = displayName.split(/\s+/).filter(Boolean);
  return {
    firstName: lead?.firstName || parts[0] || '',
    lastName: lead?.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : ''),
    fullName: displayName,
    businessName: lead?.type === 'business' ? displayName : (lead?.businessName || ''),
    email: lead?.email || '',
    phone: lead?.mobile || lead?.phone || '',
    city: lead?.address?.city || '',
    country: lead?.address?.country || '',
    category: lead?.sourceMetadata?.businessType || '',
    rating: lead?.providerMeta?.rating == null ? '' : String(lead.providerMeta.rating),
    assignedUserName: lead?.assignedTo
      ? [lead.assignedTo.firstName, lead.assignedTo.lastName].filter(Boolean).join(' ')
      : '',
    companyName: context.companyName || process.env.COMPANY_NAME || 'Updata.ai',
    senderName: context.senderName || '',
    qualificationStatus: lead?.latestCall?.qualificationStatus || '',
    callSummary: context.callSummary || '',
    // Generic customField must be explicitly supplied; never guess a field or answer.
    customField: context.customField ?? '',
  };
}

export function renderPersonalized(value, variables, { html = false, fallbacks = {}, required = [] } = {}) {
  const missing = new Set();
  const unresolved = new Set();
  const rendered = String(value || '').replace(VARIABLE_PATTERN, (token, key) => {
    if (!ALLOWED_VARIABLES.includes(key)) {
      unresolved.add(key);
      return token;
    }
    const raw = variables[key] || fallbacks[key] || '';
    if (!raw && required.includes(key)) missing.add(key);
    return html ? escapeHtml(raw) : String(raw);
  });
  // Malformed or unsupported tokens must never pass through to a recipient.
  for (const match of rendered.matchAll(/\{\{([^{}]*)\}\}/g)) unresolved.add(match[1].trim() || 'empty');
  return { value: rendered, missing: [...missing], unresolved: [...unresolved] };
}

export function smsSegments(text) {
  const value = String(text || '');
  const basic = new Set([...('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà')]);
  const extension = new Set([...'\f^{}\\[~]|€']);
  const chars = [...value];
  const unicode = chars.some((char) => !basic.has(char) && !extension.has(char));
  const units = unicode ? value.length : chars.reduce((sum, char) => sum + (extension.has(char) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multipart = unicode ? 67 : 153;
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multipart);
  return { characters: chars.length, units, segments, unicode,
    encoding: unicode ? 'UCS-2' : 'GSM-7',
    remainingInSegment: (segments <= 1 ? single : segments * multipart) - units };
}
