import { z } from 'zod';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';
import type {
  Lead,
  LeadAddress,
  LeadCreateInput,
  LeadPatch,
  LeadStatus,
  LeadType,
} from '../types/lead-types';
import type { TranslateFn } from './lead-ui-kit';
import { toSafeWebUrl } from './lead-ui-utils';
import { isValidLeadEmail, isValidLeadPhone } from './lead-contact-validation';

/**
 * Form model for creating / editing a lead (LEAD_GENERATION_DESIGN.md §4.3).
 *
 * Every field is a string so it binds straight onto an <input>; an empty string
 * means "not set". The mapping to the API payload lives in the builders below.
 *
 * Constraints mirror the server's Joi schema (lead.validation.js) so people see
 * the problem next to the field instead of as a failed request.
 */
export type LeadFormValues = {
  name: string;
  type: LeadType;
  status: LeadStatus;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  street: string;
  addressSupplement: string;
  postalCode: string;
  city: string;
  canton: string;
  country: string;
  assignedTo: string;
  notes: string;
  tagsText: string;
};

export const BLANK_LEAD_FORM_VALUES: LeadFormValues = {
  name: '',
  type: 'business',
  status: 'new',
  phone: '',
  mobile: '',
  email: '',
  website: '',
  street: '',
  addressSupplement: '',
  postalCode: '',
  city: '',
  canton: '',
  country: 'CH',
  assignedTo: '',
  notes: '',
  tagsText: '',
};

// Same patterns as the server (crm.constants.js).
const SWISS_POSTAL_CODE_PATTERN = /^[1-9]\d{3}$/;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;

const CANTON_CODES: readonly string[] = CH_CANTONS.map((canton: { code: string }) => canton.code);

export const MAX_TAG_LENGTH = 50;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/** "vip, zurich ,VIP" → ['vip', 'zurich'] (trimmed, de-duplicated, order kept). */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const tag = part.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** A bare domain becomes https://domain; existing http(s) URLs are untouched. */
export function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const normalizeCountry = (value: string): string => {
  const trimmed = value.trim().toUpperCase();
  return trimmed || 'CH';
};

const emptyToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

// ── Validation ───────────────────────────────────────────────────────────────

export function createLeadFormSchema(t: TranslateFn) {
  const tooLong = (max: number) => t('leads.form.error.tooLong', 'Maximum {max} characters', { max });
  const phoneMessage = t('leads.form.error.phone', 'Enter a valid phone number, e.g. +41 44 123 45 67');

  const phone = z
    .string()
    .trim()
    .max(50, tooLong(50))
    .refine(isValidLeadPhone, phoneMessage);

  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t('leads.form.error.nameRequired', 'Name is required'))
        .max(255, tooLong(255)),
      type: z.enum(['business', 'private']),
      status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted']),
      phone,
      mobile: phone,
      email: z
        .string()
        .trim()
        .max(255, tooLong(255))
        .refine(
          isValidLeadEmail,
          t('leads.form.error.email', 'Enter a valid email address'),
        ),
      website: z
        .string()
        .trim()
        .max(500, tooLong(500))
        .refine(
          (value) => value === '' || toSafeWebUrl(normalizeWebsite(value)) !== null,
          t('leads.form.error.website', 'Enter a valid web address, e.g. https://example.ch'),
        ),
      street: z.string().trim().max(255, tooLong(255)),
      addressSupplement: z.string().trim().max(255, tooLong(255)),
      postalCode: z.string().trim().max(20, tooLong(20)),
      city: z.string().trim().max(120, tooLong(120)),
      canton: z
        .string()
        .trim()
        .refine(
          (value) => value === '' || CANTON_CODES.includes(value.toUpperCase()),
          t('leads.form.error.canton', 'Choose a valid canton'),
        ),
      country: z
        .string()
        .trim()
        .refine(
          (value) => value === '' || COUNTRY_PATTERN.test(value),
          t('leads.form.error.country', 'Use a 2-letter country code, e.g. CH'),
        ),
      assignedTo: z.string(),
      notes: z.string().max(5000, tooLong(5000)),
      tagsText: z
        .string()
        .max(1000, tooLong(1000))
        .refine(
          (value) => parseTags(value).every((tag) => tag.length <= MAX_TAG_LENGTH),
          t('leads.form.error.tagLength', 'Each tag may have at most {max} characters', {
            max: MAX_TAG_LENGTH,
          }),
        ),
    })
    .superRefine((values, context) => {
      const country = normalizeCountry(values.country);
      if (values.postalCode && country === 'CH' && !SWISS_POSTAL_CODE_PATTERN.test(values.postalCode)) {
        context.addIssue({
          code: 'custom',
          path: ['postalCode'],
          message: t('leads.form.error.postalCode', 'Swiss postal codes have exactly 4 digits'),
        });
      }
    });
}

// ── Lead ⇄ form ──────────────────────────────────────────────────────────────

export function leadToFormValues(lead: Lead | null | undefined): LeadFormValues {
  if (!lead) return { ...BLANK_LEAD_FORM_VALUES };
  return {
    name: lead.name,
    type: lead.type,
    status: lead.status,
    phone: lead.phone ?? '',
    mobile: lead.mobile ?? '',
    email: lead.email ?? '',
    website: lead.website ?? '',
    street: lead.address.street ?? '',
    addressSupplement: lead.address.addressSupplement ?? '',
    postalCode: lead.address.postalCode ?? '',
    city: lead.address.city ?? '',
    canton: lead.address.canton ?? '',
    country: lead.address.country || 'CH',
    assignedTo: lead.assignedTo ?? '',
    notes: lead.notes ?? '',
    tagsText: lead.tags.join(', '),
  };
}

/** Payload for POST /crm/leads. Unset fields are omitted rather than sent blank. */
export function buildLeadCreateInput(values: LeadFormValues): LeadCreateInput {
  const input: LeadCreateInput = {
    name: values.name.trim(),
    type: values.type,
    status: values.status,
    source: 'manual',
  };

  const phone = emptyToNull(values.phone);
  if (phone) input.phone = phone;
  const mobile = emptyToNull(values.mobile);
  if (mobile) input.mobile = mobile;
  const email = emptyToNull(values.email);
  if (email) input.email = email;
  const website = emptyToNull(normalizeWebsite(values.website));
  if (website) input.website = website;

  const address: Partial<LeadAddress> = { country: normalizeCountry(values.country) };
  const street = emptyToNull(values.street);
  if (street) address.street = street;
  const supplement = emptyToNull(values.addressSupplement);
  if (supplement) address.addressSupplement = supplement;
  const postalCode = emptyToNull(values.postalCode);
  if (postalCode) address.postalCode = postalCode;
  const city = emptyToNull(values.city);
  if (city) address.city = city;
  const canton = emptyToNull(values.canton);
  if (canton) address.canton = canton.toUpperCase();
  input.address = address;

  if (values.assignedTo) input.assignedTo = values.assignedTo;
  const notes = emptyToNull(values.notes);
  if (notes) input.notes = notes;
  const tags = parseTags(values.tagsText);
  if (tags.length > 0) input.tags = tags;

  return input;
}

const sameText = (a: string, b: string): boolean => a.trim() === b.trim();

/**
 * Payload for PATCH /crm/leads/:id — only what changed, so a stale legacy value
 * in an untouched field is never re-sent (and re-validated) by an unrelated
 * edit. A cleared field is sent as null so the server really clears it.
 *
 * When any address field changes the whole address is sent: it is one logical
 * unit, and that is correct whether the server merges or replaces it.
 */
export function buildLeadPatch(initial: LeadFormValues, next: LeadFormValues): LeadPatch {
  const patch: LeadPatch = {};

  if (!sameText(initial.name, next.name)) patch.name = next.name.trim();
  if (initial.type !== next.type) patch.type = next.type;
  if (initial.status !== next.status) patch.status = next.status;
  if (!sameText(initial.phone, next.phone)) patch.phone = emptyToNull(next.phone);
  if (!sameText(initial.mobile, next.mobile)) patch.mobile = emptyToNull(next.mobile);
  if (!sameText(initial.email, next.email)) patch.email = emptyToNull(next.email);
  if (!sameText(initial.website, next.website)) patch.website = emptyToNull(normalizeWebsite(next.website));

  const addressChanged =
    !sameText(initial.street, next.street) ||
    !sameText(initial.addressSupplement, next.addressSupplement) ||
    !sameText(initial.postalCode, next.postalCode) ||
    !sameText(initial.city, next.city) ||
    !sameText(initial.canton, next.canton) ||
    normalizeCountry(initial.country) !== normalizeCountry(next.country);
  if (addressChanged) {
    const canton = emptyToNull(next.canton);
    patch.address = {
      street: emptyToNull(next.street),
      addressSupplement: emptyToNull(next.addressSupplement),
      postalCode: emptyToNull(next.postalCode),
      city: emptyToNull(next.city),
      canton: canton ? canton.toUpperCase() : null,
      country: normalizeCountry(next.country),
    };
  }

  if (initial.assignedTo !== next.assignedTo) patch.assignedTo = next.assignedTo || null;
  if (!sameText(initial.notes, next.notes)) patch.notes = emptyToNull(next.notes);

  const initialTags = parseTags(initial.tagsText);
  const nextTags = parseTags(next.tagsText);
  if (initialTags.length !== nextTags.length || initialTags.some((tag, index) => tag !== nextTags[index])) {
    patch.tags = nextTags;
  }

  return patch;
}

export const isEmptyPatch = (patch: LeadPatch): boolean => Object.keys(patch).length === 0;
