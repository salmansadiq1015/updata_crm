# Call-cost calculation and chart correction

Reviewed on 30 October 2026. These changes correct the application’s estimates;
they do not establish an exact OpenAI invoice amount for the photographed calls.
OpenAI billing records and the live production worker’s runtime environment were
not accessed during this review. The caller confirmed that the recent roughly
3–5 minute calls were made locally and that live production is a different
environment. Local and production calls must be reconciled separately.

A later read-only check of the configured call database found records matching
the photographed call, including 208 seconds and 103,867 tokens. The stored SDK
usage had empty `model` and `provider` strings. The old read path substituted
the API server's current default model and applied its list rate. This is a
verified source of unsupported price attribution, not evidence that OpenAI
charged that model's rate. No customer transcripts were read and no database
values were changed by that check.

## What the screenshots establish

The OpenAI screenshot reports $0.02 and 4,448 tokens with the Default project,
All API keys, and Last 7 days selected. The visible capability card is Responses
and Chat Completions. The CRM screenshot reports an estimated $0.9659, about
181,000 Realtime audio/text tokens, six campaign call attempts and three connected
calls with 30 days selected. One additional test call is excluded from the CRM
campaign totals.

The caller confirmed that the worker belongs to the same OpenAI project shown
in the screenshot; a different project is not the established explanation. A
safe comparison of local environment files found different API-server and
voice-worker keys, with `gpt-realtime` configured for the worker. Different keys
can belong to the same project; no key values were printed or changed. These
files do not prove the configuration of an already running worker.

The screenshots show different usage counts and application scopes. A 30-day
versus 7-day selection alone does not explain the difference: the photographed
calls on 28–29 October fall within both windows. The available evidence does not
establish why the OpenAI total is $0.02 or whether that view includes the matching
Realtime requests. Replacing the CRM estimate with $0.02 without matching billing
evidence would fabricate a result.

Realtime input includes the conversation context again on subsequent responses.
Its token count is not the count of unique words spoken in a call. Cached input
is a subset of total input, charged at the cached rate; it must not be counted
twice or removed from the bill entirely. Input transcription is billed separately.
Sources: [OpenAI Realtime cost accounting](https://developers.openai.com/api/docs/guides/voice-latency-cost?voice-api=realtime)
and [gpt-realtime rates](https://developers.openai.com/api/docs/models/gpt-realtime).

For the `gpt-realtime` rate card verified during this review, USD estimates use:

```text
model estimate = (
  uncached audio input × 32 + cached audio input × 0.40
  + audio output × 64
  + uncached text input × 4 + cached text input × 0.40
  + text output × 16
) / 1,000,000
```

The screenshot’s rounded token totals are consistent with approximately $0.97
at those rates. That is a consistency check on the estimate, not proof of the
amount OpenAI charged. Contract rates, account-level adjustments and the exact
selected billing population require provider billing records.

## Bugs corrected

- The trend SVG had a height but no bounded width. Its aspect ratio made it
  wider than its card. It now fills a bounded, clipped plot with explicit width
  and height. Mobile/tablet/desktop layout, keyboard/tap interaction, unique
  gradient IDs, single-day data and RTL placement are covered by tests.
- A report containing multiple models was priced at the first model’s rates.
  Each model is now priced separately and its breakdown retained.
- Prefix matching could price a new or custom model at an unrelated known
  model’s rate. Only exact models and their dated snapshots inherit that card.
- Partial rate overrides reset unspecified rates to zero. Unspecified rates now
  retain their prior values; explicit zero remains supported.
- Ambiguous cached modality splits and invalid/inconsistent token counts are
  marked unpriced. The calculator preserves usage instead of guessing an amount.
- Other providers do not silently inherit OpenAI prices just because their
  model string matches. Unsupported image pricing is marked incomplete.
- Foreign-currency amounts are no longer added to USD totals. Their original
  values remain available in individual call details and CSV.
- Date shortcuts now use complete UTC days, with an exclusive end boundary.
  Seven days is the initial range. The date scope is displayed next to costs.
- Connected-call averages use connected-call costs, and the qualified-lead
  denominator counts distinct leads rather than repeated qualified calls.
- The worker reads its final cumulative SDK usage snapshot once at call end.
  Cumulative snapshots must never be added together as separate turns.
- When SDK model/provider fields are blank, the worker now stamps the actual
  configuration used to create that call's OpenAI session, with its provenance.
  Existing explicit provider metrics are retained. The API no longer substitutes
  its own current model for missing historical identity. Such calls and totals
  display “Not recorded”; their apparent zero is never described as free usage.
- Unpriced connected calls display “Not recorded,” and partially priced calls
  display “partial.” Reported totals without a modality breakdown are not
  relabeled as audio-token charges.

## What the UI now means

“Estimated call total” is this agent’s recorded campaign-call estimate in the
selected UTC period. The billing comparison shows Realtime model cost separately
from configured carrier/platform estimates. It explicitly states that it is not
reconciled with OpenAI billing. Input transcription, post-call analysis and other
agents/API requests are excluded from the Realtime model estimate. Test calls
remain separately totaled. Missing pricing and excluded currencies are disclosed.

OpenAI billing/export is authoritative for actual billed spend. To reconcile,
select the same organization, project, API key and UTC range in OpenAI, include
Realtime usage, and compare like-for-like model usage. Do not compare this
agent’s estimate with only the Responses/Chat Completions capability card.
The OpenAI organization Costs API supports billing buckets and scope filters;
an ordinary inference key does not establish access to that organization’s billing
data. The application does not claim invoice verification without those records.
See [Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs).

## Existing calls and deployment

Deploy API, web client and voice worker together. No new secret or environment
variable is required. Preserve existing `AI_CALLING_MODEL_PRICING` if you have
contracted rates; inspect it for incorrect units (all model rates are USD per
million tokens). Carrier/platform rates remain per billed minute. New estimates
are stamped `pricingVersion: 2` and preserve raw usage and per-model rates.

Agent analytics re-evaluates legacy token estimates from their retained raw usage
when reading them. Complete historic rate cards are preserved; provider-reported
amounts are not overwritten. No retrospective estimate is fabricated if usage is
missing. For persisted campaign summaries and other reports, use this explicit
repair utility after a database backup:
Pause campaigns and finish in-flight calls before applying it. Do not resume
budget-limited campaigns with unpriced history until billing is reconciled;
unknown historical spend cannot be treated as unused budget.

```bash
cd /var/www/updata/server
# Preview only: no database writes.
node scripts/reprice-call-estimates.mjs
# Optionally scope the preview/application to a single known campaign:
node scripts/reprice-call-estimates.mjs --campaign=YOUR_CAMPAIGN_OBJECT_ID
# Apply the reviewed estimate repairs and refresh affected campaign USD totals.
node scripts/reprice-call-estimates.mjs --apply
```

The utility uses the server’s effective database environment, preserves raw usage,
skips provider amounts, and uses compare-and-set updates to avoid overwriting a
concurrent correction. Running it again leaves current priced estimates alone.
Unpriced records can be reconsidered when a valid rate card becomes available.
It does not contact customers, resend messages or make calls. It was not applied
to either database during this work. Use the environment containing the local
calls when reviewing those calls; do not apply a local-call repair to live
production merely because its configuration differs.

## Validation

The focused backend regression run passed 113 tests, the calling UI passed 158,
and the voice worker passed 73. Ten browser cases covered chart bounds at
390/768/1440 pixels, RTL, interaction and missing historical pricing. The
production client build, typecheck and targeted lint checks passed. These checks establish
application behavior, not agreement with an unavailable provider invoice.
