export type DiscoveryStatus =
  | 'idle'
  | 'starting'
  | 'discovering'
  | 'paused'
  | 'processing'
  | 'enriching'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type DiscoveryPhase =
  | 'SEARCH_INITIALIZED'
  | 'WAITING_FOR_RESULTS'
  | 'EXTRACTING'
  | 'PROCESSING'
  | 'CHECKING_FOR_MORE'
  | 'NEXT_RESULTS'
  | 'NO_MORE_RESULTS'
  | 'COMPLETED'
  | 'FAILED';

export type CrmLeadStatus = 'not-imported' | 'importing' | 'imported' | 'existing' | 'failed';

export type EmailConfidence = 'high' | 'medium' | 'low' | null;

export interface Lead {
  id: string;
  source: 'google-maps';
  sourceUrl: string;
  googleMapsUrl: string;
  placeIdentifier: string | null;
  businessName: string;
  category: string | null;
  categories: string[];
  phone: string | null;
  internationalPhone: string | null;
  website: string | null;
  emails: string[];
  address: string | null;
  street: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  distanceKm: number | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  openingHours: string[];
  priceLevel: string | null;
  emailSource: string | null;
  emailConfidence: EmailConfidence;
  enrichmentStatus: 'not-requested' | 'pending' | 'complete' | 'failed';
  discoveredAt: string;
  updatedAt: string;
  searchId: string;
  crmStatus?: CrmLeadStatus;
  crmLeadId?: string | null;
  crmLeadNumber?: string | null;
  crmError?: string | null;
}

export interface RawBusinessRecord {
  businessName: string;
  category?: string | null;
  categories?: string[];
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  street?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  businessStatus?: string | null;
  openingHours?: string[];
  priceLevel?: string | null;
  googleMapsUrl: string;
  placeIdentifier?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SearchRecord {
  id: string;
  businessType: string;
  location: string;
  radiusKm: number | null;
  query: string;
  startedAt: string;
  completedAt: string | null;
  status: DiscoveryStatus;
  discoveredCount: number;
  uniqueCount: number;
  exportedCount: number;
  tabId?: number;
  lastActivityAt?: string;
  currentPhase?: DiscoveryPhase;
  currentQuery?: string;
  currentPage?: number;
  currentStateKey?: string;
  processedResultKeys?: string[];
  stopRequested?: boolean;
  error?: string | null;
  config?: DiscoveryConfig;
}

export interface DiscoveryConfig {
  businessType: string;
  location: string;
  radiusKm: number | null;
  maxResults: number;
  queryExpansion: boolean;
  enableEnrichment: boolean;
  maxPagesPerWebsite: number;
  safetyLimit?: number;
}

export interface DiscoveryProgress {
  searchId: string;
  status: DiscoveryStatus;
  query: string;
  discovered: number;
  duplicates: number;
  unique: number;
  withPhone: number;
  withWebsite: number;
  withEmail: number;
  iteration: number;
  maxIterations: number;
  message?: string;
  phase?: DiscoveryPhase;
  processed?: number;
  currentQuery?: string;
  error?: string | null;
}

export interface CrmAuthUser {
  id: string;
  _id?: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  role?: unknown;
  permissions?: string[];
}

export interface CrmAuthState {
  authenticated: boolean;
  apiBaseUrl: string | null;
  user: CrmAuthUser | null;
}

export interface CrmImportProgress {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'partial' | 'failed';
  total: number;
  processed: number;
  created: number;
  existing: number;
  failed: number;
  failedLeadIds: string[];
  leadIds: string[];
  error?: string | null;
  startedAt?: string;
  completedAt?: string | null;
}

export type ExtensionMessage =
  | { type: 'GET_MAPS_CONTEXT' }
  | { type: 'GET_AUTH_STATE' }
  | { type: 'LOGIN'; apiBaseUrl: string; email: string; password: string }
  | { type: 'LOGOUT' }
  | { type: 'START_DISCOVERY'; config: DiscoveryConfig }
  | { type: 'PAUSE_DISCOVERY' }
  | { type: 'RESUME_DISCOVERY' }
  | { type: 'STOP_DISCOVERY' }
  | { type: 'RETRY_DISCOVERY' }
  | { type: 'GET_PROGRESS' }
  | { type: 'MARK_EXPORTED'; searchId: string; count: number }
  | { type: 'ENRICH_LEAD'; leadId: string; maxPages: number }
  | { type: 'IMPORT_TO_CRM'; leadIds: string[] }
  | { type: 'RETRY_CRM_IMPORT'; leadIds?: string[] }
  | { type: 'GET_CRM_IMPORT' }
  | { type: 'MAPS_STATE_CHANGED'; context: MapsContext }
  | { type: 'COLLECT_DETAILS' }
  | { type: 'CLEAR_ALL_DATA' };

export interface MapsContext {
  isMaps: boolean;
  url: string;
  query: string | null;
  hasResults: boolean;
  isListing: boolean;
  visibleResultCount: number;
  centerCoordinates?: { latitude: number; longitude: number } | null;
}

export interface ExportSummary {
  totalDiscovered: number;
  uniqueLeads: number;
  phoneAvailable: number;
  websiteAvailable: number;
  emailAvailable: number;
  averageRating: number | null;
}
