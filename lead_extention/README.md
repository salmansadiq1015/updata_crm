# Lead Finder — local-first Maps discovery + CRM

This is the existing MV3 React/TypeScript extension, hardened for Google Maps SPA navigation and connected to the application's authenticated CRM.

## Build

```bash
npm install
npm run typecheck
npm test
npm run build
npm run package
```

Install `dist/` through `chrome://extensions` → Developer mode → Load unpacked, or use `lead-finder-extension.zip`. Open Google Maps, sign in with the existing CRM account, and start from a visible Maps search.

## Discovery behavior

- The service worker persists the active `SearchRecord` and local leads in IndexedDB.
- URL changes, history navigation, pushState/replaceState, DOM replacement, delayed results, infinite scroll, and detail navigation are treated as recoverable Maps state changes.
- The state machine waits, retries with exponential backoff, extracts, deduplicates, checkpoints, and only completes after settled no-new-result checks or an explicit termination condition.
- Closing and reopening the side panel or service-worker restart recovers the active job through storage and a Chrome alarm.
- The safety result-state limit is configurable in Settings. It protects against pathological loops; it is not the normal completion condition.

## CRM behavior

The extension uses the existing application's auth endpoints and does not create a second user database. CRM ownership is server-derived from the authenticated bearer token. Imports are authenticated, batched, idempotent by Google place ID where available, and return created/existing/failed row outcomes. Local leads remain available if CRM is unavailable.

The preferred server endpoint for this flow is:

```text
POST /api/v1/crm/leads/bulk-import
```

If the deployed CRM has not received that endpoint yet, the extension automatically falls back to the existing authenticated `/crm/leads/import` CSV route. This keeps imports working during backend rollout while preserving server-derived ownership and duplicate checks.

Production CORS must explicitly include the released extension origin (`chrome-extension://<extension-id>`) in `ALLOWED_ORIGINS`.

## Exports

CSV and the first `Leads` sheet of XLSX use the CRM's existing import template column order:

```text
name,type,status,street,addressSupplement,postalCode,city,canton,country,phone,mobile,email,website,notes,tags
```

## Permission and privacy model

Maps host access is limited to Google Maps. Public website access is requested only when enrichment is enabled. The service worker is the only extension component that contacts the CRM API; access tokens and refresh tokens are not sent to Maps pages. No API keys, backend secrets, or passwords are bundled.

See [AUDIT_REPORT.md](./AUDIT_REPORT.md) for root causes, implementation details, evidence, and the live-test boundary.
