# AI Interaction Layer — Design Spec
**Date:** 2026-05-05  
**Status:** Approved  
**Surfaces:** Chat interface (`ai-chat-*.jsx`) + Floating panel (`ai-panel-*.jsx`)

---

## 1. Overview

Enhance the AI assistant with three production-grade interaction features:

1. **Retry System** — automatic exponential backoff for transient failures only
2. **Copy System** — per-message copy with markdown and plain-text formats
3. **Voice Assistant** — full two-way hands-free voice mode (STT + TTS) using browser APIs

Architecture: **Three independent hooks + thin coordinator** (`use-interaction-layer`). Each feature hook owns its domain; the coordinator handles cross-feature concerns (e.g., pause TTS when STT starts, suspend retry during voice responding).

---

## 2. State Models

### 2.1 Message States
```
pending → running → completed
                 ↘ failed (transient) → retrying → running
                 ↘ failed (hard)      → [permanent error, no retry]
```

### 2.2 Voice FSM
```
idle → listening → processing → responding → idle  (normal)
idle → listening → processing → responding → listening  (hands-free loop)
idle → listening → processing → error → idle
```

### 2.3 Retry State (per message)
```js
{
  attemptCount: 0,      // current attempt number (0 = not yet retried)
  maxAttempts: 3,
  nextRetryAt: null,    // Date timestamp, for countdown UI
  backoffMs: 1000,      // doubles per attempt: 1s → 2s → 4s
  isTransient: false,   // set by retry-classifier.js
  isRetrying: false,
  exhausted: false      // true after maxAttempts reached
}
```

### 2.4 Copy State (per message)
```js
{
  copied: false,        // true for 2s after copy, then resets
  messageId: null
}
```

### 2.5 Voice State
```js
{
  status: 'idle',                // 'idle'|'listening'|'processing'|'responding'
  transcript: {
    partial: '',                 // live interim text shown in input
    final: '',                   // confirmed transcript sent as message
    confidence: null             // 0.0–1.0; <0.6 = low confidence warning
  },
  handsFreeModeEnabled: false,
  autoPlay: false                // global TTS auto-play toggle
}
```

---

## 3. Transient Error Classifier

**File:** `client/src/modules/ai/utils/retry-classifier.js`

Pure function: `classifyError(error) → { isTransient: boolean, reason: string }`

| Error / HTTP Status | isTransient | Reason |
|---------------------|-------------|--------|
| HTTP 429 | true | Rate limited — will clear |
| HTTP 503 | true | Queue/service unavailable |
| HTTP 504 | true | Agent timeout |
| `fetch()` threw (no response) | true | Network offline |
| `QUEUE_UNAVAILABLE` | true | Redis down |
| HTTP 403 / `RBAC_DENIED` | false | Permission error |
| HTTP 400 | false | Validation error |
| HTTP 404 | false | Resource not found |
| `AI_AGENT_INVALID_STATUS` | false | Stale state |
| `AI_SESSION_INVALID_STATUS` | false | Stale state |
| Any other 4xx | false | Client error |

Hard errors show the error card with no retry affordance. Transient errors trigger automatic retry.

---

## 4. Feature Design

### 4.1 Retry System

**Behavior:**
- Transient failure detected → `scheduleRetry()` called immediately
- Backoff: 1s → 2s → 4s (exponential, max 3 attempts)
- UI shows countdown: "Retrying in 2s..." → "Retrying (2/3)..."
- After attempt 3 fails → `exhausted = true` → permanent error card shown, no further action
- Each retry reuses original `correlationId` for idempotency

**UI States:**
- Attempt in progress: message bubble dimmed + pulsing border + attempt counter
- Between attempts: error card with countdown timer
- Exhausted: error card "Failed after 3 attempts" — no retry button

**Floating panel:** Uses existing `error` panel view. Retry progress shown via `ai-status-badge`.

**Idempotency:** `correlationId` generated client-side on first send, reused on all retries. Backend returns existing result if `correlationId` already maps to a `COMPLETED` run.

### 4.2 Copy System

**Affordance:**
- Any message bubble: hover → copy icon appears top-right
- Click → copies markdown format (default)
- Long-press or right-click → context menu:
  - "Copy" (markdown)
  - "Copy as plain text"
- Floating panel result view: single "Copy response" button (no hover needed)

**Feedback:** Copy icon → green ✓ "Copied!" → 2s → resets to copy icon

**Formatting rules:**

`toMarkdown(content)` — passes raw markdown string as-is to clipboard

`toPlainText(content)`:
- Strip `**bold**`, `*italic*`, `# headings`, `> blockquotes`, `---` dividers
- Convert `- item` → `• item`
- Code blocks: preserve indentation, prepend language as comment (`// javascript`)
- Preserve paragraph breaks (double newline)
- No UI chrome (timestamps, avatars, status badges)

**File:** `client/src/modules/ai/utils/copy-formatter.js`

### 4.3 Voice Assistant

#### STT (Speech-to-Text) — `SpeechRecognition` API
- Config: `continuous: true`, `interimResults: true`
- Live partial transcripts stream into the chat input field in real time
- Silence detection: no `onresult` event for 1.5s → auto-submit transcript
- Low confidence (< 0.6): underline transcript text + show "Low confidence — tap to edit" note; wait 2s before auto-submit (giving user time to cancel)
- Stop button during listening: cancel, do not submit
- Voice commands that exit hands-free without submitting: "stop", "cancel", "nevermind"

**STT error handling:**
| Error | Behavior |
|-------|----------|
| `no-speech` | Return to IDLE silently |
| `not-allowed` | Show mic permission error toast, return to IDLE |
| `network` | Show "Voice unavailable — type instead" toast, return to IDLE |
| `aborted` | Return to IDLE silently |

#### TTS (Text-to-Speech) — `SpeechSynthesis` API
- Response text split at sentence boundaries (`.`, `?`, `!`) by `tts-chunker.js`
- Sentences queued sequentially; next plays only after `onend` fires on current
- Controls per AI message bubble: Play / Pause / Stop
- Global auto-play toggle in chat header (persisted to `ai-store.js`)
- Hands-free: auto-play forced ON; after final sentence `onend` → trigger LISTENING

**TTS chunker:** `client/src/modules/ai/utils/tts-chunker.js`
- Splits on sentence-ending punctuation followed by space or end-of-string
- Minimum chunk: 3 words (avoids splitting "e.g." or "Dr.")
- Maximum chunk: 200 characters (avoids browser TTS cut-off)

#### Hands-Free Mode
- **Activate:** Hold mic button 1s OR toggle in chat header
- **Visual:** Pulsing ring on mic button + "Hands-free" label in header
- **Loop:** RESPONDING ends → LISTENING starts automatically
- **Exit:** Press mic button / say "stop" / "cancel" / "nevermind" / close panel
- **Safety:** "stop", "cancel", "nevermind" in transcript → exit hands-free, discard transcript, do not submit as message

---

## 5. File Map

### 5.1 New Client Files
```
client/src/modules/ai/
├── hooks/
│   ├── use-message-retry.js
│   ├── use-message-copy.js
│   ├── use-voice-interaction.js
│   └── use-interaction-layer.js
├── utils/
│   ├── retry-classifier.js
│   ├── copy-formatter.js
│   └── tts-chunker.js
└── components/
    ├── chat/
    │   ├── ai-chat-message-actions.jsx
    │   └── ai-chat-retry-indicator.jsx
    └── voice/
        ├── ai-voice-status-bar.jsx
        └── ai-voice-transcript-preview.jsx
```

### 5.2 Modified Client Files
| File | Change |
|------|--------|
| `ai-chat-message.jsx` | Add hover state, mount `ai-chat-message-actions` |
| `ai-chat-input.jsx` | Wire `SpeechRecognition`, transcript preview, hands-free toggle |
| `ai-chat-main.jsx` | Add `ai-voice-status-bar` to header |
| `ai-panel-idle.jsx` | Long-press handler for hands-free activation |
| `ai-panel-result.jsx` | Add "Copy response" button |
| `ai-store.js` | Add `voiceMode`, `autoPlay` fields |
| `use-ai-chat.js` | Consume `use-interaction-layer` |
| `use-ai-assistant.js` | Consume `use-interaction-layer` for panel surface |

### 5.3 New/Modified Server Files
| File | Change |
|------|--------|
| `agent.service.js` | Add `findByCorrelationId()` idempotency check before queue |
| `agent.executor.js` | Emit `504` on job timeout instead of generic `500` |
| `voiceSession.service.js` | Change STT failure to `503`; add idempotency check at session creation |

---

## 6. Hook API Signatures

### `use-message-retry.js`
```js
const { scheduleRetry, cancelRetry, retryState } = useMessageRetry({
  runId,
  correlationId,
  onRetry: (correlationId) => void,
  maxAttempts: 3,
})
```

### `use-message-copy.js`
```js
const { copy, copyState } = useMessageCopy()
// copy(content: string, format: 'markdown' | 'plain') → void
// copyState: { copied: boolean, messageId: string | null }
```

### `use-voice-interaction.js`
```js
const {
  voiceState,         // 'idle'|'listening'|'processing'|'responding'
  transcript,         // { partial, final, confidence }
  startListening,
  stopListening,
  speak,              // speak(text: string) → void, queues TTS
  stopSpeaking,
  toggleHandsFree,
  toggleAutoPlay,
} = useVoiceInteraction({
  handsFreeModeEnabled: boolean,
  autoPlay: boolean,
  onTranscriptFinal: (text: string) => void,
  onError: (code: string) => void,
})
```

### `use-interaction-layer.js`
```js
const interaction = useInteractionLayer({ runId, correlationId, messageContent, onDispatch })
// Returns: { retry, copy, voice } — all three hooks composed and coordinated
// Cross-feature rules applied internally:
//   - TTS paused when voiceState → 'listening'
//   - Retry suspended when voiceState === 'responding'
```

---

## 7. Data Flows

### Retry Flow
```
1. User sends message → agentRun created, correlationId stored client-side
2. Run fails (503) → retry-classifier: isTransient = true
3. use-message-retry: scheduleRetry(backoffMs=1000)
4. UI: countdown "Retrying in 1s..."
5. Retry fires → POST /agent/run { correlationId }
6. Backend: no existing run → creates new; existing COMPLETED run → returns result
7. UI updates via WebSocket + React Query polling (existing infrastructure)
```

### Hands-Free Voice Flow
```
1. User activates hands-free → voiceState: idle → listening
2. SpeechRecognition.start() — partials stream to input field
3. 1.5s silence → voiceState: listening → processing
4. Final transcript dispatched → agent run starts
5. voiceState: processing → responding (on AI response)
6. tts-chunker splits response → SpeechSynthesis queue
7. Last sentence onend → voiceState: responding → listening (loop)
8. "Stop" in transcript → discard, voiceState → idle, exit hands-free
```

---

## 8. Server Changes Detail

### 8.1 `agent.service.js` — Idempotency Check
```js
// Before queueJob():
const existing = await AgentRun.findOne({ correlationId });
if (existing?.status === 'COMPLETED') return existing;
if (existing?.status === 'RUNNING') return { runId: existing._id, status: 'RUNNING' };
// else: create new run as normal
```

### 8.2 `agent.executor.js` — Timeout Status Code
```js
// On BullMQ job timeout:
await agentRun.updateOne({ status: 'FAILED', error: { code: 'AGENT_TIMEOUT', httpStatus: 504 } });
```

### 8.3 `voiceSession.service.js` — STT Failure Code + Idempotency
```js
// STT failure: change from 500 to 503
throw new AppError(503, 'AI_TRANSCRIPTION_FAILED', 'Transcription service unavailable');

// Session creation idempotency:
const existing = await VoiceSession.findOne({ idempotencyKey });
if (existing && !['FAILED','CANCELLED'].includes(existing.status)) return existing;
```

---

## 9. Edge Cases

| Scenario | Handling |
|----------|----------|
| Rapid retry clicks (if shown) | Debounce 500ms, only one retry in flight |
| Voice interruption mid-TTS | `stopSpeaking()` called, TTS queue cleared, LISTENING starts |
| Network drops during hands-free | STT `network` error → toast + exit hands-free → IDLE |
| Retry while voice responding | Retry scheduled but not fired until voice exits RESPONDING |
| Copy during streaming response | Copy button disabled until response is complete |
| Browser lacks SpeechRecognition | Voice toggle hidden, replaced with "Voice not supported" tooltip |
| Browser lacks SpeechSynthesis | TTS controls hidden silently, auto-play treated as OFF |
| correlationId collision (hash clash) | Backend returns 409, client generates new correlationId and retries once |
