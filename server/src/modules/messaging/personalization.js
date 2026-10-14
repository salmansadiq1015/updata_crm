const VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g;

export const ALLOWED_VARIABLES = Object.freeze([
  'firstName', 'lastName', 'fullName', 'businessName', 'email', 'phone', 'city',
  'country', 'category', 'rating', 'assignedUserName', 'companyName', 'senderName',
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
    companyName: context.companyName || process.env.COMPANY_NAME || 'Updata',
    senderName: context.senderName || '',
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
  for (const match of rendered.matchAll(VARIABLE_PATTERN)) unresolved.add(match[1]);
  return { value: rendered, missing: [...missing], unresolved: [...unresolved] };
}

export function smsSegments(text) {
  const value = String(text || '');
  // GSM-7 contains ASCII plus this extension/non-ASCII set. Control characters
  // are harmless; everything else requires UCS-2 segment sizing.
  const gsmNonAscii = new Set([...`€£¥èéùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉ`]);
  const unicode = [...value].some((char) => (char.codePointAt(0) || 0) > 127 && !gsmNonAscii.has(char));
  const single = unicode ? 70 : 160;
  const multipart = unicode ? 67 : 153;
  const characters = [...value].length;
  return { characters, segments: characters <= single ? 1 : Math.ceil(characters / multipart), unicode };
}
