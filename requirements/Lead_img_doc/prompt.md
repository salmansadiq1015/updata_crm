Modify the existing Lead Generation / Business Discovery workflow to reduce dependency and API costs by replacing Google Maps as the primary business/location discovery provider.
The existing Lead Generation functionality must remain intact.
The new provider architecture must be:
PRIMARY PROVIDERS

1. Mapbox
2. Geoapify
   FALLBACK PROVIDER
3. Google Maps / Google Places API
   Google Maps must NOT be used for normal discovery when Mapbox + Geoapify can provide the required data.
   The goal is to achieve the highest possible business-discovery coverage at significantly lower cost while preserving the existing Lead Generation UX and CRM integration.
   Before changing code:
4. Inspect the complete existing Lead Generation workflow.
5. Identify every Google Maps / Google Places API integration.
6. Identify:
   - location search
   - geocoding
   - business/category search
   - radius search
   - area/polygon search
   - map markers
   - business details
   - pagination
   - deduplication
   - lead creation
   - existing-lead detection
   - DiscoverySession
   - DiscoveryResult
7. Identify which parts of Google Maps are being used only for visualization and which are being used for data discovery.
8. Reuse the existing Lead / CRM / RBAC / tenant architecture.
9. Do NOT redesign the existing CRM.
10. Do NOT create duplicate Lead models.
11. Do NOT break the existing Google Maps implementation until the replacement has been verified.
    Create a provider abstraction.
    Example:
    BusinessDiscoveryProvider
    Implement:
    MapboxProvider
    GeoapifyProvider
    GooglePlacesProvider
    The Lead Generation business logic must NOT directly depend on a specific provider.
    Example:
    Lead Discovery Service
    |
    v
    Business Discovery Provider
    |
    +---- Mapbox
    |
    +---- Geoapify
    |
    +---- Google Places fallback
    This allows providers to be changed or added later without rewriting Lead Generation.
    Normal discovery order:
    PRIMARY:
    Mapbox + Geoapify
    FALLBACK:
    Google Places
    Recommended flow:
12. Mapbox handles location/geocoding/boundary information.
13. Geoapify handles business/POI discovery.
14. Mapbox can supplement geographic/business information where appropriate.
15. Merge results.
16. Deduplicate results.
17. Evaluate coverage.
18. Only if the primary providers cannot provide sufficient/usable results, invoke Google Places as fallback.
19. Merge Google results into the existing result set.
20. Deduplicate again.
21. Return the final normalized dataset.
    Do NOT call Google automatically for every request.
    The existing user workflow must remain:
    User searches:
    "Paris, France"
    The system should resolve:

- latitude
- longitude
- bounding box
- administrative boundaries where available
- formatted address
- country
- city
- postal code where available
  Prefer Mapbox for geocoding.
  Geoapify may be used as a secondary geocoding source when necessary.
  Normalize the result into the application's existing location structure.
  Preserve the existing Lead Generation workflow.
  User can select:
- location
- radius
- circle
- rectangle
- polygon
- map-drawn area
  Example:
  Location:
  Paris, France
  Radius:
  5 km
  Business Type:
  Restaurant
  The system must search the actual geographic area selected by the user.
  Do NOT simply send the center point to one API and accept whatever results are returned.
  The geographic boundary must be respected.
  This is critical.
  Do NOT assume that one API request can return every business in a large area.
  For larger areas:

1. Calculate the geographic search boundary.
2. Divide the area into smaller overlapping search cells/tiles where necessary.
3. Search each cell.
4. Collect results.
5. Merge all results.
6. Deduplicate them.
7. Validate that each result is actually inside the selected area.
8. Continue until all applicable provider pages/results have been exhausted.
   Example:
   5 km radius
   |
   v
   Create overlapping search cells
   |
   +-------+-------+-------+
   | Cell 1| Cell 2| Cell 3|
   +-------+-------+-------+
   | Cell 4| Cell 5| Cell 6|
   +-------+-------+-------+
   |
   v
   Merge results
   |
   v
   Deduplicate
   |
   v
   Validate geographic boundary
   |
   v
   Final results
   The purpose is to maximize business coverage rather than returning only the first page of results.
   The existing user-selected business type must remain the primary discovery criterion.
   Examples:
   Restaurant
   Hotel
   Hospital
   Pharmacy
   Medical Store
   Dentist
   Clinic
   Gym
   Salon
   Supermarket
   etc.
   Map the application's internal business categories to provider-specific categories.
   Example:
   Application:
   restaurant
   Geoapify:
   appropriate POI/category mapping
   Mapbox:
   appropriate category/search mapping
   Do NOT send the UI's translated display label directly to the providers.
   Use stable internal category IDs.
   Support:
   Business Type:
   Restaurant
   Keyword:
   Italian
   The discovery system should combine:
   geographic area

- business category
- optional keyword
  Example:
  Restaurants
  within 5 km
  of Paris
  matching "Italian"
  Do not let keyword searching override the selected geographic boundary.
  Use Mapbox primarily for:

* location search
* geocoding
* reverse geocoding
* coordinates
* map rendering if applicable
* bounding boxes
* geographic context
* area/boundary calculations where appropriate
  Use the provider only for capabilities actually supported by the configured Mapbox APIs/products.
  Do not assume Mapbox automatically provides complete business coverage.
  Use Geoapify primarily for:
* POI/business discovery
* category-based searches
* geographic filtering
* radius/area searches
* business attributes available from the provider
* address/location data
* coordinates
* website/phone/category information where available
  Use appropriate Geoapify APIs/endpoints based on the current API documentation and available plan.
  Do not hard-code unsupported parameters.
  Google Places should only be used when primary providers fail to provide sufficient/usable discovery results.
  Possible fallback conditions:
* provider unavailable
* timeout
* rate limit
* API error
* no usable results
* insufficient geographic coverage
* missing critical business information
* provider-specific limitation
* primary provider cannot satisfy the requested category/search
  Example:
  Mapbox:
  SUCCESS
  Geoapify:
  SUCCESS
  87 businesses
  Coverage:
  GOOD
  → Do NOT call Google.
  Another example:
  Mapbox:
  SUCCESS
  Geoapify:
  FAILED / RATE LIMITED
  → Use Google fallback.
  Another example:
  Mapbox + Geoapify:
  return 25 businesses
  Expected coverage strategy:
  multiple geographic cells + pagination exhausted
  If the provider documentation/API indicates the result set is incomplete or capped:
  → optionally invoke Google fallback according to the configured coverage policy.
  Do not blindly assume that "25 results" means the area contains only 25 businesses.
  Create configurable provider settings.
  Example:
  DISCOVERY_PROVIDER_MODE:
  "PRIMARY_ONLY"
  "PRIMARY_WITH_FALLBACK"
  "GOOGLE_ONLY" // temporary diagnostic/admin mode if needed
  Default:
  PRIMARY_WITH_FALLBACK
  Configuration should support:
  MAPBOX_ENABLED
  GEOAPIFY_ENABLED
  GOOGLE_FALLBACK_ENABLED
  Do not expose API keys to the frontend.
  All providers must return the same normalized internal structure.
  Example:
  {
  provider,
  providerPlaceId,
  name,
  category,
  categories,
  address,
  city,
  postalCode,
  country,
  latitude,
  longitude,
  phone,
  website,
  email,
  rating,
  reviewCount,
  openingHours,
  source,
  rawProviderData
  }
  Adapt this to the existing DiscoveryResult model rather than creating unnecessary duplicate models.
  The frontend must NOT care whether the result came from:
  Mapbox
  Geoapify
  Google
  Every discovery result must record its source.
  Examples:
  MAPBOX
  GEOAPIFY
  GOOGLE_PLACES
  If the same business is found from multiple providers:
  source:
  [
  "GEOAPIFY",
  "GOOGLE_PLACES"
  ]
  or use the existing source structure if already available.
  This is important for debugging provider quality and measuring cost.
  Deduplicate aggressively but safely.
  Priority:

1. providerPlaceId when the same provider result is repeated
2. cross-provider stable identifiers where available
3. phone number
4. website/domain
5. normalized name + address
6. geographic proximity + normalized name
   Example:
   Geoapify:
   Restaurant XYZ
   +33 1 23 45 67 89
   Google:
   Restaurant XYZ
   +33 1 23 45 67 89
   These must become ONE business.
   Do not create duplicate CRM Leads.
   After retrieving results:
   Verify every business belongs inside the user's selected area.
   For radius:
   distance(business, center) <= radius
   For polygon:
   point-in-polygon(business.coordinates, polygon)
   For rectangle:
   coordinates must fall inside bounds.
   Do not trust provider filtering blindly.
   This prevents businesses outside the selected area from appearing in the results.
   After provider-level deduplication, compare against existing CRM Leads.
   Use the existing CRM deduplication strategy.
   Example statuses:
   NEW
   EXISTING
   POSSIBLE_DUPLICATE
   Do NOT discard EXISTING businesses from the discovery results.
   The user should still see them and understand:
   ✓ New
   ✓ Already in CRM
   ⚠ Possible duplicate
   Preserve the existing DiscoverySession concept.
   Store:

- organization/tenant ID
- user ID
- location
- center coordinates
- radius
- selected geometry
- selected business type
- keyword
- providers used
- provider execution status
- provider result counts
- deduplicated count
- existing CRM count
- new lead count
- possible duplicate count
- execution duration
- error information
- fallback usage
- createdAt
- completedAt
  Example:
  DiscoverySession
  {
  location: "Paris, France",
  radius: 5,
  businessType: "restaurant",
  providers: [
  "MAPBOX",
  "GEOAPIFY"
  ],
  fallbackUsed: false,
  rawResults: 142,
  uniqueResults: 118,
  newLeads: 91,
  existingLeads: 22,
  possibleDuplicates: 5
  }
  Adapt to the existing schema.
  Add provider-level metrics.
  Track:
- requests
- successful requests
- failed requests
- rate limits
- latency
- results returned
- unique results
- duplicate results
- fallback calls
- fallback reason
- estimated API cost where possible
  This allows us to determine whether Mapbox + Geoapify are actually reducing Google API usage.
  Example:
  Discovery Session
  Mapbox:
  6 requests
  1.2s average
  successful
  Geoapify:
  8 requests
  2.1s average
  118 results
  Google:
  0 requests
  This is ideal.
  Do not fail the entire discovery operation because one provider fails.
  Example:
  Mapbox SUCCESS
  Geoapify FAILURE
  Google FALLBACK
  Return usable results.
  Provider failures should be logged with:
  provider
  endpoint
  status
  error code
  request ID if available
  duration
  session ID
  Never expose API keys or sensitive provider information to users.
  Implement provider-specific:
- timeout
- retry
- exponential backoff
- rate-limit handling
- concurrency control
  Do NOT fire hundreds of provider requests simultaneously.
  For area tiling:
  Use controlled concurrency.
  Example:
  MAX_CONCURRENT_PROVIDER_REQUESTS = configurable
  This prevents:
- rate-limit storms
- server overload
- API cost explosions
  Cache expensive geographic operations where appropriate.
  Potential cache keys:
  geocode:{normalizedLocation}
  discovery:{provider}:{category}:{cell}:{keyword}
  Use the existing Redis/cache infrastructure if already available.
  Do not cache user-specific CRM data incorrectly across tenants.
  Provider discovery cache must have appropriate TTLs.
  The primary goal is cost reduction.
  Implement:

1. Mapbox + Geoapify first.
2. Google only when required.
3. Cache repeated location queries.
4. Avoid duplicate provider requests.
5. Deduplicate overlapping cells.
6. Stop processing when coverage requirements are satisfied.
7. Avoid unnecessary Google fallback calls.
8. Track fallback frequency and provider usage.
   Add configuration such as:
   GOOGLE_FALLBACK_MAX_REQUESTS
   GOOGLE_FALLBACK_ENABLED
   DISCOVERY_MAX_CELLS
   DISCOVERY_MAX_CONCURRENT_REQUESTS
   Do not introduce arbitrary low result limits that reduce discovery quality.
   The existing UI should remain familiar.
   User workflow:
9. Open Lead Generation.
10. Search location.
11. Select area/radius/polygon.
12. Select Business Type.
13. Add optional keyword.
14. Click Analyze Area.
15. Discovery starts.
16. Map displays discovered businesses.
17. Results list displays businesses.
18. User can inspect details.
19. User can import individually.
20. User can Add All.
    The user should NOT need to know which provider was used.
    Optionally show subtle source information in business details/admin diagnostics.
    Example:
    "Discovered from multiple sources"
    Do not clutter the normal UX with provider implementation details.
    For large searches, show meaningful progress.
    Example:
    Analyzing selected area...
    Searching 4 / 9 geographic zones
    Businesses discovered:
    86
    Removing duplicates...
    Final unique businesses:
    74
    This is better than showing a generic infinite spinner.
    Do NOT implement:
    results.slice(0, 20)
    or:
    limit = 20
    or any frontend/backend restriction that causes only a small subset to appear.
    Pagination must be handled correctly.
    Provider-specific limits must be handled through:

- pagination
- multiple queries
- geographic subdivision
- overlapping search cells
- multiple provider sources
- fallback provider
  The final UI may paginate the results for performance, but the backend discovery process must not arbitrarily truncate the dataset.
  Mapbox, Geoapify and Google API keys must remain server-side where required.
  Do not expose private provider keys in frontend source code.
  Use environment variables.
  Example:
  MAPBOX_ACCESS_TOKEN
  GEOAPIFY_API_KEY
  GOOGLE_MAPS_API_KEY
  Use the existing secret/configuration architecture.
  Test the following scenarios:
  TEST 1
  Paris
  5 km
  Restaurant
  TEST 2
  Paris
  10 km
  Restaurant
  Keyword: Italian
  TEST 3
  Large geographic area
  Hospital
  TEST 4
  Pharmacy
  Small radius
  TEST 5
  Geoapify unavailable
  → Google fallback
  TEST 6
  Mapbox unavailable
  → Geoapify + fallback
  TEST 7
  Both primary providers unavailable
  → Google fallback
  TEST 8
  Same business returned by Mapbox + Geoapify
  → one result
  TEST 9
  Same business already exists in CRM
  → EXISTING
  TEST 10
  Polygon selection
  → only businesses inside polygon
  TEST 11
  5 km radius
  → no business outside radius
  TEST 12
  Large area requiring multiple geographic cells
  → all cells processed and results merged
  Before declaring the migration complete, run comparison tests between:
  OLD:
  Google-only
  NEW:
  Mapbox + Geoapify
  Compare:
- number of businesses
- unique businesses
- duplicate rate
- geographic accuracy
- category accuracy
- phone availability
- website availability
- address quality
- response time
- API request count
- Google fallback frequency
- estimated cost
  Do not assume the new providers are better merely because they are cheaper.
  Measure actual coverage.
  Do NOT claim:
  "Mapbox + Geoapify return every business."
  Business databases are provider-dependent and no provider should be treated as a guaranteed complete representation of every real-world business.
  The objective is:
  MAXIMUM AVAILABLE COVERAGE
  within the selected geographic area,
  using multiple provider strategies,
  pagination,
  area subdivision,
  deduplication,
  and Google fallback when necessary.
  If provider limitations prevent complete coverage, expose that limitation rather than falsely claiming 100% coverage.
  PHASE 1
  Audit existing Google integration.
  PHASE 2
  Create provider abstraction.
  PHASE 3
  Implement Mapbox provider.
  PHASE 4
  Implement Geoapify provider.
  PHASE 5
  Implement result normalization.
  PHASE 6
  Implement geographic area/cell search.
  PHASE 7
  Implement pagination and controlled concurrency.
  PHASE 8
  Implement cross-provider deduplication.
  PHASE 9
  Integrate existing CRM Lead deduplication.
  PHASE 10
  Implement Google fallback.
  PHASE 11
  Add caching and cost controls.
  PHASE 12
  Add provider metrics/logging.
  PHASE 13
  Connect to existing frontend.
  PHASE 14
  Run provider comparison tests.
  PHASE 15
  Only after successful validation, make Mapbox + Geoapify the production default.
  The implementation is complete only when:
  ✓ Mapbox is a primary provider
  ✓ Geoapify is a primary provider
  ✓ Google Places is fallback only
  ✓ Existing Lead Generation UX remains functional
  ✓ Location search works
  ✓ Radius search works
  ✓ Circle selection works
  ✓ Rectangle selection works
  ✓ Polygon selection works
  ✓ Business type filtering works
  ✓ Keyword filtering works
  ✓ Pagination is handled
  ✓ Large areas are subdivided when necessary
  ✓ Results are geographically validated
  ✓ Cross-provider duplicates are removed
  ✓ Existing CRM duplicates are detected
  ✓ No arbitrary 20/50/100 result limit exists
  ✓ Results are normalized
  ✓ Provider source is tracked
  ✓ DiscoverySession records provider information
  ✓ Google is not called unnecessarily
  ✓ Provider failures are handled gracefully
  ✓ API keys remain secure
  ✓ Caching is implemented where appropriate
  ✓ Rate limiting is handled
  ✓ Cost/usage is measurable
  ✓ Existing CRM architecture is reused
  ✓ Tenant isolation remains intact
  ✓ Existing RBAC remains intact
  ✓ No duplicate Lead model is introduced
  ✓ No regression to existing functionality
  ✓ Frontend shows complete discovered results
  ✓ Import/Add All continues to work
  ✓ Production default is Mapbox + Geoapify
  ✓ Google remains available as a controlled fallback
