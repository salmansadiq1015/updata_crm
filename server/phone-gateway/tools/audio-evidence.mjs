#!/usr/bin/env node
/**
 * Audio evidence for the two-way call proof (OpenAI audio API; key from OPENAI_API_KEY or server/.env).
 *
 *   node tools/audio-evidence.mjs tts --text "…" --out prompt.wav [--voice alloy] [--model gpt-4o-mini-tts]
 *   node tools/audio-evidence.mjs transcribe remote.wav [--expect "the test phrase"] [--language en]
 *
 * `transcribe` writes <file>.transcript.json and, with --expect, reports how many of the expected
 * words were heard. It is evidence for a human reviewer, not an automatic gate.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.openai.com/v1';
const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[(i += 1)];
    else out._.push(argv[i]);
  }
  return out;
}

async function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const env = await readFile(join(here, '..', '..', '.env'), 'utf8').catch(() => '');
  const line = env.split('\n').find((l) => l.startsWith('OPENAI_API_KEY='));
  const key = line?.slice('OPENAI_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('OPENAI_API_KEY is not set (env or server/.env)');
  return key;
}

const words = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/** Share of expected words that appear in the transcript (order-free; tolerant of ASR noise). */
export function phraseMatch(expected, heard) {
  const want = words(expected);
  const got = new Set(words(heard));
  const found = want.filter((w) => got.has(w));
  return { expected: want.length, found: found.length, ratio: want.length ? found.length / want.length : 0 };
}

async function tts(args) {
  if (!args.text || !args.out) throw new Error('tts needs --text and --out');
  const res = await fetch(`${API}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model || 'gpt-4o-mini-tts',
      voice: args.voice || 'alloy',
      input: args.text,
      response_format: 'wav',
    }),
  });
  if (!res.ok) throw new Error(`speech ${res.status}: ${await res.text()}`);
  await writeFile(args.out, Buffer.from(await res.arrayBuffer()));
  console.log(JSON.stringify({ ok: true, out: args.out, text: args.text }));
}

async function transcribe(args) {
  const file = args._[1];
  if (!file) throw new Error('transcribe needs a WAV file');
  const form = new FormData();
  form.append('file', new Blob([await readFile(file)], { type: 'audio/wav' }), basename(file));
  form.append('model', args.model || 'gpt-4o-transcribe');
  if (args.language) form.append('language', args.language);
  const res = await fetch(`${API}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await apiKey()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`transcriptions ${res.status}: ${await res.text()}`);
  const { text } = await res.json();
  const result = { file: basename(file), model: args.model || 'gpt-4o-transcribe', text, at: new Date().toISOString() };
  if (args.expect) result.match = { phrase: args.expect, ...phraseMatch(args.expect, text) };
  await writeFile(`${file}.transcript.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

const args = parseArgs(process.argv.slice(2));
const commands = { tts, transcribe };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = commands[args._[0]];
  if (!run) {
    console.error('usage: audio-evidence.mjs tts|transcribe …  (see the header comment)');
    process.exit(2);
  }
  run(args).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
