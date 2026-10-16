// Mobile view of the CRM Lead (server/src/modules/crm/lead.model.js; web types in
// client/src/modules/leads/types/lead-types.ts). Parsing is tolerant like the web's
// lead-schemas.ts: unknown extra fields are ignored, absent ones become null.
import { z } from 'zod';

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_TYPES = ['business', 'private'] as const;
export const LEAD_SOURCES = ['google_places', 'manual', 'widget', 'import'] as const;
export const LEAD_CONTACT_CHANNELS = ['email', 'whatsapp', 'phone', 'sms'] as const;

/** Sort fields the CRM's list endpoint accepts (server lead.validation.js listLeads). */
export const LEAD_SORT_FIELDS = ['createdAt', 'name', 'status'] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

/** Statuses a user may set from the app. `converted` is set only by the CRM's convert flow. */
export const ASSIGNABLE_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified'] as const;
export type AssignableLeadStatus = (typeof ASSIGNABLE_LEAD_STATUSES)[number];

const nullableString = z
  .string()
  .nullish()
  .transform((value) => (value && value.trim() ? value : null));

const userRefSchema = z
  .union([
    z.object({
      _id: z.string().optional(),
      id: z.string().optional(),
      firstName: z.string().nullish(),
      lastName: z.string().nullish(),
      email: z.string().nullish(),
    }),
    z.string(),
  ])
  .nullish()
  .transform((ref) => {
    if (!ref) return null;
    if (typeof ref === 'string') return { id: ref, name: null };
    const name = [ref.firstName, ref.lastName].filter(Boolean).join(' ').trim();
    return { id: ref.id ?? ref._id ?? '', name: name || ref.email || null };
  });

const addressSchema = z
  .object({
    street: nullableString,
    postalCode: nullableString,
    city: nullableString,
    country: nullableString,
    formatted: nullableString,
  })
  .nullish()
  .transform((address) => {
    if (!address) return null;
    const composed = [address.street, [address.postalCode, address.city].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ');
    const text = address.formatted ?? (composed || null);
    return text ? { text, city: address.city } : null;
  });

export const leadSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    leadNumber: nullableString,
    name: z.string(),
    type: z.enum(LEAD_TYPES).catch('business'),
    status: z.enum(LEAD_STATUSES).catch('new'),
    source: z.enum(LEAD_SOURCES).nullish().catch(null),
    address: addressSchema,
    phone: nullableString,
    mobile: nullableString,
    email: nullableString,
    website: nullableString,
    providerMeta: z.object({ mapsUrl: nullableString }).nullish().catch(null),
    assignedTo: userRefSchema,
    notes: nullableString,
    tags: z.array(z.string()).nullish().catch([]),
    lastContactedAt: nullableString,
    lastContactChannel: z.enum(LEAD_CONTACT_CHANNELS).nullish().catch(null),
    createdAt: nullableString,
  })
  .transform((raw, ctx) => {
    const id = raw.id ?? raw._id;
    if (!id) {
      ctx.addIssue({ code: 'custom', message: 'Lead has no id' });
      return z.NEVER;
    }
    return {
      id,
      leadNumber: raw.leadNumber,
      name: raw.name,
      type: raw.type,
      status: raw.status,
      source: raw.source ?? null,
      address: raw.address,
      phone: raw.phone,
      mobile: raw.mobile,
      email: raw.email,
      website: raw.website,
      mapsUrl: raw.providerMeta?.mapsUrl ?? null,
      assignedTo: raw.assignedTo,
      notes: raw.notes,
      tags: raw.tags ?? [],
      lastContactedAt: raw.lastContactedAt,
      lastContactChannel: raw.lastContactChannel ?? null,
      createdAt: raw.createdAt,
    };
  });

export type Lead = z.infer<typeof leadSchema>;

/**
 * Same parameters and semantics as the web CRM's lead list (lead-list-view.tsx →
 * buildLeadFilterParams): server-side search and filters, never a filter over loaded pages.
 */
export type LeadListFilters = {
  q?: string;
  status?: LeadStatus;
  source?: (typeof LEAD_SOURCES)[number];
  type?: (typeof LEAD_TYPES)[number];
  /** A user id; the web's "Mine" filter sends the signed-in user's id. */
  assignedTo?: string;
  sortBy?: LeadSortField;
  sortOrder?: SortOrder;
};
