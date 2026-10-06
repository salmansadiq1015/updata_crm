# Lead Finder production audit

## Root causes found

1. Discovery state lived only in the service worker. Side-panel closure or worker suspension made the UI report idle and lost the active loop.
2. The old loop used fixed delays, a bounded page counter, and an empty/unchanged DOM as an immediate completion signal. That is unsafe for Google Maps' SPA and infinite-scroll behavior.
3. The content script reported URL changes but did not report meaningful DOM/result-state changes, so dynamic result replacement could stop extraction without a navigation.
4. Search state did not persist phase, query, result-state key, processed result keys, tab, stop request, or error.
5. The extension had no authenticated CRM path. Generic exports did not match the CRM's canonical import template, and there was no server endpoint that derived ownership from the authenticated session.

## Implemented architecture

- MV3 service worker owns the discovery job and checkpoints `SearchRecord` state in IndexedDB.
- Recovery runs on service-worker startup, a periodic Chrome alarm, side-panel reopen, and Resume.
- Maps URL/history/pushState/replaceState/popstate and debounced DOM/result signatures are observed by the content script.
- Discovery phases are persisted: `SEARCH_INITIALIZED`, `WAITING_FOR_RESULTS`, `EXTRACTING`, `PROCESSING`, `CHECKING_FOR_MORE`, `NEXT_RESULTS`, `NO_MORE_RESULTS`, `COMPLETED`, and `FAILED`.
- Result loading retries with bounded exponential backoff. Completion requires repeated settled checks with no new records, Maps end-of-results information, a user stop, or the configured result/safety limit.
- Processed place IDs/URLs are persisted, leads are written incrementally, and side-panel progress is reconstructed from storage.
- Login uses the existing `/auth/login`, `/auth/refresh`, `/auth/logout`, and `/users/me` contract. Credentials remain in the extension service-worker boundary and are never sent to Maps content scripts.
- Added authenticated `POST /api/v1/crm/leads/bulk-import`. The server derives `createdBy` from `req.user._id`, checks place ID/fallback duplicates, returns per-row results, and handles partial failure.
- Extension CSV/XLSX first-sheet columns now match the CRM's current import template exactly: `name,type,status,street,addressSupplement,postalCode,city,canton,country,phone,mobile,email,website,notes,tags`.
- CRM imports are batched at 50 records and locally persist `imported`, `existing`, and `failed` status for retry.
- Existing premium side-panel styling was retained and extended with login, connected-user, CRM progress, dark mode, responsive layout, virtualized lead table, and deterministic async timeout behavior.

## Verification evidence

- Extension `npm run typecheck` — PASS.
- Extension `npm test` — PASS, 9 tests.
- Extension `npm run build` — PASS.
- Extension `npm run package` — PASS.
- ZIP integrity check — PASS.
- Changed server modules `node --check` — PASS.
- Live Google Maps navigation, browser restart, authenticated CRM, CORS, and Mongo duplicate-race tests — NOT RUN in this environment.

## Required deployment configuration

1. Set production `ALLOWED_ORIGINS` to include the released extension origin `chrome-extension://<extension-id>`; do not use a wildcard in credentialed production CORS.
2. Point the login screen at the deployed application's `/api/v1` base URL.
3. Verify the logged-in role has the existing `lead:import` permission.
4. Run the manual Chrome acceptance flow with a real Maps session and a test CRM workspace before release.

## Known limitations

- Google Maps is a changing, locale-sensitive SPA; extraction is limited to information exposed in the rendered user session.
- A safety limit is a recovery guard, not the normal definition of completion. It can stop an unusually large or pathological result state with a retryable saved job.
- The current environment cannot prove provider behavior, production CORS, live authentication, or real MongoDB duplicate races.

## Production readiness

Static/build readiness: 90%. Live production readiness: not claimed until the required Chrome + authenticated API acceptance tests pass.
