// Template personalization with the CRM's exact variable contract
// (server/src/modules/messaging/personalization.js): `{{name}}` tokens from a fixed
// allowlist. Differences are deliberate and stricter: an EMPTY value for a variable
// used in the template is reported as missing, so a message is never sent with a hole.

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g;

export const ALLOWED_VARIABLES = [
  'firstName',
  'lastName',
  'fullName',
  'businessName',
  'email',
  'phone',
  'city',
  'country',
  'category',
  'rating',
  'assignedUserName',
  'companyName',
  'senderName',
] as const;

export type TemplateVariable = (typeof ALLOWED_VARIABLES)[number];
export type TemplateVariables = Partial<Record<TemplateVariable, string>>;

const ALLOWED = new Set<string>(ALLOWED_VARIABLES);

export type TemplateLead = {
  name: string;
  type: 'business' | 'private';
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: { city: string | null } | null;
  assignedTo: { name: string | null } | null;
};

export function leadTemplateVariables(
  lead: TemplateLead,
  context: { senderName?: string | null } = {},
): TemplateVariables {
  const displayName = lead.name.trim();
  const parts = displayName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
    fullName: displayName,
    businessName: lead.type === 'business' ? displayName : '',
    email: lead.email ?? '',
    phone: lead.mobile ?? lead.phone ?? '',
    city: lead.address?.city ?? '',
    assignedUserName: lead.assignedTo?.name ?? '',
    senderName: context.senderName ?? '',
    // country/category/rating/companyName are not in the mobile lead view: left empty so
    // a template that needs them is blocked instead of rendered with a guess.
  };
}

export type RenderResult = {
  text: string;
  /** Allowed variables with no value (the template cannot be sent as-is). */
  missing: string[];
  /** Tokens outside the allowlist. */
  unsupported: string[];
  ok: boolean;
};

export function renderTemplate(
  template: string,
  variables: TemplateVariables,
  fallbacks: Record<string, string> = {},
): RenderResult {
  const missing = new Set<string>();
  const unsupported = new Set<string>();
  const text = template.replace(VARIABLE_PATTERN, (token, key: string) => {
    if (!ALLOWED.has(key)) {
      unsupported.add(key);
      return token;
    }
    const value = variables[key as TemplateVariable]?.trim() || fallbacks[key]?.trim() || '';
    if (!value) {
      missing.add(key);
      return token;
    }
    return value;
  });
  return {
    text,
    missing: [...missing],
    unsupported: [...unsupported],
    ok: missing.size === 0 && unsupported.size === 0,
  };
}

/** Any `{{…}}` left in free text the user typed (e.g. pasted from a template). */
export function findUnresolvedTokens(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE_PATTERN)].map((match) => match[1] ?? ''))].filter(Boolean);
}
