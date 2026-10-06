# Lead Finder v0.2.4 — production implementation report

## Root cause

The extension did not contain a literal 25-lead total cap. The failure was architectural:

1. The Maps virtual list normally exposed about 25 cards at a time.
2. Every observation added the complete visible-card count to `discoveredCount`, including already processed cards. That produced misleading totals such as 4,906 discovered / 25 unique.
3. The fallback scroll-container selector preferred the smallest scrollable element and could scroll the wrong part of Maps.
4. Two unchanged reads were treated as completion even when the result feed had not reached a confirmed end.
5. Maps navigation reset `currentPage` to zero, while scroll position, query index, last successful result, and batch cursor were not fully checkpointed.
6. CRM requests were batched, but interrupted import batches had no persisted processed-ID cursor.
7. A refactor briefly produced an ESM import in the classic Manifest V3 content-script bundle. Real Chrome testing caught this; the content script is now self-contained.
8. The Maps adapter queried every visible place link in the document, mixing canvas markers with left-panel cards. At the list end, `scrollIntoView` could also jump backward, so the job kept scrolling while the unique count stayed fixed.
9. Recovery could dynamically inject the classic Maps content script more than once. Its top-level lexical declarations then collided, while successful duplicate executions could register extra message listeners, history wrappers, and DOM observers.
10. A virtualized feed reporting forward scroll movement bypassed the settled-DOM read and reset the no-progress counter. Maps could therefore recycle the same cards indefinitely while the extension kept scrolling without adding leads.
11. Contact extraction depended too heavily on generic English labels and discarded coordinates present in place URLs, reducing phone, website, address, rating, review, and location coverage on localized Maps pages.

## Implemented fix

- Discovery and CRM batch sizes are explicitly separate from total job limits. Both currently use controlled batches of 25.
- Stable result identity uses place ID, normalized Maps place URL, normalized name/phone/address, website domain/name, then coordinates.
- Every lead is written before its result key is checkpointed, preventing data loss across worker suspension.
- IndexedDB search checkpoints now persist processed count/keys, query index, result index, scroll position/height, visible anchors, retry count, stable rounds, last successful key/URL/time, phase, and timestamps.
- Maps result scrolling selects the feed/ancestor containing the most place links and persists stable first/last visible anchors.
- Extraction is scoped to one business card per actual results-feed card; canvas marker links are excluded. Only forward `scrollTop` movement counts as continuation, and “Back to top” cannot reset completion checks.
- Completion requires three no-progress checks at an actual/confirmed end of the feed. A repeated 25-card DOM window no longer inflates counters or completes the job.
- Navigation, retry, side-panel reopening, content-script reinjection, and service-worker recovery restore the same search session and skip processed businesses.
- Checkpoint v2 automatically repairs already polluted sessions (for example, 114 marker observations / 24 businesses) to canonical stored business identities.
- Pause, Resume, Stop, Retry, resuming, retrying, stopped, and error states preserve stored leads and deterministic button state.
- CRM imports persist processed lead IDs and resume only pending IDs after service-worker recovery. Missing local records and partial failures are isolated.
- CSV/XLSX read the full local dataset, independent of the virtualized table.
- The CRM bulk endpoint derives ownership from the authenticated request user, rejects client-controlled ownership, deduplicates stable place IDs, and returns per-row results.
- The Maps content runtime now has a page-world singleton guard, the service worker coalesces concurrent recovery injections per tab, and the production bundle is wrapped in an IIFE. Concurrent reinjection is safe: no top-level redeclaration, duplicate listener, duplicate observer, or repeated history wrapping.
- CRM bulk import no longer routes structured JSON through the multipart upload limiter. Non-Swiss locations are normalized without inventing invalid Swiss canton codes, telemetry cannot turn completed row results into a 500, and the extension falls back to the authenticated CSV import route when the structured endpoint returns a rollout-time 5xx.
- Every scroll cycle now waits for the virtual feed to settle, collects newly rendered cards, checkpoints them, and evaluates completion against the settled state. Scroll movement alone is never treated as lead progress.
- Large visible result sets are processed and published in 25-record batches while the complete visible set and overall discovery job continue.
- Detail extraction now uses Maps `data-item-id` attributes and `tel:`/authority links first, supports localized labels and review formats, preserves place coordinates, and returns structured extraction errors to bounded worker recovery instead of silently timing out.
- The manifest public key pins release ID `bnmjibohjdkkibimeknikhnolhlbgmnk`; server CORS permits that exact extension origin and rejects arbitrary extension IDs with an operational 403 instead of a misleading 500.

## Verification

```text
IMPLEMENTATION REPORT

Audit: PASS
Google Maps pagination/infinite scroll: PASS (live Chrome continuation scroll)
Continuous discovery: PASS (1,000 records / 40 batches regression)
Navigation recovery: PASS (100-record navigation checkpoint regression)
Side-panel recovery: PASS (200-record reopen regression)
Service-worker recovery: PASS (300-record restart regression)
Retry recovery: PASS (400-record failure checkpoint regression)
Loading state: PASS
Local persistence: PASS
Duplicate protection: PASS
CSV full-dataset export: PASS (1,000 rows)
XLSX full-dataset export: PASS (1,000 rows)
Application-compatible import columns: PASS
Authentication UI/error/session boundary: PASS
Production successful-login flow: NOT RUN (no valid test account supplied)
CRM single/bulk/partial/idempotent logic: PASS
CRM authenticated user ownership: PASS (Mongo-backed server regression)
Production CRM bulk route: PASS (deployed route returns authenticated 401 boundary)
Production CORS for this build ID: FAIL (server source fixed; deployment pending)
Production CORS rejects arbitrary extension IDs: PASS
5,000-record checkpoint test: PASS (200 batches)
Extension security checks: PASS
Deployed server CORS hardening: PENDING DEPLOYMENT
Automated Chrome E2E smoke: PASS (34 checks, 1 production-deployment warning; stable release ID loaded, concurrent reinjection remained responsive, Hotel near Paris advanced from 6 to 20 unique rendered businesses and terminated after the confirmed stable end instead of scrolling indefinitely)
Extension tests: PASS (26/26)
Focused CRM server tests: PASS (33/33 across the final focused runs)
Production build: PASS
ZIP integrity: PASS
```

## Build artifact

- Version: `0.2.4`
- File: `lead-finder-extension.zip`
- Extension ID: `bnmjibohjdkkibimeknikhnolhlbgmnk`
- SHA-256: `8e391e7aa1bc5e884f3074f5650b7ae77c6bd7b13d8cf15835266ae7a7299748`

## Remaining production acceptance

- Complete a successful login using a designated production test account.
- Deploy the server change that allows only `chrome-extension://bnmjibohjdkkibimeknikhnolhlbgmnk`. The current deployment rejects this release origin, so browser login cannot succeed until deployment.
- Verify the authenticated test account has `lead:import`.
- Run an authenticated create/existing/partial-failure import against the production workspace.

## Known limitations

- Google Maps does not expose a reliable “1,000+ available” total to the extension. Counters report only businesses actually encountered and processed; map markers are not claimed as extracted list records.
- Maps may expose only a short list for some hotel/date/search contexts even when many map markers are visible. The job completes only when that rendered result feed confirms its end.
- Contact fields remain `null` when Google Maps or the public business website does not expose them; the extension does not fabricate phone numbers, websites, emails, addresses, ratings, or reviews.
- Tokens use `chrome.storage.session`: panel and service-worker restarts are supported, while a full browser restart may require login again.

## Production readiness

Code/build/Maps browser readiness: **PASS**.

Overall production readiness: **90%**, pending deployment of the exact extension-origin allowlist and successful authenticated production CRM acceptance with a valid test account. No 100% claim is made without those final external verifications.
