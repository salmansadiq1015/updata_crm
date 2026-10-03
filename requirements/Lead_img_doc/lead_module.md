# WORLD-CLASS LEAD GENERATION & GOOGLE MAPS BUSINESS DISCOVERY MODULE

## Principal-Level Architecture, MongoDB Design, Geographic Discovery, Deduplication & Bulk Lead Import

Ref Design images: /Users/app/Downloads/Development/updata_crm/requirements/Lead_img_doc/design_imgs
You are acting as a **Principal Solution Architect, Staff Backend Engineer, Distributed Systems Architect, Database Architect, Security Architect, Frontend Architect, UX Architect, QA Architect, and Technical Product Designer with 20+ years of production experience**.

You are extending an **existing production CRM**.

Your job is to design and implement a **world-class Lead Generation / Business Discovery module** that discovers businesses from Google Maps / Google Places based on:

> **Business Type + Geographic Area + Optional Keyword → Discover Businesses → Deduplicate → Review → Add One / Add Selected / Add All → Existing CRM Leads**

---

# 0. NON-NEGOTIABLE RULE

## DO NOT redesign the existing CRM.

The existing application already contains some or all of:

- Authentication
- Users
- Organizations / tenants
- RBAC / permissions
- Existing CRM Lead entity
- Lead services
- Lead APIs
- Database infrastructure
- Audit logs
- Notifications
- Queue infrastructure
- Redis/cache
- WebSockets/realtime infrastructure
- Existing UI component system
- Existing API conventions
- Existing error handling
- Existing validation
- Existing observability
- Existing duplicate detection

### FIRST ACTION

Before writing code:

1. Inspect the complete existing architecture.
2. Inspect the existing Lead model/schema.
3. Inspect Lead services.
4. Inspect Lead APIs/controllers/routes.
5. Inspect organization/tenant isolation.
6. Inspect RBAC permissions.
7. Inspect existing duplicate detection.
8. Inspect existing queue/job infrastructure.
9. Inspect Redis/cache infrastructure.
10. Inspect existing audit system.
11. Inspect notification/realtime infrastructure.
12. Inspect existing frontend architecture.
13. Inspect Google Maps/Places integration if one already exists.
14. Inspect MongoDB indexes and conventions.
15. Inspect existing tests.

Then produce a concise:

# EXISTING ARCHITECTURE AUDIT

with:

```text
ALREADY EXISTS
REUSE
EXTEND
MISSING
CONFLICT
DO NOT BUILD
```

Do NOT create duplicate systems.

If an existing service already solves a requirement, reuse it.

---

# 1. PRODUCT PURPOSE

The module allows CRM users to discover businesses geographically and convert eligible businesses into CRM leads.

The fundamental workflow is:

```text
Lead Generation
      ↓
Business Discovery
      ↓
Search Location
      ↓
Select Geographic Area
      ↓
Select Business Type
      ↓
Optional Keyword
      ↓
Analyze Area
      ↓
Google Places Discovery
      ↓
Pagination / Area Coverage
      ↓
Normalize
      ↓
Deduplicate
      ↓
Match Existing CRM
      ↓
Display Results
      ↓
Add One / Add Selected / Add All
      ↓
Existing CRM Lead Service
      ↓
CRM Leads
```

The UX should feel like:

> **Draw/select an area → choose what businesses you want → Analyze → review → add leads.**

The user must not need to understand Google APIs.

---

# 2. CORE BUSINESS REQUIREMENT

The module MUST support:

## Business Type

Examples:

### Food & Hospitality

- Restaurant
- Cafe
- Coffee Shop
- Bakery
- Fast Food
- Hotel
- Motel
- Resort
- Catering

### Healthcare

- Hospital
- Clinic
- Medical Store
- Pharmacy
- Dentist
- Dental Clinic
- Diagnostic Center
- Laboratory
- Physiotherapy Center
- Medical Center
- Veterinary Clinic

### Professional Services

- Law Firm
- Accountant
- Accounting Firm
- Real Estate Agency
- Insurance Agency
- Consulting Firm
- Marketing Agency
- Software Company
- IT Company

### Retail

- Supermarket
- Grocery Store
- Clothing Store
- Electronics Store
- Furniture Store
- Jewelry Store
- Automobile Dealer
- Mobile Phone Store

### Personal Services

- Gym
- Fitness Center
- Salon
- Barber
- Spa
- Beauty Center
- Car Wash

### Education

- School
- College
- University
- Training Center
- Language School
- Tutoring Center

### Construction / Industrial

- Construction Company
- Contractor
- Architecture Firm
- Engineering Company
- Manufacturer
- Factory
- Hardware Store

### Custom

Support custom business-type discovery where Google Places supports the requested query/type.

Do not artificially restrict users to a tiny hard-coded list.

---

# 3. BUSINESS TYPE ≠ KEYWORD

These are separate concepts.

### Business Type

Structured discovery category.

```text
Restaurant
```

### Keyword

Optional refinement.

```text
Italian
```

Example:

```text
Business Type: Restaurant
Keyword: Italian
```

or:

```text
Business Type: Pharmacy
Keyword: 24 hour
```

or:

```text
Business Type: Hotel
Keyword: luxury
```

Store both values in the discovery session.

---

# 4. GOOGLE CATEGORY TAXONOMY

Do NOT assume CRM categories map 1:1 to Google Places types.

Create a configurable mapping layer:

```text
CRM Business Type
        ↓
Discovery Type Configuration
        ↓
Google Places supported type/query
```

Example:

```text
Medical Store
    ↓
pharmacy / relevant supported Google type/query

Restaurant
    ↓
restaurant

Hotel
    ↓
hotel
```

The mapping must be centralized rather than scattered throughout controllers.

Requirements:

- configurable
- testable
- versionable if necessary
- documented
- safe fallback for unsupported categories
- no fake Google types
- distinguish structured Places type filtering from text search

If Google does not support an exact business type, use the appropriate supported search mechanism and clearly document the limitation.

---

# 5. MAP DISCOVERY UI

The main screen should contain:

```text
┌─────────────────────────────────────────────────────────────┐
│ Business Discovery                                          │
│                                                             │
│ Location                                                   │
│ [ Search location...                                    ]  │
│                                                             │
│ Business Type                                              │
│ [ Restaurant                                          ▼ ]  │
│                                                             │
│ Keyword                                                    │
│ [ Optional refinement                                  ]  │
│                                                             │
│ Area                                                       │
│ [ Radius ▼ ] [ 5 km ]                                     │
│                                                             │
│                 [ Analyze Area ]                            │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────┬──────────────────────────────┐
│                              │                              │
│          GOOGLE MAP          │       RESULTS PANEL          │
│                              │                              │
│      Selected Area           │  124 Businesses             │
│      Business Markers        │                              │
│      Clustering              │  Filters                     │
│                              │  Business Cards              │
│                              │                              │
└──────────────────────────────┴──────────────────────────────┘
```

---

# 6. GEOGRAPHIC SELECTION

Support:

- Radius
- Circle
- Rectangle
- Polygon

Where technically supported.

The system must store the **actual geographic boundary**, not just a human-readable location name.

For example:

```text
center:
{
  lat,
  lng
}

radiusMeters

geometry:
{
  type: "Polygon",
  coordinates: [...]
}
```

Use GeoJSON-compatible representation where appropriate.

---

# 7. IMPORTANT: EXACT AREA ≠ GOOGLE SEARCH AREA

Do not assume Google Places will directly return every place inside an arbitrary polygon.

The architecture must separate:

```text
USER SELECTED GEOMETRY
        ↓
DISCOVERY COVERAGE STRATEGY
        ↓
GOOGLE SEARCH REQUESTS
        ↓
RAW RESULTS
        ↓
GEOMETRY FILTER
        ↓
FINAL IN-AREA RESULTS
```

For larger areas, implement an appropriate search coverage strategy such as:

```text
Selected Polygon
       ↓
Calculate bounding region
       ↓
Generate search cells / centers where required
       ↓
Run discovery queries
       ↓
Merge results
       ↓
Deduplicate by Place ID
       ↓
Filter exact coordinates against selected geometry
```

Do not blindly trust a bounding box to represent a polygon.

The final result must be checked against the user's actual selected geometry.

---

# 8. AREA COVERAGE

For small searches:

```text
Single search region
```

For larger areas:

```text
Area
 ↓
Coverage grid / search cells
 ↓
Multiple discovery requests
 ↓
Merge
 ↓
Deduplicate
 ↓
Point-in-polygon validation
```

The coverage algorithm must have:

- maximum cell count
- configurable limits
- protection against runaway API costs
- cancellation support
- progress tracking
- concurrency limits
- retry handling

Never create an unbounded Google API request loop.

---

# 9. DISCOVERY COMPLETENESS

Never claim:

> "Every business in the world/area"

unless the upstream provider guarantees that.

The UI should communicate:

> "Businesses available from Google Places for the selected search criteria and area."

If search coverage has limitations, expose meaningful metadata such as:

```text
Coverage:
Complete within configured discovery strategy

Provider:
Google Places

Results:
124

Search requests:
8
```

If the provider returns only a limited result set:

```text
Some businesses may not be returned by Google Places.
```

Never fabricate missing results.

---

# 10. ANALYZE AREA

The primary action:

> **Analyze Area**

must send:

```text
location
+
geometry
+
businessType
+
keyword
+
discovery options
```

to the backend.

The backend creates a durable:

```text
DiscoverySession
```

before starting expensive processing.

---

# 11. DISCOVERY SESSION LIFECYCLE

Use explicit states.

Recommended:

```text
DRAFT
QUEUED
RUNNING
FETCHING
NORMALIZING
DEDUPLICATING
MATCHING
COMPLETED
PARTIAL
FAILED
CANCELLED
EXPIRED
```

Do not overload one generic `status` value to represent unrelated concepts.

Track:

```text
progress.stage
progress.percent
progress.processed
progress.discovered
progress.persisted
progress.errors
```

---

# 12. DISCOVERY PIPELINE

Implement:

```text
REQUEST VALIDATION
        ↓
AUTHORIZATION
        ↓
LOCATION RESOLUTION
        ↓
GEOMETRY VALIDATION
        ↓
BUSINESS TYPE VALIDATION
        ↓
CREATE DISCOVERY SESSION
        ↓
QUEUE JOB
        ↓
DISCOVERY COVERAGE
        ↓
GOOGLE PLACES SEARCH
        ↓
PAGINATION
        ↓
PLACE DETAILS
        ↓
NORMALIZATION
        ↓
DATA QUALITY
        ↓
GEOMETRY FILTER
        ↓
DEDUPLICATION
        ↓
CRM MATCHING
        ↓
PERSIST DISCOVERY RESULTS
        ↓
UPDATE PROGRESS
        ↓
COMPLETE
```

Each stage must define:

- input
- output
- timeout
- retry policy
- idempotency key
- failure behavior
- metrics

---

# 13. GOOGLE PLACES INTEGRATION

Create a dedicated provider adapter.

Conceptually:

```text
DiscoveryService
      ↓
PlacesProvider
      ↓
GooglePlacesProvider
```

Do not spread Google API calls across controllers/services.

The provider must encapsulate:

- text/nearby search where appropriate
- place details
- pagination
- provider errors
- rate limits
- timeouts
- field selection
- API version specifics
- request logging without secrets
- provider response normalization

This makes future provider replacement possible without rewriting the discovery system.

---

# 14. GOOGLE API COST CONTROL

This is mandatory.

Do not request expensive Place Details fields unnecessarily.

Define field profiles:

```text
DISCOVERY_MINIMAL
DETAILS_STANDARD
DETAILS_IMPORT
```

Only fetch data actually needed.

Avoid:

```text
Search 500 businesses
→ request every expensive field for all 500 immediately
```

Instead:

```text
Discovery
→ minimal business identity/location data
→ persist candidates
→ fetch additional details only when required
```

where supported and appropriate.

Implement:

- request budgets
- maximum places/session
- maximum searches/session
- concurrency limits
- timeout
- quota handling
- cancellation
- organization-level usage tracking if appropriate

---

# 15. API KEY / SECRET SECURITY

Never expose server-side Google credentials.

Browser may receive only the configuration required for approved client-side Maps functionality.

Server secrets remain:

```text
Backend environment / secret manager
```

Never:

- commit secrets
- store API secrets in MongoDB
- return secrets through APIs
- log secrets
- expose provider credentials to frontend

---

# 16. MONGODB DATA ARCHITECTURE

Use MongoDB following the existing project's conventions.

Do not create unnecessary collections.

At minimum, determine whether these collections are required:

```text
discovery_sessions
discovery_results
```

Do NOT create another Lead collection.

The existing:

```text
leads
```

collection remains the CRM source of truth.

---

# 17. DISCOVERY SESSION SCHEMA

Design a production-grade schema similar to:

```js
{
  _id: ObjectId,

  organizationId: ObjectId,
  createdBy: ObjectId,

  status: "QUEUED",

  location: {
    name: String,

    center: {
      type: "Point",
      coordinates: [Number, Number]
    },

    countryCode: String,
    country: String,
    region: String,
    city: String,
    formattedAddress: String
  },

  area: {
    type: "radius" | "circle" | "rectangle" | "polygon",

    radiusMeters: Number,

    geometry: {
      type: "Polygon",
      coordinates: [[[Number]]]
    },

    bounds: {
      north: Number,
      south: Number,
      east: Number,
      west: Number
    }
  },

  businessType: {
    id: String,
    name: String,
    providerTypes: [String]
  },

  keyword: String,

  provider: {
    name: "google_places",
    version: String
  },

  discoveryConfig: {
    maxResults: Number,
    maxSearchRequests: Number,
    maxCoverageCells: Number,
    concurrency: Number
  },

  progress: {
    stage: String,
    percent: Number,
    searchesCompleted: Number,
    searchesTotal: Number,
    resultsDiscovered: Number,
    resultsPersisted: Number,
    errors: Number
  },

  counts: {
    discovered: Number,
    new: Number,
    existing: Number,
    possibleDuplicates: Number,
    imported: Number,
    skipped: Number,
    failed: Number
  },

  job: {
    jobId: String,
    attempt: Number
  },

  error: {
    code: String,
    message: String,
    retryable: Boolean
  },

  startedAt: Date,
  completedAt: Date,
  expiresAt: Date,

  createdAt: Date,
  updatedAt: Date
}
```

Use schema validation and TypeScript types if the project uses TypeScript.

Do not blindly copy this schema. Adapt it to the existing project's conventions.

---

# 18. GEOJSON IMPORTANT RULE

MongoDB GeoJSON coordinates use:

```text
[longitude, latitude]
```

NOT:

```text
[latitude, longitude]
```

Validate this consistently.

Add appropriate geospatial indexes where useful.

---

# 19. DISCOVERY RESULT SCHEMA

Use a production-grade structure similar to:

```js
{
  _id: ObjectId,

  organizationId: ObjectId,

  discoverySessionId: ObjectId,

  provider: {
    name: "google_places",
    placeId: String
  },

  business: {
    name: String,
    normalizedName: String,

    primaryType: String,
    types: [String],

    phone: String,
    internationalPhone: String,

    website: String,

    address: {
      formatted: String,
      street: String,
      city: String,
      region: String,
      postalCode: String,
      country: String
    },

    location: {
      type: "Point",
      coordinates: [Number, Number]
    },

    rating: Number,
    reviewCount: Number,

    openingHours: Object,

    mapsUrl: String
  },

  matching: {
    status: "NEW" | "EXISTING" | "POSSIBLE_DUPLICATE",

    crmLeadId: ObjectId,

    matchedBy: [
      {
        method: String,
        confidence: Number
      }
    ]
  },

  import: {
    status:
      "NOT_IMPORTED" |
      "QUEUED" |
      "IMPORTED" |
      "SKIPPED" |
      "FAILED",

    crmLeadId: ObjectId,

    importedAt: Date,

    error: {
      code: String,
      message: String
    }
  },

  discoveryContext: {
    businessTypeId: String,
    businessTypeName: String,
    keyword: String,
    areaType: String
  },

  discoveredAt: Date,

  createdAt: Date,
  updatedAt: Date
}
```

Again: adapt to the project's actual architecture.

---

# 20. RAW PROVIDER DATA

Do not blindly store the entire Google API response.

Prefer:

```text
Normalized business data
+
minimal provider metadata
```

If raw provider responses are required for debugging/compliance:

- isolate them
- apply retention rules
- avoid unnecessary PII
- avoid uncontrolled document growth
- never expose them directly to the client

---

# 21. MONGODB INDEXING

Design indexes based on actual query patterns.

At minimum evaluate:

```text
DiscoverySession

{ organizationId: 1, createdAt: -1 }

{ organizationId: 1, status: 1, createdAt: -1 }

{ organizationId: 1, createdBy: 1, createdAt: -1 }
```

Discovery results:

```text
{ organizationId: 1, discoverySessionId: 1, createdAt: -1 }

{ organizationId: 1, "provider.placeId": 1 }

{ organizationId: 1, "matching.status": 1 }

{ organizationId: 1, "import.status": 1 }

2dsphere index:
{ "business.location": "2dsphere" }
```

For uniqueness, carefully evaluate:

```text
organizationId + provider + placeId
```

Use unique indexes where safe.

Do not add indexes merely because they look useful.

Every index must have a query/write justification.

---

# 22. DISCOVERY RESULT UNIQUENESS

Within an organization, the same provider place must not create uncontrolled duplicates.

Conceptually:

```text
organizationId
+
provider.name
+
provider.placeId
```

should be treated as the provider identity.

However, because the same business may appear in multiple discovery sessions, do NOT prevent the same business from being referenced by multiple sessions unless the architecture explicitly requires that.

Separate:

```text
Business identity
```

from:

```text
Discovery occurrence/session
```

Avoid designing a schema where repeated discovery forces duplicate business records.

---

# 23. RE-DISCOVERY

If the user searches:

```text
Restaurant
+
Gulberg
+
5 km
```

again:

Do not create duplicate CRM leads.

The system should recognize:

```text
Previously discovered
Already imported
Still existing
New since previous discovery
```

A repeated discovery should update/match existing discovery knowledge where appropriate without destroying historical discovery-session information.

---

# 24. DEDUPLICATION STRATEGY

Primary:

```text
Google Place ID
```

Secondary matching:

```text
normalized phone
```

Then:

```text
normalized website/domain
```

Then:

```text
normalized business name
+
normalized address
+
geographic proximity
```

Example:

```text
Google Place ID
      ↓
Exact match?
 ┌────┴────┐
YES        NO
 ↓          ↓
EXISTING   Phone
            ↓
         Website
            ↓
      Name + Address
            ↓
       Geo proximity
            ↓
    POSSIBLE_DUPLICATE
```

Never automatically merge uncertain businesses without a sufficiently strong identity match.

---

# 25. DUPLICATE CLASSIFICATION

Support:

```text
NEW
EXISTING
POSSIBLE_DUPLICATE
```

Optionally maintain:

```text
MATCH_CONFIDENCE
MATCH_METHOD
MATCHED_LEAD_ID
```

Example:

```js
{
  method: "PHONE",
  confidence: 0.99
}
```

Do not represent confidence as mathematical certainty.

---

# 26. EXISTING CRM LEAD MATCHING

Reuse the existing CRM duplicate detection and Lead service whenever available.

Do NOT build a competing lead database.

Flow:

```text
Discovery Result
      ↓
Existing Lead Matching Service
      ↓
NEW / EXISTING / POSSIBLE_DUPLICATE
```

If the CRM's existing duplicate system is insufficient, extend it rather than creating a parallel duplicate engine.

---

# 27. IMPORT ARCHITECTURE

There are exactly three primary import actions:

## Add One

```text
Business
 ↓
Duplicate Check
 ↓
Existing Lead Service
 ↓
Lead Created
```

## Add Selected

```text
Selected IDs
 ↓
Validate ownership/session
 ↓
Duplicate check
 ↓
Batch import
 ↓
Existing Lead Service
 ↓
Results
```

## Add All

```text
Discovery Session
 ↓
Find eligible results
 ↓
Duplicate validation
 ↓
Batch import
 ↓
Existing Lead Service
 ↓
Import summary
```

---

# 28. ADD ALL MUST NEVER MEAN "BLIND INSERT"

For:

```text
124 discovered
```

the system may determine:

```text
87 NEW
24 EXISTING
13 POSSIBLE_DUPLICATE
```

Then:

```text
Import 87 eligible leads
```

not:

```text
Insert 124 records
```

---

# 29. BULK IMPORT MUST BE A JOB FOR LARGE BATCHES

Do not process thousands of leads in one HTTP request.

For small imports:

```text
Synchronous
```

For larger imports:

```text
API
 ↓
Create Import Job
 ↓
Queue
 ↓
Worker
 ↓
Batch processing
 ↓
Existing Lead Service
 ↓
Progress
 ↓
Complete
```

Use the existing queue.

Do not create another queue system.

---

# 30. IMPORT JOB STATES

Use explicit states:

```text
QUEUED
RUNNING
COMPLETED
PARTIAL
FAILED
CANCELLED
```

Track:

```text
total
processed
created
existing
duplicates
failed
```

Example:

```text
Selected: 100

Imported: 82
Already Exists: 12
Skipped: 4
Failed: 2
```

---

# 31. IMPORT IDEMPOTENCY

A repeated request must not create duplicate leads.

Support idempotency at:

```text
individual import
bulk import
job retry
worker retry
HTTP retry
```

Use appropriate idempotency keys / database constraints / atomic operations.

Do not rely solely on:

```text
"we checked before inserting"
```

because concurrent workers can race.

---

# 32. CONCURRENCY

Protect against:

```text
User clicks Add All twice
+
two workers process same batch
```

Use:

- atomic status transitions
- unique constraints
- conditional updates
- idempotency keys
- job locking where appropriate

The system must remain correct under concurrency.

---

# 33. IMPORT TRANSACTION STRATEGY

Do not assume a huge bulk operation can always be wrapped in one MongoDB transaction.

Prefer controlled batches.

Example conceptual strategy:

```text
Batch 1: 50
Batch 2: 50
Batch 3: 50
...
```

Failures should not roll back thousands of successfully imported leads unnecessarily.

---

# 34. LEAD FIELD MAPPING

Create a deterministic mapping:

```text
Google Business
      ↓
Lead DTO
      ↓
Existing Lead Service
      ↓
CRM Lead
```

Example:

```text
business.name
→ lead.name

business.phone
→ lead.phone

business.website
→ lead.website

business.address
→ lead.address

business.location
→ lead.location

provider.placeId
→ lead.sourceMetadata.googlePlaceId
```

Adapt this to the existing Lead model.

Never invent CRM fields if existing fields already support the information.

If source metadata is required, extend the existing Lead model minimally.

---

# 35. SOURCE PROVENANCE

Imported leads must preserve:

```text
source = GOOGLE_PLACES
providerPlaceId
discoverySessionId
businessType
keyword
area
discoveredAt
```

This is essential for traceability.

The CRM should be able to answer:

> "Where did this lead come from?"

and:

> "Which discovery generated it?"

---

# 36. MAP ↔ LIST SYNCHRONIZATION

Map and result list must be synchronized.

Interactions:

```text
Click marker
→ highlight list card

Click list card
→ focus map marker

Hover card
→ highlight marker

Select card
→ select corresponding result

Change filters
→ update visible markers
```

For large datasets:

- marker clustering
- viewport-aware rendering
- virtualized list
- server pagination
- avoid rendering thousands of DOM nodes

---

# 37. RESULT PAGINATION

Never send thousands of results in one API response.

Use:

```text
GET /discoveries/:id/results
```

with:

```text
page / cursor
limit
filters
sort
```

Prefer cursor pagination for large/high-volume result sets.

Example:

```text
GET /discoveries/:id/results?
cursor=...
&limit=50
&status=NEW
&minRating=4
```

---

# 38. RESULT FILTERS

Support useful filters:

```text
Business Type
CRM Status
Import Status
Rating
Review Count
Has Phone
Has Website
Has Email if available
Distance
Search
```

Do not pretend Google provides fields it does not actually provide.

---

# 39. SORTING

Potential sorts:

```text
Relevance
Distance
Rating
Review Count
Business Name
Recently Discovered
CRM Status
```

Only expose sorting supported efficiently by the persisted data.

---

# 40. BUSINESS DETAIL DRAWER

Clicking a result should open a detailed panel.

Include:

```text
Business Name
Business Type
Rating
Reviews
Address
Phone
Website
Google Maps
Opening Hours if available
Coordinates
CRM Status
Duplicate Status
Discovery Source
Discovery Session
```

Actions:

```text
Open in Google Maps
Add Lead
```

Do not expose unnecessary provider internals.

---

# 41. DISCOVERY HISTORY

Users should be able to see prior discovery sessions.

Example:

```text
Discovery History

Restaurant · Gulberg · 5 km
124 results
87 new
24 existing
13 possible duplicates
Completed
Oct 1, 2026

Hotel · DHA · Polygon
64 results
...
```

Support:

- view
- filter
- search
- reopen results
- inspect summary
- optionally re-run
- cancel running job
- delete/expire according to retention policy

Do not allow one organization to see another organization's sessions.

---

# 42. API DESIGN

Adapt routes to existing conventions.

Conceptually:

```http
POST   /lead-generation/discoveries
GET    /lead-generation/discoveries
GET    /lead-generation/discoveries/:id
POST   /lead-generation/discoveries/:id/cancel

GET    /lead-generation/discoveries/:id/results
GET    /lead-generation/discoveries/:id/results/:resultId

POST   /lead-generation/results/:resultId/import
POST   /lead-generation/discoveries/:id/import
POST   /lead-generation/discoveries/:id/import-selected

GET    /lead-generation/business-types
GET    /lead-generation/discovery-usage
```

Do not blindly implement these exact URLs if the existing API convention differs.

---

# 43. REQUEST VALIDATION

Validate server-side:

```text
organization authorization
business type
keyword length
geometry
coordinates
radius
polygon size
maximum area
maximum search requests
result limits
```

Reject:

- invalid coordinates
- malformed polygons
- self-intersecting polygons where unsupported
- absurd radius
- excessive polygon complexity
- invalid ObjectIds
- unauthorized session IDs

---

# 44. API AUTHORIZATION

Every endpoint must verify:

```text
Authenticated user
        ↓
Organization membership
        ↓
Required permission
        ↓
Resource belongs to organization
```

Never trust:

```text
organizationId
```

provided by the browser.

Derive tenant context from the authenticated request wherever the existing architecture supports this.

---

# 45. TENANT ISOLATION

Every discovery query must be organization-scoped.

Never execute:

```js
DiscoveryResult.findById(id);
```

alone if the system requires tenant isolation.

Prefer:

```text
organizationId + resourceId
```

or the equivalent existing repository pattern.

This must be enforced consistently at the service/repository boundary.

---

# 46. RATE LIMITING

Protect:

```text
Discovery creation
Google API proxy endpoints
Import endpoints
Bulk import
History APIs
```

Use existing CRM rate limiting infrastructure.

Add organization/user quotas where appropriate.

---

# 47. USAGE / COST TRACKING

Track discovery consumption where appropriate:

```text
organizationId
userId
discoverySessionId
provider
searchRequests
detailsRequests
results
estimated usage/cost metadata
timestamp
```

Do not claim exact billing cost unless the pricing calculation is based on the correct current provider pricing configuration.

The architecture must make cost control possible.

---

# 48. CACHING

Cache only where useful.

Potential candidates:

```text
location autocomplete
location resolution
business type configuration
short-lived provider responses where permitted
```

Do not cache sensitive tenant-specific data globally.

Cache keys must include appropriate tenant/context dimensions where required.

Never violate Google API terms through caching.

---

# 49. QUEUE / WORKER

Use existing queue infrastructure.

If none exists, first document the gap and then choose the smallest appropriate infrastructure.

Architecture:

```text
API
 ↓
DiscoverySession
 ↓
Queue
 ↓
Worker
 ↓
Google Places
 ↓
Normalize
 ↓
Deduplicate
 ↓
Persist
 ↓
Progress
```

Worker must support:

- retries
- exponential backoff
- timeout
- dead-letter handling if existing architecture supports it
- cancellation
- idempotency
- concurrency limits

---

# 50. RETRY STRATEGY

Retry only transient errors.

Retry:

```text
network timeout
temporary provider failure
429/rate limit where appropriate
5xx
temporary database errors
```

Do not endlessly retry:

```text
invalid request
invalid API key
permission denied
unsupported type
malformed geometry
```

Use:

```text
exponential backoff
+
maximum attempts
+
jitter
```

---

# 51. PARTIAL FAILURE

Suppose:

```text
10 search requests
```

and:

```text
8 succeeded
2 failed
```

Do not throw away the 8 successful searches.

Mark the discovery:

```text
PARTIAL
```

and expose:

```text
8/10 searches completed
```

The user should still receive valid results.

---

# 52. CANCELLATION

The user should be able to cancel a long-running discovery.

Cancellation must:

```text
mark session cancelled
stop scheduling new work
allow safe in-flight work to finish where necessary
prevent further processing
preserve already discovered results
```

Do not corrupt the session.

---

# 53. FAILURE HANDLING

Explicitly design for:

```text
Invalid Location
Invalid Geometry
Unsupported Business Type
Google API Failure
Google Rate Limit
Google Quota Exhaustion
Network Timeout
Provider Partial Response
No Results
Database Failure
Queue Failure
Worker Crash
Duplicate
Permission Denied
Import Failure
Concurrent Import
```

Every failure should have:

```text
machine-readable code
human-readable message
retryable flag
safe UI state
logging context
```

Do not expose provider secrets or internal stack traces to users.

---

# 54. OBSERVABILITY

Reuse existing observability.

Measure:

```text
discovery_duration
search_requests
details_requests
provider_latency
provider_errors
rate_limits
quota_failures
results_discovered
results_persisted
duplicate_rate
existing_lead_rate
import_success_rate
import_failure_rate
queue_wait_time
worker_duration
```

Logs must include correlation identifiers such as:

```text
requestId
organizationId
discoverySessionId
jobId
```

Do not log sensitive provider credentials.

---

# 55. AUDIT LOGGING

Use existing audit infrastructure.

Record important events:

```text
DISCOVERY_CREATED
DISCOVERY_STARTED
DISCOVERY_COMPLETED
DISCOVERY_FAILED
DISCOVERY_CANCELLED

LEAD_IMPORT_STARTED
LEAD_IMPORTED
LEAD_IMPORT_SKIPPED
LEAD_IMPORT_FAILED
BULK_IMPORT_COMPLETED
```

Do not create a duplicate audit system.

---

# 56. RETENTION

Discovery results can become stale.

Define configurable retention strategy.

Potential states:

```text
ACTIVE
EXPIRED
ARCHIVED
```

Do not automatically delete CRM leads simply because discovery data expires.

Important distinction:

```text
Discovery Result retention
≠
CRM Lead retention
```

---

# 57. DATA FRESHNESS

A discovered business is not necessarily permanently current.

Store:

```text
discoveredAt
lastCheckedAt
```

where useful.

Do not silently overwrite CRM truth with provider data.

Imported lead data may be edited by CRM users.

The discovery system must respect the CRM as the authoritative operational record after import.

---

# 58. IMPORT DATA OWNERSHIP

Before importing:

```text
Google data
```

After importing:

```text
CRM Lead
```

The existing CRM becomes the source of truth.

Future discovery should identify the relationship without blindly overwriting user-edited CRM fields.

---

# 59. UI BULK ACTIONS

Results must support:

```text
☑ Business A
☑ Business B
☐ Business C
```

Toolbar:

```text
3 selected

[ Add Selected ]
```

Top-level actions:

```text
[ Add All New ]
[ Add Selected ]
```

Never show:

```text
Add All
```

without explaining whether existing/duplicate records are excluded.

---

# 60. IMPORT PREVIEW

Before a large Add All operation, show:

```text
Import Preview

Total discovered       124
New                     87
Already in CRM          24
Possible duplicates     13

Will import             87

[ Cancel ]
[ Import 87 Leads ]
```

For extremely large imports, make this preview server-calculated.

---

# 61. IMPORT RESULT

Show truthful results:

```text
Import Complete

Imported              82
Already Existing       12
Skipped                 4
Failed                  2
```

Never display:

```text
"100 imported"
```

when only 82 succeeded.

Allow:

```text
View Failed
Retry Failed
View Imported
View Existing
```

where supported.

---

# 62. BUSINESS TYPE CONTEXT IN LEADS

Preserve discovery provenance.

Conceptually:

```text
Lead
 ├── source
 │     └── GOOGLE_PLACES
 │
 ├── providerPlaceId
 │
 ├── discoverySessionId
 │
 ├── businessType
 │
 ├── keyword
 │
 ├── discoveryArea
 │
 └── discoveredAt
```

Use existing CRM fields if possible.

If extension is required, make the smallest backward-compatible schema change.

---

# 63. WHATSAPP / MAP / EXTERNAL ACTIONS

If existing CRM supports these actions, integrate with them.

Business detail can provide:

```text
Open Google Maps
Call
Website
WhatsApp
```

Only show an action when the underlying legitimate data exists.

Never fabricate:

```text
phone
email
WhatsApp
website
```

---

# 64. FRONTEND ARCHITECTURE

Use the existing frontend architecture.

Conceptually:

```text
LeadGenerationPage
│
├── DiscoveryToolbar
│   ├── LocationSearch
│   ├── BusinessTypeSelect
│   ├── KeywordInput
│   ├── AreaSelector
│   └── AnalyzeButton
│
├── DiscoveryMap
│   ├── SearchCenter
│   ├── AreaOverlay
│   ├── MarkerCluster
│   └── SelectedMarker
│
└── ResultsPanel
    ├── DiscoveryProgress
    ├── ResultSummary
    ├── Filters
    ├── BulkActionBar
    ├── BusinessList
    └── BusinessDetailDrawer
```

Avoid business logic inside page components.

---

# 65. FRONTEND STATE

Separate:

```text
UI state
```

from:

```text
server state
```

Examples:

UI:

```text
selectedBusinessIds
mapViewport
drawingMode
drawerOpen
```

Server:

```text
discoverySession
results
progress
importStatus
```

Use the existing project's state/data-fetching architecture.

Do not introduce another state management library unnecessarily.

---

# 66. REALTIME PROGRESS

If existing WebSocket/SSE infrastructure exists, reuse it.

Example:

```text
Discovery queued
   ↓
Running
   ↓
Searching 3/8
   ↓
Found 72
   ↓
Processing
   ↓
Completed
```

Fallback to polling if that is already the project's convention.

Do not add WebSockets simply because they sound sophisticated.

---

# 67. LOADING UX

Do not show an indefinite spinner.

Show:

```text
Analyzing Gulberg Lahore...

Searching restaurants
Search area: 5 km

Businesses found: 84
Processing: 6/8 search regions
```

For long jobs:

```text
[ Cancel Discovery ]
```

---

# 68. EMPTY STATES

Examples:

### No businesses

```text
No businesses found

Try:
• expanding the area
• changing the business type
• removing the keyword
```

### No new leads

```text
All discovered businesses are already in your CRM.
```

### Partial results

```text
Discovery completed with partial coverage.
Some provider requests could not be completed.
```

---

# 69. ACCESSIBILITY

The UI must support:

- keyboard navigation
- accessible labels
- focus management
- contrast
- screen-reader semantics
- non-color-only status indicators
- accessible map controls where possible

---

# 70. RESPONSIVE DESIGN

Support:

```text
Desktop
Tablet
Mobile
```

Mobile layout:

```text
Filters
 ↓
Map
 ↓
Results
```

Desktop:

```text
Map | Results
```

Avoid making the map unusable on smaller screens.

---

# 71. PERFORMANCE

Target:

- fast initial UI
- paginated results
- virtualized lists
- marker clustering
- incremental result loading
- small API payloads
- compressed responses
- indexed MongoDB queries
- background discovery
- batch imports

Never do:

```text
Google API
→ huge response
→ browser
→ render thousands of cards
```

Prefer:

```text
Google
→ Backend
→ Normalize
→ MongoDB
→ Cursor API
→ UI
```

---

# 72. API RESPONSE DESIGN

Do not expose unnecessary MongoDB/provider internals.

Use DTOs.

Example:

```json
{
  "id": "...",
  "business": {
    "name": "ABC Restaurant",
    "type": "Restaurant",
    "rating": 4.6,
    "reviewCount": 324,
    "phone": "...",
    "website": "...",
    "address": "...",
    "location": {
      "lat": 31.5,
      "lng": 74.3
    }
  },
  "crmStatus": "NEW",
  "importStatus": "NOT_IMPORTED"
}
```

---

# 73. SECURITY BOUNDARIES

Architecture:

```text
┌─────────────────────┐
│ Browser             │
│                     │
│ UI / Map            │
│ Public client config│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Existing API        │
│                     │
│ Authentication      │
│ RBAC                │
│ Tenant isolation    │
│ Validation          │
│ Rate limiting       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Discovery Service   │
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐
│ Google Provider     │
│ Server credentials  │
└─────────────────────┘
```

---

# 74. ARCHITECTURE DIAGRAMS

Produce all of the following.

## A. System Context

```text
CRM User
 ↓
Existing CRM
 ↓
Lead Generation Module
 ↓
Google Maps / Places
```

## B. Container Diagram

Include:

```text
Frontend
API
Discovery Service
Provider Adapter
Queue
Worker
MongoDB
Redis
Existing Lead Service
Audit
Observability
Google APIs
```

## C. Component Diagram

Show:

```text
Discovery Controller
Location Service
Area Service
Business Type Service
Discovery Service
Coverage Planner
Google Provider
Pagination Handler
Normalizer
Geometry Validator
Deduplicator
CRM Matcher
Result Repository
Import Service
Import Worker
History Service
```

## D. Data Flow

```text
Location
+
Area
+
Business Type
+
Keyword
 ↓
Discovery
 ↓
Coverage
 ↓
Google
 ↓
Normalize
 ↓
Geometry Filter
 ↓
Deduplicate
 ↓
CRM Match
 ↓
Persist
 ↓
Results
 ↓
Import
```

## E. ERD

Show:

```text
Organization
     │
     ├───────────────┐
     │               │
     ▼               ▼
DiscoverySession    Lead
     │
     │ 1:N
     ▼
DiscoveryResult
     │
     └──────────────► Lead
```

Clearly show that:

```text
Lead
```

is an existing CRM entity.

## F. Sequence Diagram

Show:

```text
User
 ↓
Frontend
 ↓
API
 ↓
Discovery Service
 ↓
Queue
 ↓
Worker
 ↓
Google
 ↓
Normalizer
 ↓
Deduplicator
 ↓
MongoDB
 ↓
Frontend
```

## G. Bulk Import Sequence

```text
User
 ↓
UI
 ↓
Import API
 ↓
Validation
 ↓
Deduplication
 ↓
Existing Lead Service
 ↓
MongoDB
 ↓
Import Summary
```

## H. Failure/Retry Diagram

Include:

```text
Google
 ↓
Failure
 ↓
Retryable?
 ├── YES → Backoff → Retry
 └── NO → Mark failure
```

## I. Security Boundary Diagram

Clearly show:

```text
Browser
 ↓
Existing Auth
 ↓
RBAC
 ↓
Tenant Isolation
 ↓
Validation
 ↓
Discovery Service
 ↓
Google API
```

---

# 75. COMPLETE USER FLOW

Implement this exact conceptual journey:

```text
START
 ↓
Lead Generation
 ↓
Business Discovery
 ↓
Search Location
 ↓
Map moves
 ↓
Select Area
 ↓
Select Business Type
 ↓
Optional Keyword
 ↓
Analyze Area
 ↓
Discovery Running
 ↓
Businesses Found?
 ┌──────────────┴──────────────┐
 NO                            YES
 ↓                              ↓
Empty State                  Results
                                ↓
                           Map + List
                                ↓
                           Filter/Search
                                ↓
                           Open Details
                                ↓
                      ┌─────────┼─────────┐
                      ▼         ▼         ▼
                   Add One  Add Selected Add All
                      │         │         │
                      └─────────┼─────────┘
                                ↓
                         Duplicate Check
                                ↓
                         Existing Lead Service
                                ↓
                           CRM Leads
```

---

# 76. COMPLETE DATABASE RELATIONSHIP

Use:

```text
Organization
     │
     │ 1:N
     ▼
DiscoverySession
     │
     │ 1:N
     ▼
DiscoveryResult
     │
     │ 0..1
     ▼
Existing Lead
```

Potentially:

```text
User
 │
 └── createdBy → DiscoverySession
```

Do not duplicate organization/user documents unnecessarily.

Use ObjectId references consistent with the existing project.

---

# 77. BUSINESS TYPE CONFIGURATION

Determine whether business types should be:

```text
static application configuration
```

or:

```text
database configuration
```

based on the existing architecture.

If database-backed configuration is justified, keep it minimal.

Potential fields:

```text
id
name
group
icon
description
providerMappings
active
sortOrder
```

Do not create a massive category-management subsystem unless the product actually needs administrators to manage categories.

---

# 78. CUSTOM BUSINESS TYPE

For custom types:

```text
Custom Business Type
+
Keyword
```

must be sanitized and bounded.

Prevent abuse such as:

```text
extremely long queries
repeated expensive searches
malicious provider query injection
```

---

# 79. SEARCH QUERY NORMALIZATION

Normalize:

- whitespace
- casing where appropriate
- phone numbers
- URLs
- domains
- addresses
- business names

Do not normalize away meaningful business distinctions.

---

# 80. PHONE NORMALIZATION

Use a proper international phone normalization strategy if the existing CRM already has one.

Do not implement naive:

```js
phone.replace(/\D/g, "");
```

as the entire normalization system.

Country context matters.

---

# 81. WEBSITE NORMALIZATION

Normalize:

```text
https://example.com/
www.example.com
example.com
```

to a consistent comparison representation while preserving the original URL for display.

---

# 82. GOOGLE MAP URL

Store/use a legitimate Google Maps URL or construct one according to Google's current supported mechanisms.

Do not create invalid links from assumptions.

---

# 83. DATABASE WRITE STRATEGY

Avoid:

```text
one MongoDB write per Google API field
```

Prefer:

```text
normalized object
→ bulkWrite
```

where safe.

Use:

```text
bulkWrite
upsert
ordered/unordered strategy
```

based on correctness requirements.

---

# 84. MONGO QUERY PERFORMANCE

Every query must be checked against indexes.

Use:

```text
explain()
```

during performance validation for important queries.

Avoid:

```text
COLLSCAN
```

on high-volume collections.

Do not over-index.

Indexes have write/storage costs.

---

# 85. LARGE DISCOVERY RESULTS

If a discovery can produce tens/hundreds of thousands of records:

Do not load everything into memory.

Process streaming/batched where possible:

```text
Google page
 ↓
normalize batch
 ↓
dedupe batch
 ↓
bulkWrite
 ↓
next page
```

For coverage cells:

```text
cell
 ↓
search
 ↓
process
 ↓
persist
 ↓
next cell
```

---

# 86. RESULT STORAGE STRATEGY

Determine whether all discovery results should be persisted.

Default:

```text
Persist normalized results
```

because users need:

- history
- re-open
- filtering
- import later
- auditability

But apply retention rules so discovery history does not grow without bounds.

---

# 87. NO DUPLICATE DISCOVERY DATA EXPLOSION

Repeated searches must not blindly create millions of copies of the same business.

Separate:

```text
stable provider/business identity
```

from:

```text
session membership
```

If the current architecture can support a normalized provider-business identity model without unnecessary complexity, evaluate it.

Otherwise keep:

```text
DiscoveryResult
```

session-scoped with provider identity and strong deduplication.

Choose the simpler architecture that meets the requirements.

---

# 88. API PAGINATION

Every list endpoint must have bounded limits.

Example:

```text
default = 50
maximum = 100
```

Use the existing project's convention.

Never allow:

```text
?limit=1000000
```

---

# 89. SORT / FILTER SECURITY

Never directly interpolate arbitrary client-provided MongoDB field names/operators.

Whitelist:

```text
allowed filters
allowed sort fields
allowed directions
```

Prevent Mongo operator injection.

---

# 90. INPUT SECURITY

Protect against:

```text
NoSQL injection
prototype pollution
malicious URLs
oversized payloads
regex abuse
query abuse
```

Do not blindly construct regex from user input.

---

# 91. TESTING STRATEGY

Before declaring complete, implement:

## Unit tests

- business type mapping
- geometry validation
- point-in-polygon
- normalization
- deduplication
- match classification
- import mapping
- idempotency

## Integration tests

- discovery session creation
- provider adapter
- Mongo persistence
- duplicate detection
- import service
- queue worker

## API tests

- authorization
- tenant isolation
- validation
- pagination
- rate limits
- error responses

## E2E tests

Scenario:

```text
Search location
→ Select area
→ Select Restaurant
→ Analyze
→ Results
→ Add One
→ Verify lead
```

Then:

```text
Select 10
→ Add Selected
→ Verify 10
```

Then:

```text
Add All
→ duplicate handling
→ verify summary
```

Then:

```text
repeat same search
→ no duplicate CRM leads
```

---

# 92. FAILURE TESTS

Test:

```text
Google timeout
Google 429
Google 500
invalid API key
invalid geometry
empty results
partial search failure
worker crash
database failure
duplicate import
double-click Add All
two concurrent import jobs
cancel running discovery
```

---

# 93. LOAD TESTING

Evaluate realistic loads:

```text
100 businesses
1,000 businesses
10,000 businesses
large polygon
multiple simultaneous organizations
multiple simultaneous users
```

Measure:

```text
API latency
queue wait
worker throughput
Mongo write throughput
memory
CPU
Google request volume
```

Do not claim scalability without measurement.

---

# 94. SECURITY TESTING

Verify:

```text
Tenant A cannot read Tenant B discovery
Tenant A cannot import Tenant B result
Unauthorized user cannot run discovery
Unauthorized user cannot bulk import
Expired session cannot be manipulated
IDs cannot bypass organization filters
```

---

# 95. UX TESTING

Verify:

- user understands Business Type
- user understands selected area
- user understands progress
- user understands result coverage
- user understands duplicates
- user understands what Add All will do
- user understands import completion
- failures are actionable

Do not hide important information inside tooltips.

---

# 96. FINAL ARCHITECTURE PRINCIPLES

Follow these principles:

### Existing architecture first

Reuse before creating.

### Single source of truth

Existing CRM Lead remains authoritative.

### Discovery ≠ Lead

A discovered business is only a candidate until imported.

### Provider abstraction

Google integration stays isolated.

### Geographic correctness

Final results must be checked against the actual selected geometry.

### Idempotency

Retries and repeated actions must be safe.

### Tenant isolation

Every operation is organization-scoped.

### Cost awareness

Provider calls must be bounded and optimized.

### Progressive processing

Large searches run asynchronously.

### Minimal infrastructure

Do not create services/queues/collections unnecessarily.

### Observable

Every long-running operation must be traceable.

### Honest UX

Never claim more coverage than the provider actually supplies.

---

# 97. FINAL ARCHITECTURE REVIEW

Before implementation approval, explicitly verify:

```text
□ Existing CRM architecture audited
□ Existing Lead model reused
□ Existing Lead service reused
□ Existing RBAC reused
□ Existing auth reused
□ Existing tenant isolation reused
□ Existing queue reused
□ Existing Redis reused
□ Existing audit system reused
□ Existing notification/realtime reused
□ Existing UI system reused

□ Business Type selection
□ Custom business type
□ Keyword refinement
□ Radius
□ Circle
□ Rectangle
□ Polygon
□ Exact geometry validation
□ Area coverage strategy
□ Google Places integration
□ Pagination
□ Provider adapter
□ Cost controls
□ Result normalization
□ Google Place ID identity
□ Phone matching
□ Website matching
□ Name/address matching
□ Geographic duplicate matching
□ CRM duplicate matching

□ Add One
□ Add Selected
□ Add All
□ Import preview
□ Bulk import jobs
□ Import progress
□ Import idempotency
□ Concurrent import protection
□ Partial failures
□ Retry failed
□ Import audit trail

□ Discovery history
□ Re-discovery
□ Result persistence
□ Result retention
□ Data freshness
□ Provenance

□ MongoDB schema
□ MongoDB indexes
□ GeoJSON
□ 2dsphere index
□ Query optimization
□ Bulk writes
□ Cursor pagination

□ Rate limiting
□ Quotas
□ API secret security
□ NoSQL injection protection
□ Input validation
□ Tenant isolation

□ Logging
□ Metrics
□ Tracing/correlation
□ Error monitoring

□ Unit tests
□ Integration tests
□ API tests
□ E2E tests
□ Failure tests
□ Concurrency tests
□ Load tests
□ Security tests

□ Responsive UI
□ Accessibility
□ Marker clustering
□ Virtualized result list
□ Loading states
□ Empty states
□ Partial-result state
□ Error states
```

---

# 98. IMPLEMENTATION STRATEGY

Do NOT immediately modify hundreds of files.

Work in phases.

## PHASE 1 — AUDIT

Inspect existing application.

Output:

```text
Architecture Audit
Dependency Map
Existing Services
Existing Models
Existing APIs
Existing UI
Missing Pieces
Risks
```

Do not implement yet.

## PHASE 2 — DATABASE + DOMAIN

Implement only the minimum required:

```text
DiscoverySession
DiscoveryResult
Business Type configuration if actually required
indexes
validation
repositories
```

Verify indexes.

## PHASE 3 — PROVIDER

Implement:

```text
PlacesProvider
GooglePlacesProvider
normalization
pagination
provider errors
timeouts
```

Test independently.

## PHASE 4 — DISCOVERY ENGINE

Implement:

```text
coverage strategy
geometry filtering
deduplication
CRM matching
discovery worker
progress
cancellation
```

## PHASE 5 — IMPORT

Implement:

```text
Add One
Add Selected
Add All
bulk import
idempotency
duplicate protection
```

## PHASE 6 — API

Implement:

```text
controllers
validation
authorization
pagination
DTOs
errors
```

## PHASE 7 — FRONTEND

Implement:

```text
location search
map
area selection
business type
keyword
results
filters
selection
import
history
progress
```

## PHASE 8 — OBSERVABILITY

Integrate existing:

```text
logs
metrics
audit
notifications
```

## PHASE 9 — TESTING

Run:

```text
unit
integration
API
E2E
failure
concurrency
security
performance
```

## PHASE 10 — FINAL AUDIT

Run a complete architecture/code audit.

Find:

```text
dead code
duplicate code
unused files
unnecessary abstractions
unnecessary collections
unnecessary APIs
missing indexes
N+1 queries
race conditions
tenant leaks
security issues
Google API misuse
cost risks
UX problems
```

Remove unnecessary implementation.

---

# 99. CRITICAL IMPLEMENTATION RULE

Do not create:

```text
new CRM
new Lead system
new authentication
new RBAC
new organization system
new audit system
new notification system
new queue
new cache
```

if the existing CRM already provides them.

Extend existing architecture.

---

# 100. DEFINITION OF DONE

The module is NOT complete until all of the following work end-to-end.

## Scenario A — Restaurant

```text
Open Lead Generation
→ Search Gulberg Lahore
→ Select 5 km
→ Select Restaurant
→ Analyze Area
→ Discover businesses
→ See map + list
→ Add One
→ Verify CRM Lead
```

## Scenario B — Hotel

```text
Search location
→ Draw polygon
→ Select Hotel
→ Analyze
→ Review results
→ Select several
→ Add Selected
→ Verify CRM
```

## Scenario C — Pharmacy

```text
Search location
→ Select area
→ Select Medical Store / Pharmacy
→ Analyze
→ Discover available businesses
→ Add All New
→ Duplicate detection
→ Import eligible businesses
→ Verify CRM
```

## Scenario D — Repeated Search

```text
Run same search again
→ Existing businesses recognized
→ No duplicate CRM leads
→ New businesses identified
→ User can import new ones
```

## Scenario E — Failure

```text
Google fails halfway
→ retry transient requests
→ preserve successful results
→ mark session PARTIAL
→ show truthful status
```

## Scenario F — Concurrent Import

```text
User clicks Add All twice
→ two requests arrive
→ idempotency / atomic protection
→ no duplicate CRM leads
```

---

# 101. FINAL REQUIRED OUTPUT

Before changing implementation, produce:

### 1. Existing Architecture Audit

### 2. Gap Analysis

### 3. Final Architecture

### 4. System Context Diagram

### 5. Container Diagram

### 6. Component Diagram

### 7. Complete Discovery Data Flow

### 8. Geographic Coverage Strategy

### 9. Google Places Integration Strategy

### 10. MongoDB Collections + Complete Fields

### 11. MongoDB Index Strategy

### 12. Entity Relationship Diagram

### 13. API Contract

### 14. Discovery Sequence Diagram

### 15. Bulk Import Sequence Diagram

### 16. Failure/Retry Architecture

### 17. Security Boundary Diagram

### 18. Deduplication Strategy

### 19. Idempotency Strategy

### 20. Queue/Worker Strategy

### 21. Cache Strategy

### 22. Cost/Quota Strategy

### 23. Frontend Component Architecture

### 24. UX Flow

### 25. Testing Strategy

### 26. Performance Strategy

### 27. Implementation Plan

### 28. File-by-File Change Plan

### 29. Risks and Trade-offs

### 30. Final Definition of Done

---

# 102. FINAL STANDARD

The final implementation must be:

> **Production-grade, tenant-safe, geographically correct, provider-aware, cost-controlled, idempotent, observable, performant, maintainable, accessible, and native to the existing CRM.**

Do not optimize for the number of files created.

Do not optimize for architectural complexity.

Do not create abstractions merely to appear sophisticated.

Optimize for:

```text
CORRECTNESS
+
SECURITY
+
USER EXPERIENCE
+
PERFORMANCE
+
MAINTAINABILITY
+
COST CONTROL
+
SCALABILITY
```

The user experience should ultimately be as simple as:

> **Select an area → Select a business type → Analyze → Review → Add One / Add Selected / Add All.**

Everything complicated must remain behind the scenes.
