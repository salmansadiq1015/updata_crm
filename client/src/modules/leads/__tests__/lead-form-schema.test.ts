import { describe, expect, it } from 'vitest';
import {
  BLANK_LEAD_FORM_VALUES,
  buildLeadCreateInput,
  buildLeadPatch,
  createLeadFormSchema,
  isEmptyPatch,
  leadToFormValues,
  normalizeWebsite,
  parseTags,
} from '../ui/lead-form-schema';
import type { LeadFormValues } from '../ui/lead-form-schema';
import { leadSchema } from '../schemas/lead-schemas';
import { makeLeadDTO } from './mocks/data';

// The schema only needs a translate function; echo the fallback.
const t = (_key: string, fallback?: string | null) => fallback ?? _key;
const schema = createLeadFormSchema(t);

const values = (overrides: Partial<LeadFormValues> = {}): LeadFormValues => ({
  ...BLANK_LEAD_FORM_VALUES,
  name: 'Muster GmbH',
  ...overrides,
});

const issuesFor = (input: LeadFormValues) => {
  const result = schema.safeParse(input);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
};

describe('lead form validation', () => {
  it('accepts a lead with nothing but a name', () => {
    expect(schema.safeParse(values()).success).toBe(true);
  });

  it('requires a name', () => {
    expect(issuesFor(values({ name: '   ' }))).toHaveProperty('name', 'Name is required');
  });

  it('rejects malformed contact data and accepts well-formed data', () => {
    const bad = issuesFor(values({ email: 'not-an-email', website: 'http://', phone: 'call me' }));
    expect(bad).toHaveProperty('email');
    expect(bad).toHaveProperty('website');
    expect(bad).toHaveProperty('phone');

    expect(
      schema.safeParse(values({ email: 'info@example.ch', website: 'example.ch', phone: '+41 44 123 45 67' })).success,
    ).toBe(true);
  });

  it('only insists on a 4-digit postal code for Swiss addresses', () => {
    expect(issuesFor(values({ postalCode: '80010', country: 'CH' }))).toHaveProperty('postalCode');
    expect(issuesFor(values({ postalCode: '800', country: '' }))).toHaveProperty('postalCode');
    expect(schema.safeParse(values({ postalCode: '8001', country: 'CH' })).success).toBe(true);
    expect(schema.safeParse(values({ postalCode: '78462', country: 'DE' })).success).toBe(true);
  });

  it('rejects an unknown canton and an over-long tag', () => {
    expect(issuesFor(values({ canton: 'XX' }))).toHaveProperty('canton');
    expect(schema.safeParse(values({ canton: 'zh' })).success).toBe(true);
    expect(issuesFor(values({ tagsText: `ok, ${'x'.repeat(51)}` }))).toHaveProperty('tagsText');
  });
});

describe('form helpers', () => {
  it('parses tags: trimmed, de-duplicated case-insensitively, order kept', () => {
    expect(parseTags(' vip, Zurich ,VIP;\nfollow-up,, ')).toEqual(['vip', 'Zurich', 'follow-up']);
    expect(parseTags('')).toEqual([]);
  });

  it('adds https:// to a bare domain and leaves existing schemes alone', () => {
    expect(normalizeWebsite('example.ch')).toBe('https://example.ch');
    expect(normalizeWebsite(' http://example.ch ')).toBe('http://example.ch');
    expect(normalizeWebsite('')).toBe('');
  });
});

describe('buildLeadCreateInput', () => {
  it('sends a minimal manual lead without blank fields', () => {
    expect(buildLeadCreateInput(values())).toEqual({
      name: 'Muster GmbH',
      type: 'business',
      status: 'new',
      source: 'manual',
      address: { country: 'CH' },
    });
  });

  it('maps every filled field', () => {
    const input = buildLeadCreateInput(
      values({
        name: '  Muster GmbH ',
        type: 'private',
        phone: '+41 44 123 45 67',
        email: 'info@example.ch',
        website: 'example.ch',
        street: 'Bahnhofstrasse 1',
        postalCode: '8001',
        city: 'Zürich',
        canton: 'zh',
        country: 'ch',
        assignedTo: 'u1',
        notes: ' hello ',
        tagsText: 'vip, vip, b2b',
      }),
    );
    expect(input).toMatchObject({
      name: 'Muster GmbH',
      type: 'private',
      phone: '+41 44 123 45 67',
      email: 'info@example.ch',
      website: 'https://example.ch',
      address: { street: 'Bahnhofstrasse 1', postalCode: '8001', city: 'Zürich', canton: 'ZH', country: 'CH' },
      assignedTo: 'u1',
      notes: 'hello',
      tags: ['vip', 'b2b'],
    });
    expect(input).not.toHaveProperty('mobile');
  });
});

describe('buildLeadPatch', () => {
  const lead = leadSchema.parse(
    makeLeadDTO({
      id: 'lead-1',
      name: 'Muster GmbH',
      phone: '+41 44 123 45 67',
      email: 'info@example.ch',
      tags: ['vip'],
      notes: 'old note',
      assignedTo: 'u1',
    }),
  );
  const initial = leadToFormValues(lead);

  it('is empty when nothing changed', () => {
    expect(isEmptyPatch(buildLeadPatch(initial, { ...initial }))).toBe(true);
    // Whitespace-only edits are not changes.
    expect(isEmptyPatch(buildLeadPatch(initial, { ...initial, name: ' Muster GmbH ' }))).toBe(true);
  });

  it('contains only the fields that changed', () => {
    expect(buildLeadPatch(initial, { ...initial, name: 'Neue AG', status: 'qualified' })).toEqual({
      name: 'Neue AG',
      status: 'qualified',
    });
  });

  it('sends null for a cleared field and for removing the assignee', () => {
    expect(buildLeadPatch(initial, { ...initial, email: '', notes: '', assignedTo: '' })).toEqual({
      email: null,
      notes: null,
      assignedTo: null,
    });
  });

  it('sends the whole address when one address field changes', () => {
    const patch = buildLeadPatch(initial, { ...initial, city: 'Bern', canton: 'be' });
    expect(Object.keys(patch)).toEqual(['address']);
    expect(patch.address).toEqual({
      street: 'Bahnhofstrasse 1',
      addressSupplement: null,
      postalCode: '8001',
      city: 'Bern',
      canton: 'BE',
      country: 'CH',
    });
  });

  it('replaces the tags only when they differ', () => {
    expect(isEmptyPatch(buildLeadPatch(initial, { ...initial, tagsText: ' VIP ' }))).toBe(false);
    expect(buildLeadPatch(initial, { ...initial, tagsText: 'vip, new' }).tags).toEqual(['vip', 'new']);
    expect(isEmptyPatch(buildLeadPatch(initial, { ...initial, tagsText: 'vip' }))).toBe(true);
  });
});
