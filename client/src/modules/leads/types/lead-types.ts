// Frontend-facing types for the Leads CRM entity.
// Mirrors LEAD_GENERATION_DESIGN.md §4.3 (lead model) and §11 (API contract).

export type GeoPoint = { lat: number; lng: number };

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted';

export type LeadType = 'business' | 'private';

export type LeadSource = 'google_places' | 'manual' | 'widget' | 'import';

export type LeadAddress = {
  street: string | null;
  addressSupplement: string | null;
  postalCode: string | null;
  city: string | null;
  canton: string | null;
  country: string;
};

export type LeadProviderMeta = {
  rating: number | null;
  reviewCount: number | null;
  // Google Places (New) returns a string enum (e.g. 'PRICE_LEVEL_MODERATE');
  // the legacy API / imports may send a 0–4 number. Accept either.
  priceLevel: number | string | null;
};

export type LeadDiscoveryLocation = {
  name: string | null;
  placeId: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  formattedAddress: string | null;
  center: GeoPoint | null;
};

export type LeadDiscoveryArea = {
  type: string | null;
  radiusMeters: number | null;
  areaSqKm: number | null;
  bounds: { north: number; south: number; east: number; west: number } | null;
  geometry: { type: 'Polygon'; coordinates: number[][][] } | null;
};

export type LeadDiscoverySearchCoordinates = {
  cellId: string | null;
  depth: number | null;
  center: GeoPoint | null;
  radiusMeters: number | null;
  bounds: { north: number; south: number; east: number; west: number } | null;
};

export type LeadSourceMetadata = {
  googlePlaceId: string | null;
  discoverySessionId: string | null;
  discoveryResultId: string | null;
  businessType: string | null;
  keyword: string | null;
  discoveryLocation?: LeadDiscoveryLocation | null;
  discoveryArea?: LeadDiscoveryArea | null;
  discoverySearchCoordinates?: LeadDiscoverySearchCoordinates | null;
  discoveryBusinessTypes?: Array<{ id: string; name: string | null }>;
  discoveredAt: string | null;
};

/**
 * A user as the API embeds one in a lead: populated (name fields) when the
 * server resolved the reference, otherwise nothing but the id.
 */
export type LeadUserRef = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

/**
 * Website-scraped social profile links. Each platform is a URL string or null;
 * the server fills these from the lead's website during enrichment.
 */
export type LeadSocial = {
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
  twitter: string | null;
  youtube: string | null;
  tiktok: string | null;
};

export type LeadEnrichmentStatus = 'none' | 'pending' | 'running' | 'done' | 'failed';

/** Status + last results of the website-enrichment job for a single lead. */
export type LeadEnrichment = {
  status: LeadEnrichmentStatus;
  enrichedAt: string | null;
  source: string | null;
  foundEmails: string[];
  foundPhones: string[];
  error: string | null;
};

export type Lead = {
  id: string;
  leadNumber: string | null;
  name: string;
  normalizedName: string | null;
  type: LeadType;
  status: LeadStatus;
  address: LeadAddress;
  phone: string | null;
  mobile: string | null;
  normalizedPhone: string | null;
  email: string | null;
  website: string | null;
  websiteDomain: string | null;
  location: GeoPoint | null;
  providerMeta: LeadProviderMeta;
  source: LeadSource;
  sourceMetadata: LeadSourceMetadata;
  assignedTo: string | null;
  notes: string | null;
  tags: string[];
  convertedCustomerId: string | null;
  convertedAt: string | null;
  /**
   * Who created the lead: provenance, never edited. The API populates the user;
   * a response that was not populated carries the bare id, and a lead whose
   * creator is unknown carries null.
   */
  createdBy: LeadUserRef | string | null;
  createdAt: string;
  updatedAt: string;
  /** Website-scraped social profile links (any field may be null). Absent on leads not yet seen since enrichment shipped. */
  social?: LeadSocial;
  /** Status + results of the website enrichment for this lead. */
  enrichment?: LeadEnrichment;
};

export type LeadFilters = {
  status?: LeadStatus;
  assignedTo?: string;
  source?: LeadSource;
  type?: LeadType;
  city?: string;
  q?: string;
};

export type LeadPlaceFilterOption = {
  city: string;
  cantons: string[];
  count: number;
};

export type LeadTypeFilterOption = {
  value: LeadType;
  count: number;
};

export type LeadFilterOptions = {
  places: LeadPlaceFilterOption[];
  types: LeadTypeFilterOption[];
};

export type LeadListParams = LeadFilters & {
  cursor?: string | null;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export type CursorPage<T> = {
  data: T[];
  pagination: {
    hasNext: boolean;
    nextCursor: string | null;
    limit: number;
    /** Total rows matching the current filter (for an honest "page X of Y"). */
    total?: number;
  };
};

export type LeadPage = CursorPage<Lead>;

/** Filters the map view accepts — the list filters minus cursor pagination. */
export type LeadMapParams = Pick<LeadFilters, 'status' | 'assignedTo' | 'source' | 'type' | 'city' | 'q'> & {
  limit?: number;
};

/**
 * Response of `GET /crm/leads/map`: the whole filtered lead set (located leads
 * first), with honest located/unlocated counts for the map stats panel.
 * `limited` is true when the set was truncated at the server's hard cap.
 */
export type LeadMapResponse = {
  leads: Lead[];
  total: number;
  withLocation: number;
  withoutLocation: number;
  limited: boolean;
};

/** Why a geocode attempt did not place the lead (null when it succeeded). */
export type LeadGeocodeReason = 'no_address' | 'not_found' | 'provider_error';

/**
 * Result of `POST /crm/leads/:id/geocode`. Honest + non-destructive: `geocoded`
 * is false (with a `reason`) when the address could not be placed, and the lead
 * is returned unchanged — a location is never invented.
 */
export type LeadGeocodeResult = {
  lead: Lead;
  geocoded: boolean;
  reason: LeadGeocodeReason | null;
  formattedAddress: string | null;
};

export type LeadCreateInput = {
  name: string;
  type?: LeadType;
  status?: LeadStatus;
  address?: Partial<LeadAddress>;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  location?: GeoPoint;
  assignedTo?: string;
  notes?: string;
  tags?: string[];
  source?: LeadSource;
};

export type LeadPatch = Partial<
  Pick<
    Lead,
    'name' | 'type' | 'status' | 'phone' | 'mobile' | 'email' | 'website' | 'notes' | 'tags' | 'assignedTo'
  >
> & {
  address?: Partial<LeadAddress>;
};

export type LeadConvertInput = {
  assignedTo?: string;
  note?: string;
};

export type LeadConversionResult = {
  lead: Lead | null;
  customerId: string | null;
};

export type LeadDuplicateEntityType = 'lead' | 'customer';

export type LeadDuplicate = {
  id: string;
  entityType: LeadDuplicateEntityType;
  name: string | null;
  phone: string | null;
  website: string | null;
  placeId: string | null;
  matchedBy: string[];
  confidence: number | null;
};

export type LeadDuplicateParams = {
  name?: string;
  phone?: string;
  website?: string;
  placeId?: string;
};

// ── Contact log (single-lead communication history) ──────────────────────────

/** Channels a contact-log entry can record. `email` entries live in the e-mail
 * history instead, but the type accepts it for forward-compatibility. */
export type LeadContactChannel = 'whatsapp' | 'phone' | 'manual' | 'email';

export type LeadContactLogEntry = {
  id: string;
  channel: LeadContactChannel;
  subject: string | null;
  note: string | null;
  createdBy: LeadUserRef | string | null;
  createdAt: string | null;
};

/** Result of logging an outbound WhatsApp intent (POST …/whatsapp). */
export type LeadWhatsAppLogResult = {
  /** E.164 digits without the leading `+`, as the server resolved it. */
  waNumber: string | null;
  logged: boolean;
};

// ── Website enrichment ────────────────────────────────────────────────────────

/** What the scraper reported for a lead — not necessarily applied to it. */
export type LeadEnrichFound = {
  emails: string[];
  phones: string[];
  social: Partial<LeadSocial>;
};

/**
 * Which previously-missing fields the server actually filled from `found`.
 * Enrichment only fills blanks server-side, so this is the honest "what changed".
 */
export type LeadEnrichApplied = {
  email?: string | null;
  phones?: string[];
  socials?: string[];
};

/**
 * Pre-computed, honest tallies for the UI summary. `appliedCount` is the number
 * of fields the server actually filled, so the UI never over-claims.
 */
export type LeadEnrichSummary = {
  emails: number;
  phones: number;
  socials: number;
  appliedCount: number;
};

/** Result of `POST /crm/leads/:id/enrich` (synchronous). */
export type LeadEnrichResult = {
  lead: Lead;
  found: LeadEnrichFound;
  applied: LeadEnrichApplied;
  summary: LeadEnrichSummary;
};

export type LeadEnrichJobCounts = {
  total: number;
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
};

export type LeadEnrichJobStatus = 'queued' | 'pending' | 'running' | 'done' | 'failed';

/** Result of `GET /crm/leads/enrich-jobs/:jobId`. */
export type LeadEnrichJob = {
  status: LeadEnrichJobStatus;
  counts: LeadEnrichJobCounts;
};

/** Result of `POST /crm/leads/enrich-bulk` (202). */
export type LeadEnrichBulkResult = {
  jobId: string;
};
