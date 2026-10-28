import { describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { LiveKitSipProvider } from '../../src/modules/aiCalling/providers/livekitSip.provider.js';
import { TwilioVoiceFallbackProvider } from '../../src/modules/aiCalling/providers/twilioVoiceFallback.provider.js';

const LK = { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret-at-least-16' };

/** A fetch mock that routes by Twirp method name in the URL. */
function mockFetch(routes) {
  return jest.fn(async (url) => {
    const method = String(url).split('/').pop();
    const handler = routes[method] || (() => ({ ok: true, status: 200, body: {} }));
    const { ok = true, status = 200, body = {} } = handler();
    return { ok, status, json: async () => body };
  });
}

describe('LiveKitSipProvider — carrier-agnostic (no Twilio)', () => {
  it('issues listeners a short-lived room token that cannot publish microphone or data', () => {
    const p = new LiveKitSipProvider(LK, mockFetch({}));
    const claims = jwt.verify(p.issueJoinToken({ roomName: 'call-room', identity: 'monitor-owner', canPublish: false, ttlSeconds: 120 }), LK.LIVEKIT_API_SECRET);
    expect(claims.video).toEqual({ room: 'call-room', roomJoin: true, canPublish: false, canPublishData: false, canSubscribe: true });
    expect(claims.exp - claims.nbf).toBe(120);
  });

  it('mints a LiveKit service token without a participant subject', () => {
    const p = new LiveKitSipProvider({ ...LK }, mockFetch({}));
    const claims = jwt.verify(p._token('crm-call-token-test'), LK.LIVEKIT_API_SECRET, { algorithms: ['HS256'] });
    expect(claims).toMatchObject({
      iss: LK.LIVEKIT_API_KEY,
      video: { roomAdmin: true, roomCreate: true, room: 'crm-call-token-test' },
      sip: { admin: true, call: true },
    });
    expect(claims.sub).toBeUndefined();
  });

  it('is honest about an unconfigured provider (never fakes a call)', async () => {
    const p = new LiveKitSipProvider({}, mockFetch({}));
    expect(p.livekitReady).toBe(false);
    expect(p.configured).toBe(false);
    expect(await p.ensureOutboundTrunk()).toBeNull();
    const res = await p.createOutboundCall({ to: '+41790000000', roomName: 'r', internalCallId: 'c' });
    expect(res.outcome).toBe('rejected');
    expect(res.errorCode).toBe('NOT_CONFIGURED');
  });

  it('LiveKit ready but no trunk/carrier → browser test only, PSTN not configured', async () => {
    const p = new LiveKitSipProvider({ ...LK }, mockFetch({}));
    expect(p.livekitReady).toBe(true);
    expect(p.configured).toBe(false);
    const health = await p.health();
    expect(health).toMatchObject({ livekitReady: true, configured: false, reason: 'no_sip_trunk', trunkSource: null });
  });

  it('verifies a preset primary trunk belongs to a non-Twilio carrier', async () => {
    const fetch = mockFetch({
      GetSIPOutboundTrunk: () => ({ ok: true, body: { trunk: { sip_trunk_id: 'ST_preset', address: 'sip.telnyx.com' } } }),
    });
    const p = new LiveKitSipProvider({ ...LK, LIVEKIT_SIP_OUTBOUND_TRUNK_ID: 'ST_preset' }, fetch);
    expect(p.configured).toBe(true);
    expect(await p.ensureOutboundTrunk()).toBe('ST_preset');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await p.health()).trunkSource).toBe('preset_trunk_id');
  });

  it('refuses a preset Twilio trunk as the primary and requires it for the Twilio fallback', async () => {
    const fetch = mockFetch({
      GetSIPOutboundTrunk: () => ({ ok: true, body: { trunk: { sip_trunk_id: 'ST_twilio', address: 'acme.pstn.twilio.com' } } }),
    });
    const primary = new LiveKitSipProvider({ ...LK, LIVEKIT_SIP_OUTBOUND_TRUNK_ID: 'ST_twilio' }, fetch);
    expect(await primary.ensureOutboundTrunk()).toBeNull();

    const fallback = new TwilioVoiceFallbackProvider({
      ...LK,
      LIVEKIT_TWILIO_SIP_OUTBOUND_TRUNK_ID: 'ST_twilio',
      TWILIO_VOICE_FROM_NUMBER: '+41445001234',
      AI_CALLING_TWILIO_FALLBACK_ENABLED: 'true',
      AI_CALLING_TWILIO_FALLBACK_COUNTRIES: 'CH',
    }, fetch);
    expect(await fallback.ensureOutboundTrunk()).toBe('ST_twilio');
    expect(fallback.eligibleFor('CH')).toBe(true);
  });

  it('auto-provisions a LiveKit trunk from a non-Twilio SIP carrier (create path)', async () => {
    const fetch = mockFetch({
      ListSIPOutboundTrunk: () => ({ ok: true, body: { items: [] } }),
      CreateSIPOutboundTrunk: () => ({ ok: true, body: { sip_trunk_id: 'ST_created' } }),
    });
    const p = new LiveKitSipProvider({
      ...LK, SIP_OUTBOUND_ADDRESS: 'sip.telnyx.com', SIP_OUTBOUND_NUMBER: '+41445001234',
      SIP_OUTBOUND_USERNAME: 'u', SIP_OUTBOUND_PASSWORD: 'p', SIP_OUTBOUND_TRANSPORT: 'tls',
    }, fetch);
    expect(p.hasSipCarrier).toBe(true);
    expect(p.configured).toBe(true);
    expect(p.callerId).toBe('+41445001234'); // carrier DID becomes caller-id
    expect(await p.ensureOutboundTrunk()).toBe('ST_created');
    // Cached: a second call does not create again.
    const createCalls = fetch.mock.calls.filter((c) => String(c[0]).endsWith('CreateSIPOutboundTrunk'));
    expect(await p.ensureOutboundTrunk()).toBe('ST_created');
    expect(createCalls.length).toBe(1);
    // Transport enum mapped correctly in the create body.
    const body = JSON.parse(fetch.mock.calls.find((c) => String(c[0]).endsWith('CreateSIPOutboundTrunk'))[1].body);
    expect(body.trunk).toMatchObject({ address: 'sip.telnyx.com', numbers: ['+41445001234'], transport: 'SIP_TRANSPORT_TLS', auth_username: 'u' });
  });

  it('reuses an existing trunk with the same name instead of creating a duplicate', async () => {
    const fetch = mockFetch({
      ListSIPOutboundTrunk: () => ({ ok: true, body: { items: [{ name: 'crm-outbound', numbers: ['+41445001234'], sip_trunk_id: 'ST_existing' }] } }),
      CreateSIPOutboundTrunk: () => ({ ok: true, body: { sip_trunk_id: 'ST_should_not_be_used' } }),
    });
    const p = new LiveKitSipProvider({ ...LK, SIP_OUTBOUND_ADDRESS: 'sip.peoplefone.ch', SIP_OUTBOUND_NUMBER: '+41445001234' }, fetch);
    expect(await p.ensureOutboundTrunk()).toBe('ST_existing');
    expect(fetch.mock.calls.some((c) => String(c[0]).endsWith('CreateSIPOutboundTrunk'))).toBe(false);
  });

  it('places an outbound call end-to-end through the provisioned carrier trunk', async () => {
    const fetch = mockFetch({
      ListSIPOutboundTrunk: () => ({ ok: true, body: { items: [] } }),
      CreateSIPOutboundTrunk: () => ({ ok: true, body: { sip_trunk_id: 'ST_new' } }),
      CreateDispatch: () => ({ ok: true, body: { id: 'AD_1' } }),
      CreateSIPParticipant: () => ({ ok: true, body: { sip_call_id: 'SCL_1', participant_id: 'PA_1' } }),
    });
    const p = new LiveKitSipProvider({ ...LK, SIP_OUTBOUND_ADDRESS: 'sip.plivo.com', SIP_OUTBOUND_NUMBER: '+41445001234' }, fetch);
    const res = await p.createOutboundCall({ to: '+41790000000', roomName: 'crm-call-x', internalCallId: 'x' });
    expect(res.outcome).toBe('accepted');
    expect(res.providerCallId).toBe('SCL_1');
    // The SIP participant was dialed via the provisioned trunk id.
    const spBody = JSON.parse(fetch.mock.calls.find((c) => String(c[0]).endsWith('CreateSIPParticipant'))[1].body);
    expect(spBody).toMatchObject({ sip_trunk_id: 'ST_new', sip_call_to: '+41790000000', sip_number: '+41445001234' });
  });

  it('does not place a PSTN call when explicit agent dispatch is rejected', async () => {
    const fetch = mockFetch({
      GetSIPOutboundTrunk: () => ({ ok: true, body: { trunk: { sip_trunk_id: 'ST_preset', address: 'sip.telnyx.com' } } }),
      CreateDispatch: () => ({ ok: false, status: 401, body: { message: 'unauthorized' } }),
    });
    const p = new LiveKitSipProvider({ ...LK, LIVEKIT_SIP_OUTBOUND_TRUNK_ID: 'ST_preset' }, fetch);
    const res = await p.createOutboundCall({ to: '+41790000000', roomName: 'r', internalCallId: 'c' });
    expect(res).toMatchObject({ outcome: 'rejected', errorCode: 'HTTP_401' });
    expect(fetch.mock.calls.some((call) => String(call[0]).endsWith('CreateSIPParticipant'))).toBe(false);
  });

  it('refuses a Twilio hostname as the primary BYO carrier', async () => {
    const p = new LiveKitSipProvider({ ...LK, SIP_OUTBOUND_ADDRESS: 'example.pstn.twilio.com', SIP_OUTBOUND_NUMBER: '+41445001234' }, mockFetch({}));
    expect(p.configured).toBe(false);
    expect((await p.health()).reason).toBe('primary_carrier_must_not_be_twilio');
  });
});
