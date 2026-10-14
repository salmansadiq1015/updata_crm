# Lead multi-channel messaging

## Audit summary

The implementation extends the existing Express/Mongoose API, Next.js lead UI, JWT/RBAC middleware, audit service, BullMQ/Redis queue manager, and SMTP-backed `EmailRecord` pipeline. It does not create a separate application or replace the lead/auth models.

The current repository is company-wide/single-tenant: leads have `createdBy`, but there is no organization/tenant entity or `organizationId` boundary. Campaigns, history, templates, and analytics therefore use the authenticated actor as their available access boundary. Do not market this deployment as multi-tenant until the base CRM has an organization boundary that these collections can inherit.

The former lead WhatsApp action opened a `wa.me` browser link. Lead outreach now queues an official Meta Cloud API template request. The existing notification adapters remain separate because they serve a different module.

## Runtime architecture

`MessageCampaign` snapshots either the explicit lead IDs or the IDs matching the confirmed filters. `MessageRecipient` stores one personalized, eligibility-checked record per campaign/lead. `ProviderSubmissionAttempt` is append-only and captures every provider submission. `MessageDeliveryEvent` makes provider callbacks idempotent and tolerates duplicates and out-of-order events.

Bulk delivery uses the existing BullMQ connection through the `outbound-messaging` queue. Jobs have one application-level attempt. A network timeout is recorded as `unknown`; BullMQ does not blindly retry it.

A separate five-minute recovery sweep handles process/host failures. Stale work that never crossed the durable provider-intent boundary is safely re-enqueued. If a provider call may have started, the recipient is quarantined as `unknown` unless an immutable provider attempt already proves acceptance or rejection. Recovery therefore never guesses that a timeout or worker crash means “not sent.”

Daily and monthly CRM quotas use one atomic MongoDB reservation across both limits before a provider call can begin. Parallel workers therefore cannot pass a count-then-send race. Accepted and ambiguous submissions consume the reservation conservatively; confirmed rejections and `confirm_not_accepted` reconciliation release it idempotently. The current-period ledger is internal and never returned by settings APIs. Limits are capped at 50,000 to keep the bounded reservation ledger safely below MongoDB document limits.

Optional recipient-frequency policy applies independently per normalized destination and channel. Administrators can configure a minimum interval plus rolling 24-hour and seven-day caps for selected campaign purposes. Eligibility is checked while the recipient snapshot is built, rechecked immediately before jobs enter the queue, and reserved atomically at the final dispatch boundary so parallel campaigns cannot race past a limit. Accepted, unknown, and otherwise ambiguous submissions consume the reservation conservatively; proven rejection or `confirm_not_accepted` reconciliation releases it idempotently. A disabled policy or a zero value disables only that rule.

Global promotional quiet hours can be supplemented with administrator-defined regional rules matching ISO-2 lead country, channel, and message purpose. Matching queued work is delayed until every applicable window is open. These rules are operational controls, not an automatically maintained statement of local law; deployment owners must configure and review them with appropriate legal and carrier guidance.

SMS routing is:

1. Validate destination, consent, suppression, content, quota, country, purpose, and quiet hours.
2. Check the TextBee gateway before submission.
3. Submit once to TextBee and record its result. A successful `smsBatchId` means accepted/queued, not delivered.
4. Use Twilio only when the campaign explicitly allows fallback, global fallback is enabled, the country/purpose/spend policy allows it, and TextBee is known not to have accepted the SMS.
5. Never fall back following an ambiguous TextBee network, timeout-like HTTP, conflict, or 5xx outcome. Explicit rejection classes such as a verified rate-limit response may fall back only when all administrator policies permit it.

Exactly-once delivery cannot be guaranteed across external providers. Unknown attempts require provider/device reconciliation before any manual resend.

WhatsApp routing is Meta-first. A Meta-approved template and ordered parameter mapping remain
mandatory. Optional Twilio WhatsApp fallback is disabled by default and requires a separate,
administrator-supplied Twilio Content SID mapping for the same approved content. It is considered
only after a definitive Meta rejection and only when campaign opt-in, country, purpose, and spend
policies all permit it. A Meta timeout, network failure, or otherwise ambiguous result never falls
back, because the original submission may have been accepted.

## Environment

All credentials are server-only. Configure these in the API process or its secret manager; never use `NEXT_PUBLIC_` variables for them.

```dotenv
MESSAGE_DESTINATION_HASH_SECRET=<stable-random-secret-at-least-16-characters>
MESSAGE_UNSUBSCRIBE_SECRET=<stable-random-secret-at-least-32-characters>
MESSAGING_PUBLIC_API_URL=https://api.crm.example.com
MESSAGING_CONCURRENCY=3
MESSAGING_RECOVERY_STALE_MINUTES=10
MESSAGING_RECOVERY_BATCH_SIZE=500
MESSAGING_RECONCILIATION_MIN_AGE_MINUTES=5
MESSAGING_RECONCILIATION_MAX_AGE_DAYS=7
MESSAGING_RECONCILIATION_BATCH_SIZE=200

META_WHATSAPP_BUSINESS_ACCOUNT_ID=
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_ACCESS_TOKEN=
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
META_GRAPH_API_VERSION=<version-supported-by-your-meta-app>
META_WHATSAPP_TIMEOUT_MS=15000

TEXTBEE_API_KEY=
TEXTBEE_DEVICE_ID= # optional for sending; required for exact batch reconciliation polling
TEXTBEE_API_URL=https://api.textbee.dev
TEXTBEE_WEBHOOK_SECRET=<textbee-subscription-secret-at-least-20-characters>
TEXTBEE_TIMEOUT_MS=15000

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_STATUS_CALLBACK_URL=https://crm.example.com/api/v1/webhooks/messaging/twilio
TWILIO_WEBHOOK_PUBLIC_URL=https://crm.example.com/api/v1/webhooks/messaging/twilio
TWILIO_TIMEOUT_MS=15000

# Optional WhatsApp fallback through Twilio (Meta remains primary):
TWILIO_WHATSAPP_FROM=
TWILIO_WHATSAPP_MESSAGING_SERVICE_SID=
TWILIO_WHATSAPP_STATUS_CALLBACK_URL=https://crm.example.com/api/v1/webhooks/messaging/twilio
```

The existing `SMTP_*`, `REDIS_*`, MongoDB, JWT, and audit configuration remains required. Use either `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`. The Meta adapter deliberately remains disabled until an explicit Graph API version supported by the deployed Meta application is configured; no moving or guessed version is hardcoded.

SMTP health performs a real transport connection/authentication check without sending a message. TLS certificate verification defaults to enabled. `SMTP_TLS_REJECT_UNAUTHORIZED=false` exists only for an explicitly trusted private SMTP server using a self-signed certificate and should not be used for public production SMTP services.

Provider enablement, provider-specific ISO-2 country eligibility, quotas, recipient-frequency limits, global/regional quiet hours, allowed fallback countries/purposes, and fallback spend limits are non-secret values stored through `PATCH /api/v1/messaging/settings` (`settings:admin`). Invalid IANA quiet-hour timezones are rejected. `GET /api/v1/messaging/settings/health` (`settings:read`) reports redacted configuration and gateway health. Credentials are never accepted or returned by those endpoints.

## Provider setup and webhooks

- Meta callback: `GET/POST /api/v1/webhooks/messaging/meta`. Configure the verification token and subscribe the WhatsApp Business Account to message events. POST bodies require `X-Hub-Signature-256`, verified with `META_APP_SECRET`. Business-initiated sends require a locally registered template marked approved with its exact Meta name, language, component structure, and parameter order.
- TextBee callback: `POST /api/v1/webhooks/messaging/textbee`. Configure TextBee to sign the exact raw body using the matching webhook secret. The adapter verifies the documented lowercase-hex HMAC-SHA256 `X-Signature`, uses `idempotencyKey`, and reads recipient evidence from the documented `{ data: { batch, messages } }` response shape. Keep the Android gateway powered, connected, authorized, and supplied with a SIM/plan permitted to send the relevant traffic.
- Twilio callback: `POST /api/v1/webhooks/messaging/twilio`. `TWILIO_STATUS_CALLBACK_URL` is sent with outbound requests. `TWILIO_WEBHOOK_PUBLIC_URL` must equal the externally visible callback URL exactly so `X-Twilio-Signature` verification succeeds behind a proxy. Signature verification uses Twilio's server SDK for both form and JSON request modes.
- Email unsubscribe: `GET /api/v1/webhooks/messaging/unsubscribe?token=...`. `MESSAGING_PUBLIC_API_URL` must point to the externally reachable API origin so promotional email can include a signed, expiring unsubscribe URL. Promotional email fails closed when this URL is missing. Bounce events from the existing verified email webhook add an email suppression record.

Expose webhook routes over HTTPS. Preserve raw request bytes through the reverse proxy, and do not rewrite the externally visible Twilio URL without updating the setting.

Automated HTTP-boundary coverage verifies that invalid Meta, TextBee, and Twilio signatures are rejected before any event is processed, that valid signatures survive Express body parsing, and that duplicate provider event keys are idempotent. Each stored event has a completion marker: if the idempotency claim is written but a later database operation fails, the provider retry resumes the unprocessed claim instead of either losing the status/opt-out or creating a second event. Nested credential-shaped provider payload fields are recursively redacted and oversized payload structures are bounded before persistence. Campaign detail, recipient, and CSV export service paths also have explicit cross-owner disclosure regression tests. CSV responses neutralize formula-shaped untrusted strings before serialization so names, phone numbers, and provider errors cannot become active spreadsheet formulas when opened.

## Database and deployment

Use Node.js 22.22 or newer for client installs and builds. The current LiveKit client dependency declares that minimum; older 22.x patch releases may appear to work but emit an unsupported-engine warning and are not the deployment baseline. The verified client framework version is Next.js 16.4.0. Production dependency audits for both `client` and `server` must pass with `npm audit --omit=dev` before release.

Run:

```bash
cd server
npm run migrate
npm run seed:messaging-templates
```

The targeted template seed is non-destructive and idempotent. It creates the ten shared, editable
email starter templates only when they are missing and does not run the full database reseed. In
this single-tenant deployment the shared library is keyed independently of the current admin user,
so rotating the configured administrator does not duplicate the templates.

Migrations `016_messaging_indexes.js`, `018_messaging_operations_indexes.js`, `019_messaging_quota_indexes.js`, `020_messaging_frequency_indexes.js`, `021_messaging_reconciliation_indexes.js`, `022_messaging_workspace_indexes.js`, and `023_messaging_progress_backfill.js` create lookup and unique indexes for templates, campaigns, paginated campaign/recipient workspaces, attempts, delivery events, consent/suppression, operational history, quota and frequency reservations, recovery scans, reconciliation polling, and settings. Migration `023` backfills only the additive campaign progress counters from recipient evidence; it does not alter recipient outcomes. Version `018` intentionally follows the workspace's existing AI-calling migration at version `017`; later phases use additive migrations so already-applied versions are never silently changed. They do not rewrite existing lead, auth, or email data.

Start at least one API/worker process with MongoDB and Redis available. The repository registers workers in the API bootstrap; do not run multiple competing schedulers unless that matches the existing deployment model. Start with low `MESSAGING_CONCURRENCY`, verify carrier/provider throughput limits, then raise it carefully.

Before enabling production sends:

1. Run the migration and deploy the API and client together.
2. Open `/admin/messaging`, run **Test connections**, and resolve every blocking deployment-preflight result. The same credential-safe report is returned by `GET /api/v1/messaging/settings/health`; it lists missing environment-variable names but never secret values.
3. Record channel-specific consent for test leads.
4. Create templates; for WhatsApp, use the administrator-only Meta synchronization action to import the approved name, language, category, status, component structure, and parameter order.
5. Set provider enablement and conservative daily/monthly/per-campaign quotas. Configure recipient-frequency and regional quiet-hour policies for the jurisdictions and message purposes you actually operate in.
6. Leave Twilio fallback disabled until country, purpose, sender eligibility, explicit ISO-2 allowlists, and positive daily/monthly spend limits are configured.
7. Verify each webhook challenge/signature and send only to authorized test recipients.
8. Confirm delivery events in the lead communication timeline; accepted/queued is not delivery.

### Production verification runbook

Use a dedicated lead for each authorized test destination and store its channel-specific consent evidence before sending.

1. Confirm MongoDB migrations are current and Redis reports the `outbound-messaging` queue as available in the deployment preflight.
2. Email: queue one support test, then one promotional test. Verify the promotional message contains a working signed unsubscribe link and that using it creates suppression/opt-out evidence.
3. TextBee: verify the Android device is online with the intended SIM, queue one SMS, record the TextBee batch/message ID, and distinguish API acceptance from carrier delivery evidence.
4. Twilio direct: with fallback disabled, queue one direct Twilio SMS to an eligible registered test destination. Verify the signed callback advances the same recipient and provider SID.
5. Safe fallback: enable fallback only for the test country/purpose with small positive spend caps. Simulate a definitive TextBee rejection marked safe to fallback and confirm exactly one Twilio attempt. Separately simulate a timeout/ambiguous outcome and confirm no fallback is created.
6. Meta: synchronize an actually approved template, map every ordered parameter, send to an opted-in test recipient, and verify sent/delivered/read events plus an inbound reply where the test account supports them.
7. Stop/opt-out: send a supported opt-out reply through every inbound-capable SMS provider and confirm future eligibility checks block that channel.
8. Recovery: restart the worker with queued work present. Confirm pre-provider jobs are recovered, provider-bound ambiguous work becomes `unknown`, and no cross-provider resend occurs without evidence.
9. Alerting: force an enabled provider from healthy to degraded/down, confirm active Admin-role users receive a deduplicated in-app/email alert, restore it, and confirm the in-app recovery notice links to `/admin/messaging`.
10. Review the campaign CSV, lead communication history, analytics denominators, fallback cost evidence, daily/monthly quota counters, and structured logs before raising concurrency.

The automated preflight proves configuration presence, HTTPS callback consistency, provider health responses, queue availability, quotas, fallback bounds, country-policy warnings, and cost-estimate warnings. It cannot prove Meta template approval, carrier permission, sender registration, current pricing, external account balance, real handset delivery, or legal authority to contact a recipient; those require the live checks above.

### Browser acceptance tests

The client includes Playwright coverage against the real Next.js routes in desktop and mobile Chromium. Provider/API calls are mocked at the browser network boundary, while authentication bootstrap, the platform layouts, campaign/recipient evidence, the nested outreach scroll region, Templates/Analytics tabs, and the administrator provider-control page execute in a real browser.

```bash
cd client
npm run typecheck:outreach
npm run test:e2e:install
npm run test:e2e
```

The outreach typecheck is intentionally scoped to Leads, Messaging, AI Calling, and their route entrypoints so this delivery has a strict zero-error gate independent of unrelated legacy TypeScript debt elsewhere in the mixed JavaScript/TypeScript client. The runner reuses a local server at `http://localhost:3000` when present, or starts it. Set `PLAYWRIGHT_PORT` when CI reserves a different port. These tests complement, rather than replace, the authorized live-provider runbook.

For a CI/CD release gate against an already deployed API, inject a short-lived bearer token belonging to an active user with `settings:read` permission and run:

```bash
cd server
MESSAGING_PREFLIGHT_API_URL=https://api.crm.example.com \
MESSAGING_PREFLIGHT_BEARER_TOKEN="$SHORT_LIVED_TOKEN" \
npm run messaging:preflight
```

Do not pass the token as a command-line argument or commit it to an environment file. The command prints only credential-safe checks and exits `0` when ready, `1` when policy/configuration blocks deployment, and `2` when the protected health endpoint cannot be evaluated.

## API surface

- Campaigns: list, create draft, inspect, list recipients, remove individual snapshotted recipients while still a draft, start/schedule, pause/resume, cancel, retry definitively failed recipients, preview and exact-count-confirm safe bulk retries, administrator reconciliation of ambiguous submissions, and CSV export. Bulk retry excludes ambiguous and permanent provider outcomes, uses a compare-and-set operation marker, and relies on the worker's queued-status claim as the final duplicate-delivery boundary.
- Test sends: one explicitly authorized lead through the same eligibility, consent, suppression, quota, and provider pipeline as a normal campaign.
- Templates: list, create, edit, duplicate, archive, and administrator-only synchronization of approved Meta templates. Shared templates are readable and duplicable by CRM writers, while edit/archive remain owner-only; every lifecycle mutation is audit logged.
- Leads: filtered and paginated inbound/outbound communication history plus privacy-safe channel-consent profiles and audited consent updates. Manual denial/revocation adds a destination suppression. A normal grant cannot override an active suppression; only `crm:admin` can release the current destination through the explicit reinstatement endpoint with fresh evidence, capture time, and confirmation.
- Analytics: actor-scoped and date-filtered counts by status, channel, provider, delivery, WhatsApp read evidence, email bounce evidence, inbound reply, fallback, configured quota, compliance blocks, expiring/expired consent, suppression, and reliable recorded provider cost. Costs remain separated by currency, administrator-configured estimates are labeled separately from actual evidence, and the filtered evidence can be exported as CSV.
- Settings: redacted live provider/gateway health, persistent health snapshots, reconciliation backlog, unknown outcomes, recent provider errors, queue status, plus admin-only policy, quota, routing, global/regional quiet-hour, recipient-frequency, fallback, and estimated-rate updates. Secret credentials remain server-only.

The lead list provides individual/current-selection/all-filtered recipient modes, a guided composer, pre-snapshot and post-snapshot recipient removal, paginated draft inspection, personalized representative previews, separate HTML email and plain-text fallback editing, sandboxed HTML preview, explicit WhatsApp component-variable mapping, SMS segment estimates, eligibility confirmation, scheduling, drafts, and progress status. Dedicated Email and Phone columns expose validated `mailto:`/`tel:` actions, visibly flag malformed legacy contact values, and offer permission-gated inline add/edit controls when contact data is missing. The quick editor covers email, phone, and mobile, shares the full lead form's validation rules, normalizes an international `00` prefix, and saves through the existing audited `PATCH /crm/leads/:id` path; saving contact data never creates consent. The lead drawer provides the same channel actions, a provider-backed communication history, and a channel-level consent/suppression panel. Operators with `crm:write` can record evidence; suppression release is visibly separated and requires `crm:admin` plus an explicit renewed-opt-in confirmation.

The operations UI is available at `/leads/outreach` for server-paginated campaign search/filtering, paginated recipient outcomes, retry/reconciliation, exact-count bulk retry, processing progress, in-flight/queued counts, schedule state, measured throughput, estimated completion time, large-audience indicators, template, export, and date-filtered analytics workflows. Provider policy, health checks, cost estimates, and authorized test sends are available at `/admin/messaging`; server RBAC remains authoritative even if a control is hidden in the client.

## Operational limits

- TextBee acceptance is not proof of carrier delivery. Plan limits can change; SIM/carrier fees and restrictions still apply. The current documented free allowance must be checked again immediately before deployment.
- Twilio costs, sender registration, throughput, and destination eligibility vary by country and sender type. Configure policy/spend limits rather than hardcoding a universal price.
- Meta pricing, template approval, conversation rules, permission review, and Graph versions are external dependencies and can change.
- SMTP delivery/open/bounce fidelity depends on the existing email provider. This change reuses that provider and does not add a second email vendor.
- Pricing is administrator-configured and deliberately not an automatic provider price-catalog sync. It is an estimate unless the provider supplies reliable actual cost evidence; rates must be reviewed whenever Meta, Twilio, TextBee, a carrier, or a jurisdiction changes pricing.
- An ambiguous TextBee submission is never automatically sent through Twilio. The UI permits an authorized administrator to record reconciliation evidence; this is a controlled operational decision, not provider-independent exactly-once delivery.
- Verified inbound provider events and STOP-style opt-outs are stored and enforced. Inbound WhatsApp/TextBee reply text is merged into the matching lead timeline when the sender can be associated with an accessible lead; unmatched messages remain webhook evidence and require operational review.
- Consent profiles never return the lead's email address or phone number. Suppression release applies only to the lead's current normalized channel destination; old destination suppressions remain protected rather than being broadly deleted.
- Campaign pause prevents new queued recipients from being claimed. It cannot recall a submission already handed to an external provider, and an in-flight recipient is allowed to settle to its evidenced status.
- Campaign cancellation is subject to the same external-provider boundary: queued internal work is stopped where technically possible, but accepted provider messages cannot be recalled.
- Crash recovery is deliberately conservative: stale provider-bound submissions become `unknown` and require evidence-based reconciliation. Stale pre-provider work is re-enqueued, and a durable accepted/rejected attempt is restored without another send.
- Signed webhooks remain the primary delivery source. The five-minute recovery sweep also performs bounded status lookup for accepted TextBee batch IDs and Twilio message SIDs. Meta remains webhook-only because this implementation has no documented per-message polling contract. A provider lookup failure or not-found response never proves non-acceptance and never makes a message retryable.
- Provider health snapshots use the existing integration-health history collection and its 30-day TTL. After the first baseline snapshot, health transitions publish deduplicated notifications to every active Admin-role user: degraded/down transitions use in-app plus email, while recovery uses in-app. Keep external log aggregation/on-call alerting as an independent operational layer.
- CRM quota usage includes capacity reserved by in-flight or ambiguous submissions, not only completed provider responses. This conservative denominator prevents concurrent workers from overshooting configured limits.
- Recipient-frequency counts use rolling time windows and likewise retain ambiguous submissions until reconciliation proves the provider did not accept them. Historical evidence seeds the atomic ledger when a destination is first encountered or the configured horizon expands.
- Regional quiet-hour rules depend on accurate lead country data and administrator-maintained timezones. They do not replace consent, carrier, WhatsApp, or jurisdiction-specific legal review.
- Only the Meta synchronization path can create approval metadata. Synced template structure, language, name, category, and approval evidence are read-only locally; ordinary WhatsApp drafts remain unsendable.
- Live provider behavior is not verified without credentials, a TextBee Android gateway/SIM, registered Twilio senders, an approved Meta template, and authorized test recipients.
- The repository remains structurally single-tenant. A true organization model, organization-scoped credentials, and tenant keys cannot be added only inside messaging without changing the base CRM architecture; those controls remain a prerequisite before describing the product as tenant-isolated.
