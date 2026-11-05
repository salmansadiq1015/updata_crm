// Pure rules of the incoming-calls feature: AI status labels (exact wording), allowed controls,
// realtime protocol parsing and cache updates from socket events.
import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/queryKeys';
import { i18next } from '@/i18n';

import { applyInboundEvent } from '../hooks/useIncomingCalls';
import {
  aiStatusKey,
  appendTurn,
  availableControls,
  isAiConnected,
  simLabel,
} from '../domain/incomingCallDomain';
import { parsePacket, socketUrl } from '../realtime/inboundSocket';
import { liveInboundCallSchema, type LiveInboundCall, type TranscriptTurn } from '../types';

import { serverLive } from '../__fixtures__/serverPayloads';

const label = (aiStatus: string, speaker?: string | null) =>
  i18next.t(`incomingCalls.aiStatus.${aiStatusKey(aiStatus, speaker)}`);

describe('AI status labels', () => {
  it('maps every server AI status to the agreed wording', () => {
    expect(label('waiting')).toBe('Waiting for AI');
    expect(label('connecting')).toBe('Connecting audio');
    expect(label('connected')).toBe('AI connected · listening');
    expect(label('listening')).toBe('AI connected · listening');
    expect(label('speaking')).toBe('AI speaking');
    expect(label('listening', 'caller')).toBe('Caller speaking');
    expect(label('connected', 'caller')).toBe('Caller speaking');
    expect(label('handed_off')).toBe('Human handling');
    expect(label('unavailable')).toBe('AI unavailable');
    expect(label('ended')).toBe('Call completed');
  });

  it('never says "AI connected" unless the AI is connected, speaking or listening', () => {
    const others = [
      'not_applicable',
      'waiting',
      'connecting',
      'handed_off',
      'unavailable',
      'ended',
      'failed',
      'bogus',
    ];
    for (const status of others) {
      expect(isAiConnected(status)).toBe(false);
      expect(label(status)).not.toMatch(/AI connected/);
      // A stale "caller is speaking" never relabels a session that is not connected.
      expect(label(status, 'caller')).not.toBe('Caller speaking');
    }
    for (const status of ['connected', 'listening', 'speaking']) expect(isAiConnected(status)).toBe(true);
  });
});

describe('availableControls', () => {
  it('ringing: let the AI answer (unless it already is) and reject', () => {
    expect(availableControls({ status: 'RINGING', handling: null })).toEqual(['answer', 'reject']);
    expect(availableControls({ status: 'RINGING', handling: 'ai' })).toEqual(['reject']);
    expect(availableControls({ status: 'ANSWERING', handling: null })).toEqual(['reject']);
  });

  it('answered: take over (audio to the handset) and hang up', () => {
    expect(availableControls({ status: 'AI_ACTIVE', handling: 'ai' })).toEqual(['takeover', 'hangup']);
    expect(availableControls({ status: 'HUMAN_ACTIVE', handling: 'human' })).toEqual(['hangup']);
  });

  it('nothing once the line is down, and no repeat of a command the phone has not acked', () => {
    expect(availableControls({ status: 'WRAPPING_UP', handling: 'ai' })).toEqual([]);
    expect(availableControls({ status: 'COMPLETED', handling: 'ai' })).toEqual([]);
    expect(availableControls({ status: 'AI_ACTIVE', handling: 'ai', pendingCommand: 'takeover' })).toEqual([
      'hangup',
    ]);
  });
});

describe('helpers', () => {
  it('labels the SIM from the bridge', () => {
    expect(simLabel({ slot: 0, label: null })).toBe('SIM 1');
    expect(simLabel({ slot: 1, label: 'Work' })).toBe('Work');
    expect(simLabel({ slot: null, label: null })).toBeNull();
  });

  it('appends a transcript turn only once', () => {
    const turn: TranscriptTurn = { itemId: 'a', role: 'caller', text: 'hi', at: '1', interrupted: false };
    const once = appendTurn([], turn);
    expect(appendTurn(once, turn)).toBe(once);
    // A tail from GET /live has no itemId: match by role + text + time instead.
    expect(appendTurn([{ ...turn, itemId: null }], turn)).toHaveLength(1);
    expect(appendTurn(once, { ...turn, itemId: 'b', text: 'more' }, 1)).toEqual([
      { ...turn, itemId: 'b', text: 'more' },
    ]);
  });
});

describe('realtime protocol', () => {
  it('derives the socket URL from the API base URL', () => {
    expect(socketUrl('https://crm.example.com/api/v1')).toBe(
      'wss://crm.example.com/socket.io/?EIO=4&transport=websocket',
    );
    expect(socketUrl('http://10.0.2.2:5000/api/v1/')).toBe(
      'ws://10.0.2.2:5000/socket.io/?EIO=4&transport=websocket',
    );
  });

  it('parses Engine.IO / Socket.IO packets', () => {
    expect(parsePacket('0{"sid":"x","pingInterval":25000,"pingTimeout":20000}')).toEqual({
      type: 'open',
      pingInterval: 25000,
      pingTimeout: 20000,
    });
    expect(parsePacket('2')).toEqual({ type: 'ping' });
    expect(parsePacket('40{"sid":"y"}')).toEqual({ type: 'connected' });
    expect(parsePacket('44{"message":"Authentication failed"}')).toEqual({
      type: 'connectError',
      message: 'Authentication failed',
    });
    expect(parsePacket('42["inbound-call:update",{"id":"c1"}]')).toEqual({
      type: 'event',
      name: 'inbound-call:update',
      payload: { id: 'c1' },
    });
    expect(parsePacket('42not json')).toEqual({ type: 'other' });
  });
});

describe('applyInboundEvent', () => {
  const setup = () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const live = liveInboundCallSchema.parse(serverLive());
    client.setQueryData<LiveInboundCall[]>(queryKeys.incomingCalls.live, [live]);
    return { client, live };
  };
  const liveRow = (client: QueryClient) =>
    client.getQueryData<LiveInboundCall[]>(queryKeys.incomingCalls.live)?.[0];

  it('activity: updates who is speaking without a refetch', () => {
    const { client, live } = setup();
    applyInboundEvent(client, {
      name: 'inbound-call:activity',
      payload: { callId: live.callId, agentState: 'listening', speaker: 'caller', aiStatus: 'listening' },
    });
    const row = liveRow(client)!;
    expect(aiStatusKey(row.aiStatus, row.agentActivity?.speaker)).toBe('callerSpeaking');
  });

  it('transcript: appends the turn to the live tail once', () => {
    const { client, live } = setup();
    const event = {
      name: 'inbound-call:transcript',
      payload: { callId: live.callId, turn: { itemId: 'item_9', role: 'caller', text: 'Thanks', at: 'now' } },
    };
    applyInboundEvent(client, event);
    applyInboundEvent(client, event);
    expect(liveRow(client)!.lastTurns.map((t) => t.text)).toEqual([
      'Hello, Updata reception. How can I help?',
      'How much does a website cost?',
      'Thanks',
    ]);
  });

  it('settings: applies a newer version pushed by the website', () => {
    const { client } = setup();
    client.setQueryData(queryKeys.incomingCalls.settings, {
      enabled: false,
      version: 3,
      defaultAgentId: null,
    });
    applyInboundEvent(client, { name: 'inbound-call:settings', payload: { version: 4, enabled: true } });
    expect(client.getQueryData(queryKeys.incomingCalls.settings)).toMatchObject({
      enabled: true,
      version: 4,
    });
  });
});
