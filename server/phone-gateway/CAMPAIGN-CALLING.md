# Start and monitor campaign calls

AI Calling shows **Start calling** beside each draft, scheduled or paused campaign
and in the campaign drawer. The drawer keeps this button and calling status above
all tabs, including Simulate. Start resumes the remaining eligible recipients;
it does not call completed leads again. **Pause calling** stops new calls while
the current call finishes. Cancel stops the campaign; retry is an explicit action
for failed/exhausted recipients, never for an uncertain call outcome.

Start calling requests sequential dispatch (`sequential: true`). An ESP32 phone
always has one call slot; cloud campaigns started with this control also use one
slot. Recipients proceed through the existing durable tick, lease, provider and
result pipeline. The next lead waits until the current attempt has finished
processing. Phone cooldowns and account/campaign call limits still apply.

**Start calling** sends `startNow: true`, clears a saved future start date, and
uses `runMode: immediate` for this run. It does not wait for either the campaign's
calling window or a recipient's local quiet hours. **Start on schedule** sends
`startNow: false`, uses `runMode: scheduled`, and retains both time-window gates.
The saved schedule itself is never overwritten. An already running scheduled
campaign has **Start calling now**, which switches its pending queue immediately
without first pausing or calling completed leads again. Old queued time deferrals
are cleared; retry backoff on `retry_scheduled` recipients remains intact.

The calling-status panel distinguishes these modes and keeps phone/service
blockers visible. A TEST badge
means lead records remain unchanged; Start calling still places real phone calls.
Simulate and Live test use the browser.

The owner-scoped `GET /ai-calling/campaigns/:id/run-status` is read-only. The Start
endpoint checks for an available queue/worker before changing campaign state.
If enqueuing fails, it invalidates the unconfirmed tick and restores the prior
state unless a concurrent pause/cancel or a confirmed worker claim superseded it.
A lost Redis acknowledgement after a worker has claimed the tick does not reset
or duplicate that run. List and detail caches update together after transitions,
with socket invalidation and polling as fallbacks.

## Runtime

Production uses the existing normal server bootstrap, which registers
`outbound-calling` and the reconciliation watchdog. It requires configured MongoDB,
Redis, the matching voice-agent worker, and (for SIM calls) the authenticated
laptop gateway with a ready, verified phone. Consent, suppression, ownership,
device signing, retry backoff, call limits and the global calling stop switch
remain enforced in both modes. Calling-hour gates apply to scheduled mode.

For the local hardware setup environment only:

```sh
LIVEKIT_AGENT_NAME=crm-voice-agent-esp32-0d62 node scripts/paired-phone-setup-api.mjs --campaign-calls
```

This enables only the calling worker, without unrelated jobs, seeds, migrations
or scans of old campaigns. It accepts jobs queued after this local process starts;
old debugging jobs are skipped. After restarting this local helper, explicitly
start/resume the intended campaign in the CRM. Do not use this helper in production
in place of the normal server and its durable recovery/scheduled jobs.

For a controlled restart of the same authorized local session, an operator can
preserve its original cutoff with `UPDATA_CAMPAIGN_STARTED_AFTER=<past ISO date>`.
This retains already requested delayed jobs from that session without enabling
older debugging runs. It is a local process setting, never accepted from CRM
requests. Routine production restarts use the normal worker's durable recovery.

Deployment needs the updated client and API together. These are additive route/
request changes; no database migration, new npm dependency, firmware flash or
ESP32 protocol change is required.

## Validation

Backend tests use an isolated MongoDB and mocked providers to exercise sequential
dispatch, worker outages, queue acknowledgement loss, start/pause/cancel races,
future schedules, quiet hours and ownership. UI/browser tests use mocked CRM data.
The real local BullMQ worker also completed a non-dial connectivity job with one
worker connected. No lead was called by these verification checks.

Validation on 27 October 2026: 224 backend tests (18 suites), 74 calling UI tests
(13 files), and eight Playwright runs across desktop/mobile configurations passed.
Typecheck and changed-client-file lint passed. An initial browser locator matched
the campaign name together with its badges; the name is now an explicit accessible
button, and the browser checks passed using that control.

The owner's real Testing campaign was explicitly started through the CRM while
these changes were running. It has two eligible leads pending, no active call and
an online calling worker. Its Asia/Karachi window is 09:00–23:00 on weekdays;
the next window opens 28 October 2026 at 09:00. A controlled local API restart
preserved this session's previously requested delayed ticks. Phone USB/HFP were
confirmed connected. Recipient quiet hours and other per-lead gates still apply.

That scheduled-run snapshot preceded the owner's 28 October clarification that
Start must call immediately. The current controls now distinguish immediate and
scheduled starts as described above. Existing scheduled runs keep their mode
until the owner chooses Start calling now; no bulk conversion or unrequested
lead dial is performed when the application reloads.

Immediate-mode verification: 228 backend tests, 76 calling UI tests and 12
desktop/mobile browser runs passed, plus typecheck and changed-client lint.
The new cases cover both time windows closed, switching an already waiting run
to immediate mode, clearing queued time deferrals, retained consent checks,
scheduled-mode behavior, stale hour warnings and conflicting start options.
Providers and browser CRM data are mocked in these automated tests; verification
did not request a live lead dial.
