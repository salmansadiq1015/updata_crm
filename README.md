# Updata CRM / ERP

A single-tenant CRM + ERP platform (bespoke, for an HVAC/heating business) covering
the full operational lifecycle: customers and sites, lead generation, quotes &
orders, projects, scheduling, field service, procurement, catalog, accounting,
document templates, and AI-assisted workflows.

It ships with a **Chrome extension** ("Lead Finder") that captures businesses from
Google Maps straight into the CRM's lead pipeline.

---

## Repository layout

This is a monorepo of three independently-installed apps (no root `package.json`):

| Path | What it is | Stack |
| --- | --- | --- |
| [`server/`](server/) | REST + realtime API | Node (ESM), Express 5, Mongoose 9 (MongoDB), BullMQ + ioredis (Redis), Socket.IO 4, Winston, Jest |
| [`client/`](client/) | Web app | Next.js 16 (App Router), React 18, TanStack Query, Zustand, Tailwind v4, Vitest |
| [`lead_extention/`](lead_extention/) | Chrome extension (MV3) | Vite + React + TypeScript, Vitest ([details](lead_extention/README.md)) |

---

## Architecture at a glance

- **Single-tenant.** There is no `organizationId` / tenant concept — data is scoped
  per user by `createdBy`. Identity is always derived server-side from the
  authenticated request, never from the client.
- **Account tree.** `Customer` (`K-#####`) → `Site`/object (`O-###`) →
  `Installation` (`A-#####`). Prospects live separately as `Lead` (`L-#####`) with a
  one-click **Convert to Customer**.
- **Auth & RBAC.** JWT access (short-lived) + rotating refresh tokens, sessions in
  Redis, permission-based access control (`module:action`) enforced per route.
- **Backend module convention.** Each feature is
  `model / repository / service / controller / routes / validation (+events)`,
  mounted under `/api/v1/<module>`.
- **i18n.** Custom flat-dictionary i18n in the client — **de / en / fr / ar** with
  full RTL for Arabic; locale is cookie-based for SSR.

---

## Core capabilities

- **CRM** — customers, contacts, sites, installations, address book, activity.
- **Lead Generation** — Google Places / Maps business discovery → dedupe → review
  on map + list → import as leads; CSV/XLSX/PDF import & export; website enrichment;
  email + WhatsApp outreach.
- **Android app** (`mobile/`) — the CRM's own leads on the phone, SIM calling and SMS-composer
  hand-off with outcome, notes and qualification synced back to the lead
  ([details](LEAD-MOBILE-CALLING.md)).
- **Chrome extension integration** — install from the Leads page and securely link it
  to the signed-in CRM account (see below).
- **Operations** — quotes & orders, projects/PM, scheduling, assignments, field
  service / tickets, procurement, catalog, time tracking.
- **Finance & documents** — accounting, document templates (`doctpl`), AI agents.

---

## Chrome extension integration

The Leads page exposes a **Chrome Extension** entry point with a live status and a
real **"Add to Chrome"** flow. The connection is secure by design — **no CRM
password is ever entered into the extension**:

```
CRM Leads page → "Add to Chrome" → Chrome Web Store → user installs
      → "Connect" → CRM mints a single-use, short-lived pairing grant
      → extension redeems it for a normal rotating session token
      → status shows Connected (verified, never faked)
```

- The Web Store URL is configurable via `NEXT_PUBLIC_CHROME_EXTENSION_STORE_URL`.
  Until the extension is published, the card shows an honest "load unpacked"
  development flow instead of a dead link.
- Connection state combines an in-browser ping (is it installed?) with a server
  connection record (is this account linked?), so it never claims a state it can't
  verify. Disconnect revokes the extension's session.
- The extension reuses the existing auth, RBAC, lead ownership and lead APIs — no
  second user or lead system. See [`lead_extention/README.md`](lead_extention/README.md).

---

## Getting started

### Prerequisites

- Node.js 20+ and npm
- MongoDB and Redis running locally (or reachable via connection strings)
- Google Maps Platform API key (for the Lead Generation map / Places discovery)

### 1. Backend (`server/`)

```bash
cd server
npm install
# create server/.env with at least: MONGODB_URI, REDIS_URL, JWT_SECRET, PORT (e.g. 9097)
npm run seed       # seed roles, permissions and base data
npm run migrate    # apply DB migrations
npm run dev        # start the API (nodemon)
```

### 2. Web client (`client/`)

```bash
cd client
npm install
# create client/.env.local — e.g.:
#   NEXT_PUBLIC_API_URL=http://localhost:9097/api/v1
#   NEXT_PUBLIC_SOCKET_URL=http://localhost:9097
#   NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<AIza…>           # Lead Generation map
#   NEXT_PUBLIC_CHROME_EXTENSION_STORE_URL=<listing-url>  # optional until published
npm run dev        # http://localhost:3000
```

### MongoDB startup failures

The API retries transient database connection failures up to three times, with
a ten-second server-selection timeout per attempt and a two-second pause between
attempts. Authentication and invalid URI errors fail immediately. Configure these
limits with `MONGODB_CONNECT_ATTEMPTS`, `MONGODB_SERVER_SELECTION_TIMEOUT_MS`, and
`MONGODB_CONNECT_RETRY_DELAY_MS` in `server/.env`.

If startup still fails, inspect the database log's `error.servers` entries for
the underlying DNS, TCP, or TLS error. Atlas's generic IP whitelist message does
not establish the cause. Check that the cluster is available, your current public
IP is in the Atlas project's **Network Access** list, and your network permits
outbound connections to the cluster. See
[Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).
Retrying cannot resolve a persistent Atlas access-list or network restriction.

### 3. Chrome extension (`lead_extention/`)

```bash
cd lead_extention
npm install
npm run build      # outputs dist/
npm run package    # builds + zips lead-finder-extension.zip
# Load dist/ via chrome://extensions → Developer mode → Load unpacked
```

---

## Testing

```bash
cd server && npm test     # Jest (unit + integration)
cd client && npm test     # Vitest
cd lead_extention && npm test && npm run typecheck
```

---

## Notes

- `.env` / `.env.local` files are git-ignored — never commit secrets.
- The `client/` app runs on **Next.js 16**; consult the in-repo guides before
  changing App Router internals (see `client/AGENTS.md`).
- The `requirements/` folder holds design docs (e.g. the Lead Generation design);
  when docs and code disagree, trust the code.
