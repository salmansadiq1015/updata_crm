/** Opt-in provider benchmark; no CRM writes or phone calls. Uses exact production
 * schemas and prompts extracted from the selected Git baseline/current worker.
 * Synthetic local speech, manual audio commits, no ASR/LiveKit/SIM: results prove
 * provider usage for this harness, not end-to-end production calling quality. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { actionToInstruction, answerResultInstruction, withCurrentStep } from '../src/toolApi.js';
import * as engine from '../../src/modules/aiCalling/engine/questionEngine.js';
import { validateAnswer } from '../../src/modules/aiCalling/engine/answerValidation.js';
import { computeCallCost } from '../../src/modules/aiCalling/engine/callCost.js';
import * as currentPrompt from '../../src/modules/aiCalling/engine/leadContext.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to authorize provider usage; optional --models=gpt-realtime,gpt-realtime-mini and --questions=2 or 8.');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const env = { ...dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url))), ...process.env };
const output = path.resolve(process.argv.find(x => x.startsWith('--output='))?.slice(9) || path.join(root, 'AI_CALLING_BENCHMARK_RESULTS.json'));
const models = (process.argv.find(x => x.startsWith('--models='))?.slice(9) || 'gpt-realtime').split(',');
const count = Number(process.argv.find(x => x.startsWith('--questions='))?.slice(12) || 8);
if (![2, 8].includes(count)) throw new Error('questions must be 2 or 8');
const baselineRef = process.argv.find(x => x.startsWith('--baseline='))?.slice(11) || 'HEAD';
const baselineCommit = execFileSync('git', ['rev-parse', baselineRef], { cwd: root, encoding: 'utf8' }).trim();
const git = file => execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root, encoding: 'utf8' });
const oldModule = git('server/src/modules/aiCalling/engine/leadContext.js').replace("'../aiCalling.languages.js'", JSON.stringify(pathToFileURL(path.join(root, 'server/src/modules/aiCalling/aiCalling.languages.js')).href));
const oldPrompt = await import(`data:text/javascript;base64,${Buffer.from(oldModule).toString('base64')}`);
const workerSources = { baseline: git('server/agent-worker/src/agent.js'), optimized: fs.readFileSync(new URL('../src/agent.js', import.meta.url), 'utf8') };
const fields = [
  ['name', 'Full name', 'What is your full name?', 'short_text', 'Morgan Reed', 'My full name is Morgan Reed.'],
  ['email', 'Email', 'What is your email address?', 'email', 'morgan@example.com', 'My email address is morgan at example dot com.'],
  ['phone', 'Phone', 'What is your phone number?', 'phone', '+14155550101', 'My phone number is plus one, four one five, five five five, zero one zero one.'],
  ['city', 'City', 'What city do you live in?', 'short_text', 'Boston', 'I live in Boston.'],
  ['education', 'Education', 'What is your highest completed education level?', 'short_text', 'bachelor', 'My highest completed education is a bachelor degree.'],
  ['birth', 'Date of birth', 'What is your complete date of birth?', 'date', '2001-01-10', 'My date of birth is January tenth, two thousand and one.'],
  ['family', 'Family size', 'How many people are in your family?', 'number', 4, 'There are four people in my family.'],
  ['occupation', 'Occupation', 'What is your occupation?', 'short_text', 'software engineer', 'I work as a software engineer.'],
].slice(0, count);
const questionnaire = { questions: fields.map(([fieldKey, label, text, type], order) => ({ fieldKey, label, text, type, required: true, order })) };
const agentConfig = { language: 'en', organizationName: 'Updata QA', agentName: 'QA assistant', objective: 'Collect the configured contact details.', recordCall: false };
const temp = fs.mkdtempSync('/tmp/updata-voice-benchmark-');
const speech = text => {
  const key = createHash('sha256').update(text).digest('hex'); const pcm = path.join(temp, `${key}.pcm`);
  if (!fs.existsSync(pcm)) {
    execFileSync('/usr/bin/say', ['-o', path.join(temp, `${key}.aiff`), text]);
    execFileSync('/usr/local/bin/ffmpeg', ['-v', 'error', '-y', '-i', path.join(temp, `${key}.aiff`), '-ar', '24000', '-ac', '1', '-f', 's16le', pcm]);
  }
  return fs.readFileSync(pcm);
};
const corpus = new Map(['Yes, I agree to continue.', ...fields.map(f => f[5])].map(text => [text, speech(text)]));
const runs = []; let totalEstimate = 0;
const save = () => fs.writeFileSync(output, JSON.stringify({ version: 1, date: new Date().toISOString(), baselineRef, baselineCommit, scenario: `${count}-question qualification`,
  limitations: ['Synthetic local English speech; manual commits; no ASR, VAD, LiveKit transport, SIM leg or carrier charges.', 'Costs are provider-reported tokens at configured rates, not reconciled invoices.', 'Same 1024 output cap for both variants; no production model/configuration changes.', 'Model accuracy and latency are observations of this small fixture only.'], runs }, null, 2));
for (const model of models) for (const variant of ['baseline', 'optimized']) {
  let socket; const started = Date.now();
  const result = { model, variant, responses: [], transcripts: [], errors: [], completed: false };
  runs.push(result);
  try {
    const promptModule = variant === 'baseline' ? oldPrompt : currentPrompt;
    const context = { agentConfig, systemPrompt: promptModule.buildSystemPrompt({ agentConfig, questions: questionnaire.questions, lead: { name: 'QA business', address: { city: 'Boston' } } }),
      disclosure: promptModule.disclosureText(agentConfig), transfer: { enabled: false }, dynamicLeadInstruction: currentPrompt.dynamicLeadInstruction({ name: 'QA business', address: { city: 'Boston' } }) };
    const source = workerSources[variant];
    const expression = source.match(/const baseInstructions = ([\s\S]*?);\n/)[1];
    const base = new Function('context', `return ${expression}`)(context);
    const toolsStart = source.indexOf('const tools = {');
    const toolsBlock = source.slice(toolsStart, source.indexOf('\n    };', toolsStart) + 7);
    // Only construct trusted local schema definitions. Tool execute closures are
    // not called; the same deterministic engine below acts as the isolated API.
    const definitions = new Function('llm', 'z', 'context', 'gated', 'guarded', `${toolsBlock}\nreturn tools;`)(llm, z, context, f => f, f => f);
    const tools = Object.entries(definitions).map(([name, t]) => ({ type: 'function', name, description: t.description, parameters: llm.toJsonSchema(t.parameters) }));
    let state = engine.initConversationState(); let inputStarted = 0; let firstAudio = null;
    const queue = []; const waiters = [];
    const next = () => new Promise((resolve, reject) => {
      if (queue.length) return resolve(queue.shift());
      const timer = setTimeout(() => reject(new Error('provider_event_timeout')), 30000);
      waiters.push(e => { clearTimeout(timer); resolve(e); });
    });
    const send = event => socket.send(JSON.stringify(event));
    socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } });
    socket.on('message', data => {
      const e = JSON.parse(data);
      if (e.type === 'response.output_audio.delta' && firstAudio == null) firstAudio = Date.now();
      if (e.type === 'response.output_audio_transcript.done') result.transcripts.push(e.transcript);
      if (['session.created', 'session.updated', 'response.done', 'error'].includes(e.type)) { const waiter = waiters.shift(); if (waiter) waiter(e); else queue.push(e); }
    });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const until = async type => { for (;;) { const e = await next(); if (e.type === 'error') throw new Error(e.error?.code || 'provider_error'); if (e.type === type) return e; } };
    await until('session.created');
    let pending = actionToInstruction(engine.nextAction(questionnaire, state));
    send({ type: 'session.update', session: { type: 'realtime', instructions: variant === 'baseline' ? withCurrentStep(base, pending) : base, tools,
      output_modalities: ['audio'], max_output_tokens: 1024, audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: null }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'alloy' } } } });
    await until('session.updated');
    if (variant === 'optimized') send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: `Initial step (until first tool result): ${pending}` }] } });
    const spoken = new Map();
    for (let step = 0; step < 50; step++) {
      inputStarted = Date.now(); firstAudio = null;
      send({ type: 'response.create' });
      const event = await until('response.done'); const response = event.response;
      const u = response.usage; const i = u?.input_token_details || {}; const o = u?.output_token_details || {};
      if (u) {
        const row = { type: 'llm_usage', provider: 'api.openai.com', model, responseId: response.id, status: response.status,
          inputTokens: u.input_tokens, outputTokens: u.output_tokens, inputAudioTokens: i.audio_tokens, inputTextTokens: i.text_tokens,
          inputCachedTokens: i.cached_tokens, inputCachedAudioTokens: i.cached_tokens_details?.audio_tokens, inputCachedTextTokens: i.cached_tokens_details?.text_tokens,
          outputAudioTokens: o.audio_tokens, outputTextTokens: o.text_tokens, ttftMs: firstAudio ? firstAudio - inputStarted : null };
        result.responses.push(row); totalEstimate += computeCallCost({ usage: [row] }, env).amount;
        if (totalEstimate > 3) throw new Error('benchmark_budget_exceeded');
      }
      if (response.status !== 'completed') throw new Error(`response_${response.status}`);
      const calls = (response.output || []).filter(x => x.type === 'function_call');
      for (const call of calls) {
        const args = JSON.parse(call.arguments || '{}'); let reply = '';
        if (call.name === 'disclose') state = engine.markDisclosed(state);
        else if (['record_answer', 'record_answers'].includes(call.name)) {
          const answers = call.name === 'record_answers' ? args.answers : [{ fieldKey: args.fieldKey, rawAnswer: args.answer }];
          for (const answer of answers) {
            const q = questionnaire.questions.find(q => q.fieldKey === answer.fieldKey);
            if (!q || !state.disclosed) throw new Error('invalid_tool_answer');
            const validation = validateAnswer(q, answer.rawAnswer);
            state = engine.applyAnswer(state, answer.fieldKey, { ...validation, rawAnswer: answer.rawAnswer });
            reply = answerResultInstruction(validation, '');
          }
        } else if (call.name === 'no_response') state = engine.applyNoResponse(state, args.fieldKey, { requestId: call.call_id, reason: args.reason });
        else if (call.name === 'finish_call') { result.completed = engine.nextAction(questionnaire, state).type === 'finish'; break; }
        else throw new Error(`unexpected_tool_${call.name}`);
        pending = actionToInstruction(engine.nextAction(questionnaire, state));
        if (variant === 'baseline') { send({ type: 'session.update', session: { type: 'realtime', instructions: withCurrentStep(base, pending) } }); await until('session.updated'); }
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: call.call_id, output: `${reply} Next: ${pending}` } });
      }
      if (result.completed) break;
      if (calls.length) continue;
      const action = engine.nextAction(questionnaire, state);
      const key = action.type === 'disclose' ? 'disclose' : action.question?.fieldKey;
      if (!key) {
        // Let the model call finish after a spoken goodbye without fabricating a caller reply.
        send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: 'The goodbye has finished. Call finish_call now.' }] } }); continue;
      }
      spoken.set(key, (spoken.get(key) || 0) + 1);
      if (spoken.get(key) > 3) throw new Error(`question_stalled_${key}`);
      const utterance = key === 'disclose' ? 'Yes, I agree to continue.' : fields.find(f => f[0] === key)[5];
      const pcm = corpus.get(utterance);
      for (let at = 0; at < pcm.length; at += 24000) send({ type: 'input_audio_buffer.append', audio: pcm.subarray(at, at + 24000).toString('base64') });
      send({ type: 'input_audio_buffer.commit' });
    }
    result.answers = state.answers;
    result.validAnswers = fields.filter(f => state.answers[f[0]]?.validation === 'valid').length;
    result.expectedAnswers = Object.fromEntries(fields.map(f => [f[0], f[4]]));
    result.exactFieldMatches = fields.filter(f => String(state.answers[f[0]]?.normalizedValue).toLowerCase() === String(f[4]).toLowerCase()).length;
    result.requiredAnswers = fields.length;
    result.instructionCharacters = base.length; result.toolSchemaCharacters = JSON.stringify(tools).length;
    result.instructionFingerprint = createHash('sha256').update(base).digest('hex');
    result.toolSchemaFingerprint = createHash('sha256').update(JSON.stringify(tools)).digest('hex');
  } catch (error) { result.errors.push(error.message); }
  finally {
    if (socket) { socket.close(); socket.terminate(); }
    result.elapsedSeconds = (Date.now() - started) / 1000;
    const priced = computeCallCost({ usage: result.responses }, env);
    result.estimatedCost = priced.amount; result.tokens = priced.breakdown.tokens;
    result.costBreakdown = priced.breakdown;
    result.cacheHitPercent = result.tokens.input ? 100 * (result.tokens.inputCachedAudio + result.tokens.inputCachedText) / result.tokens.input : null;
    const times = result.responses.map(r => r.ttftMs).filter(x => x != null);
    result.averageTtftMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    result.estimatedCostPerHarnessMinute = result.elapsedSeconds ? result.estimatedCost * 60 / result.elapsedSeconds : null;
    save(); console.log(JSON.stringify({ model, variant, completed: result.completed, valid: result.validAnswers, estimate: result.estimatedCost, tokens: result.tokens.total, errors: result.errors }));
  }
}
fs.rmSync(temp, { recursive: true, force: true });
