# Platform governance

Team-scoped lead access, PII masking, audited supervisor access, campaign
profitability and the multi-tenant guard. Every setting defaults to the
behaviour that existed before this work, so deploying the code changes nothing
until an operator opts in.

| Setting | Default | Effect |
| --- | --- | --- |
| `LEAD_ACCESS_MODE` | `company` | `team` scopes lead visibility (below). |
| `LEAD_ACCESS_REASON_REQUIRED` | `true` | Team mode only: opening a lead you do not own requires a stated reason. |
| `LEAD_ACCESS_GRANT_MINUTES` | `30` | How long a stated reason keeps that lead open for that user. |
| `PII_MASKING_ENABLED` | `false` | Mask lead phone and e-mail for users without `lead:pii:view`. |
| `SIM_SMS_COST_PER_MESSAGE` / `_CURRENCY` | blank / `CHF` | Cost of one SIM SMS. Blank means the cost is not recorded. |
| `MULTI_TENANT_MODE` | `false` | `true` stops the server at startup (see the last section). |

New permissions are seeded by `seed.js`, and Admin receives all of them:
`lead:read:all`, `lead:pii:view`, `team:read`, `team:manage` and
`analytics:attribution:read`. `users:admin` implies `team:*`, and `crm:admin`
implies `analytics:attribution:read`. Migration `037_platform_governance` adds
indexes only.

## Team-scoped lead access

The policy is defined once, in `server/src/modules/governance/leadAccess.js`
(`buildLeadAccessFilter(user)`). In team mode a user can see the leads they
created, the leads assigned to them, and the leads assigned to members of teams
they supervise or manage. They also see unassigned leads in a pool their team
shares (`team.leadScope.shareUnassigned`, which can be limited to specific
sources). Users with `lead:read:all` see every lead.

`governance.middleware.js` is mounted once in `app.js`, in front of
`/api/v1/crm/leads`, `/api/v1/crm/follow-ups`, `/api/v1/ai-calling`,
`/api/v1/sim-sms` and `/api/v1/sim-calls`. It applies the scope in four ways:

- **Lists, map, filter options, exports and follow-ups.** The request runs inside
  an `AsyncLocalStorage` context. `lead.repository.buildListFilter` and the
  follow-up lead lookups each add `currentLeadAccessFilter()` in a one-line hook.
- **Requests by id.** These include a lead, `/:id/*`, an AI call, an SMS
  conversation and a SIM-call task. If the item is out of scope, the server
  returns **404**, so the response does not reveal that it exists. The check
  covers GET, PATCH, DELETE and convert, as well as any future `/:id/...` route.
- **Bulk body ids.** For the `leadIds`, `sourceLeadId(s)`, `targetLeadId` and
  similar keys on POST, PUT, PATCH and DELETE, any out-of-scope id makes the
  server return **403 `LEAD_ACCESS_DENIED`**.
- **Break-glass.** A lead the user can see but does not own returns **428
  `ACCESS_REASON_REQUIRED`**. The web drawer then asks for a reason and sends it
  to `POST /api/v1/governance/access-grants`. This is audited and opens access
  for `LEAD_ACCESS_GRANT_MINUTES`. Each kind of access is then audited once per
  grant with the stated reason. The kinds are `lead.view`,
  `conversation.view`, `transcript.read`, `call.listen` (live monitor) and
  `*.modify`.

Duplicate detection for create and import stays **global** by design, so team
mode never creates duplicates of leads a user cannot see. Team mode costs one
extra authentication lookup on governed requests, because the middleware runs
before the route's own guard.

Other teams can use `teamService.getSupervisorsFor(userId)` and
`teamService.getMembers(teamId)` for escalation and for finding eligible users.

## PII masking

The policy and helpers live in `server/src/shared/security/fieldMasking.js`:

- Phone fields become `+41 *** ***4321`.
- E-mail fields become `j***@domain.com`.
- Phone numbers and e-mail addresses inside SMS bodies, transcript turns and
  notes are masked, and the surrounding wording is kept.
- `recordingRef` is removed.
- Internal user references (`createdBy`, `assignedTo` and similar) are not
  touched.
- Each masked object gets `piiMasked: true`.

The middleware masks every successful JSON response on the governed paths when
`PII_MASKING_ENABLED=true` and the viewer lacks `lead:pii:view`. Exports are
handled as follows:

- The lead CSV, XLSX or PDF export masks its rows.
- AI-calling CSV exports cannot be masked row by row, so they are refused with
  **403 `PII_PERMISSION_REQUIRED`**.
- Every export is audited as `governance.data.exported`, with `piiMasked`
  recording whether it was masked. This applies in every mode.

Dialling and sending still resolve the number on the server:

- SIM call or SMS from the lead: `dialNumber` from
  `POST /crm/leads/:id/communications`.
- SIM-call campaigns: `next` and `dial`.
- SIM-SMS device lease: `/sim-sms/device/*`, which is never masked.
- WhatsApp: `waNumber`.

Where a person really needs to see a value, they use
`POST /api/v1/governance/leads/:leadId/reveal {purpose}`. The `view` purpose
needs `lead:pii:view`. The `call`, `sms` and `email` purposes need
`lead:write`, and `whatsapp` needs `lead:whatsapp`. The endpoint is audited
(failures too), limited to 30 requests per minute per user, and sends
`Cache-Control: no-store`.

Known limits:

- Search still matches raw phone and e-mail values. A masked viewer can confirm
  that a number they already know exists.
- The mobile app's `mailto:` link and the web WhatsApp button need a reveal
  while masking is on. The web `tel:`, `mailto:` and WhatsApp links are disabled
  for masked values.
- The mobile app does not handle the 428 break-glass response yet.

## Access log

`GET /api/v1/governance/access-log` (requires `audit:read`) can be filtered by
user, lead, action (grant, access, reveal or export) and date. It is shown at
**Settings → Access log**, and each lead drawer has a "Who accessed this lead"
panel backed by `GET /governance/leads/:leadId/access-log`. Entries are stored
in the existing immutable `AuditLog` with `module: 'governance'`. Audit writes
are best-effort through the audit queue.

## Campaign performance and attribution

`GET /api/v1/analytics/attribution` and `/export` (CSV, audited) accept these
parameters:

- `from` and `to`.
- `groupBy`: `campaign`, `channel` or `agent`.
- `model`: `first`, `last` or `linear`.
- `currency`.
- `includeDiscovery`.

The page is at `/campaign-performance`. Outcomes come from recorded activity.
AI-call and SIM-SMS costs can include estimates using configured rates; missing
costs and exchange rates remain explicitly unrecorded.

**Touches** are counted from these sources:

- AI calls. The cost is the stored or priced token usage plus the configured
  minute rates, from `callAnalytics.pricedCost`. Test calls are excluded. A call
  that never connected counts as a recorded 0.
- SIM-call attempts. The cost is not recorded.
- SIM SMS. The cost comes from `SIM_SMS_COST_PER_MESSAGE` if it is set.
- Provider messages. Only `actualCost` is used, never `estimatedCost`.
- Manual mobile calls and SMS.
- Optionally, lead discovery.

**Outcomes:**

- A lead counts as qualified when its status is qualified or converted.
- A lead counts as converted when it has a `convertedCustomerId`.
- Revenue is the net subtotal, excluding VAT, of the converted customer's issued
  STANDARD and FINAL invoices, minus credit notes. Drafts, cancelled and
  written-off invoices are excluded. ADVANCE invoices are also excluded,
  because the FINAL invoice carries the full amount.

**Credit** goes only to touches made before `convertedAt`. Spend is not
attributed: each group's spend is the cost of its own touches.

**Currency.** Amounts are converted only with an exchange rate recorded in
Accounting. If no rate is recorded, the server returns `null` for the amount and
lists the missing pair. Missing costs, revenue and rates are counted in each
row's `excluded` and shown as "not recorded" in the UI. In team mode the report
covers only the leads the user can see.

## Tenant isolation

Multi-tenant mode is **not implemented**. The application serves one company.
Setting `MULTI_TENANT_MODE=true` makes `config/index.js` (`tenancyGuard.js`)
stop startup with the message *"tenant isolation not implemented; see docs"*.
User ownership and teams do not isolate tenants from each other.

Isolation would require the following:

1. A required, indexed `tenantId` on every collection. That includes users,
   roles, audit logs, counters, files and settings, and every unique index must
   be compound with `tenantId`.
2. A tenant context resolved on the server from the session, never from
   request input. It must be applied in every repository query and aggregation,
   including `$lookup` pipelines.
3. A tenant id carried in and checked on every asynchronous path:
   - BullMQ job payloads and repeatable jobs.
   - Socket.io rooms.
   - EventBus and DLQ events.
   - Webhooks, which must map a provider account to a tenant.
   - The voice-agent worker and its tokens.
   - Android device leases.
   - The paired-phone gateway.
4. Per-tenant storage prefixes and signed URLs, per-tenant cache keys and rate
   limiters, and per-tenant counters (lead, customer and invoice numbers).
5. Negative tests for each HTTP route, job, event, storage and recovery path,
   proving that tenant A can never read or change tenant B's data. These tests
   are required before the flag can be lifted.
