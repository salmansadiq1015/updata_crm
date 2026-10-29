# Production deployment: CRM, calling, transcription and SMS operations

Release instructions prepared on 29 October 2026. This covers the complete pending
release: lead workflow/quality, calling intelligence/quality, SMS operations,
governance, mobile heartbeat, gateway 0.4.3 and caller-transcription improvements.
Pushing Git does not deploy production. The repository's production GitHub Action
is manual (`workflow_dispatch`).

Examples use `/var/www/updata` and `https://updata.behjja.com`; substitute your
actual checkout and public HTTPS origin. Keep existing production secrets and
provider configuration. Example placeholders below are not usable credentials.

## 1. Processes and prerequisites

| Component | Location / process | Requirement |
| --- | --- | --- |
| API and background queues | `server`, PM2 `updata-api` | Node.js 22, MongoDB, Redis, production API environment |
| Web client | `client`, PM2 `updata-client` | Node.js 22; build after setting public variables |
| Live voice worker | `server/agent-worker`, PM2 `updata-voice-agent` | Same LiveKit project/name as API; an actual OpenAI key |
| Paired-phone gateway | Computer physically connected to each ESP32 | Gateway 0.4.3, own phone profile and USB port; this runs outside the web server |
| Android SMS agent | User's Android device | Updated signed APK, permissions, selected SIM, connectivity |

API startup registers the BullMQ workers and scheduled jobs. There is no new
standalone queue-worker service to start. Redis is required for scheduled calls,
post-call extraction, benchmarks, scoring, follow-up/SLA and recovery sweeps.
Check startup logs: the API can otherwise start after logging that job
registration failed. Keep existing MongoDB/Redis versions supported by your
installation; tests use MongoDB 6.0.16.

Install MongoDB Database Tools (`mongodump`/`mongorestore`) on the server before
deployment. Do not rely on a deployment that reports a missing backup tool.

## 2. API: `server/.env`

Edit the existing file. Do not replace it with `.env.example`, which contains
development URLs and placeholder secrets. These are the core production values:

```dotenv
NODE_ENV=production
PORT=9097
HOST=127.0.0.1
AUTO_MIGRATE=false
MONGODB_URI=mongodb://YOUR_DATABASE_HOST:27017/YOUR_PRODUCTION_DATABASE
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=KEEP_EXISTING_PRODUCTION_VALUE
SESSION_SECRET=KEEP_EXISTING_PRODUCTION_VALUE
CLIENT_URI=https://updata.behjja.com
PUBLIC_API_BASE_URL=https://updata.behjja.com
ALLOWED_ORIGINS=https://updata.behjja.com

# Actual OpenAI credentials for voice-related readiness and extraction.
# Preserve your existing OPENAI_MODEL / OPENAI_BASE_URL for text AI.
OPENAI_API_KEY=YOUR_SERVER_AI_KEY
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy

LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
LIVEKIT_AGENT_NAME=crm-voice-agent
LIVEKIT_TIMEOUT_MS=15000

AI_VOICE_CALLING_ENABLED=true
AI_CALLING_REQUIRE_CONSENT=true
AI_CALLING_WORKER_CONCURRENCY=5
AI_CALLING_QUALITY_LATENCY_MS=2000

# Keep existing effective values; see the secret-continuity instructions below.
AI_CALLING_AGENT_SECRET=KEEP_EXISTING_EFFECTIVE_VALUE
AI_CALLING_PHONE_HASH_SECRET=KEEP_EXISTING_EFFECTIVE_VALUE
PAIRED_PHONE_KEY_SECRET=KEEP_EXISTING_EFFECTIVE_VALUE
MESSAGE_DESTINATION_HASH_SECRET=KEEP_EXISTING_EFFECTIVE_VALUE

# Defaults preserve current lead visibility and masking behavior.
LEAD_ACCESS_MODE=company
LEAD_ACCESS_REASON_REQUIRED=true
LEAD_ACCESS_GRANT_MINUTES=30
PII_MASKING_ENABLED=false
MULTI_TENANT_MODE=false

# Optional cost estimates. Use your contracted rates, or leave blank.
AI_CALLING_COST_PER_MINUTE=
AI_CALLING_COST_CURRENCY=USD
AI_CALLING_TELEPHONY_COST_PER_MINUTE=
AI_CALLING_PLATFORM_COST_PER_MINUTE=
AI_CALLING_MODEL_PRICING=
SIM_SMS_COST_PER_MESSAGE=
SIM_SMS_COST_CURRENCY=CHF

# Also set the matching values in the separate voice worker environment.
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-transcribe
OPENAI_REALTIME_TRANSCRIBE_LANGUAGE=
OPENAI_REALTIME_TRANSCRIBE_LANGUAGES=
OPENAI_REALTIME_TURN_DETECTION=server
OPENAI_REALTIME_SILENCE_MS=1000
```

`HOST=127.0.0.1` assumes an Nginx proxy on the same host. Retain the appropriate
bind address for a container or separate proxy. `PUBLIC_API_BASE_URL` is the
public **origin**, without `/api/v1`; the code appends the tool routes itself.
List other approved web/iframe/extension origins in `ALLOWED_ORIGINS` if used.
Retain your existing SMTP, object storage, maps, messaging-provider, unsubscribe
and SMS-link settings from `server/.env.example`; this release does not replace
those integrations. Keep provider credentials server-side.

**Secret continuity on an existing database:**

- Never generate replacement values just because the variables are shown above.
- `AI_CALLING_PHONE_HASH_SECRET` and `MESSAGE_DESTINATION_HASH_SECRET` fall back
  to `JWT_SECRET`. If previously blank, either preserve that fallback or set each
  to the **existing JWT secret**. A different value disconnects stored suppression
  and consent lookups from their original hashes.
- `PAIRED_PHONE_KEY_SECRET` also falls back to `JWT_SECRET`. Preserve the
  effective value or existing encrypted ESP32 dial keys become unreadable.
- `AI_CALLING_AGENT_SECRET` falls back to `JWT_SECRET`; changing it invalidates
  active call tokens. Keep it stable during the release.
- Preserve `MESSAGE_UNSUBSCRIBE_SECRET` and SMS-link token secrets so existing
  public links remain valid. Create separate random secrets only for genuinely
  new integrations; plan a migration before rotating existing ones.
- `server/.env.local`, if present, overrides `.env` when the API loads. Inspect it
  on the production host for stale URLs or settings. Do not print it into logs.

`LEAD_ACCESS_MODE=team` and `PII_MASKING_ENABLED=true` are optional behavior
changes. Configure teams, assignments, permissions and user acceptance before
enabling them. `MULTI_TENANT_MODE=true` deliberately refuses API startup because
tenant isolation is not implemented. See [governance](docs/PLATFORM-GOVERNANCE.md).

### Optional carrier configuration

Browser tests and ESP32/SIM paired-phone calls do not require a SIP trunk.
For cloud PSTN calls, configure either an existing outbound LiveKit trunk:

```dotenv
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=YOUR_OUTBOUND_TRUNK_ID
LIVEKIT_SIP_CALLER_ID=YOUR_E164_CALLER_ID
```

Or leave that trunk ID empty and retain your carrier's `SIP_OUTBOUND_ADDRESS`,
`SIP_OUTBOUND_NUMBER`, `SIP_OUTBOUND_USERNAME`, `SIP_OUTBOUND_PASSWORD` and
`SIP_OUTBOUND_TRANSPORT`. Do not enable the optional Twilio fallback without
configuring its separate outbound trunk.

## 3. Voice worker: `server/agent-worker/.env`

The worker is a separate process. Editing only `server/.env` does not configure
a worker launched with its working directory at `server/agent-worker`.

```dotenv
NODE_ENV=production
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
LIVEKIT_AGENT_NAME=crm-voice-agent
OPENAI_API_KEY=YOUR_ACTUAL_OPENAI_API_KEY
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-transcribe
OPENAI_REALTIME_TRANSCRIBE_LANGUAGE=
OPENAI_REALTIME_TRANSCRIBE_LANGUAGES=
OPENAI_REALTIME_TURN_DETECTION=server
OPENAI_REALTIME_SILENCE_MS=1000
AGENT_RING_TIMEOUT_MS=60000
AGENT_HEALTH_PORT=8081
AGENT_IDLE_PROCESSES=2
```

Use the same LiveKit project credentials and agent name as the API. Set a free
health port if 8081 is occupied. Idle-process count is capacity tuning; reduce
it if the host has limited memory. The worker receives the API URL and a
call-scoped token from dispatch metadata; it does not need the API's JWT secret.
An OpenAI-compatible text-provider key cannot replace an actual OpenAI key here.

For all-language support, leave both transcription-language overrides blank and
use Automatic in the agent's language setting when callers can speak any
language. A specific agent language supplies recognition hints. Optional hints
such as `OPENAI_REALTIME_TRANSCRIBE_LANGUAGES=ur,en` are for a known audience;
do not apply that restriction globally if you expect other languages.

The change uses `gpt-transcribe`, independent of the speaking model. It passes
question wording/types as recognition context, preserves the spoken language,
and allows 1000 ms silence between words/letters. Existing explicit model or
silence overrides must be updated too. PM2/ecosystem/system environment values
can override the worker's `.env`; update those sources if configured.

`STT_PROVIDER` configures a different application voice path and does not select
the caller transcription model for this LiveKit worker.

## 4. Web client: `client/.env.local`

For a same-origin HTTPS site behind Nginx:

```dotenv
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_SOCKET_URL=https://updata.behjja.com
API_PROXY_TARGET=http://127.0.0.1:9097
```

Retain public maps/extension settings if used. Never place OpenAI, LiveKit
secrets, database URLs or JWT secrets in `NEXT_PUBLIC_*` variables. These values
are compiled into the web build; rebuild after changes. Preserve the existing
client listen port: the sample Nginx uses 3000, while some existing deployments
use 8005. Nginx and the PM2 client's `--port` must agree.

Nginx must route `/api/` and `/socket.io/` to the API and the rest to the client.
Keep WebSocket Upgrade/Connection headers on `/socket.io/`; without them live
conversation updates can disconnect even though the call continues. Preserve
existing streaming/timeout settings for other AI routes. The sample is
[`deploy/nginx-ssl.conf.example`](deploy/nginx-ssl.conf.example).

Configure the LiveKit webhook as
`https://updata.behjja.com/api/v1/webhooks/ai-calling/livekit`, signed with the
same project key/secret. Allow the voice worker outbound HTTPS/WebSocket access
to OpenAI, LiveKit and your public API. LiveKit media connectivity must also be
available from the browser, worker and gateway network.

## 5. Deploy an existing installation

1. Pause voice/SMS campaigns and finish active calls or message submissions.
   Stop gateway processes while updating their computers. Record the currently
   deployed commit with `git rev-parse HEAD`. Save copies of production `.env`
   files securely outside Git; do not overwrite them during checkout updates.
2. Take a verified MongoDB backup or provider snapshot **before migrations**.
   For `mongodump`, use the actual production URI securely; do not paste secrets
   into chat, Git or deployment logs. Confirm the backup completed successfully.
3. Update the API, worker and client environment files as above.
4. Fetch and build using the commands below. Use the account that owns the
   checkout and PM2 services. Do not run both this procedure and the automated
   deploy workflow at once.

```bash
cd /var/www/updata
git status --short
git pull --ff-only origin main

# Stop after draining active work; use your actual existing process names.
pm2 stop updata-voice-agent
pm2 stop updata-api

cd /var/www/updata/server
npm ci --omit=dev
node src/migrations/runner.js status
node src/migrations/runner.js
node src/migrations/runner.js status
npm run build:phone-gateway

cd /var/www/updata/server/agent-worker
npm ci --omit=dev
# First installation, or if required model files are not already installed:
npm run download-files

cd /var/www/updata/client
# Build needs dev dependencies even if NODE_ENV=production is exported.
npm ci --include=dev
npm run build

# API first, then the worker that calls its new routes, then the web client.
pm2 restart updata-api --update-env
pm2 restart updata-voice-agent --update-env
pm2 restart updata-client --update-env
pm2 save
```

On a first voice-worker installation, replace its missing stop/restart commands
with registration after `npm ci` and environment setup:

```bash
pm2 start npm --name updata-voice-agent --cwd /var/www/updata/server/agent-worker -- start
pm2 save
```

The tracked `deploy/deploy.sh` runs dependency installation, gateway packaging,
migrations, web build and PM2 restarts, then checks `/health/ready`. It updates
the voice worker only when that PM2 process already exists. Create the worker
once before relying on this script. If deploying through GitHub, use Actions →
**Mise en production** → Run workflow on `main`, after the environment and backup
preparation. It requires the configured repository secrets `DEPLOY_SSH_KEY`,
`DEPLOY_KNOWN_HOSTS` and variables `DEPLOY_HOST`, `DEPLOY_USER`. Its current web
check targets port 8005; adapt that workflow if your host uses another port.

### Migrations and initial data

The runner applies every outstanding migration, including:

| Migration | Effect |
| --- | --- |
| 032 | Follow-up/timeline/SLA indexes; backfills recorded follow-ups as open; existing leads get no retroactive SLA |
| 033 | Lead-scoring/duplicate/merge indexes; old leads initially marked unscored |
| 034 | Calling intelligence, approved knowledge and human-transfer indexes |
| 035 | Benchmarks, script experiments and call-quality indexes |
| 036 | SMS-device/review/recovery and contact-policy indexes; default contact limits start disabled |
| 037 | Team, governance audit and lead-ownership indexes |

Do not reset the database or run a destructive seed. API startup upserts new
permissions and updates built-in roles, including Admin; verify successful seed
logs and permissions after restart. `npm run seed` is a separate reseed helper,
not required for this upgrade. Scoring fills in through the 15-minute sweep;
duplicate detection has a nightly scan and UI scan controls. Historical quality
telemetry and transcripts are not recreated by these migrations.

## 6. Gateway and Android updates

The server packaging command creates
`server/phone-gateway/dist/updata-phone-gateway.tgz`. Keep this artifact on the
production API host so the CRM download button serves the new gateway.
On every computer that operates a paired phone:

1. Stop the old gateway/service after its call finishes. Download and extract
   gateway **0.4.3** into a permanent folder.
2. Run `npm ci --omit=dev` there and retain the phone profile under
   `~/.updata/profiles/<phone-id>/`; never copy those credentials into Git.
3. Use the existing phone card's start command, including `--profile PHONE_ID`.
   Multiple bridges require a separate profile, process and USB port per phone.
4. On macOS, reinstall the profile's service from the new permanent folder if
   its path changed: `node bin/updata-gateway.mjs service install --profile PHONE_ID`.
   Linux/Windows use the documented foreground command.
5. Confirm USB control authentication, Bluetooth/SCO audio, phone readiness and
   the audio test in CRM. Gateway 0.4.3 waits for the updated voice worker's
   readiness signal before dialing; update both components together.

Firmware source includes the **0.1.3** watchdog fix. Updating the Node gateway
does not flash firmware. If a bridge still runs older firmware, use the separate
hardware procedure and validated image/layout with backup; see
[`server/phone-gateway/README.md`](server/phone-gateway/README.md). Do not flash
or provision keys during an active call.

Android changes require rebuilding and distributing a signed app to receive
the SMS-device heartbeat/operations updates. Keep the existing build/distribution
profile; private automated reply handling and shared/Play builds have different
permissions. Public mobile settings are:

```dotenv
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_API_URL=https://updata.behjja.com/api/v1
EXPO_PUBLIC_ENABLE_DEBUG_LOGS=false
```

Set these in the selected EAS production environment or your existing build
pipeline. Examples of existing profiles are `production` (AAB),
`production-apk` (shared APK), and `production-private` (private APK).
This Git push does not build, sign, publish or install an APK. Verify the updated
app on the actual device, including SIM selection, SMS permissions, heartbeat
and battery/background behavior before resuming campaigns.
An optional server setting, `SIM_SMS_MIN_APP_VERSION`, can flag older app
versions in device diagnostics. Leave it unset until you have distributed and
verified the intended version; use your actual release version if enabling it.

## 7. Verify before resuming campaigns

```bash
curl -fsS http://127.0.0.1:9097/health/ready
pm2 list
pm2 logs updata-api --lines 100 --nostream
pm2 logs updata-voice-agent --lines 100 --nostream
```

Confirm migrations 032–037 are applied, database/Redis connectivity is healthy,
jobs register successfully, the web build loads, and the worker registers under
the exact configured agent name. Verify API HTTPS, login and live Socket.IO
updates through the public domain. If Nginx changed, validate `sudo nginx -t`
before `sudo systemctl reload nginx`.

Run the browser Live test with an authorized test lead before an actual phone
test. Check names, spelled emails, complete phone digits, historical birth
dates, pauses, interruptions, corrections and language switches. Unclear answers
must prompt for missing information and must not be reported as saved. Explicit
skips remain unanswered; exhausted retries stay visible for review. Then test one
authorized real phone and one Android SMS-device heartbeat before enabling
broader campaigns. Configure approved knowledge, transfer availability, consent,
quiet hours and spend/contact limits in CRM for the features you use.

The latest transcription work passed 221 targeted backend tests, 70 voice-worker
tests and one live OpenAI synthetic-English-audio check. This is not measured
accuracy for every language, microphone or telephone route. Existing incorrect
transcripts need original audio for correction; deploying does not rewrite them.

## 8. Rollback

Pause campaigns, finish or explicitly reconcile in-flight operations, and stop
the voice worker before rolling back the API. Redeploy the recorded previous
commit using your normal release checkout, reinstall dependencies/rebuild the
client, then restart API → compatible voice worker → client. Keep environments
and the previous gateway package available. The added collections/indexes can
usually remain during an application rollback; review migration-specific
`down()` behavior before using it. A migration rollback is not a database
restore and does not reverse user actions or external calls/SMS. Restore the
verified backup only as a separate, deliberate recovery operation.

## Release verification performed locally

| Check | Result |
| --- | --- |
| Full backend Jest suite | 252 suites passed; 2,259 tests passed; one opt-in test skipped |
| Full web Vitest suite | 158 files passed; 866 tests passed |
| Full mobile Jest suite | 60 suites passed; 468 tests passed |
| Voice-worker tests | 70 passed |
| Gateway Node tests | 97 passed |
| ESP32 firmware host checks | 70 checks passed |
| Web and mobile TypeScript | Passed |
| Backend, web and mobile lint | Passed; backend/web have warnings, no errors |
| Web production build | Passed; 123 pages generated |
| Gateway release packaging | Passed; version 0.4.3; archive checked for credential files |
| Live transcription smoke check | Passed with synthetic English speech; no customer recording uploaded |

No production deployment, APK signing/distribution, physical-device acceptance,
live carrier call or all-language accuracy benchmark was performed by these
checks. Retain the post-deployment acceptance steps above.
