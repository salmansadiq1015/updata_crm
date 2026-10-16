// Form model for creating / editing a lead from the app. Mirrors the server's
// Joi rules (server/src/modules/crm/lead.validation.js createLead/updateLead)
// so problems show next to the field instead of as a failed request, and the
// web CRM's lead-form-schema.ts for the payload mapping.
import type { TFunction } from 'i18next';
import { z } from 'zod';

import { LEAD_TYPES, type Lead } from '../types';
import { isValidLeadPhone, PHONE_MAX_LENGTH } from './phoneNumber';

export type LeadFormValues = {
  name: string;
  type: (typeof LEAD_TYPES)[number];
  phone: string;
  mobile: string;
  email: string;
  website: string;
  street: string;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2; empty means "not set" (the server never invents one). */
  country: string;
  /** Comma-separated in the form; an array in the API. */
  tagsText: string;
  notes: string;
  assignToMe: boolean;
};

export const LEAD_FORM_FIELDS = [
  'name',
  'type',
  'phone',
  'mobile',
  'email',
  'website',
  'street',
  'postalCode',
  'city',
  'country',
  'tagsText',
  'notes',
] as const satisfies readonly (keyof LeadFormValues)[];

/** Server validation detail field → form field (`address.city` → `city`, `tags.0` → `tagsText`). */
export function formFieldForServerField(field: string): keyof LeadFormValues | null {
  if (field.startsWith('address.')) {
    const part = field.slice('address.'.length);
    return part === 'street' || part === 'postalCode' || part === 'city' || part === 'country' ? part : null;
  }
  if (field === 'tags' || field.startsWith('tags.')) return 'tagsText';
  if (field === 'assignedTo') return 'assignToMe';
  return (LEAD_FORM_FIELDS as readonly string[]).includes(field) ? (field as keyof LeadFormValues) : null;
}

export const MAX_TAG_LENGTH = 50;
// Same as server crm.constants.js SWISS_POSTAL_CODE_PATTERN.
const SWISS_POSTAL_CODE = /^[1-9]\d{3}$/;
const COUNTRY_CODE = /^[A-Za-z]{2}$/;
// Joi's email() requires a dotted domain; this is the web CRM's check.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "vip, zurich ,VIP" → ['vip', 'zurich'] (trimmed, de-duplicated case-insensitively, order kept). */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const tag = part.trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}

/** A bare domain becomes https://domain (as on the web); http(s) URLs are untouched. */
export function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isHttpUrl(value: string): boolean {
  // Joi uri({ scheme: http/https }): a scheme, a host and no whitespace.
  return (
    /^https?:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i.test(value) ||
    /^https?:\/\/localhost(?::\d+)?(?:[/?#]\S*)?$/i.test(value)
  );
}

const emptyToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const countryOf = (value: string): string => value.trim().toUpperCase();

export function createLeadFormSchema(t: TFunction) {
  const tooLong = (max: number) => t('leadForm.errors.tooLong', { max });
  const phone = z
    .string()
    .trim()
    .max(PHONE_MAX_LENGTH, tooLong(PHONE_MAX_LENGTH))
    .refine(isValidLeadPhone, t('leadForm.errors.phone'));

  return z
    .object({
      name: z.string().trim().min(1, t('leadForm.errors.nameRequired')).max(255, tooLong(255)),
      type: z.enum(LEAD_TYPES),
      phone,
      mobile: phone,
      email: z
        .string()
        .trim()
        .max(255, tooLong(255))
        .refine((value) => value === '' || EMAIL.test(value), t('leadForm.errors.email')),
      website: z
        .string()
        .trim()
        .max(500, tooLong(500))
        .refine((value) => value === '' || isHttpUrl(normalizeWebsite(value)), t('leadForm.errors.website')),
      street: z.string().trim().max(255, tooLong(255)),
      postalCode: z.string().trim().max(20, tooLong(20)),
      city: z.string().trim().max(120, tooLong(120)),
      country: z
        .string()
        .trim()
        .refine((value) => value === '' || COUNTRY_CODE.test(value), t('leadForm.errors.country')),
      tagsText: z
        .string()
        .refine(
          (value) => parseTags(value).every((tag) => tag.length <= MAX_TAG_LENGTH),
          t('leadForm.errors.tagLength', { max: MAX_TAG_LENGTH }),
        ),
      notes: z.string().max(5000, tooLong(5000)),
      assignToMe: z.boolean(),
    })
    .superRefine((values, context) => {
      // Server: Swiss leads keep the strict 4-digit postal code; others any ≤ 20 chars.
      const postalCode = values.postalCode.trim();
      if (postalCode && countryOf(values.country) === 'CH' && !SWISS_POSTAL_CODE.test(postalCode)) {
        context.addIssue({ code: 'custom', path: ['postalCode'], message: t('leadForm.errors.postalCode') });
      }
    });
}

export const BLANK_LEAD_FORM: LeadFormValues = {
  name: '',
  type: 'business',
  phone: '',
  mobile: '',
  email: '',
  website: '',
  street: '',
  postalCode: '',
  city: '',
  // Preselected like the web form; the user can clear it.
  country: 'CH',
  tagsText: '',
  notes: '',
  assignToMe: true,
};

export function leadToFormValues(lead: Lead, myUserId: string | null): LeadFormValues {
  return {
    name: lead.name,
    type: lead.type,
    phone: lead.phone ?? '',
    mobile: lead.mobile ?? '',
    email: lead.email ?? '',
    website: lead.website ?? '',
    street: lead.address?.street ?? '',
    postalCode: lead.address?.postalCode ?? '',
    city: lead.address?.city ?? '',
    country: lead.address?.country ?? '',
    tagsText: lead.tags.join(', '),
    notes: lead.notes ?? '',
    assignToMe: Boolean(myUserId && lead.assignedTo?.id === myUserId),
  };
}

export type LeadAddressInput = {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

export type LeadCreateInput = {
  name: string;
  type: LeadFormValues['type'];
  source: 'manual';
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  address?: LeadAddressInput;
  tags?: string[];
  notes?: string;
  assignedTo?: string;
};

export type LeadPatch = {
  name?: string;
  type?: LeadFormValues['type'];
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  address?: LeadAddressInput;
  tags?: string[];
  notes?: string | null;
  assignedTo?: string | null;
};

/** POST /crm/leads body. Unset fields are omitted rather than sent blank. */
export function buildLeadCreateInput(values: LeadFormValues, myUserId: string | null): LeadCreateInput {
  const input: LeadCreateInput = { name: values.name.trim(), type: values.type, source: 'manual' };
  const phone = emptyToNull(values.phone);
  if (phone) input.phone = phone;
  const mobile = emptyToNull(values.mobile);
  if (mobile) input.mobile = mobile;
  const email = emptyToNull(values.email);
  if (email) input.email = email;
  const website = emptyToNull(normalizeWebsite(values.website));
  if (website) input.website = website;

  const address: LeadAddressInput = {};
  const street = emptyToNull(values.street);
  if (street) address.street = street;
  const postalCode = emptyToNull(values.postalCode);
  if (postalCode) address.postalCode = postalCode;
  const city = emptyToNull(values.city);
  if (city) address.city = city;
  const country = emptyToNull(countryOf(values.country));
  if (country) address.country = country;
  if (Object.keys(address).length > 0) input.address = address;

  const tags = parseTags(values.tagsText);
  if (tags.length > 0) input.tags = tags;
  const notes = emptyToNull(values.notes);
  if (notes) input.notes = notes;
  if (values.assignToMe && myUserId) input.assignedTo = myUserId;
  return input;
}

const same = (a: string, b: string) => a.trim() === b.trim();

/**
 * PATCH /crm/leads/:id body — only what changed, so an untouched legacy value
 * is never re-sent (and re-validated). A cleared field is sent as null. Any
 * address change sends the whole address (the server merges it).
 */
export function buildLeadPatch(
  initial: LeadFormValues,
  next: LeadFormValues,
  myUserId: string | null,
): LeadPatch {
  const patch: LeadPatch = {};
  if (!same(initial.name, next.name)) patch.name = next.name.trim();
  if (initial.type !== next.type) patch.type = next.type;
  if (!same(initial.phone, next.phone)) patch.phone = emptyToNull(next.phone);
  if (!same(initial.mobile, next.mobile)) patch.mobile = emptyToNull(next.mobile);
  if (!same(initial.email, next.email)) patch.email = emptyToNull(next.email);
  if (!same(initial.website, next.website)) patch.website = emptyToNull(normalizeWebsite(next.website));

  const addressChanged =
    !same(initial.street, next.street) ||
    !same(initial.postalCode, next.postalCode) ||
    !same(initial.city, next.city) ||
    countryOf(initial.country) !== countryOf(next.country);
  if (addressChanged) {
    patch.address = {
      street: emptyToNull(next.street),
      postalCode: emptyToNull(next.postalCode),
      city: emptyToNull(next.city),
      country: emptyToNull(countryOf(next.country)),
    };
  }

  const initialTags = parseTags(initial.tagsText);
  const nextTags = parseTags(next.tagsText);
  if (initialTags.length !== nextTags.length || initialTags.some((tag, index) => tag !== nextTags[index])) {
    patch.tags = nextTags;
  }
  if (!same(initial.notes, next.notes)) patch.notes = emptyToNull(next.notes);
  // Toggling "assign to me" off only unassigns a lead that was assigned to me.
  if (initial.assignToMe !== next.assignToMe) patch.assignedTo = next.assignToMe ? myUserId : null;
  return patch;
}

export const isEmptyPatch = (patch: LeadPatch): boolean => Object.keys(patch).length === 0;
