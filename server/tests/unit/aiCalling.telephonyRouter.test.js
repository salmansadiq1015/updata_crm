import { describe, expect, it, jest } from '@jest/globals';
import { routeOutboundCall } from '../../src/modules/aiCalling/providers/telephonyRouter.js';

const input = { to: '+41790000000', country: 'CH', roomName: 'r', internalCallId: 'c', metadata: {} };

describe('AI calling telephony routing', () => {
  it('uses the primary and never invokes fallback after acceptance', async () => {
    const primary = { createOutboundCall: jest.fn(async () => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: 'p1' })) };
    const fallback = { eligibleFor: () => true, createOutboundCall: jest.fn() };
    const routed = await routeOutboundCall(input, { primaryProvider: primary, fallbackProvider: fallback });
    expect(routed.result.provider).toBe('livekit_sip');
    expect(fallback.createOutboundCall).not.toHaveBeenCalled();
  });

  it('never falls back after an ambiguous primary result', async () => {
    const primary = { createOutboundCall: jest.fn(async () => ({ provider: 'livekit_sip', outcome: 'ambiguous', safeToFallback: false })) };
    const fallback = { eligibleFor: () => true, createOutboundCall: jest.fn() };
    const routed = await routeOutboundCall(input, { primaryProvider: primary, fallbackProvider: fallback });
    expect(routed.attempts).toHaveLength(1);
    expect(fallback.createOutboundCall).not.toHaveBeenCalled();
  });

  it('uses the optional Twilio carrier only after definite rejection and skips duplicate agent dispatch', async () => {
    const primary = { createOutboundCall: jest.fn(async () => ({ provider: 'livekit_sip', outcome: 'rejected', safeToFallback: true, errorCode: 'HTTP_503', agentDispatched: true })) };
    const fallback = { eligibleFor: () => true, createOutboundCall: jest.fn(async () => ({ provider: 'twilio_voice', outcome: 'accepted', providerCallId: 't1' })) };
    const routed = await routeOutboundCall(input, { primaryProvider: primary, fallbackProvider: fallback });
    expect(routed.result).toMatchObject({ provider: 'twilio_voice', fallbackFrom: 'livekit_sip', fallbackReason: 'HTTP_503' });
    expect(fallback.createOutboundCall).toHaveBeenCalledWith(expect.objectContaining({ skipAgentDispatch: true }));
  });

  it('creates an agent dispatch on fallback when the primary failed before dispatch', async () => {
    const primary = { createOutboundCall: jest.fn(async () => ({ provider: 'livekit_sip', outcome: 'rejected', safeToFallback: true, errorCode: 'NOT_CONFIGURED', agentDispatched: false })) };
    const fallback = { eligibleFor: () => true, createOutboundCall: jest.fn(async () => ({ provider: 'twilio_voice', outcome: 'accepted', providerCallId: 't2' })) };
    await routeOutboundCall(input, { primaryProvider: primary, fallbackProvider: fallback });
    expect(fallback.createOutboundCall).toHaveBeenCalledWith(expect.objectContaining({ skipAgentDispatch: false }));
  });
});
