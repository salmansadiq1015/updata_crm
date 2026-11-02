# Lead Finder — local-first Maps discovery + CRM

This is the existing MV3 React/TypeScript extension, hardened for Google Maps SPA navigation and connected to the application's authenticated CRM. Version 0.6.3 applies the selected maximum independently to each business type.

## Build

```bash
npm install
npm run typecheck
npm test
npm run build
npm run package
```

Install `dist/` through `chrome://extensions` → Developer mode → Load unpacked, or use `lead-finder-extension.zip`. Open Google Maps, sign in with the existing CRM account, and start from a visible Maps search.

### 0.6.3 results per business type

Maximum results means **per selected business type**. Selecting Gym and Beauty
Salon with a maximum of 10 searches for up to 10 new unique gyms and 10 new
unique beauty salons, for up to 20 unique businesses in the campaign. A sparse
type can return fewer results; its unused allowance is not added to another
type. Cross-type duplicates remain one record and do not consume a new-result
slot. Resume and Retry preserve saved counts and each type's remaining allowance.

Reload version 0.6.3 at `chrome://extensions` after updating the unpacked files.
Previously saved campaigns retain their shared-limit checkpoints and history.
Use **Restart per type** or **Start new campaign** to apply the new limits.

### Earlier 0.6.2 shared limits and recovery (historical)

The maximum remains a total across all business types. Each type receives an
initial share of the remaining capacity: a total of 10 across Gym and Beauty
Salon starts with 5 slots each. If Gym only finds 2, Beauty Salon can use the
remaining 8. If the last type is sparse, unused slots return to types whose
initial share filled. Budgets survive pause/resume and worker recovery; duplicates do not
consume new unique-business slots. Set the total at least as high as the number
of selected types so each type has room for a result.

Retry resumes the selected campaign's failed/skipped task when capacity remains,
including when the original Maps tab was closed and another Maps tab is open.
A full historical campaign cannot accept more results. Its action is **Restart
fairly**, which starts a new balanced run using its saved settings and keeps the
previous campaign and leads in History. Skipped types are reported as skipped,
not as searched. Reload version 0.6.2 after updating the unpacked extension.

### 0.6.1 import metadata update

Deploy the matching CRM server and client before distributing this extension,
then run the server's normal `npm run migrate` command. Migration 038 repairs
older records identified by the extension's import signatures, fills recoverable
business types and areas, and installs the extension place-ID uniqueness index.
It preserves ordinary file imports, provider discovery records, and valid data.

New structured and CSV fallback imports both use the `extension` source shown as
**Chrome extension**. The fallback upload carries the complete structured record,
including area, category, search context, ratings, and Maps identifiers. A real
Maps category takes priority; a missing category uses the business type of the
lead's discovery task. Old single-type local searches can recover their category
from saved search history; mixed searches without per-lead evidence are not
assigned an arbitrary type. Re-adding existing leads fills missing metadata.

Areas are recovered from the full address or the business pin when possible.
A city name is not substituted for a missing neighbourhood. Provider failures,
missing coordinates, or unavailable area data can still leave an area unknown.
Reload version 0.6.1 at `chrome://extensions` after updating the unpacked files.

## Discovery behavior

- Choose one or more searchable business types. The selected chip order is the execution order; each type reaches a real terminal state before the worker starts the next one.
- Location, radius, scanning, contact hydration, and query expansion are shared by the campaign. Optional latitude/longitude supplies the exact area-scan center while the area/city/address remains the human-readable query context.
- **Maximum results applies to each business type**. The campaign maximum is that value multiplied by the number of selected types; each type stops at its own allowance.
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

CRM uniqueness is enforced on the server across extension, Google Places and
legacy CSV records. Maps IDs and their URL/CID aliases identify a business;
when no ID is available, exact name and street/locality or an explicit Maps
place pin provide conservative branch evidence. A name alone, shared phone or
chain website does not merge separate branches. Concurrent imports of the same
identity return one created lead and the existing lead to subsequent requests.

Deploy the matching server/client and run `npm run migrate` from `server/`.
Migration 039 backfills the unique identity index and consolidates confirmed
legacy copies through the existing merge journal, retaining linked history,
opt-outs, tags and missing metadata. Conflicting converted leads remain in the
duplicate review queue. Same-name records without reliable branch evidence
remain separate. This server update does not require a new extension version.

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
