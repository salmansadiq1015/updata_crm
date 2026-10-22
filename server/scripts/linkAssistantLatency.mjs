#!/usr/bin/env node
/**
 * Real-model latency for the SMS link assistant: time to the first streamed token
 * of the reply-phrasing model with the production prompt shape, plus cost per turn.
 *
 * This calls the OpenAI API with the server's OPENAI_API_KEY and costs money
 * (≈ $0.0001–0.0002 per turn with gpt-4o-mini), so it only runs with --confirm.
 *
 *   node scripts/linkAssistantLatency.mjs --confirm [--runs 20] [--model gpt-4o-mini]
 */
import 'dotenv/config';
import { performance } from 'node:perf_hooks';

import { createOpenAiClient, isAiConfigured } from '../src/shared/ai/llmFactory.js';
import { buildComposerMessages, costOf, streamCompletion } from '../src/modules/linkAssistant/engine/composer.js';
import { modelSettings } from '../src/modules/linkAssistant/engine/modelSettings.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

if (!args.includes('--confirm')) {
  console.error('This makes paid OpenAI requests. Re-run with --confirm.');
  process.exit(2);
}
if (!isAiConfigured()) {
  console.error('OPENAI_API_KEY is not configured.');
  process.exit(2);
}

const runs = Number(flag('runs', 20));
const settings = modelSettings();
const model = flag('model', settings.model);
const client = await createOpenAiClient();
const scenarios = [
  { language: 'en', customerText: 'yes I am interested', plan: { kind: 'ask', answered: { fieldKey: 'interest' }, question: { text: 'What is your average monthly electricity bill in rupees?' } } },
  { language: 'roman_ur', customerText: 'ji haan bilkul', plan: { kind: 'ask', answered: { fieldKey: 'interest' }, question: { text: 'What is your average monthly electricity bill in rupees?' } } },
  { language: 'ur', customerText: 'آپ کے پاس میرا نمبر کیسے آیا؟', plan: { kind: 'question', question: { text: 'What kind of roof do you have?' } } },
];

const firstToken = [];
let cost = 0;
for (let i = 0; i < runs; i += 1) {
  const s = scenarios[i % scenarios.length];
  const messages = buildComposerMessages({
    persona: 'Ayesha', company: 'Sunrise Solar', tone: 'warm', language: s.language,
    objective: 'Offer a free solar survey', faq: [{ question: 'Why do you have my number?', answer: 'You filled in our quote form.' }],
    plan: s.plan, customerText: s.customerText,
  });
  const t0 = performance.now();
  let first = null;
  const { usage } = await streamCompletion({
    client, model, messages, maxTokens: 220, onToken: () => { if (first === null) first = performance.now() - t0; },
  });
  firstToken.push(first ?? performance.now() - t0);
  cost += costOf(usage, settings.prices);
}
const pct = (p) => [...firstToken].sort((a, b) => a - b)[Math.min(firstToken.length - 1, Math.floor((p / 100) * firstToken.length))];
console.log(JSON.stringify({
  model, runs,
  firstTokenMs: { p50: Math.round(pct(50)), p95: Math.round(pct(95)) },
  targetsMs: { p50: 800, p95: 1500 },
  costUsd: { total: Number(cost.toFixed(5)), perTurn: Number((cost / runs).toFixed(6)) },
}, null, 2));
