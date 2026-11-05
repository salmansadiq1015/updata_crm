# Email workspace

The `/email` workspace uses the existing Next.js shell, bearer authentication,
MongoDB, BullMQ registry, CRM contact history, notifications, audit service and
configured AI model factory. No new runtime packages are required.

## Setup

1. Set `EMAIL_CREDENTIAL_SECRET` to a unique 64-character hex key on every API/job
   instance (`openssl rand -hex 32`). Back it up securely: losing it makes stored
   credentials unrecoverable. Do not use the JWT signing secret.
2. Configure Google and/or Microsoft OAuth apps using the `EMAIL_*` variables in
   `server/.env.example`. Register the exact callback URLs shown there, using
   your HTTPS API origin in production. `CLIENT_URL` must name the trusted CRM
   frontend origin. Both Google Workspace and Gmail use the Google provider;
   Outlook and Microsoft 365 use Microsoft.
3. Enable Gmail API and request `gmail.modify`. Production distribution needs
   Google's restricted-scope verification and any applicable security assessment.
   Microsoft uses delegated `User.Read`, `Mail.ReadWrite`, `Mail.Send` and
   `offline_access`; organizational tenant policies may require admin consent.
4. For custom email, allow exact public hostnames in
   `EMAIL_ALLOWED_MAIL_HOSTS`. IMAP uses TLS/993; SMTP uses TLS/465 or
   STARTTLS/587. App passwords may be required by the mail provider. Private IP
   endpoints are deliberately rejected and DNS is pinned to the validated IP.
5. Run `npm --prefix server run migrate` against the intended database to apply
   migration 049 and create indexes/permissions. Migration execution is a deployment
   action; it has not been run against your development or production CRM database.
6. Assign the new `email:read`, `email:write`, `email:send`, `email:manage` and
   `email:ai` permissions to the intended roles. Existing Admin bypass applies;
   existing non-admin roles do not silently acquire access to mailbox contents.
7. Start the existing API and its BullMQ job registry with Redis available. The
   mailbox sweep runs every minute. Visit Email → Connect account.

Optional push:

- Google: create a Pub/Sub topic, grant Gmail publish access, configure an
  authenticated push subscription to `/api/v1/email/webhooks/google`, and set
  `EMAIL_GOOGLE_PUBSUB_TOPIC`, `EMAIL_GOOGLE_PUSH_AUDIENCE` and
  `EMAIL_GOOGLE_PUSH_SERVICE_ACCOUNT`. JWT signature, issuer, audience and verified
  service-account identity are checked. Gmail watches renew daily.
- Microsoft: set `EMAIL_WEBHOOK_BASE_URL` to your public HTTPS API origin. The
  module creates 48-hour message subscriptions, renews them daily, handles
  validation challenges and verifies a random clientState for every notification.
- Webhooks only accelerate sync. Polling recovers lost notifications.

## Architecture and contracts

- `server/src/modules/email`: models, Zod request validation, OAuth/PKCE, provider
  adapters, authenticated APIs, webhook verification, mailbox service and constrained
  calling-agent tools. `server/src/jobs/mailbox.job.js` registers background work.
- Collections: EmailAccount, EmailMessage, EmailAttachment, EmailOAuth. OAuth state
  is single-use with a 10-minute TTL. AES-256-GCM encrypts tokens/passwords with
  authenticated owner context; credential fields are excluded from normal queries.
- The existing CRM uses a single-tenant database rather than a tenant-ID middleware.
  Every mailbox API is additionally owner-scoped, including Admin users; possession
  of an account, message or attachment ID never grants access. This does not introduce
  multi-tenant infrastructure into unrelated CRM modules.
- Google backfill is paginated, then switches to Gmail history checkpoints.
  Expired history restarts backfill. Microsoft sync cycles standard folders using
  delta links and immutable message IDs. IMAP uses folder/UIDVALIDITY/UID checkpoints
  and refreshes flags on the latest 100 messages per visited folder.
- Checkpoints advance only after a successful page. Provider errors use retries,
  bounded backoff and Retry-After. A per-account lease prevents concurrent sync;
  credential refresh has a separate lease. Unique indexes deduplicate provider
  messages, incoming attachments and draft creation requests.
- Drafts, schedules and approval state live in MongoDB. BullMQ is an accelerator;
  the sweep recovers due queued sends if enqueuing failed. Compare-and-set transitions
  prevent concurrent send workers from submitting twice. A timeout after submission
  becomes `unknown`, never an automatic resend. Sent-folder sync reconciles matching
  RFC Message-IDs; stale `sending` rows become `unknown` after ten minutes.
- Account disconnect removes stored credentials and agent grants and returns queued
  messages to drafts; it preserves history. Revoke the app in the provider security
  console too if provider-wide authorization must be removed. A send already accepted
  by a provider cannot be recalled by disconnecting.
- Local drafts are local CRM drafts. Synced provider drafts can be viewed; editing
  and saving a new CRM draft does not modify the native provider draft. Standard
  folders and labels are supported, but arbitrary IMAP label/importance semantics
  are not synthesized. The UI reports unsupported provider operations.
- Custom IMAP incrementally imports message bodies up to 12 MB, up to 25 messages
  per pass; attachments are limited to 10 and 8 MB combined per CRM message. Larger
  attachments must be accessed in the provider. Historical IMAP flag refresh is
  bounded and complete mailbox expunge/UIDVALIDITY reconciliation is not implemented.
  These are operational limits to address before promising full mailbox fidelity.

## CRM, agents and automation

Owners explicitly link a thread to an owned lead or customer before email content
is copied into the existing contact log/unified history. New replies inherit that
link; audit events record access, connection, drafts, approvals and sends. Email
notifications use the existing IN_APP channel and link back to the message.

Each account grants individual calling agents read/draft/send rights, human
approval requirements, instructions and response templates. The outbound calling
worker now exposes `email_customer_context` and `draft_email_follow_up`. Their
server endpoints resolve the owner, agent and current lead from the active call
token; the model cannot supply another lead or arbitrary recipients. Reading is
limited to explicitly linked conversations and granted accounts. Incoming-call
receptionist tools retain their existing behavior.

AI assistance uses the existing configured model factory. Insights return
validated summaries, categories, priority, customer intent, opportunities, contact
details, suggested follow-ups and replies. Automatic analysis is opt-in per
account and requires `email:ai`; it never changes lead facts or sends mail.
Writing assistance remains a draft for the user to review.

Optional account follow-up rules create one template-based message after an
original email to a linked lead receives no reply. They apply to emails sent
after enabling the rule, stop on a later reply/message, require an assigned agent
with draft access, and preserve the same human approval gate. Supported template
variables are `{{name}}` and `{{subject}}`. Contact suppression/consent blockers are
checked before sending. This is a no-reply follow-up rule, not a new bulk campaign
builder; existing CRM calling campaigns can use the constrained email tools.

## Verification

- Server: `npm --prefix server test -- --watchman=false --runInBand
  tests/unit/email.workspace.test.js tests/unit/email.providers.test.js
  tests/unit/email.routes.test.js tests/unit/permissionImplications.mirror.test.js`
- Browser: `npm --prefix client run test:e2e -- email-workspace.spec.ts`
- Client: `npm --prefix client run build`; lint the new module using the existing
  client/server lint commands.

The tests exercise real temporary MongoDB persistence, isolation, approvals,
concurrent send claims, ambiguous-delivery recovery, provider pagination/transport
contracts, MIME/BCC/attachments, follow-ups, HTTP permissions and call-scoped email
access. Browser tests use intercepted API fixtures. No live provider account was
connected or email sent during implementation. Production readiness still requires
provider-app configuration, live account acceptance tests, and deployment checks.

Provider references used for implementation:
[Gmail message API](https://developers.google.com/workspace/gmail/api/reference/rest),
[Gmail sending](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send),
[Microsoft message delta](https://learn.microsoft.com/en-us/graph/api/message-delta),
[Microsoft immutable IDs](https://learn.microsoft.com/en-us/graph/outlook-immutable-id).
