# Lead Finder — local-first Maps discovery + CRM

This is the existing MV3 React/TypeScript extension, hardened for Google Maps SPA navigation and connected to the application's authenticated CRM. Version 0.6.0 adds persistent, sequential multi-business-type campaigns.

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

- Choose one or more searchable business types. The selected chip order is the execution order; each type reaches a real terminal state before the worker starts the next one.
- Location, radius, scanning, contact hydration, and query expansion are shared by the campaign. Optional latitude/longitude supplies the exact area-scan center while the area/city/address remains the human-readable query context.
- **Maximum results is one global unique-business cap for the campaign**, not a per-type allowance. Pending types are skipped when that cap is reached.
- The unified result list updates after each committed business. Cross-type duplicates keep one record and accumulate their search categories.
- The campaign and per-type states support pause, resume, stop, bounded retry, service-worker reconstruction, and individual failed-type retry.
- The service worker persists the active `SearchRecord` and local leads in IndexedDB.
- URL changes, history navigation, pushState/replaceState, DOM replacement, delayed results, infinite scroll, and detail navigation are treated as recoverable Maps state changes.
- The state machine waits, retries with exponential backoff, extracts, deduplicates, checkpoints, and only completes after settled no-new-result checks or an explicit termination condition.
- Closing and reopening the side panel or service-worker restart recovers the active job through storage and a Chrome alarm.
- The safety result-state limit is configurable in Settings. It protects against pathological loops; it is not the normal completion condition.

## Secure CRM connect (no password in the extension)

The primary way to link the extension is a one-time pairing grant initiated from
the CRM. The extension never handles a CRM password:

1. In the CRM, open **Leads → Chrome Extension → Connect**. The CRM (already
   authenticated) mints a single-use, 5-minute pairing grant bound to that user.
2. The CRM page hands the grant to the extension via
   `chrome.runtime.sendMessage(EXTENSION_ID, { type: 'CRM_CONNECT', grant })`.
   This channel is restricted by `externally_connectable` to the CRM origin, and
   the service worker re-validates the sender origin.
3. The extension redeems the grant at `POST /api/v1/extension/pairing/redeem` and
   receives a normal rotating access/refresh pair tied to a dedicated extension
   session — the same session machinery as a browser login. Tokens live in
   `chrome.storage.session`.

The Lead page shows live status (Not installed / Installed-not-connected /
Connected / Connection error) by combining an in-browser `CRM_PING` with the
server-side connection record, and can disconnect (revoking the session).

A manual email/password sign-in remains available in the side panel as a
fallback, but the connect-from-CRM flow is preferred.

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

The extension requests only what each feature needs. Every permission is
justified below; broad host access is **optional** and requested at runtime.

| Permission | Why it is needed |
| --- | --- |
| `storage` | Persist the active search checkpoint and settings (session storage holds the short-lived tokens). |
| `downloads` | Save CSV / XLSX exports the user explicitly requests. |
| `sidePanel` | The whole UI is a side panel. |
| `activeTab` + `scripting` | Read the business cards visible in the user's current Google Maps tab (content script). |
| `alarms` | Resume an interrupted discovery/import after the service worker is suspended. |
| host `https://updata.behjja.com/*` | Talk to the CRM API (auth, connect, lead import). |
| host `https://*.google.com/maps/*` | Read the Maps results the user is viewing. |
| `optional_host_permissions` `https://*/*` | Requested **only** if the user turns on optional website-contact enrichment. |
| `externally_connectable` `https://updata.behjja.com/*` | Lets the CRM Lead page send the one-time connect grant and status pings — the CRM origin only. |

Maps host access is limited to Google Maps. The service worker is the only extension component that contacts the CRM API; access tokens and refresh tokens are not sent to Maps pages. No API keys, backend secrets, or passwords are bundled.

See [MULTI_BUSINESS_DISCOVERY_REPORT.md](./MULTI_BUSINESS_DISCOVERY_REPORT.md) for the current audit, architecture, test evidence, browser verification, migration, and known limitations. The earlier hardening history remains in [AUDIT_REPORT.md](./AUDIT_REPORT.md).
