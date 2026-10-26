# Multi-business discovery implementation report

Date: 2026-10-26  
Extension version: 0.6.0

## Initial audit

The extension was already a Manifest V3 React/TypeScript side panel with a service-worker-owned discovery loop. Search records and leads were checkpointed in IndexedDB, user settings were stored through the existing settings repository, and short-lived CRM credentials were isolated in `chrome.storage.session`.

The audit found these gaps before implementation:

- Search configuration, progress, history, and the persisted `SearchRecord` represented only one `businessType`.
- The side panel used a native single-select and could not preserve a user-defined execution order.
- Discovery had no campaign/task model, per-type terminal states, queue checkpoint, individual retry, or global multi-type progress.
- A completed Maps loop returned control only to the single search; there was no event-driven transition to another category.
- Pause/stop operated on an in-memory job. A reconstructed paused job after service-worker suspension needed an explicit way to restart its execution loop.
- Deduplication was local to one search and needed stronger cross-category identity precedence and category attribution.
- Export/history described one category only.
- Latitude/longitude from the Maps viewport existed internally, but there was no user-facing way to provide an exact shared campaign center.

Existing behavior preserved and reused:

- Maps SPA navigation, result-feed extraction, scrolling, adaptive tile scanning, settled-result detection, and bounded safety limits.
- Detail-page hydration for phone, website, address, provider category, place ID, and coordinates.
- Optional public-website contact enrichment.
- IndexedDB lead/search persistence and settings migration patterns.
- CRM authentication, tenant ownership, bulk import/CSV fallback, resumable batches, history, and CSV/XLSX export.
- Existing cancellation, alarms, retry helpers, stale-route protection, and progress messages.

## Implementation

### Campaign orchestration

`DiscoveryCampaign` is persisted inside the existing `SearchRecord`. It contains ordered `BusinessTypeTask` entries, queue position, current type, campaign status, per-type counters, errors/retries, timestamps, enrichment counters, and the most recent checkpoint metadata.

The worker processes exactly one discovery task at a time. A task advances only after the existing Maps workflow reports a real terminal outcome: settled extraction, a valid zero-result completion, global cap, cancellation, or an exhausted error policy. It does not use a fixed delay to move between business types. Transient failures use bounded backoff; an exhausted task becomes failed and the next eligible task starts automatically.

The result cap is explicitly global. A value of 100 means at most 100 unique businesses across the complete campaign. Cross-type duplicates do not consume another slot. When the cap is reached, remaining pending types are marked skipped with a limit-reached reason.

Campaign starts are guarded against duplicate messages and double clicks. Pause checkpoints the current operation and prevents new work; resume restarts a reconstructed MV3 job when no live run loop remains; stop prevents subsequent type transitions and preserves all committed results. A failed type can be retried without recreating the campaign.

### Data integrity and location accuracy

Business identity is evaluated in this order:

1. Stable Google Maps place/provider identifier, including a normalized Maps place URL.
2. Exact normalized full phone number.
3. Canonical website domain with corroborating business identity.
4. Exact normalized name/address, or the same normalized name within a cautious 150-metre coordinate threshold.

Conflicting stable place IDs are never merged merely because names match. A merged lead keeps its original source identifiers and accumulates `discoveryCategories` separately from the Maps provider category.

The campaign accepts one shared area/city/address and optional latitude/longitude. Coordinates are range-validated and act as the exact center for area scanning; manually supplied coordinates require **Scan the entire area** so the radius is enforceable. Every generated tile is checked against the configured circular area. Lead coordinates and formatted addresses are taken only from Google Maps data exposed in the active session; the extension does not invent an address or claim reverse-geocoding precision that Maps did not provide.

### Side-panel experience

The single select was replaced with an accessible searchable multi-select that provides checkboxes, ordered removable chips, selected count, Select all/Clear all, custom search categories, keyboard navigation, empty states, validation, and responsive styling. A saved legacy `businessType` is migrated to a one-element `businessTypes` array.

The progress card shows overall task completion, current type/stage, unique and duplicate counts, contact enrichment, elapsed time, errors/retries, and each task's status/count. Results remain in the existing unified list and are committed incrementally. History, CSV/XLSX, lead selection, and CRM import continue to use the same search ID and now retain all campaign categories and per-type counts.

### Enrichment

Maps detail hydration remains part of the current type's sequential workflow. Public-website enrichment is optional, bounded, tagged with the campaign/type, and skips already completed work. A missing phone, website, or email is not a discovery failure; exhausted optional enrichment is recorded as `COMPLETED_WITH_ERRORS` while the valid business remains available.

## Files changed

- `src/shared/types.ts`: campaign/task contracts, multi-type configuration, category attribution, progress and retry messages.
- `src/shared/campaign.ts`: pure campaign creation, migration, transition, retry, skip, and aggregate helpers.
- `src/background/service-worker.ts`: durable sequential queue, lifecycle recovery, controls, retries, global cap, per-type progress, and enrichment integration.
- `src/shared/normalize.ts`: cross-type identity matching and safe record/category merging.
- `src/sidepanel/main.tsx`: multi-select, coordinates, validation, campaign controls/progress, incremental/history rendering.
- `src/sidepanel/styles.css`: responsive multi-select, chips, progress, and task status styling.
- `src/export/exporters.ts`: combined categories and campaign detail worksheets.
- `src/integration/crm-api.ts`: category-preserving CRM fallback tags without changing authentication or server ownership.
- `src/shared/constants.ts`: the content-runtime revision used by the hardened Maps lifecycle.
- `tests/multi-business-campaign.test.ts`: deterministic campaign and compatibility tests.
- `tests/browser-smoke.mjs`: current-Chrome unpacked-extension and real Maps lifecycle verification.
- `README.md`, `package.json`, `package-lock.json`, `public/manifest.json`: release documentation and version 0.6.0.

No new runtime dependency or extension permission was added.

## Automated verification

Executed in `lead_extention`:

```text
npm run typecheck  PASS
npm test           PASS — 14 test files, 98 tests
npm run build      PASS — Vite production build, 50 modules
```

Coverage includes the required single/multi-type ordering, automatic transition, zero results, failure continuation, bounded retry, partial-result preservation, pause/resume, stop, worker reconstruction, idempotent starts, cross-type deduplication, global cap, independent area scans, optional-enrichment failure, incremental updates, CRM/export/history compatibility, queue changes, validation, and regression suites.

## Real-browser verification

The smoke procedure launches a disposable Chrome profile, loads `dist/` through the DevTools Extensions protocol, opens real Google Maps, and drives the extension through its runtime and IndexedDB boundaries.

Verified on Chrome 156:

- The extension loaded and the side panel rendered the accessible multi-select, persisted chips, keyboard selection, coordinates, and global-limit disclosure.
- Real Maps feed extraction, stable fields, scroll checkpoints, and detail hydration worked.
- A two-type campaign ran a deliberate zero-result type followed by Hotel automatically. The worker observed the categories in the configured order, updated unique results incrementally (`0`, `1`, `4`), and stopped at the global limit of four.
- Pause persisted the active Hotel checkpoint. The service worker was then forcibly stopped; `GET_PROGRESS` reconstructed the paused job; Resume restarted it; Stop became terminal and marked Gym skipped.
- Search, lead, campaign, and checkpoint data were present in IndexedDB after recovery.

Manual reproduction:

```bash
npm run build
npm run test:browser
```

For a human smoke test, load `dist/` unpacked, open a Maps tab, select at least two types, provide the area/city or exact coordinates, start the campaign, and confirm each task changes from Pending to Running to a terminal state in order. During the second type, close/reopen the panel, then test Pause/Resume and Stop. Finally select the combined leads, export both formats, and import with a valid CRM account.

## Known limitations and verification boundaries

- Google Maps can cap, reorder, or temporarily stall its virtualized result feed. The extension uses settled-state checks, tile checkpoints, timeouts, retries, and a safety state limit, but cannot guarantee that Maps exposes a requested count. One exploratory run produced a long unconfirmed feed stall; the final smoke run completed its required checks.
- Address accuracy is limited to the address and coordinates exposed by Google Maps. An exact campaign center improves radius accuracy but is not evidence that every provider address is postal-authority verified.
- CAPTCHA, consent, provider throttling, or unavailable fields are surfaced; the extension does not bypass access controls or fabricate contacts.
- Automated CRM payload/import compatibility passed. A successful live production CRM login/import could not be completed without valid user credentials; the public production login returned its existing generic `Login failed` response in the disposable profile. Authentication, tenant isolation, and server authorization code were not modified.
- The individual type retry safely rescans that category and relies on campaign-wide identity deduplication. It does not retain a second full per-type copy of the lead dataset, avoiding storage-quota growth.

## Migration and rollout

- Existing single-type settings migrate automatically on first render; no user action and no IndexedDB schema bump are required.
- Existing historical searches without a campaign are read through a legacy one-task campaign projection and remain exportable/importable.
- Deploy the built extension as version 0.6.0. Keep the released extension origin in the CRM CORS allowlist and use a valid CRM account for the final environment-specific import acceptance check.
