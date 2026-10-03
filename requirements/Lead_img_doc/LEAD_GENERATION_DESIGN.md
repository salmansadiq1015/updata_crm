# Lead Generation / Google Maps Business Discovery — Architecture & Design

**Module:** 15 — Lead Generation & Business Discovery
**App:** Updata (MB Boiler & Heizung AG) — single-tenant Swiss HVAC/ERP
**Status:** Design (pre-implementation gate). Phase 1 audit complete; awaiting go-ahead to build.
**Author:** Claude Opus 4.8 · **Date:** 2026-10-02

> **Written for:** the Updata engineering team (backend, frontend, QA) and the product owner, as the review-and-approval gate before implementation. It documents the existing architecture we reuse, the net-new pieces, and a phased build plan.

## Locked decisions (from product owner)
1. **Import target = a new `Lead` entity** (its own `leads` collection) with source/geo provenance and one-click **Convert to Customer**. Discovered businesses stay as `discovery_results` until explicitly imported into `leads`.
2. **Google Maps Platform**, provider-abstracted. Product owner provisions a billing-enabled key (secret **server-side Places key** + referer-restricted **browser Maps key**); this doc specifies which APIs to enable and the cost controls.
3. **Four UI languages: DE, EN, FR, AR**, with **proper global RTL** for Arabic (dynamic `dir`, logical CSS). The language toggle becomes a 4-way selector.

---

## 1. Existing Architecture Audit (summary)

Full audit in the conversation; condensed here. The app is a **modular monolith** (Node ESM, Express 5, Mongoose 9, BullMQ 5, ioredis, socket.io 4, Winston, prom-client; Next.js 16 / React 19 client). Per-entity module convention: `model / repository / service / controller / routes / validation (+ events)`, all singleton-class default exports.

**REUSE as-is** (do **not** rebuild):

| Need | Reuse |
|---|---|
| AuthN | `shared/middleware/authenticate.js` → `authenticate` (JWT + Redis session). Attaches only `req.user` (+ populated `role`) and `req.sessionId`. Identity = `req.user._id` (never from client). |
| AuthZ (RBAC) | `requirePermission('module:action')`, `authGuard()`, Admin bypass. New perms via `seed.js` `PERMISSION_DEFINITIONS`. |
| Validation | `shared/validation/validate.js` (Joi; validated query → `req._validatedQuery`), `shared/validation/commonSchemas.js` (`objectId`, `cursorPagination`). |
| Pagination / filtering | `shared/utils/pagination.js` (cursor), `shared/utils/queryBuilder.js` (`buildFilter` whitelist, `escapeRegex`, `accentSafeRegex`). |
| Queue / workers | `shared/queue/QueueManager.js` (`registerQueue`, `addJob`) + `shared/queue/BaseWorker.js` (`process()`, `isAlreadyDone()` idempotency). Register in `jobs/index.js`. **Template:** `modules/catalog/igh.service.js` + `jobs/ighImport.job.js` + `modules/catalog/ighImportJob.model.js`. |
| Bulk import | `modules/crm/sparePart.service.js` (`bulkWrite`/`insertMany({ordered:false})`, per-row errors) + `modules/migration/migrationLoader.service.js` (`MigrationRecordMap` source→target idempotency). |
| Cache | `shared/cache/CacheManager.js` (`getOrSet`, `invalidatePattern`, L1 NodeCache + L2 Redis). |
| Audit | `modules/auth/audit.service.js` → `logEvent({eventType, userId, module, result, details})` (async queue + fallback). |
| Notifications | `modules/notifications/notification.service.js` → `create(data, userId, meta)` (IN_APP / EMAIL / …). |
| Errors | `shared/errors/*` — `AppError` family incl. `ExternalServiceError('google-places', …)`, `errorCodes.js`. Envelope `{success,error,meta}` via `responseEnvelope.js` (`res.success/res.fail`). |
| Metrics / logs | `metrics/index.js` (prom-client), `shared/logger` (Winston + PII masking), `requestId.js` correlation. |
| Rate limiting | `shared/middleware/rateLimiter.js` → `createLimiter({windowMs,max,keyGenerator})` (per-user/IP). |
| Numbering / soft-delete | `modules/crm/counter.service.js` (`K-`/`A-`/`O-`; extend with `L-`), global `pre(/^find/)` soft-delete hook. |
| Config | `config/schema.js` (Joi, fail-fast, frozen) + `config/index.js`. |
| **Frontend** | Copy **`src/modules/tasks`**: `ui/components/services/hooks/state/types/schemas`; TanStack Query (cursor + `useInfiniteQuery`); zustand `rowSelection` bulk-select; `@/shared/components/detail-drawer` + `@/shared/hooks/use-drawer` (`?detail=`); `DataTableShell`; `useVirtualizer` (`task-list-view.tsx`); `use-task-realtime.ts` cache-merge; RHF+zod; `@/lib/api/client` (envelope auto-unwrapped), `@/lib/query/{keys,client}`, `@/lib/socket/client`, `@/lib/toast`; semantic Tailwind tokens. |

**CONFLICTS resolved** (spec assumed capabilities this codebase lacks):
- No `organizationId` / multi-tenancy anywhere → **single-tenant; scope by `createdBy`**, not org.
- No `Lead` / `leads` collection / lead service → **build the `Lead` entity** (decision #1).
- i18n is DE/EN only, custom flat dictionary, **zero RTL** → **add FR + AR + global RTL** (decision #3).
- No Google Maps/Places key or map library → **add both** (decision #2).
- Brand is navy (`--primary = brand-700 #1C388E`), not the orange of `branding.md` → **build on semantic tokens**; any orange rebrand is a separate global token change.

**DO NOT BUILD:** new auth, RBAC, queue, cache, audit, notifications, error/response layer, pagination/validation stack, or any tenant system.

---

## 2. Gap Analysis

| Capability | State | Action |
|---|---|---|
| Discovery sessions + results persistence | MISSING | New collections `discovery_sessions`, `discovery_results` |
| Lead entity | MISSING | New `crm/lead.*` + `leads` collection |
| Google Places integration | MISSING | New provider adapter (`PlacesProvider` → `GooglePlacesProvider`) |
| Geospatial (GeoJSON + 2dsphere) | MISSING | New on discovery_results + leads; geometry utils + point-in-polygon |
| Area coverage strategy | MISSING | New `CoveragePlanner` (bbox → capped grid of circles) |
| Dedup ladder (placeId→phone→website→name+geo) | PARTIAL (name+postal only, warn-only) | Extend into `Deduplicator` + `CrmMatcher` (match vs `leads` **and** `customers`) |
| Bulk lead import (create) | MISSING (only bulk update/deactivate) | New `lead-import` worker + import service (idempotent) |
| Job progress → socket | PARTIAL (`updateProgress` exists, no bridge) | New `discovery.events.js` EventBus→socket bridge (fallback: poll session doc) |
| Map UI + markers/clustering + draw | MISSING | Add map lib + components |
| FR/AR + RTL | MISSING | Extend i18n + global RTL |
| Google key + cost controls | MISSING | Config keys + field masks + caps + rate limit + usage metrics |

---

## 3. Final Architecture

```
server/src/modules/
├── crm/
│   ├── lead.model.js            NEW  (leads collection; L-##### via Counter)
│   ├── lead.repository.js       NEW  (cursor list, dedup queries, soft-delete)
│   ├── lead.service.js          NEW  (create/list/get/update/convertToCustomer/bulkCreate)
│   ├── lead.controller.js       NEW
│   ├── lead.routes.js           NEW  (mounted in crm.routes.js → /api/v1/crm/leads)
│   ├── lead.validation.js       NEW
│   └── counter.service.js       EDIT (add 'L-' lead sequence)
└── businessDiscovery/           NEW module (mounted /api/v1/business-discovery)
    ├── discoverySession.model.js
    ├── discoveryResult.model.js
    ├── leadImportJob.model.js        (job-tracking doc for bulk import)
    ├── discovery.repository.js
    ├── discovery.service.js          (create session, list, get, results, cancel)
    ├── import.service.js             (Add One / Selected / All-New; preview; summary)
    ├── discovery.controller.js
    ├── discovery.routes.js
    ├── discovery.validation.js
    ├── discovery.events.js           (EventBus → socket progress bridge)
    ├── businessTypeCatalog.js        (static CRM→Google type mapping + i18n keys)
    ├── provider/
    │   ├── PlacesProvider.js         (interface)
    │   ├── GooglePlacesProvider.js   (Places API New; field masks; pagination; errors)
    │   └── fieldProfiles.js          (DISCOVERY_MINIMAL / DETAILS_STANDARD / DETAILS_IMPORT)
    ├── engine/
    │   ├── coveragePlanner.js        (geometry → search cells, capped)
    │   ├── geometry.js               (bbox, point-in-polygon, haversine, GeoJSON helpers)
    │   ├── normalizer.js             (business/name/phone/website/address normalization)
    │   ├── deduplicator.js           (in-session + provider identity dedup)
    │   └── crmMatcher.js             (classify NEW/EXISTING/POSSIBLE_DUPLICATE vs leads+customers)
    └── location.service.js           (geocode / autocomplete proxy; cached)

server/src/jobs/
├── discoveryRun.job.js          NEW  (BaseWorker; runs the discovery pipeline)
├── leadImport.job.js            NEW  (BaseWorker; batched bulk import)
└── index.js                     EDIT (register 'discovery-run' + 'lead-import' queues)

server/src/config/{schema.js,index.js}  EDIT (GOOGLE_* keys + discovery block)
server/src/shared/errors/errorCodes.js  EDIT (DISCOVERY_* / LEAD_* codes)
server/src/metrics/index.js              EDIT (updata_discovery_* metrics)
server/src/seed/seed.js                  EDIT (discovery:* + lead:* permissions)
server/src/migrations/0XX_*.js           NEW  (indexes)

client/src/modules/
├── leadGeneration/              NEW  (discovery wizard + map)   → route /lead-generation
└── leads/                       NEW  (lead list/pipeline + detail) → route /leads
client/src/app/(platform)/lead-generation/{page.jsx,layout.jsx}  NEW
client/src/app/(platform)/leads/{page.jsx,layout.jsx}            NEW
client/src/lib/api/endpoints.js  EDIT (LEADS + DISCOVERY blocks)
client/src/lib/query/keys.js     EDIT (queryKeys.leads + queryKeys.discovery)
client/src/lib/i18n/{translations.js,language-context.jsx}  EDIT (fr/ar + RTL)
client/src/layout/language-toggle.jsx  EDIT (4-way selector)
client/src/app/layout.js         EDIT (dynamic dir / RTL wiring)
```

### A. System Context
```
CRM User ──► Updata Web App (Next.js) ──► Updata API (Express) ──► Google Maps Platform
                                               │                     (Places API New, Geocoding)
                                               ├─► MongoDB  (sessions, results, leads, customers)
                                               ├─► Redis    (BullMQ, cache, rate-limit, sessions)
                                               └─► socket.io (live progress)
```

### B. Container Diagram
```
┌── Browser ─────────────────────────────────────────────┐
│ LeadGeneration UI (wizard + Google Map + results)      │
│ Leads UI (list/pipeline + detail)                      │
│ TanStack Query · zustand · socket.io-client · Map SDK  │  Maps key (browser, referer-restricted)
└───────────────┬────────────────────────────────────────┘
                │ REST /api/v1 (+ JWT) · WebSocket
┌───────────────▼── Express API ─────────────────────────┐
│ authenticate → requirePermission → validate → ctrl     │
│ businessDiscovery service · import service              │
│ crm/lead service  ◄── reuse customer dedup, counter    │
│ provider/GooglePlacesProvider  ── Places key (SERVER)  │
└───┬───────────────┬───────────────┬────────────────────┘
    │ enqueue        │ cache/emit    │ audit/notify/metrics
┌───▼── BullMQ ──┐ ┌─▼ Redis ─┐ ┌───▼ MongoDB ─┐ ┌ Google Maps Platform ┐
│ discovery-run  │ │ cache    │ │ sessions     │ │ Places (New)         │
│ lead-import    │ │ rl/sess  │ │ results/leads│ │ Geocoding            │
└────────────────┘ └──────────┘ └──────────────┘ └──────────────────────┘
```

### C. Component Diagram (discovery pipeline)
```
DiscoveryController → DiscoveryService → [create session] → QueueManager('discovery-run')
                                                                   │
discoveryRun.job (BaseWorker) ──► CoveragePlanner ──► GooglePlacesProvider (search→paginate→details)
     │                                   │                   │
     │                              GeometryFilter      Normalizer
     │                                   │                   │
     │                              Deduplicator ──► CrmMatcher(leads+customers)
     │                                   │
     └──► discovery.repository.bulkWrite(results) ──► session.progress ──► discovery.events → socket
```

### D. Discovery Data Flow
```
Location + Area(geometry) + BusinessType(s) + Keyword + options
  → validate → create DiscoverySession(status=QUEUED) → enqueue discovery-run
  → CoveragePlanner (bbox → capped grid of search circles)
  → for each cell: GooglePlacesProvider.searchNearby/searchText (paginate ≤60/cell, field mask MINIMAL)
  → merge by placeId → GeometryFilter (point-in-polygon vs user geometry)
  → Normalizer (name/phone/website/address/geo) → Deduplicator (dedup keys)
  → CrmMatcher → matching.status NEW|EXISTING|POSSIBLE_DUPLICATE (vs leads + customers)
  → bulkWrite discovery_results (upsert by createdBy+session+placeId)
  → update session.progress/counts (emit socket) → status COMPLETED|PARTIAL|FAILED
```

### E. ERD
```
User ─1:N─► DiscoverySession ─1:N─► DiscoveryResult ─0..1─► Lead ─0..1─► Customer (existing)
  (createdBy)                         (import.leadId)        (convertedCustomerId)
User ─1:N─► Lead (createdBy, assignedTo)
Lead/DiscoveryResult ─match─► Customer | Lead (dedup references, no ownership)
```
`Customer`, `Site`, `Installation`, `Contact` are **existing** CRM entities, unchanged (except an optional, additive `source` note on conversion).

### F. Discovery Sequence
```
User→UI: Analyze Area
UI→API: POST /business-discovery/sessions {location,area,businessTypes,keyword,options}
API→API: validate → authz → create session(QUEUED) → enqueue
API→UI: 202 {sessionId}
UI⇄WS: subscribe discovery:session:<id>
Worker→Google: searchNearby×cells (MINIMAL mask) → place details (on demand)
Worker→Mongo: bulkWrite results; update progress  →WS: progress events
Worker→Mongo: session COMPLETED/PARTIAL          →WS: completed
UI→API: GET /sessions/:id/results?cursor=&limit=&status=NEW
```

### G. Bulk Import Sequence
```
User→UI: Add All New   (or Add Selected / Add One)
UI→API: POST /business-discovery/sessions/:id/import {mode:'new'|'skip'|'update', selection}
API→API: validate → compute preview {new,existing,possibleDup,willImport}
  small (≤BATCH): synchronous import.service → summary
  large: create LeadImportJob(QUEUED) → enqueue lead-import → 202 {jobId}
Worker: batches of N → per result atomic status NOT_IMPORTED→QUEUED
        → leadService.create (idempotent via unique googlePlaceId) → result.import.status=IMPORTED|SKIPPED|FAILED
        → job counts + progress →WS
API/UI: truthful summary {imported, existing, skipped, failed}
```

### H. Failure / Retry
```
Google call → error?
  ├─ transient (timeout, 429, 5xx, ECONNRESET) → backoff+jitter, ≤N attempts (BullMQ) → else mark cell failed
  └─ permanent (400, invalid key, REQUEST_DENIED, unsupported) → no retry → ExternalServiceError, mark failed
Cells: 8/10 ok, 2 fail → session=PARTIAL, keep 8 cells' results, expose coverage 8/10.
Worker crash → BullMQ re-runs; isAlreadyDone()/idempotent upserts prevent dupes.
```

### I. Security Boundary
```
Browser (Maps key: referer-restricted, Maps JS only; no Places key)
  → HTTPS + JWT
  → authenticate → requirePermission(discovery:*/lead:*) → validate(Joi) → mongo-sanitize
  → DiscoveryService (createdBy scoping; filter+sort whitelists)
  → GooglePlacesProvider (Places key: SERVER-only, never returned/logged)
```

---

## 4. Data Model (MongoDB)

GeoJSON rule: coordinates are **[lng, lat]**. All collections are single-tenant (scoped by `createdBy`), soft-deletable (`isDeleted` + `pre(/^find/)` hook), `timestamps:true`.

### 4.1 `discovery_sessions`
```
_id, createdBy(ObjectId ref User, req),
status: enum DRAFT|QUEUED|RUNNING|FETCHING|NORMALIZING|DEDUPLICATING|MATCHING|COMPLETED|PARTIAL|FAILED|CANCELLED|EXPIRED,
location: { name, mode: 'search'|'draw'|'upload', center:{type:'Point',coordinates:[lng,lat]},
            countryCode, country, region, city, formattedAddress },
area: { type:'radius'|'circle'|'rectangle'|'polygon', radiusMeters,
        geometry:{type:'Polygon',coordinates:[[[lng,lat]]]},   // normalized to polygon for filtering
        bounds:{north,south,east,west}, areaSqKm },
businessTypes: [{ id, name, providerIncludedType, providerTextQuery }],   // multi-select (mockup)
keyword: String,
provider: { name:'google_places', version },
config: { maxResults, maxSearchRequests, maxCoverageCells, concurrency, detailsOnImport:Boolean },
progress: { stage, percent, searchesCompleted, searchesTotal, resultsDiscovered, resultsPersisted, errors },
counts: { discovered, new, existing, possibleDuplicates, imported, skipped, failed },
usage: { searchRequests, detailsRequests, geocodeRequests },
cancelRequested: Boolean,
error: { code, message, retryable },
startedAt, completedAt, expiresAt(Date, TTL for retention),
createdAt, updatedAt
```

### 4.2 `discovery_results`
```
_id, createdBy(ref User, req), discoverySessionId(ref, req),
provider: { name:'google_places', placeId(req) },
business: {
  name, normalizedName, primaryType, types:[String],
  phone, internationalPhone, normalizedPhone,
  website, websiteDomain,
  email,                                  // only if provider supplies; never fabricated
  address: { formatted, street, city, region, postalCode, country, canton },
  location: { type:'Point', coordinates:[lng,lat] },
  rating, reviewCount, priceLevel, businessStatus, openingHours(Mixed), mapsUrl
},
matching: { status: 'NEW'|'EXISTING'|'POSSIBLE_DUPLICATE',
            matchedLeadId(ref Lead), matchedCustomerId(ref Customer),
            matchedBy:[{ method:'PLACE_ID'|'PHONE'|'WEBSITE'|'NAME_ADDRESS'|'GEO', confidence:Number }] },
import: { status:'NOT_IMPORTED'|'QUEUED'|'IMPORTED'|'SKIPPED'|'FAILED',
          leadId(ref Lead), importedAt, error:{code,message} },
discoveryContext: { businessTypeIds:[String], keyword, areaType },
discoveredAt, createdAt, updatedAt
```
Raw provider payloads are **not** stored wholesale (privacy + growth). Optional debug blob behind a config flag with short TTL only.

### 4.3 `leads` (NEW CRM entity)
```
_id, leadNumber(String, unique, 'L-#####' via Counter),
name(req), normalizedName, type: enum 'business'|'private' (default business),
status: enum 'new'|'contacted'|'qualified'|'unqualified'|'converted' (default new, indexed),
address:{ street, addressSupplement, postalCode, city, canton, country(default 'CH') },
phone, mobile, normalizedPhone, email(lowercase), website, websiteDomain,
location:{ type:'Point', coordinates:[lng,lat] },           // nullable
providerMeta:{ rating, reviewCount, priceLevel },           // display-only snapshot at import
source: enum 'google_places'|'manual'|'widget'|'import' (default manual),
sourceMetadata:{ googlePlaceId, discoverySessionId(ref), discoveryResultId(ref),
                 businessType, keyword, discoveryArea:Mixed, discoveredAt },
assignedTo(ref User), notes(max5000), tags:[String],
convertedCustomerId(ref Customer), convertedAt,
createdBy(ref User, req), isDeleted, deletedAt, createdAt, updatedAt
```
Conversion: `lead.service.convertToCustomer()` maps lead→Customer via existing `customerService.create`, sets `convertedCustomerId`/`status=converted`, optional additive `source` note on the Customer.

### 4.4 `lead_import_jobs`
```
_id, createdBy(req), discoverySessionId(ref), mode:'new'|'skip'|'update',
selection:{ kind:'ALL_NEW'|'SELECTED', resultIds:[ObjectId] },
status:'QUEUED'|'RUNNING'|'COMPLETED'|'PARTIAL'|'FAILED'|'CANCELLED',
counts:{ total, processed, created, existing, duplicates, skipped, failed },
log(String, max100000), error:{code,message}, startedAt, completedAt, createdAt, updatedAt
```

---

## 5. Index Strategy (every index justified)

**discovery_sessions**
- `{createdBy:1, createdAt:-1}` — history list (default).
- `{createdBy:1, status:1, createdAt:-1}` — filter by status.
- `{status:1}` — worker/stale scans.
- `{expiresAt:1}` TTL — retention.

**discovery_results**
- `{createdBy:1, discoverySessionId:1, createdAt:-1}` — results list per session.
- `{discoverySessionId:1, 'provider.placeId':1}` **unique** — in-session identity / upsert idempotency.
- `{createdBy:1, 'matching.status':1}` — filter NEW/EXISTING.
- `{createdBy:1, 'import.status':1}` — import filtering / Add-All-New selection.
- `{'business.location':'2dsphere'}` — proximity / in-area queries.
- `{createdBy:1, 'business.normalizedPhone':1}` and `{createdBy:1, 'business.websiteDomain':1}` — dedup lookups.

**leads**
- `{createdBy:1, createdAt:-1}`, `{status:1}`, `{assignedTo:1}` — lists/pipeline.
- `{'sourceMetadata.googlePlaceId':1}` **unique, partial** (`source:'google_places'`) — import idempotency (prevents double-create under concurrency).
- `{normalizedPhone:1}`, `{websiteDomain:1}`, `{name:1,'address.postalCode':1}` — dedup ladder.
- `{location:'2dsphere'}` — geo dedup / map.
- text index `{name, 'address.city', email}` — search.

All critical queries validated with `explain()` (no `COLLSCAN` on results/leads). Indexes created via a numbered migration (`migrations/0XX_lead_generation_indexes.js`).

---

## 6. Google Places Integration Strategy

- **API:** Places API **(New)** — `places:searchNearby` (type + circle) and `places:searchText` (keyword/custom type), `places/{id}` details. Geocoding API for location resolution.
- **Keys:** `GOOGLE_PLACES_API_KEY` (server, secret, Places+Geocoding) and `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (browser, referer-restricted, Maps JS + client Autocomplete only). Server key never leaves the backend, never logged (Winston masks), never in responses.
- **Field masks (cost):** `fieldProfiles.js`
  - `DISCOVERY_MINIMAL`: `places.id, places.displayName, places.location, places.primaryType, places.formattedAddress, places.businessStatus` (+ `rating,userRatingCount` for filters).
  - `DETAILS_STANDARD` / `DETAILS_IMPORT`: phone, website, openingHours, components — fetched **only on import or detail-drawer open**, not for every discovered place.
- **Pagination:** up to 20/page, `nextPageToken` up to 60/search. Beyond that → CoveragePlanner subdivides the area.
- **Mapping:** `businessTypeCatalog.js` maps each CRM business type → a supported Google `includedType` (structured) or a `textQuery` (fallback), plus a safe fallback for custom types. No fabricated Google types; limitations documented inline.
- **Maps URL:** build canonical `https://www.google.com/maps/search/?api=1&query=<lat,lng>&query_place_id=<placeId>` (supported format).
- **ToS:** only `place_id` cached long-term; other place fields cached short-lived (≤30 days) per Google terms. No bulk re-export of Google content.

---

## 7. Geographic Coverage Strategy

```
User geometry (radius/circle/rect/polygon) → normalize to GeoJSON Polygon + bounds
small (radius ≤ R0, area ≤ A0): single searchNearby(center, radius)
large: bounding box → grid of overlapping search circles sized to Google's radius cap,
       capped at config.maxCoverageCells → one search per cell (bounded concurrency)
merge all cell results by placeId → point-in-polygon filter against the EXACT user geometry
```
Guards: max cell count, max search requests, max results, bounded concurrency, cancellation check between cells, retry per cell. **Never** an unbounded loop. Coverage honesty surfaced as "N/M search regions completed".

---

## 8. Deduplication & CRM Matching

Ladder (highest confidence first), evaluated by `crmMatcher` against existing **leads** and **customers**:
1. **Google Place ID** (vs prior leads' `sourceMetadata.googlePlaceId`) → `EXISTING` (1.0).
2. **Normalized phone** (E.164-ish, default region CH; not naive `\D` stripping) → `EXISTING` (~0.95).
3. **Website domain** (registrable domain, strip scheme/www/path) → high (~0.9).
4. **Normalized name + postal/address + geo proximity** (haversine < threshold) → `POSSIBLE_DUPLICATE` (0.6–0.8).
5. Else → `NEW`.

Never auto-merge on weak signals; `POSSIBLE_DUPLICATE` requires human action. Reuses `accentSafeRegex`; seeds from `migrationLoader.findCustomerDuplicate`. Confidence is a heuristic, not certainty.

---

## 9. Idempotency & Concurrency

- **Discovery worker:** `isAlreadyDone()` on session status; results upserted by unique `{discoverySessionId, provider.placeId}` → re-runs don't duplicate.
- **Import:** per-result atomic transition `findOneAndUpdate({_id, 'import.status':'NOT_IMPORTED'},{$set:{'import.status':'QUEUED'}})` claims work; lead creation guarded by **unique partial index** on `sourceMetadata.googlePlaceId` → concurrent/double "Add All" cannot create duplicate leads (second insert → caught → `SKIPPED`/`EXISTING`).
- **Import job:** `LeadImportJob` status transitions; BaseWorker idempotency.
- **Re-discovery:** same criteria re-run recognizes Previously discovered / Already imported / New since last — via placeId matching, without destroying prior session history.

---

## 10. Queue / Worker, Cache, Cost

- **Queues:** `discovery-run` (low concurrency, e.g. 2 — each run fans out many paid calls) and `lead-import` (modest). Both `BaseWorker`; retry/backoff/jitter from `config/queue.js`; cancellation via `session.cancelRequested`.
- **Progress:** worker `job.updateProgress()` + writes `session.progress`; `discovery.events.js` subscribes and emits to `user:${createdBy}`; FE merges into query cache; **fallback = poll** `GET /sessions/:id`.
- **Cache:** `CacheManager.getOrSet` for geocode/autocomplete and `discovery:place:<placeId>` details; `businessTypeCatalog` cached; keys namespaced `discovery:*` (+ user where tenant-specific). No global caching of user-specific data.
- **Cost controls:** field masks; per-session caps (`maxResults`, `maxSearchRequests`, `maxCoverageCells`); per-user `createLimiter` on `POST /sessions`; details-on-demand; usage counts on session + `updata_discovery_places_api_calls_total` metric; recommend Google Cloud **budget alerts + quotas**. (We surface usage, not a billed figure.)

---

## 11. API Contract (`/api/v1`)

Middleware on every route: `authenticate → requirePermission(...) → validate(...) → controller`. Lists use `cursorPagination` + whitelisted filters/sort (tasks-style `ALLOWED_SORT_FIELDS` + `safeSortBy`).

Business Discovery (`/api/v1/business-discovery`):
```
GET   /business-types                                 discovery:read   (static catalog, i18n)
GET   /usage                                          discovery:read
POST  /sessions                 (rate-limited)        discovery:create → 202 {sessionId}
GET   /sessions                 (cursor,status,q)     discovery:read
GET   /sessions/:id                                   discovery:read   (progress/counts)
POST  /sessions/:id/cancel                            discovery:create
DELETE/sessions/:id                                   discovery:delete (soft)
GET   /sessions/:id/results     (cursor,filters,sort) discovery:read
GET   /sessions/:id/results/:resultId                 discovery:read
GET   /sessions/:id/import/preview  {mode}            lead:import      (server-computed counts)
POST  /sessions/:id/import       {mode,selection}     lead:import      → sync summary | 202 {jobId}
POST  /results/:resultId/import  {mode}               lead:import      (Add One)
GET   /import-jobs/:jobId                             lead:import      (progress/summary)
POST  /location/geocode | /location/autocomplete      discovery:read   (cached proxy)
```
Leads (`/api/v1/crm/leads`):
```
GET    /           (cursor,status,assignedTo,source,q)  lead:read
POST   /                                                lead:write
GET    /:id                                             lead:read
PATCH  /:id                                             lead:write
DELETE /:id                                             lead:delete  (soft)
POST   /:id/convert                                     lead:convert (→ Customer)
GET    /duplicates (name,phone,website,placeId)         lead:read
POST   /bulk-import  (internal; used by import.service)  lead:import
```
Responses are DTOs via the standard envelope: `{ id, business{...}, crmStatus, importStatus }` etc. — no raw Mongo/provider internals.

---

## 12. Frontend Architecture

Mirror `src/modules/tasks`. Two feature modules + thin routes:

```
modules/leadGeneration/   → /lead-generation
  ui/lead-gen-workspace.tsx        (orchestrator; wizard state machine)
  ui/steps/{location-step,business-type-step,review-step,add-to-crm-step}.tsx
  ui/discovery-map.tsx             (map + area draw + marker cluster + selected marker)
  ui/results-panel.tsx             (summary, filters, bulk bar, virtualized list)
  ui/business-detail-drawer.tsx    (DetailDrawer + ?detail=)
  ui/discovery-progress.tsx        (staged checklist + live counts + cancel)
  ui/import-preview-dialog.tsx / import-summary.tsx
  ui/saved-searches.tsx            (history: view/re-run/cancel/delete)
  components/{business-type-grid,area-selector,location-search,filter-panel}.tsx
  services/discovery-api.ts        (zod-parsed; cursor shape)
  hooks/{use-discovery-session,use-discovery-results,use-discovery-realtime,use-import}.ts
  state/lead-gen-store.ts          (wizard step, filters, rowSelection, mapViewport, drawingMode)
  types/ schemas/ constants/ utils/ __tests__/
modules/leads/            → /leads
  ui/lead-list-view, lead-detail-drawer, lead-bulk-action-bar, convert-dialog
  services/lead-api.ts  hooks/  state/  schemas/  __tests__/
```

- **Map:** add `@vis.gl/react-google-maps` (official, hooks-based) + `@googlemaps/markerclusterer`; Drawing/Geometry libraries for area selection. Browser key only.
- **State split:** server = TanStack Query (cursor + `useInfiniteQuery`); UI (wizard step, selection map, viewport, drawing mode, drawer) = zustand + `?detail=`.
- **Map ↔ list sync:** hover/click/select propagate via store (`selectedResultId`, `hoveredResultId`); filters update both; virtualized list (`useVirtualizer`) for large sets.
- **Realtime:** `use-discovery-realtime` subscribes to `discovery:session:<id>`, merges progress/results into cache (version-guarded, like `use-task-realtime`); polling fallback.
- **Honest UX:** "Businesses available from Google Places for your criteria/area"; coverage "N/M regions"; Add-All labeled **Add All New (X)** with server-computed preview; truthful import summary (imported/existing/skipped/failed) with View/Retry Failed.

---

## 13. UX Flow (matches mockups)

4-step wizard: **Location** (Search / Draw Area / Upload boundary) → **Business Type** (popular grid, multi-select chips, custom type, keyword) → **Review** (summary + Start Analysis) → **Analyze** (staged progress + live counts + Cancel) → **Results** (map + virtualized list + filters + detail drawer) → **Add to CRM** (options: add new / skip existing / update existing / assign to member; preview; confirm) → **Success** (truthful counts; View Leads / New Search). Saved Searches = history with re-run. Empty/partial/error states per spec.

---

## 14. i18n & RTL (DE / EN / FR / AR)

- Add `'fr'`, `'ar'` to `SUPPORTED_LOCALES` (`language-context.jsx`) and `LOCALES` (`language-toggle.jsx`); toggle becomes a 4-way dropdown.
- Add `fr:{…}`, `ar:{…}` blocks in `translations.js` (full `leadgen.*`/`leads.*` namespaces in all 4; `t()` fallback covers the rest until translated). Keep German-orthography normalization.
- **RTL:** in `LanguageProvider`, set `document.documentElement.dir = locale==='ar' ? 'rtl':'ltr'` (+ `lang`); flip `components.json` `rtl:true`; author the new modules with **logical** Tailwind utilities (`ps-/pe-/ms-/me-/start-/end-/text-start`) and verify the map/drawer/table in RTL. Shared components used by the module get targeted RTL fixes.
- Accessibility: all status via icon+label (not color alone), keyboard nav, focus management, ARIA on map controls.

---

## 15. Testing Strategy

- **Unit (server):** geometry (bbox, point-in-polygon, haversine, [lng,lat] order), coverage planner (caps/cells), normalizers (phone/website/name/address), deduplicator + crmMatcher classification, business-type mapping, field profiles, import field-mapping, idempotency helpers.
- **Integration (server, mongodb-memory-server + mocked HTTP):** provider adapter (search/paginate/details, error taxonomy), discovery persistence/upsert, dedup vs seeded leads+customers, import service (modes, partial failure), workers (retry, cancellation, idempotency), rate limiting.
- **API (supertest):** authz (perm matrix), validation (geometry/radius/limit bounds), cursor pagination + sort whitelist, error envelope + codes, 202 async shapes.
- **Frontend (vitest + MSW):** wizard state machine, map↔list sync, bulk select, import preview/summary, realtime cache-merge, RTL snapshot (ar), i18n completeness test (like existing `*-translations.test`).
- **E2E (Scenarios A–F):** Restaurant Add One; Hotel polygon Add Selected; Pharmacy Add All New + dedup; repeated search → no duplicate leads; Google fails halfway → PARTIAL; double-click Add All → no duplicates.
- **Security:** cross-user access denial, perm bypass attempts, NoSQL-injection on filters/sort, server key never exposed.
- **Performance/load:** 100 / 1k / 10k results; large polygon; measure API latency, queue wait, worker throughput, Mongo writes, Google call volume (claims backed by measurement).

---

## 16. Phased Implementation Plan

| Phase | Scope | Key files | Risk |
|---|---|---|---|
| **2. DB + domain** | `Lead`, `DiscoverySession`, `DiscoveryResult`, `LeadImportJob` models + repos + validation; `Counter` `L-`; indexes migration; config keys; `DISCOVERY_*`/`LEAD_*` error codes; permissions in seed | mostly NEW files | Low |
| **3. Provider** | `PlacesProvider` + `GooglePlacesProvider` + field profiles + `location.service`; unit/integration tests with mocked HTTP | NEW | Med (external API) |
| **4. Engine** | coveragePlanner, geometry, normalizer, deduplicator, crmMatcher; discovery.service; `discoveryRun.job`; discovery.events bridge; cancellation/progress | NEW + `jobs/index.js` | Med |
| **5. Import** | import.service (Add One/Selected/All-New, preview, modes); `leadImport.job`; lead.service incl. bulkCreate + convertToCustomer; idempotency | NEW + crm | Med |
| **6. API** | controllers, routes, DTOs, rate limiter; mount in `app.js`/`crm.routes.js`; metrics | NEW + edits | Low |
| **7. Frontend** | leadGeneration + leads modules; map (+libs); wizard; results/drawer/bulk/import; saved searches; realtime | NEW + lib edits | Med-High (map) |
| **8. i18n + RTL** | fr/ar + global RTL; 4-way toggle; translations; logical-CSS pass | edits | Med |
| **9. Testing** | unit/integration/API/E2E/security/perf | NEW tests | — |
| **10. Hardening** | explain() index checks, dead-code/cost/tenant-leak audit, docs | — | — |

Each phase is a reviewable checkpoint; no "hundreds of files at once."

---

## 17. Risks & Trade-offs

- **Google cost** — mitigated by field masks, caps, caching, details-on-demand, rate limits, budget alerts. Residual: large polygons are inherently multi-call; caps make this predictable.
- **Coverage completeness** — Places does not guarantee every business; UX states this honestly; grid improves but can't exceed provider data.
- **RTL regressions** — global `dir` could affect existing LTR-only components; mitigate by scoping logical-CSS to new modules and QA-ing the shared components they use; full app RTL audit is a separate follow-up.
- **Lead vs Customer duplication** — dedup matches against **both**; Convert-to-Customer links records; unique placeId index prevents lead dupes.
- **New Lead entity surface** — more code than extending Customer, but keeps master data clean (the product-owner's choice).
- **Map library dependency** — adds client bundle; `@vis.gl/react-google-maps` is well-maintained and lazy-loadable.

---

## 18. Definition of Done

All of Scenarios A–F pass end-to-end; discovery is tenant-safe (createdBy-scoped) and geometry-correct (point-in-polygon); idempotent under retries/double-submit; bounded & observable (metrics, audit, logs with requestId/sessionId); DE/EN/FR/AR with working RTL; responsive + accessible; indexes verified via `explain()`; server Google key never exposed; truthful coverage & import summaries; tests green (unit/integration/API/E2E/security). No duplicate systems introduced; existing CRM untouched except additive Lead + optional conversion note.
