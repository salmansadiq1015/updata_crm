import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { initializeLogger, llm } from '@livekit/agents';
import { AudioFrame, dispose } from '@livekit/rtc-node';
import { z } from 'zod';
import { LiveKitVoiceAdapter } from '../src/providers/livekitAdapters.js';
import { voiceProviderConfig } from '../../shared/voiceProviderConfig.js';
import { establishProvider } from '../src/providers/providerManager.js';

initializeLogger({ pretty: false, level: 'fatal' });
after(() => dispose());
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = fn(); if (value) return value; await sleep(10); }
  throw new Error('Timed out waiting for mock protocol event');
}
async function mockServer(t, respond) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const received = []; const connections = [];
  server.on('connection', socket => {
    connections.push(socket);
    socket.on('message', bytes => { const event = JSON.parse(bytes.toString()); received.push(event); respond?.(socket, event); });
  });
  t.after(async () => { for (const socket of connections) socket.terminate(); await new Promise(resolve => server.close(resolve)); });
  return { server, received, connections, url: `http://127.0.0.1:${server.address().port}` };
}
async function create(provider, url, tools = {}) {
  const adapter = new LiveKitVoiceAdapter({ provider, model: provider === 'gemini' ? 'gemini-3.8-live' : 'gpt-realtime-2.1-mini',
    config: voiceProviderConfig({}, {}), env: { GEMINI_API_KEY: 'mock-gemini-key', OPENAI_API_KEY: 'mock-openai-key' }, instructions: 'Ask one concise question. Save answers using tools.', tools, chatCtx: llm.ChatContext.empty() });
  await adapter.initializeSession();
  // The pinned plugins expose configuration; redirect only these tests to local mock APIs.
  if (provider === 'gemini') adapter.sdk._options.httpOptions = { baseUrl: url };
  else adapter.sdk._options.baseURL = `${url}/v1`;
  return adapter;
}

test('Gemini official SDK setup acknowledgement, tools, PCM resampling, audio output, transcription and usage', { timeout: 12000 }, async t => {
  const mock = await mockServer(t, (socket, event) => { if (event.setup) socket.send(JSON.stringify({ setupComplete: {} })); });
  const tools = { record_answer: llm.tool({ description: 'Save spoken answer', parameters: z.object({ fieldKey: z.string(), rawAnswer: z.string() }), execute: async args => args }) };
  const adapter = await create('gemini', mock.url, tools);
  t.after(() => adapter.terminateSession());
  await adapter.connect(3000);
  assert.equal(adapter.livekitModel.session(), adapter.raw, 'AgentSession reuses verified socket');
  const setup = mock.received.filter(e => e.setup).at(-1).setup;
  assert.equal(setup.model, 'models/gemini-3.8-live');
  assert.deepEqual(setup.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Puck');
  assert.ok(setup.tools[0].functionDeclarations.some(tool => tool.name === 'record_answer'));
  assert.equal(setup.tools[0].functionDeclarations[0].behavior, 'BLOCKING');
  assert.equal(setup.generationConfig.thinkingConfig, undefined);
  adapter.sendAudio(new AudioFrame(new Int16Array(2400).fill(400), 24000, 1, 2400));
  const input = await until(() => mock.received.find(e => e.realtimeInput?.audio));
  assert.ok(Buffer.from(input.realtimeInput.audio.data, 'base64').length > 0);
  const samples = new Int16Array(2400).fill(1000);
  const socket = mock.connections.at(-1);
  const transcribed = once(adapter, 'transcription'); const usage = once(adapter, 'usage');
  const output = new Promise(resolve => adapter.receiveAudio(async generation => {
    for await (const message of generation.messageStream) {
      void (async () => { for await (const _text of message.textStream) { /* drain */ } })();
      for await (const frame of message.audioStream) resolve(frame);
    }
  }));
  socket.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'جی ہاں، yes', finished: true }, modelTurn: { role: 'model', parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: Buffer.from(samples.buffer).toString('base64') } }] }, outputTranscription: { text: 'Thank you', finished: true } } }));
  socket.send(JSON.stringify({ serverContent: { turnComplete: true }, usageMetadata: { promptTokenCount: 100, responseTokenCount: 30, totalTokenCount: 130, promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 80 }, { modality: 'TEXT', tokenCount: 20 }], responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 30 }] } }));
  assert.equal((await output).sampleRate, 24000);
  assert.equal((await transcribed)[0].transcript, 'جی ہاں، yes');
  assert.equal((await usage)[0].inputTokenDetails.audioTokens, 80);
  const interrupted = once(adapter.raw, 'input_speech_started');
  socket.send(JSON.stringify({ serverContent: { interrupted: true } }));
  await interrupted;
  const toolGeneration = once(adapter, 'generation');
  socket.send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'save-1', name: 'record_answer', args: { fieldKey: 'interest', rawAnswer: 'yes' } }] } }));
  const [generation] = await toolGeneration;
  const { value: toolCall } = await generation.functionStream.getReader().read();
  assert.equal(toolCall.name, 'record_answer');
  const result = await adapter.executeTool(toolCall.name, JSON.parse(toolCall.args));
  assert.equal(result.rawAnswer, 'yes');
  const chat = adapter.raw.chatCtx;
  chat.items.push(toolCall, new llm.FunctionCallOutput({ callId: toolCall.callId, name: toolCall.name, output: JSON.stringify({ saved: true, next: 'Ask the next question' }), isError: false }));
  await adapter.raw.updateChatCtx(chat);
  const toolResponse = await until(() => mock.received.find(event => event.toolResponse));
  assert.equal(toolResponse.toolResponse.functionResponses[0].id, 'save-1');
  socket.send(JSON.stringify({ serverContent: { turnComplete: true } }));
  await adapter.terminateSession();
  await until(() => mock.connections.every(s => s.readyState === 3));
});

test('OpenAI requires session.updated acknowledgement and sends existing audio/VAD configuration', { timeout: 10000 }, async t => {
  const mock = await mockServer(t, (socket, event) => { if (event.type === 'session.update') socket.send(JSON.stringify({ type: 'session.updated', session: event.session })); });
  const adapter = await create('openai', mock.url);
  t.after(() => adapter.terminateSession());
  await adapter.connect(3000);
  const update = mock.received.find(e => e.type === 'session.update');
  assert.ok(update.session.audio?.input?.turn_detection || update.session.turn_detection);
  adapter.sendAudio(new AudioFrame(new Int16Array(2400).fill(300), 24000, 1, 2400));
  await until(() => mock.received.find(e => e.type === 'input_audio_buffer.append')).catch(error => { error.message += `; events: ${mock.received.map(e => e.type).join(',')}`; throw error; });
  await adapter.terminateSession();
  await until(() => mock.connections.every(s => s.readyState === 3));
});

test('Gemini setup rejection is an establishment error, never a successful connection', { timeout: 10000 }, async t => {
  const mock = await mockServer(t, (socket, event) => { if (event.setup) socket.close(1008, 'Model not found: mock-gemini-key'); });
  const adapter = await create('gemini', mock.url);
  t.after(() => adapter.terminateSession());
  await assert.rejects(adapter.connect(2000), error => error.code === 'MODEL_UNAVAILABLE');
  assert.ok(!JSON.stringify(adapter.fatalError).includes('mock-gemini-key'));
  await adapter.terminateSession();
  await until(() => mock.connections.every(s => s.readyState === 3));
});

test('Gemini pending setup timeout closes its real SDK socket before OpenAI fallback connects', { timeout: 10000 }, async t => {
  const gemini = await mockServer(t, () => {}); // WS opens, but setupComplete never arrives.
  let primaryClosedBeforeFallback = false;
  const openai = await mockServer(t, (socket, event) => {
    primaryClosedBeforeFallback = gemini.connections.every(s => s.readyState === 3);
    if (event.type === 'session.update') socket.send(JSON.stringify({ type: 'session.updated', session: event.session }));
  });
  const result = await establishProvider({ config: { ...voiceProviderConfig({}, {}), connectionTimeoutMs: 1500 },
    createAdapter: ({ provider }) => create(provider, provider === 'gemini' ? gemini.url : openai.url),
  }).catch(error => { error.message += JSON.stringify(error.attempts); throw error; });
  t.after(() => result.adapter.terminateSession());
  assert.equal(result.provider, 'openai');
  assert.equal(result.attempts[0].reason, 'CONNECTION_TIMEOUT');
  assert.equal(primaryClosedBeforeFallback, true);
  assert.equal(gemini.received.some(event => event.realtimeInput), false, 'Failed primary received no caller audio');
  await result.adapter.terminateSession();
  await until(() => openai.connections.every(s => s.readyState === 3));
});
