# AI Interaction Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add retry (transient-only, auto backoff), copy (markdown + plain text), and full two-way hands-free voice (STT + TTS via browser APIs) to both the chat interface and floating panel.

**Architecture:** Three focused hooks (`useMessageRetry`, `useMessageCopy`, `useVoiceInteraction`) composed by `useInteractionLayer`. Retry is instantiated per-run inside `RunPair`. Copy and voice are global singletons shared across the chat surface. Server gets a `correlationId` idempotency check to prevent duplicate runs on retry.

**Tech Stack:** Next.js 16, React 19, Zustand 5, TanStack Query 5, shadcn/ui, Lucide icons, Web Speech API (SpeechRecognition + SpeechSynthesis), Jest + React Testing Library.

---

## Phase 1 — Pure Utilities

### Task 1: retry-classifier

**Files:**
- Create: `client/src/modules/ai/utils/retry-classifier.js`
- Create: `client/src/modules/ai/utils/__tests__/retry-classifier.test.js`

Two classifiers: one for HTTP dispatch errors, one for async run-level error objects.

- [ ] **Step 1: Create the test file**

```js
// client/src/modules/ai/utils/__tests__/retry-classifier.test.js
import { classifyDispatchError, classifyRunError } from '../retry-classifier';

describe('classifyDispatchError', () => {
  it('treats 429 as transient', () => {
    expect(classifyDispatchError({ status: 429 }).isTransient).toBe(true);
  });
  it('treats 503 as transient', () => {
    expect(classifyDispatchError({ status: 503 }).isTransient).toBe(true);
  });
  it('treats fetch network error (no status) as transient', () => {
    expect(classifyDispatchError({}).isTransient).toBe(true);
  });
  it('treats 403 as hard error', () => {
    expect(classifyDispatchError({ status: 403 }).isTransient).toBe(false);
  });
  it('treats 400 as hard error', () => {
    expect(classifyDispatchError({ status: 400 }).isTransient).toBe(false);
  });
  it('treats RBAC_DENIED code as hard error', () => {
    expect(classifyDispatchError({ status: 403, code: 'RBAC_DENIED' }).isTransient).toBe(false);
  });
});

describe('classifyRunError', () => {
  it('treats QUEUE_UNAVAILABLE as transient', () => {
    expect(classifyRunError({ code: 'QUEUE_UNAVAILABLE' }).isTransient).toBe(true);
  });
  it('treats AGENT_TIMEOUT as transient', () => {
    expect(classifyRunError({ code: 'AGENT_TIMEOUT' }).isTransient).toBe(true);
  });
  it('treats UNHANDLED_ERROR as transient', () => {
    expect(classifyRunError({ code: 'UNHANDLED_ERROR' }).isTransient).toBe(true);
  });
  it('treats RBAC_DENIED as hard', () => {
    expect(classifyRunError({ code: 'RBAC_DENIED' }).isTransient).toBe(false);
  });
  it('treats WORKFLOW_NOT_FOUND as hard', () => {
    expect(classifyRunError({ code: 'WORKFLOW_NOT_FOUND' }).isTransient).toBe(false);
  });
  it('returns false for unknown code', () => {
    expect(classifyRunError({ code: 'SOME_UNKNOWN' }).isTransient).toBe(false);
  });
  it('returns false for null error', () => {
    expect(classifyRunError(null).isTransient).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd client && npx jest retry-classifier --no-coverage
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

```js
// client/src/modules/ai/utils/retry-classifier.js
const TRANSIENT_HTTP = new Set([429, 503, 504]);
const TRANSIENT_RUN_CODES = new Set(['QUEUE_UNAVAILABLE', 'AGENT_TIMEOUT', 'UNHANDLED_ERROR']);
const HARD_RUN_CODES = new Set(['RBAC_DENIED', 'WORKFLOW_NOT_FOUND', 'AI_AGENT_INVALID_STATUS', 'AI_SESSION_INVALID_STATUS']);

export function classifyDispatchError(error) {
  const status = error?.status ?? error?.response?.status;
  const code = error?.code ?? error?.response?.data?.code;

  if (code === 'RBAC_DENIED') return { isTransient: false, reason: code };
  if (!status) return { isTransient: true, reason: 'network-error' };
  if (TRANSIENT_HTTP.has(status)) return { isTransient: true, reason: `HTTP_${status}` };
  return { isTransient: false, reason: `HTTP_${status}` };
}

export function classifyRunError(runError) {
  const code = runError?.code;
  if (!code) return { isTransient: false, reason: 'no-code' };
  if (TRANSIENT_RUN_CODES.has(code)) return { isTransient: true, reason: code };
  if (HARD_RUN_CODES.has(code)) return { isTransient: false, reason: code };
  return { isTransient: false, reason: code };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd client && npx jest retry-classifier --no-coverage
```
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/ai/utils/retry-classifier.js client/src/modules/ai/utils/__tests__/retry-classifier.test.js
git commit -m "feat(ai): add retry error classifier (transient vs hard)"
```

---

### Task 2: copy-formatter

**Files:**
- Create: `client/src/modules/ai/utils/copy-formatter.js`
- Create: `client/src/modules/ai/utils/__tests__/copy-formatter.test.js`

- [ ] **Step 1: Create the test file**

```js
// client/src/modules/ai/utils/__tests__/copy-formatter.test.js
import { toMarkdown, toPlainText } from '../copy-formatter';

describe('toMarkdown', () => {
  it('returns string content unchanged', () => {
    expect(toMarkdown('**hello**')).toBe('**hello**');
  });
  it('serializes objects to JSON', () => {
    expect(toMarkdown({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('toPlainText', () => {
  it('strips bold markers', () => {
    expect(toPlainText('**bold**')).toBe('bold');
  });
  it('strips italic markers', () => {
    expect(toPlainText('*italic*')).toBe('italic');
  });
  it('strips headings', () => {
    expect(toPlainText('## Title')).toBe('Title');
  });
  it('strips blockquotes', () => {
    expect(toPlainText('> quote')).toBe('quote');
  });
  it('converts list markers to bullets', () => {
    expect(toPlainText('- item')).toBe('• item');
  });
  it('strips horizontal rules', () => {
    expect(toPlainText('---')).toBe('');
  });
  it('strips inline code backticks', () => {
    expect(toPlainText('`code`')).toBe('code');
  });
  it('adds language comment to fenced code blocks', () => {
    const md = '```js\nconsole.log(1);\n```';
    expect(toPlainText(md)).toBe('// js\nconsole.log(1);');
  });
  it('strips link syntax, keeps text', () => {
    expect(toPlainText('[click here](https://example.com)')).toBe('click here');
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd client && npx jest copy-formatter --no-coverage
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

```js
// client/src/modules/ai/utils/copy-formatter.js
export function toMarkdown(content) {
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

export function toPlainText(content) {
  const str = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  return str
    .replace(/```(\w+)\n([\s\S]*?)```/g, (_, lang, code) => `// ${lang}\n${code.trimEnd()}`)
    .replace(/```([\s\S]*?)```/g, (_, code) => code.trimEnd())
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s*/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd client && npx jest copy-formatter --no-coverage
```
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/ai/utils/copy-formatter.js client/src/modules/ai/utils/__tests__/copy-formatter.test.js
git commit -m "feat(ai): add copy formatter (markdown and plain text)"
```

---

### Task 3: tts-chunker

**Files:**
- Create: `client/src/modules/ai/utils/tts-chunker.js`
- Create: `client/src/modules/ai/utils/__tests__/tts-chunker.test.js`

- [ ] **Step 1: Create the test file**

```js
// client/src/modules/ai/utils/__tests__/tts-chunker.test.js
import { splitIntoChunks } from '../tts-chunker';

describe('splitIntoChunks', () => {
  it('returns empty array for empty string', () => {
    expect(splitIntoChunks('')).toEqual([]);
  });
  it('returns empty array for null', () => {
    expect(splitIntoChunks(null)).toEqual([]);
  });
  it('returns single chunk for short text', () => {
    expect(splitIntoChunks('Hello world.')).toEqual(['Hello world.']);
  });
  it('splits at sentence boundaries', () => {
    const result = splitIntoChunks('First sentence. Second sentence. Third one.');
    expect(result.length).toBeGreaterThan(1);
  });
  it('does not split mid-sentence', () => {
    const text = 'This is a single long sentence without any terminal punctuation that goes on';
    const result = splitIntoChunks(text);
    expect(result).toHaveLength(1);
  });
  it('chunks do not exceed 200 characters', () => {
    const long = 'A'.repeat(50) + '. ' + 'B'.repeat(50) + '. ' + 'C'.repeat(50) + '. ' + 'D'.repeat(50) + '.';
    splitIntoChunks(long).forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(200);
    });
  });
  it('filters chunks shorter than 3 words when multiple chunks exist', () => {
    const result = splitIntoChunks('Ok. This is a proper sentence here. Good.');
    result.forEach((chunk) => {
      expect(chunk.split(/\s+/).length).toBeGreaterThanOrEqual(3);
    });
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd client && npx jest tts-chunker --no-coverage
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

```js
// client/src/modules/ai/utils/tts-chunker.js
const MAX_CHARS = 200;
const MIN_WORDS = 3;

export function splitIntoChunks(text) {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z"'])/);
  const chunks = [];
  let current = '';

  for (const part of parts) {
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length > MAX_CHARS && current) {
      chunks.push(current.trim());
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  if (chunks.length === 1) return chunks;
  return chunks.filter((c) => c.split(/\s+/).length >= MIN_WORDS);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd client && npx jest tts-chunker --no-coverage
```
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/ai/utils/tts-chunker.js client/src/modules/ai/utils/__tests__/tts-chunker.test.js
git commit -m "feat(ai): add TTS sentence chunker"
```

---

## Phase 2 — Server Changes

### Task 4: agentRun repository — findByCorrelationId

**Files:**
- Modify: `server/src/modules/ai/agent/agentRun.repository.js`

- [ ] **Step 1: Read the repository to find the right insertion point**

Open `server/src/modules/ai/agent/agentRun.repository.js` and locate the existing `findById` method.

- [ ] **Step 2: Add `findByCorrelationId` after `findById`**

```js
async findByCorrelationId(correlationId) {
  return AgentRun.findOne({ correlationId }).lean();
}
```

- [ ] **Step 3: Verify server starts without errors**

```bash
cd server && node --experimental-vm-modules src/app.js &
sleep 3 && curl -s http://localhost:3000/health | grep -q ok && echo "OK" && kill %1
```
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/ai/agent/agentRun.repository.js
git commit -m "feat(ai): add findByCorrelationId to agentRun repository"
```

---

### Task 5: agent.service — correlationId idempotency in run()

**Files:**
- Modify: `server/src/modules/ai/agent/agent.service.js` (lines 54-113, the `run()` method)

- [ ] **Step 1: Add the idempotency check at the top of `run()`, before `agentRunRepository.create`**

Insert after line 56 (`const sanitized = sanitizeUserInput(input);`):

```js
// Idempotency: reuse existing run if correlationId matches a non-failed run
if (meta.correlationId) {
  const existing = await agentRunRepository.findByCorrelationId(meta.correlationId);
  if (existing) {
    if (existing.status === 'COMPLETED') {
      return { agentRunId: existing._id.toString(), status: 'completed', workflowType: existing.workflowType };
    }
    if (['RUNNING', 'PENDING'].includes(existing.status)) {
      return { agentRunId: existing._id.toString(), status: 'pending', workflowType: existing.workflowType };
    }
    // FAILED or CANCELLED — fall through and create a new run
  }
}
```

- [ ] **Step 2: Verify server starts**

```bash
cd server && node --experimental-vm-modules src/app.js &
sleep 3 && echo "OK" && kill %1
```
Expected: OK (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/ai/agent/agent.service.js
git commit -m "feat(ai): idempotent run() — reuse completed/running run for same correlationId"
```

---

### Task 6: agent.executor — AGENT_TIMEOUT error code

**Files:**
- Modify: `server/src/modules/ai/agent/agent.executor.js` (the `execute` catch block, lines 27–43)

- [ ] **Step 1: Update the catch block to detect timeout errors and use AGENT_TIMEOUT code**

Replace the catch block (lines 27–43):

```js
} catch (err) {
  const isTimeout = err.message?.includes('timeout') || err.message?.includes('timed out') || err.type === 'JobTimeoutError';
  const errorCode = isTimeout ? 'AGENT_TIMEOUT' : (err.code || 'UNHANDLED_ERROR');

  logger.error('Workflow threw unhandled error', {
    module: 'ai-agent',
    action: 'executor.execute',
    agentRunId,
    error: err.message,
  });
  await agentRunRepository.updateById(agentRunId, {
    status: 'FAILED',
    failedAt: new Date(),
    error: { message: err.message, code: errorCode },
  });
  eventBus.publish(EVENT_TYPES.AI_AGENT_RUN_FAILED, { agentRunId, userId, error: err.message }, { source: 'ai:agent' });
  this._emitWs(userId, 'ai:agent:failed', { agentRunId, error: { message: err.message, code: errorCode } });
  await this._cleanup(agentRunId);
  throw err;
}
```

- [ ] **Step 2: Verify server starts**

```bash
cd server && node --experimental-vm-modules src/app.js &
sleep 3 && echo "OK" && kill %1
```

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/ai/agent/agent.executor.js
git commit -m "fix(ai): emit AGENT_TIMEOUT error code on workflow timeout"
```

---

## Phase 3 — Client Hooks

### Task 7: use-message-retry

**Files:**
- Create: `client/src/modules/ai/hooks/use-message-retry.js`

- [ ] **Step 1: Create the hook**

```js
// client/src/modules/ai/hooks/use-message-retry.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { classifyRunError } from '../utils/retry-classifier';

const BASE_BACKOFF_MS = 1000;

export function useMessageRetry({ onRetry, maxAttempts = 3 }) {
  const [retryState, setRetryState] = useState({
    attemptCount: 0,
    isRetrying: false,
    nextRetryAt: null,
    exhausted: false,
  });
  const timerRef = useRef(null);
  const onRetryRef = useRef(onRetry);
  useEffect(() => { onRetryRef.current = onRetry; }, [onRetry]);

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setRetryState((s) => ({ ...s, isRetrying: false, nextRetryAt: null }));
  }, []);

  const scheduleRetry = useCallback(
    (runError, correlationId) => {
      const { isTransient } = classifyRunError(runError);
      if (!isTransient) return false;

      setRetryState((prev) => {
        const next = prev.attemptCount + 1;
        if (next > maxAttempts) return { ...prev, exhausted: true, isRetrying: false, nextRetryAt: null };

        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, prev.attemptCount);
        const nextRetryAt = Date.now() + backoffMs;

        timerRef.current = setTimeout(() => {
          setRetryState((s) => ({ ...s, isRetrying: true, nextRetryAt: null }));
          onRetryRef.current(correlationId);
        }, backoffMs);

        return { attemptCount: next, isRetrying: false, nextRetryAt, exhausted: false };
      });
      return true;
    },
    [maxAttempts]
  );

  const reset = useCallback(() => {
    cancel();
    setRetryState({ attemptCount: 0, isRetrying: false, nextRetryAt: null, exhausted: false });
  }, [cancel]);

  useEffect(() => () => cancel(), [cancel]);

  return { scheduleRetry, cancelRetry: cancel, resetRetry: reset, retryState, maxAttempts };
}
```

- [ ] **Step 2: Verify no lint errors**

```bash
cd client && npx eslint src/modules/ai/hooks/use-message-retry.js --max-warnings=0
```
Expected: No output (clean).

- [ ] **Step 3: Commit**

```bash
git add client/src/modules/ai/hooks/use-message-retry.js
git commit -m "feat(ai): add useMessageRetry hook with exponential backoff"
```

---

### Task 8: use-message-copy

**Files:**
- Create: `client/src/modules/ai/hooks/use-message-copy.js`

- [ ] **Step 1: Create the hook**

```js
// client/src/modules/ai/hooks/use-message-copy.js
'use client';

import { useState, useCallback, useRef } from 'react';
import { toMarkdown, toPlainText } from '../utils/copy-formatter';

const RESET_DELAY_MS = 2000;

export function useMessageCopy() {
  const [copyState, setCopyState] = useState({ copied: false, messageId: null });
  const timerRef = useRef(null);

  const copy = useCallback(async (content, format = 'markdown', messageId = null) => {
    if (!navigator?.clipboard) return;
    const text = format === 'plain' ? toPlainText(content) : toMarkdown(content);
    try {
      await navigator.clipboard.writeText(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopyState({ copied: true, messageId });
      timerRef.current = setTimeout(
        () => setCopyState({ copied: false, messageId: null }),
        RESET_DELAY_MS
      );
    } catch {
      // clipboard denied — ignore silently
    }
  }, []);

  return { copy, copyState };
}
```

- [ ] **Step 2: Verify no lint errors**

```bash
cd client && npx eslint src/modules/ai/hooks/use-message-copy.js --max-warnings=0
```

- [ ] **Step 3: Commit**

```bash
git add client/src/modules/ai/hooks/use-message-copy.js
git commit -m "feat(ai): add useMessageCopy hook"
```

---

### Task 9: use-voice-interaction

**Files:**
- Create: `client/src/modules/ai/hooks/use-voice-interaction.js`

- [ ] **Step 1: Create the hook**

```js
// client/src/modules/ai/hooks/use-voice-interaction.js
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { splitIntoChunks } from '../utils/tts-chunker';

const SILENCE_TIMEOUT_MS = 1500;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const LOW_CONFIDENCE_DELAY_MS = 2000;
const EXIT_COMMANDS = new Set(['stop', 'cancel', 'nevermind']);

export function useVoiceInteraction({ onTranscriptFinal, onError, handsFreeModeEnabled = false }) {
  const [voiceState, setVoiceState] = useState('idle');
  const [transcript, setTranscript] = useState({ partial: '', final: '', confidence: null });

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const ttsQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);
  const handsFreeRef = useRef(handsFreeModeEnabled);
  const onTranscriptRef = useRef(onTranscriptFinal);
  const onErrorRef = useRef(onError);

  useEffect(() => { handsFreeRef.current = handsFreeModeEnabled; }, [handsFreeModeEnabled]);
  useEffect(() => { onTranscriptRef.current = onTranscriptFinal; }, [onTranscriptFinal]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const isSTTSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const isTTSSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ── TTS ───────────────────────────────────────────────────────────────
  const startListeningRef = useRef(null);

  const _playNext = useCallback(() => {
    if (!isTTSSupported || ttsQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      setVoiceState((prev) => {
        if (prev !== 'responding') return prev;
        return 'idle';
      });
      if (handsFreeRef.current && startListeningRef.current) {
        startListeningRef.current();
      }
      return;
    }
    const chunk = ttsQueueRef.current.shift();
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.onend = _playNext;
    utterance.onerror = _playNext;
    isSpeakingRef.current = true;
    window.speechSynthesis.speak(utterance);
  }, [isTTSSupported]);

  const speak = useCallback(
    (text) => {
      if (!isTTSSupported) return;
      const chunks = splitIntoChunks(text);
      if (!chunks.length) return;
      ttsQueueRef.current.push(...chunks);
      setVoiceState('responding');
      if (!isSpeakingRef.current) _playNext();
    },
    [isTTSSupported, _playNext]
  );

  const stopSpeaking = useCallback(() => {
    if (!isTTSSupported) return;
    ttsQueueRef.current = [];
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setVoiceState('idle');
  }, [isTTSSupported]);

  // ── STT ───────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!isSTTSupported) { onErrorRef.current?.('not-supported'); return; }

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    const resetSilence = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => recognition.stop(), SILENCE_TIMEOUT_MS);
    };

    recognition.onresult = (e) => {
      resetSilence();
      let interim = '';
      let finalText = '';
      let confidence = null;
      for (const result of e.results) {
        if (result.isFinal) { finalText += result[0].transcript; confidence = result[0].confidence; }
        else { interim += result[0].transcript; }
      }
      setTranscript((prev) => ({
        partial: interim,
        final: prev.final + finalText,
        confidence: confidence ?? prev.confidence,
      }));
    };

    recognition.onerror = (e) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setVoiceState('idle');
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      onErrorRef.current?.(e.error);
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setVoiceState((prev) => (prev === 'listening' ? 'processing' : prev));

      setTranscript((prev) => {
        const text = (prev.final + prev.partial).trim();
        if (!text) return { partial: '', final: '', confidence: null };

        const lower = text.toLowerCase();
        if (EXIT_COMMANDS.has(lower)) {
          onErrorRef.current?.('exit-command');
          return { partial: '', final: '', confidence: null };
        }

        const confidence = prev.confidence;
        const isLowConf = confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD;
        if (isLowConf) {
          setTimeout(() => onTranscriptRef.current?.(text, confidence), LOW_CONFIDENCE_DELAY_MS);
        } else {
          onTranscriptRef.current?.(text, confidence);
        }
        return { partial: '', final: '', confidence: null };
      });
    };

    recognition.start();
    setVoiceState('listening');
    resetSilence();
  }, [isSTTSupported]);

  // Keep startListeningRef current so _playNext can call it without stale closure
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    recognitionRef.current?.abort();
    setVoiceState('idle');
    setTranscript({ partial: '', final: '', confidence: null });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  }, []);

  return {
    voiceState,
    transcript,
    isSTTSupported,
    isTTSSupported,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
```

- [ ] **Step 2: Verify no lint errors**

```bash
cd client && npx eslint src/modules/ai/hooks/use-voice-interaction.js --max-warnings=0
```

- [ ] **Step 3: Commit**

```bash
git add client/src/modules/ai/hooks/use-voice-interaction.js
git commit -m "feat(ai): add useVoiceInteraction hook (STT + TTS + hands-free)"
```

---

### Task 10: use-interaction-layer

**Files:**
- Create: `client/src/modules/ai/hooks/use-interaction-layer.js`

- [ ] **Step 1: Create the coordinator hook**

```js
// client/src/modules/ai/hooks/use-interaction-layer.js
'use client';

import { useCallback } from 'react';
import { useAiStore } from '../store/ai-store';
import { useMessageCopy } from './use-message-copy';
import { useVoiceInteraction } from './use-voice-interaction';
import { showError } from '@/lib/toast';

const VOICE_ERROR_MESSAGES = {
  'not-allowed': 'Microphone access denied — check browser permissions.',
  'network': 'Voice unavailable — type instead.',
  'not-supported': null, // silently hide the button
};

export function useInteractionLayer({ onDispatch }) {
  const { voiceMode, autoPlay, setVoiceMode } = useAiStore();
  const handsFreeModeEnabled = voiceMode === 'hands-free';

  const copy = useMessageCopy();

  const voice = useVoiceInteraction({
    handsFreeModeEnabled,
    onTranscriptFinal: (text) => onDispatch(text),
    onError: (code) => {
      if (code === 'exit-command') { setVoiceMode('manual'); return; }
      const msg = VOICE_ERROR_MESSAGES[code];
      if (msg) showError(msg);
    },
  });

  // Cross-feature: stop TTS before starting STT
  const startListening = useCallback(() => {
    voice.stopSpeaking();
    voice.startListening();
  }, [voice]);

  const toggleHandsFree = useCallback(() => {
    const next = handsFreeModeEnabled ? 'manual' : 'hands-free';
    setVoiceMode(next);
    if (next === 'manual') voice.stopListening();
  }, [handsFreeModeEnabled, setVoiceMode, voice]);

  return {
    copy,
    voice: { ...voice, startListening, toggleHandsFree },
  };
}
```

- [ ] **Step 2: Verify no lint errors**

```bash
cd client && npx eslint src/modules/ai/hooks/use-interaction-layer.js --max-warnings=0
```

- [ ] **Step 3: Commit**

```bash
git add client/src/modules/ai/hooks/use-interaction-layer.js
git commit -m "feat(ai): add useInteractionLayer coordinator hook"
```

---

## Phase 4 — UI Components

### Task 11: ai-chat-message-actions

**Files:**
- Create: `client/src/modules/ai/components/chat/ai-chat-message-actions.jsx`

- [ ] **Step 1: Create the component**

```jsx
// client/src/modules/ai/components/chat/ai-chat-message-actions.jsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Copy, Check, Volume2, VolumeX, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AiChatMessageActions({
  content,
  messageId,
  onCopy,
  copyState,
  onPlay,
  onPause,
  onStop,
  ttsActive = false,
  showTts = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isCopied = copyState.copied && copyState.messageId === messageId;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div className="flex items-center gap-0.5">
      {/* Copy */}
      <div className="relative" ref={menuRef}>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => onCopy(content, 'markdown', messageId)}
          onContextMenu={(e) => { e.preventDefault(); setMenuOpen((s) => !s); }}
          title={isCopied ? 'Copied!' : 'Copy'}
        >
          {isCopied
            ? <Check className="h-3 w-3 text-green-500" />
            : <Copy className="h-3 w-3 text-muted-foreground" />}
        </Button>

        {menuOpen && (
          <div className="absolute bottom-full right-0 mb-1 z-50 min-w-36 rounded-md border bg-popover shadow-md py-1">
            <button
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
              onClick={() => { onCopy(content, 'markdown', messageId); setMenuOpen(false); }}
            >
              Copy
            </button>
            <button
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
              onClick={() => { onCopy(content, 'plain', messageId); setMenuOpen(false); }}
            >
              Copy as plain text
            </button>
          </div>
        )}
      </div>

      {/* TTS controls (AI messages only) */}
      {showTts && (
        ttsActive ? (
          <>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onPause} title="Pause">
              <Pause className="h-3 w-3 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onStop} title="Stop">
              <VolumeX className="h-3 w-3 text-muted-foreground" />
            </Button>
          </>
        ) : (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onPlay} title="Play">
            <Volume2 className="h-3 w-3 text-muted-foreground" />
          </Button>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/ai/components/chat/ai-chat-message-actions.jsx
git commit -m "feat(ai): add AiChatMessageActions (copy + TTS controls)"
```

---

### Task 12: ai-chat-retry-indicator

**Files:**
- Create: `client/src/modules/ai/components/chat/ai-chat-retry-indicator.jsx`

- [ ] **Step 1: Create the component**

```jsx
// client/src/modules/ai/components/chat/ai-chat-retry-indicator.jsx
'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AiChatRetryIndicator({ retryState, maxAttempts = 3 }) {
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    if (!retryState.nextRetryAt) { setCountdown(null); return; }
    const tick = () => setCountdown(Math.max(0, Math.ceil((retryState.nextRetryAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [retryState.nextRetryAt]);

  if (!retryState.nextRetryAt && !retryState.isRetrying && !retryState.exhausted) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs mt-2',
        retryState.exhausted
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {retryState.isRetrying && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
      {retryState.nextRetryAt && !retryState.isRetrying && (
        <AlertCircle className="h-3 w-3 shrink-0" />
      )}

      {retryState.exhausted
        ? `Failed after ${maxAttempts} attempts`
        : retryState.isRetrying
        ? `Retrying (${retryState.attemptCount}/${maxAttempts})…`
        : `Retrying in ${countdown}s…`}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/ai/components/chat/ai-chat-retry-indicator.jsx
git commit -m "feat(ai): add AiChatRetryIndicator with countdown"
```

---

### Task 13: ai-voice-status-bar

**Files:**
- Create: `client/src/modules/ai/components/voice/ai-voice-status-bar.jsx`

- [ ] **Step 1: Create the component**

```jsx
// client/src/modules/ai/components/voice/ai-voice-status-bar.jsx
'use client';

import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AiVoiceStatusBar({ voiceState, isHandsFree, autoPlay, onToggleHandsFree, onToggleAutoPlay, isSTTSupported, isTTSSupported }) {
  if (!isSTTSupported) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Hands-free toggle */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1.5 text-xs',
          isHandsFree
            ? 'text-primary bg-primary/10 hover:bg-primary/20'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={onToggleHandsFree}
        title={isHandsFree ? 'Exit hands-free mode' : 'Enable hands-free mode'}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            isHandsFree && voiceState === 'listening' ? 'bg-primary animate-pulse' : 'bg-current opacity-50'
          )}
        />
        {isHandsFree ? 'Hands-free' : 'Hands-free'}
        {isHandsFree ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
      </Button>

      {/* Auto-play TTS toggle */}
      {isTTSSupported && (
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', autoPlay ? 'text-primary' : 'text-muted-foreground')}
          onClick={onToggleAutoPlay}
          title={autoPlay ? 'Disable auto-play' : 'Enable auto-play (AI reads responses aloud)'}
        >
          {autoPlay ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/ai/components/voice/ai-voice-status-bar.jsx
git commit -m "feat(ai): add AiVoiceStatusBar (hands-free + auto-play toggles)"
```

---

### Task 14: ai-voice-transcript-preview

**Files:**
- Create: `client/src/modules/ai/components/voice/ai-voice-transcript-preview.jsx`

- [ ] **Step 1: Create the component**

```jsx
// client/src/modules/ai/components/voice/ai-voice-transcript-preview.jsx
'use client';

import { cn } from '@/lib/utils';

export function AiVoiceTranscriptPreview({ transcript, voiceState }) {
  const show = voiceState === 'listening' && (transcript.partial || transcript.final);
  if (!show) return null;

  const isLowConf = transcript.confidence !== null && transcript.confidence < 0.6;
  const displayText = transcript.final + transcript.partial;

  return (
    <div className="px-4 pt-2">
      <p
        className={cn(
          'text-sm text-muted-foreground italic',
          isLowConf && 'underline decoration-dotted decoration-amber-400'
        )}
      >
        {displayText}
      </p>
      {isLowConf && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          Low confidence — tap to edit before sending
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/ai/components/voice/ai-voice-transcript-preview.jsx
git commit -m "feat(ai): add AiVoiceTranscriptPreview for live STT display"
```

---

## Phase 5 — Wiring

### Task 15: ai-store — add voiceMode + autoPlay

**Files:**
- Modify: `client/src/modules/ai/store/ai-store.js`

- [ ] **Step 1: Add fields to INITIAL_STATE and new actions**

Replace the current file content with:

```js
import { create } from 'zustand';
import { PANEL_VIEWS, RECORDING_STATES } from '../constants/ai-constants';
import { registerAiStoreReset } from '@/stores/auth-store';

const INITIAL_STATE = {
  isPanelOpen:     false,
  recordingState:  RECORDING_STATES.IDLE,
  activeSessionId: null,
  activeRunId:     null,
  panelView:       PANEL_VIEWS.IDLE,
  voiceMode:       'manual',   // 'manual' | 'hands-free'
  autoPlay:        false,
};

export const useAiStore = create((set) => ({
  ...INITIAL_STATE,

  openPanel: () => set({ isPanelOpen: true }),

  closePanel: () =>
    set({
      isPanelOpen:     false,
      panelView:       PANEL_VIEWS.IDLE,
      activeSessionId: null,
      activeRunId:     null,
      recordingState:  RECORDING_STATES.IDLE,
      voiceMode:       'manual',
    }),

  setPanelView:      (view)          => set({ panelView: view }),
  setRecordingState: (recordingState) => set({ recordingState }),
  setActiveSessionId:(id)            => set({ activeSessionId: id }),
  setActiveRunId:    (id)            => set({ activeRunId: id }),
  setVoiceMode:      (voiceMode)     => set({ voiceMode }),
  setAutoPlay:       (autoPlay)      => set({ autoPlay }),

  resetAll: () => set(INITIAL_STATE),
}));

registerAiStoreReset(() => useAiStore.getState().resetAll());
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/ai/store/ai-store.js
git commit -m "feat(ai): add voiceMode and autoPlay to ai-store"
```

---

### Task 16: ai-agent-service — pass correlationId on dispatch

**Files:**
- Modify: `client/src/modules/ai/services/ai-agent-service.js`

- [ ] **Step 1: Update the dispatch function signature**

Replace line 5 (`dispatch: ...`):

```js
dispatch: (input, threadId, correlationId) =>
  apiClient
    .post(ENDPOINTS.AI.AGENT_RUN, { input, threadId, ...(correlationId && { correlationId }) })
    .then((r) => r.data),
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/ai/services/ai-agent-service.js
git commit -m "feat(ai): pass correlationId through dispatch for retry idempotency"
```

---

### Task 17: ai-chat-message — hover group + actions bar

**Files:**
- Modify: `client/src/modules/ai/components/chat/ai-chat-message.jsx`

- [ ] **Step 1: Replace file content**

```jsx
// client/src/modules/ai/components/chat/ai-chat-message.jsx
'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiChatMessageActions } from './ai-chat-message-actions';

export function AiChatMessage({
  variant = 'assistant',
  timestamp,
  messageId,
  content,
  onCopy,
  copyState,
  onPlay,
  onPause,
  onStop,
  ttsActive,
  isTTSSupported,
  children,
}) {
  const isUser = variant === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={cn('flex gap-3 w-full group', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
      )}

      <div className={cn('flex flex-col gap-1.5 min-w-0', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-primary-gradient text-white rounded-2xl rounded-tr-sm max-w-[75%]'
              : 'bg-card border rounded-2xl rounded-tl-sm max-w-[85%]'
          )}
        >
          {children}
        </div>

        {/* Action bar — visible on hover */}
        {onCopy && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 px-1">
            <AiChatMessageActions
              content={content}
              messageId={messageId}
              onCopy={onCopy}
              copyState={copyState}
              onPlay={onPlay}
              onPause={onPause}
              onStop={onStop}
              ttsActive={ttsActive}
              showTts={!isUser && isTTSSupported}
            />
          </div>
        )}

        {timestamp && (
          <span className="text-xs text-muted-foreground px-1">{timestamp}</span>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/ai/components/chat/ai-chat-message.jsx
git commit -m "feat(ai): add hover action bar to AiChatMessage"
```

---

### Task 18: ai-chat-thread — wire retry + copy + TTS per run

**Files:**
- Modify: `client/src/modules/ai/components/chat/ai-chat-thread.jsx`

- [ ] **Step 1: Replace `RunPair` component** (lines 105–127 in the current file)

Replace the entire `RunPair` function and its imports:

```jsx
// Add to imports at top of ai-chat-thread.jsx:
import { useEffect, useRef } from 'react'; // useRef already imported
import { useMessageRetry } from '../../hooks/use-message-retry';
import { AiChatRetryIndicator } from './ai-chat-retry-indicator';
import { randomUUID } from 'crypto'; // Not available in browser — use crypto.randomUUID()
```

> **Note:** `randomUUID` in the browser is `crypto.randomUUID()`. Replace the import with a util:

Add to `client/src/modules/ai/utils/uid.js`:
```js
export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
```

Then update `RunPair`:

```jsx
function RunPair({ run, onConfirm, isConfirming, onRetry, copyProps, ttsProps }) {
  const timestamp = run.createdAt
    ? formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })
    : '';

  const inputText =
    typeof run.input === 'string'
      ? run.input
      : run.input
      ? JSON.stringify(run.input)
      : 'Voice recording';

  const { scheduleRetry, retryState, maxAttempts } = useMessageRetry({
    onRetry: (cid) => onRetry?.(run.input, cid),
    maxAttempts: 3,
  });

  const scheduledRef = useRef(false);
  useEffect(() => {
    if (run.status === 'FAILED' && !scheduledRef.current) {
      scheduledRef.current = true;
      scheduleRetry(run.error, run.correlationId);
    }
  }, [run.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const assistantContent =
    run.status === 'COMPLETED' && run.output?.message
      ? run.output.message
      : typeof run.output === 'string'
      ? run.output
      : run.output
      ? JSON.stringify(run.output, null, 2)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <AiChatMessage
        variant="user"
        timestamp={timestamp}
        messageId={`user-${run._id}`}
        content={inputText}
        onCopy={copyProps?.onCopy}
        copyState={copyProps?.copyState ?? { copied: false, messageId: null }}
      >
        {inputText}
      </AiChatMessage>

      <AiChatMessage
        variant="assistant"
        messageId={`assistant-${run._id}`}
        content={assistantContent}
        onCopy={assistantContent ? copyProps?.onCopy : undefined}
        copyState={copyProps?.copyState ?? { copied: false, messageId: null }}
        onPlay={ttsProps ? () => ttsProps.speak(assistantContent) : undefined}
        onPause={ttsProps?.onPause}
        onStop={ttsProps?.stopSpeaking}
        ttsActive={ttsProps?.voiceState === 'responding'}
        isTTSSupported={ttsProps?.isTTSSupported}
      >
        <AgentContent run={run} onConfirm={onConfirm} isConfirming={isConfirming} />
      </AiChatMessage>

      <AiChatRetryIndicator retryState={retryState} maxAttempts={maxAttempts} />
    </div>
  );
}
```

- [ ] **Step 2: Update `AiChatThread` signature** to pass new props through:

```jsx
export function AiChatThread({ runs = [], latestRunId, isLoading, pendingInput, onConfirm, isConfirming, onRetry, copyProps, ttsProps }) {
```

And update each `<RunPair>` call inside to pass `onRetry`, `copyProps`, `ttsProps`.

- [ ] **Step 3: Create `client/src/modules/ai/utils/uid.js`**

```js
export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
```

- [ ] **Step 4: Commit**

```bash
git add client/src/modules/ai/components/chat/ai-chat-thread.jsx client/src/modules/ai/utils/uid.js
git commit -m "feat(ai): wire retry indicator and copy/TTS props into RunPair"
```

---

### Task 19: ai-chat-input — wire STT + transcript preview

**Files:**
- Modify: `client/src/modules/ai/components/chat/ai-chat-input.jsx`

- [ ] **Step 1: Add voice props and transcript preview**

Add these new props to `AiChatInput`:

```jsx
export function AiChatInput({
  onSubmit,
  isDispatching,
  recorder,
  voiceSession,
  onVoiceStart,
  // New voice interaction props:
  voiceState,        // 'idle'|'listening'|'processing'|'responding'
  transcript,        // { partial, final, confidence }
  onStartListening,
  onStopListening,
  isSTTSupported,
}) {
```

- [ ] **Step 2: Add transcript preview and STT mic behavior**

In the text input section (after the `!isVoiceBusy` check), before the `<Textarea>`, add the transcript preview import and insert it:

```jsx
import { AiVoiceTranscriptPreview } from '../voice/ai-voice-transcript-preview';
```

Inside the text input div, just before `<Textarea>`:
```jsx
<AiVoiceTranscriptPreview transcript={transcript ?? { partial: '', final: '', confidence: null }} voiceState={voiceState ?? 'idle'} />
```

- [ ] **Step 3: Replace the mic `Button` with STT-aware version**

Replace the existing mic button (lines 133–143 in original):

```jsx
{isSTTSupported !== false && (
  <Button
    size="icon"
    variant={voiceState === 'listening' ? 'destructive' : 'ghost'}
    className="h-7 w-7 text-muted-foreground hover:text-foreground"
    onClick={voiceState === 'listening' ? onStopListening : (onStartListening ?? onVoiceStart)}
    title={voiceState === 'listening' ? 'Stop listening' : 'Start voice input'}
    type="button"
  >
    {voiceState === 'listening'
      ? <Square className="h-3.5 w-3.5" />
      : <Mic className="h-4 w-4" />}
  </Button>
)}
```

- [ ] **Step 4: Sync transcript to textarea value when listening ends**

In `AiChatInput`, add effect:

```jsx
useEffect(() => {
  if (voiceState === 'processing' && transcript?.final) {
    setValue(transcript.final);
  }
}, [voiceState, transcript?.final]);
```

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/ai/components/chat/ai-chat-input.jsx
git commit -m "feat(ai): wire STT transcript preview into chat input"
```

---

### Task 20: ai-chat-main — compose interaction layer + voice status bar

**Files:**
- Modify: `client/src/modules/ai/components/chat/ai-chat-main.jsx`

- [ ] **Step 1: Replace the component to use useInteractionLayer and add AiVoiceStatusBar**

```jsx
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, PenSquare, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAiStore } from '../../store/ai-store';
import { useInteractionLayer } from '../../hooks/use-interaction-layer';
import { SESSION_TYPES } from '../../constants/ai-constants';
import { AiChatWelcome } from './ai-chat-welcome';
import { AiChatThread } from './ai-chat-thread';
import { AiChatInput } from './ai-chat-input';
import { AiVoiceStatusBar } from '../voice/ai-voice-status-bar';

export function AiChatMain({
  selectedThreadId,
  onNewChat,
  onToggleSidebar,
  threads = [],
  threadRuns = [],
  latestRun,
  isLoadingThread,
  dispatch,
  isDispatching,
  pendingInput,
  confirm,
  isConfirming,
  recorder,
  voiceSession,
}) {
  const router = useRouter();
  const { voiceMode, autoPlay, setVoiceMode, setAutoPlay } = useAiStore();

  const { copy, voice } = useInteractionLayer({ onDispatch: dispatch });

  const handleVoiceStart = useCallback(async () => {
    try {
      const session = await voiceSession.createSessionAsync(SESSION_TYPES.COMMAND);
      const sid = session._id || session.id;
      await recorder.startRecording(sid);
    } catch {
      // mutation onError shows toast
    }
  }, [voiceSession, recorder]);

  const handleRetry = useCallback(
    (input, correlationId) => dispatch(input, correlationId),
    [dispatch]
  );

  const hasHistory = threads.length > 0;
  const showThread = !!selectedThreadId || !!pendingInput;

  const copyProps = { onCopy: copy.copy, copyState: copy.copyState };
  const ttsProps = {
    speak: voice.speak,
    stopSpeaking: voice.stopSpeaking,
    voiceState: voice.voiceState,
    isTTSSupported: voice.isTTSSupported,
    onPause: voice.stopSpeaking,
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden min-w-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 bg-background/80 backdrop-blur-sm">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleSidebar} title="Toggle history">
          <Menu className="h-4 w-4" />
        </Button>
        {hasHistory && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onNewChat}
          >
            <PenSquare className="h-3.5 w-3.5" />
            New Chat
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <AiVoiceStatusBar
            voiceState={voice.voiceState}
            isHandsFree={voiceMode === 'hands-free'}
            autoPlay={autoPlay}
            onToggleHandsFree={voice.toggleHandsFree}
            onToggleAutoPlay={() => setAutoPlay(!autoPlay)}
            isSTTSupported={voice.isSTTSupported}
            isTTSSupported={voice.isTTSSupported}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/dashboard')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {showThread ? (
          <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
            <AiChatThread
              runs={threadRuns}
              latestRunId={latestRun?._id}
              isLoading={isLoadingThread && !pendingInput && !threadRuns.length}
              pendingInput={pendingInput}
              onConfirm={confirm}
              isConfirming={isConfirming}
              onRetry={handleRetry}
              copyProps={copyProps}
              ttsProps={ttsProps}
            />
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-[calc(100vh-8rem)]">
            <AiChatWelcome onSuggestionClick={dispatch} />
          </div>
        )}
      </div>

      <AiChatInput
        onSubmit={dispatch}
        isDispatching={isDispatching}
        recorder={recorder}
        voiceSession={voiceSession}
        onVoiceStart={handleVoiceStart}
        voiceState={voice.voiceState}
        transcript={voice.transcript}
        onStartListening={voice.startListening}
        onStopListening={voice.stopListening}
        isSTTSupported={voice.isSTTSupported}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/ai/components/chat/ai-chat-main.jsx
git commit -m "feat(ai): wire interaction layer into AiChatMain (copy, voice, retry)"
```

---

### Task 21: ai-panel-result — Copy response button

**Files:**
- Modify: `client/src/modules/ai/components/panel/ai-panel-result.jsx`

- [ ] **Step 1: Add copy button to the result view**

Add import and copy prop at top:

```jsx
import { Copy, Check } from 'lucide-react';
import { useMessageCopy } from '../../hooks/use-message-copy';
```

Inside `AiPanelResult`, add the copy hook and button:

```jsx
export function AiPanelResult({ agentRun, onStartOver }) {
  const status  = agentRun?.status ?? AGENT_STATUSES.FAILED;
  const summary = buildResultSummary(agentRun);
  const error   = agentRun?.error?.message;
  const { copy, copyState } = useMessageCopy();

  const copyContent = agentRun?.output?.message
    ?? (agentRun?.output ? JSON.stringify(agentRun.output, null, 2) : null);

  return (
    <div className="flex flex-col items-center gap-4 px-2 py-6 text-center">
      <ResultIcon status={status} />

      {status === AGENT_STATUSES.COMPLETED && (
        <>
          <p className="font-semibold text-green-600 dark:text-green-400">Done</p>
          {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
          {copyContent && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => copy(copyContent, 'markdown', 'panel-result')}
            >
              {copyState.copied && copyState.messageId === 'panel-result'
                ? <><Check className="h-3.5 w-3.5 text-green-500" /> Copied!</>
                : <><Copy className="h-3.5 w-3.5" /> Copy response</>}
            </Button>
          )}
        </>
      )}

      {status === AGENT_STATUSES.FAILED && (
        <>
          <p className="font-semibold text-destructive">Something went wrong</p>
          {error && <p className="text-xs text-muted-foreground max-w-60">{error}</p>}
        </>
      )}

      {status === AGENT_STATUSES.CANCELLED && (
        <p className="text-sm text-muted-foreground">Action cancelled</p>
      )}

      <Button variant="outline" size="sm" onClick={onStartOver} className="mt-2">
        Start over
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/ai/components/panel/ai-panel-result.jsx
git commit -m "feat(ai): add Copy response button to panel result view"
```

---

### Task 22: use-ai-chat — pass correlationId on retry dispatch

**Files:**
- Modify: `client/src/modules/ai/hooks/use-ai-chat.js`

- [ ] **Step 1: Update `dispatch` to accept optional correlationId**

Replace lines 108–116 (the `dispatch` callback):

```js
const dispatch = useCallback(
  (input, correlationId) => {
    const trimmed = input?.trim();
    if (!trimmed || trimmed.length < 3) return;
    setPendingInput(trimmed);
    dispatchMutation.mutate({ input: trimmed, threadId: currentThreadId, correlationId });
  },
  [dispatchMutation, currentThreadId]
);
```

- [ ] **Step 2: Update `dispatchMutation` mutationFn to pass correlationId**

Replace line 47 (`mutationFn: ({ input, threadId }) => ...`):

```js
mutationFn: ({ input, threadId, correlationId }) =>
  aiAgentService.dispatch(input, threadId, correlationId),
```

- [ ] **Step 3: Commit**

```bash
git add client/src/modules/ai/hooks/use-ai-chat.js
git commit -m "feat(ai): thread correlationId through dispatch for retry support"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Transient-only retry (classifier) | Task 1 |
| Exponential backoff 1s→2s→4s | Task 7 |
| Auto-retry per run (FAILED status effect) | Task 18 |
| Retry countdown UI | Task 12 |
| Retry exhausted state | Task 7 + 12 |
| correlationId idempotency (client) | Task 16 + 22 |
| correlationId idempotency (server) | Task 4 + 5 |
| AGENT_TIMEOUT error code | Task 6 |
| Copy markdown format | Task 2 + 11 |
| Copy plain text format | Task 2 + 11 |
| Right-click context menu | Task 11 |
| 2s copy feedback | Task 8 |
| Copy on panel result | Task 21 |
| STT SpeechRecognition | Task 9 |
| Silence detection (1.5s) | Task 9 |
| Low confidence warning | Task 9 + 14 |
| Exit commands (stop/cancel/nevermind) | Task 9 |
| TTS SpeechSynthesis | Task 9 |
| Sentence chunking | Task 3 |
| TTS play/pause/stop per message | Task 11 + 13 |
| Auto-play toggle | Task 13 + 15 + 20 |
| Hands-free mode | Task 9 + 10 + 13 + 20 |
| Hands-free loop (TTS end → STT start) | Task 9 |
| Live transcript preview in input | Task 14 + 19 |
| Voice status bar in header | Task 13 + 20 |
| STT not supported: hide button | Task 19 |
| TTS not supported: hide controls | Task 11 |
| voiceMode + autoPlay in store | Task 15 |

All spec requirements covered.
