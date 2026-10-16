import { i18next } from '@/i18n';

import type { Lead } from '../types';
import {
  BLANK_LEAD_FORM,
  buildLeadCreateInput,
  buildLeadPatch,
  createLeadFormSchema,
  formFieldForServerField,
  isEmptyPatch,
  leadToFormValues,
  parseTags,
  type LeadFormValues,
} from '../utils/leadForm';

const ME = '64b7f0c2a1b2c3d4e5f60001';
const schema = createLeadFormSchema(i18next.t);
const valid = (overrides: Partial<LeadFormValues> = {}) => ({
  ...BLANK_LEAD_FORM,
  name: 'Acme AG',
  ...overrides,
});
const errorsOf = (values: LeadFormValues) => {
  const result = schema.safeParse(values);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
};

const lead: Lead = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  leadNumber: 'L-0001',
  name: 'Acme AG',
  type: 'business',
  status: 'new',
  source: 'manual',
  address: {
    text: 'Bahnhofstrasse 1, 8001 Zürich',
    city: 'Zürich',
    street: 'Bahnhofstrasse 1',
    postalCode: '8001',
    country: 'CH',
  },
  phone: '+41 44 123 45 67',
  mobile: null,
  email: 'info@acme.ch',
  website: 'https://acme.ch',
  mapsUrl: null,
  assignedTo: { id: ME, name: 'Me' },
  notes: 'VIP',
  tags: ['vip', 'zurich'],
  lastContactedAt: null,
  lastContactChannel: null,
  createdAt: null,
};

describe('lead form schema (server createLead/updateLead parity)', () => {
  it('accepts a minimal lead: only the name is required', () => {
    expect(errorsOf(valid({ country: '' }))).toEqual({});
  });

  it('requires a name and caps it at 255', () => {
    expect(errorsOf(valid({ name: '   ' }))).toHaveProperty('name', 'Name is required');
    expect(errorsOf(valid({ name: 'x'.repeat(256) }))).toHaveProperty('name', 'At most 255 characters');
  });

  it('rejects local foreign phone formats the server rejects, accepts Swiss national', () => {
    expect(errorsOf(valid({ phone: '03054949624' }))).toHaveProperty('phone');
    expect(errorsOf(valid({ mobile: '03054949624' }))).toHaveProperty('mobile');
    expect(errorsOf(valid({ phone: '+92 3054949624', mobile: '044 123 45 67' }))).toEqual({});
  });

  it('validates email, website, country and tag length like the server', () => {
    expect(errorsOf(valid({ email: 'not-an-email' }))).toHaveProperty('email');
    expect(errorsOf(valid({ website: 'not a url' }))).toHaveProperty('website');
    expect(errorsOf(valid({ website: 'acme.ch' }))).toEqual({}); // https:// is added on save
    expect(errorsOf(valid({ country: 'CHE' }))).toHaveProperty('country');
    expect(errorsOf(valid({ tagsText: `ok, ${'t'.repeat(51)}` }))).toHaveProperty('tagsText');
    expect(errorsOf(valid({ notes: 'n'.repeat(5001) }))).toHaveProperty('notes');
  });

  it('enforces 4-digit postal codes only for Swiss addresses', () => {
    expect(errorsOf(valid({ country: 'CH', postalCode: '800' }))).toHaveProperty('postalCode');
    expect(errorsOf(valid({ country: 'ch', postalCode: '0800' }))).toHaveProperty('postalCode');
    expect(errorsOf(valid({ country: 'PK', postalCode: '54000' }))).toEqual({});
    expect(errorsOf(valid({ country: 'CH', postalCode: '8001' }))).toEqual({});
  });
});

describe('create payload', () => {
  it('sends source manual, omits blanks, never changes the typed phone', () => {
    const input = buildLeadCreateInput(
      valid({
        type: 'private',
        phone: ' 044 123 45 67 ',
        website: 'acme.ch',
        city: 'Zürich',
        country: 'ch',
        tagsText: 'vip, VIP , zurich',
        assignToMe: true,
      }),
      ME,
    );
    expect(input).toEqual({
      name: 'Acme AG',
      type: 'private',
      source: 'manual',
      phone: '044 123 45 67',
      website: 'https://acme.ch',
      address: { city: 'Zürich', country: 'CH' },
      tags: ['vip', 'zurich'],
      assignedTo: ME,
    });
  });

  it('leaves the lead unassigned and the address out when not set', () => {
    expect(buildLeadCreateInput(valid({ country: '', assignToMe: false }), ME)).toEqual({
      name: 'Acme AG',
      type: 'business',
      source: 'manual',
    });
  });
});

describe('edit payload (only changed fields)', () => {
  const initial = leadToFormValues(lead, ME);

  it('prefills from the lead', () => {
    expect(initial).toMatchObject({
      street: 'Bahnhofstrasse 1',
      postalCode: '8001',
      city: 'Zürich',
      country: 'CH',
      tagsText: 'vip, zurich',
      assignToMe: true,
    });
  });

  it('is empty when nothing changed (whitespace-only edits included)', () => {
    expect(isEmptyPatch(buildLeadPatch(initial, { ...initial, name: ' Acme AG ' }, ME))).toBe(true);
  });

  it('sends only what changed; a cleared field is null', () => {
    expect(buildLeadPatch(initial, { ...initial, mobile: '+92 3054949624', email: '' }, ME)).toEqual({
      mobile: '+92 3054949624',
      email: null,
    });
  });

  it('sends the whole address when one part changes', () => {
    expect(buildLeadPatch(initial, { ...initial, city: 'Bern', postalCode: '3011' }, ME)).toEqual({
      address: { street: 'Bahnhofstrasse 1', postalCode: '3011', city: 'Bern', country: 'CH' },
    });
  });

  it('handles tags and assignment', () => {
    expect(buildLeadPatch(initial, { ...initial, tagsText: 'zurich, vip' }, ME)).toEqual({
      tags: ['zurich', 'vip'],
    });
    expect(buildLeadPatch(initial, { ...initial, assignToMe: false }, ME)).toEqual({ assignedTo: null });
    const someoneElses = leadToFormValues({ ...lead, assignedTo: { id: 'other', name: 'Other' } }, ME);
    expect(someoneElses.assignToMe).toBe(false);
    expect(buildLeadPatch(someoneElses, { ...someoneElses, assignToMe: true }, ME)).toEqual({
      assignedTo: ME,
    });
  });
});

describe('helpers', () => {
  it('parseTags trims and de-duplicates case-insensitively', () => {
    expect(parseTags('a, b;A\n c ,,')).toEqual(['a', 'b', 'c']);
  });

  it('maps server validation fields to form fields', () => {
    expect(formFieldForServerField('address.postalCode')).toBe('postalCode');
    expect(formFieldForServerField('tags.1')).toBe('tagsText');
    expect(formFieldForServerField('phone')).toBe('phone');
    expect(formFieldForServerField('address.canton')).toBeNull();
    expect(formFieldForServerField('location')).toBeNull();
  });
});
