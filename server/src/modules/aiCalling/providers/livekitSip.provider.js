import jwt from 'jsonwebtoken';
import { dispatchAccepted, dispatchRejected, dispatchAmbiguous } from './providerResult.js';

const PROVIDER = 'livekit_sip';

/**
 * LiveKit SIP outbound telephony provider.
 *
 * Places a real PSTN call by (1) dispatching the voice agent into a LiveKit room
 * and (2) creating a SIP participant on the configured outbound trunk that dials
 * the lead and joins that room. Audio then flows: PSTN ⇄ SIP ⇄ LiveKit ⇄ the
 * LiveKit Agents worker running the OpenAI Realtime session.
 *
 * It calls the LiveKit server Twirp HTTP API directly with a JWT signed by the
 * project API key/secret (no extra SDK dependency). When the project / trunk is
 * not configured it returns an honest `rejected` result — it NEVER fabricates a
 * successful PSTN call.
 *
 * Docs: https://docs.livekit.io/sip/  ·  https://docs.livekit.io/agents/
 */
export class LiveKitSipProvider {
  constructor(env = process.env, fetchImpl = globalThis.fetch, options = {}) {
    this.fetch = fetchImpl;
    this.url = (env.LIVEKIT_URL || '').trim();            // wss://xxx.livekit.cloud or https://…
    this.apiKey = env.LIVEKIT_API_KEY || '';
    this.apiSecret = env.LIVEKIT_API_SECRET || '';
    // A pre-made LiveKit outbound trunk id (created in the LiveKit dashboard/API).
    this.outboundTrunkId = env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID || '';
    this.agentName = env.LIVEKIT_AGENT_NAME || 'crm-voice-agent';
    this.timeoutMs = Number(env.LIVEKIT_TIMEOUT_MS || 15000);
    this.providerName = options.providerName || PROVIDER;
    this.allowTwilioCarrier = Boolean(options.allowTwilioCarrier);

    // --- Bring-your-own SIP carrier (carrier-AGNOSTIC — Telnyx, Plivo, Vonage,
    // Peoplefone, Sipcall, or any SIP trunk; explicitly NOT tied to Twilio). When
    // these are set and no trunk id is given, we create the LiveKit outbound trunk
    // from them automatically (idempotent by name). ---
    this.sip = {
      address: (env.SIP_OUTBOUND_ADDRESS || '').trim(),      // e.g. sip.telnyx.com / sip.peoplefone.ch
      number: (env.SIP_OUTBOUND_NUMBER || '').trim(),        // your DID / caller-ID in E.164
      username: env.SIP_OUTBOUND_USERNAME || '',
      password: env.SIP_OUTBOUND_PASSWORD || '',
      transport: (env.SIP_OUTBOUND_TRANSPORT || 'auto').toLowerCase(), // auto|udp|tcp|tls
      trunkName: env.SIP_OUTBOUND_TRUNK_NAME || 'crm-outbound',
    };
    // Caller-ID: explicit override, else the carrier DID.
    this.callerId = env.LIVEKIT_SIP_CALLER_ID || this.sip.number || '';
    this._ensuredTrunkId = null; // in-memory cache of a trunk we created/looked up
  }

  /** Enough to run the agent + a browser WebRTC voice test (no phone needed). */
  get livekitReady() {
    return Boolean(this.url && this.apiKey && this.apiSecret);
  }

  /** Carrier credentials supplied → we can auto-provision a LiveKit outbound trunk. */
  get hasSipCarrier() {
    return Boolean(this.sip.address && this.sip.number && (this.allowTwilioCarrier || !/twilio/i.test(this.sip.address)));
  }

  /**
   * PSTN-capable: LiveKit is ready AND we can resolve an outbound trunk — either a
   * pre-made trunk id or a bring-your-own SIP carrier we can provision one from.
   */
  get configured() {
    return Boolean(this.livekitReady && (this.outboundTrunkId || this.hasSipCarrier));
  }

  _transportEnum() {
    return ({
      auto: 'SIP_TRANSPORT_AUTO', udp: 'SIP_TRANSPORT_UDP', tcp: 'SIP_TRANSPORT_TCP', tls: 'SIP_TRANSPORT_TLS',
    })[this.sip.transport] || 'SIP_TRANSPORT_AUTO';
  }

  /** https base for the Twirp API (LiveKit accepts https:// equivalent of the ws URL). */
  get httpBase() {
    return this.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
  }

  /** Short-lived server JWT with the room-admin + SIP grants the API requires. */
  _token(roomName) {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign({
      iss: this.apiKey,
      nbf: now,
      exp: now + 60,
      video: { roomAdmin: true, roomCreate: true, room: roomName },
      sip: { admin: true, call: true },
    }, this.apiSecret, { algorithm: 'HS256' });
  }

  async _twirp(service, method, body, roomName) {
    const response = await this.fetch(`${this.httpBase}/twirp/livekit.${service}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._token(roomName)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const json = await response.json().catch(() => ({}));
    return { response, json };
  }

  async health() {
    return {
      configured: this.configured,          // PSTN-capable (LiveKit + outbound trunk)
      livekitReady: this.livekitReady,       // browser voice test capable
      reachable: this.livekitReady,
      eligible: this.configured,
      // How an outbound trunk is sourced: a pre-made id, a BYO SIP carrier, or none.
      trunkSource: this.outboundTrunkId ? 'preset_trunk_id' : (this.hasSipCarrier ? 'sip_carrier' : null),
      sipCarrier: this.hasSipCarrier ? { address: this.sip.address, number: this.sip.number, transport: this.sip.transport } : null,
      reason: this.configured ? null : (this.livekitReady
        ? (/twilio/i.test(this.sip.address) ? 'primary_carrier_must_not_be_twilio' : 'no_sip_trunk')
        : 'not_configured'),
    };
  }

  /**
   * Resolve the LiveKit outbound trunk id to dial through, provisioning one from
   * the configured SIP carrier if needed. Idempotent: a preset id is returned as
   * is; otherwise we look up an existing trunk by name before creating a new one,
   * and cache the result for the process. Returns null when nothing is configured.
   */
  async ensureOutboundTrunk() {
    if (this._ensuredTrunkId) return this._ensuredTrunkId;
    if (this.outboundTrunkId) {
      // A trunk ID alone does not disclose which carrier backs it. Resolve the
      // immutable LiveKit trunk metadata before the first call so Twilio cannot
      // accidentally become the primary carrier, and the dedicated fallback
      // cannot silently point at a different carrier.
      try {
        const { response, json } = await this._twirp('SIP', 'GetSIPOutboundTrunk', {
          sip_trunk_id: this.outboundTrunkId,
        });
        const trunk = json.trunk || json;
        const id = trunk?.sip_trunk_id || trunk?.sipTrunkId;
        const address = String(trunk?.address || '');
        const isTwilio = /(^|\.)twilio\.com(?::\d+)?$/i.test(address)
          || /(^|\.)pstn\.twilio\.com(?::\d+)?$/i.test(address);
        const allowedCarrier = this.allowTwilioCarrier ? isTwilio : !isTwilio;
        if (response.ok && id === this.outboundTrunkId && address && allowedCarrier) {
          this._ensuredTrunkId = id;
          return id;
        }
      } catch { /* fail closed: an unverified preset trunk is never dialed */ }
      return null;
    }
    if (!this.livekitReady || !this.hasSipCarrier) return null;

    // 1) Reuse an existing trunk with our name (avoids duplicates across restarts).
    try {
      const { response, json } = await this._twirp('SIP', 'ListSIPOutboundTrunk', {});
      if (response.ok) {
        const items = json.items || json.trunks || [];
        const existing = items.find((t) => (t.name === this.sip.trunkName)
          && (t.numbers || []).includes(this.sip.number));
        const id = existing?.sip_trunk_id || existing?.sipTrunkId;
        if (id) { this._ensuredTrunkId = id; return id; }
      }
    } catch { /* list is best-effort; fall through to create */ }

    // 2) Create a new outbound trunk from the carrier credentials.
    try {
      const { response, json } = await this._twirp('SIP', 'CreateSIPOutboundTrunk', {
        trunk: {
          name: this.sip.trunkName,
          address: this.sip.address,
          numbers: [this.sip.number],
          transport: this._transportEnum(),
          ...(this.sip.username ? { auth_username: this.sip.username } : {}),
          ...(this.sip.password ? { auth_password: this.sip.password } : {}),
        },
      });
      const id = json.sip_trunk_id || json.sipTrunkId;
      if (response.ok && id) { this._ensuredTrunkId = id; return id; }
    } catch { /* surfaced as not_configured by the caller */ }
    return null;
  }

  /**
   * Dispatch the agent and start the outbound call.
   * @param {object} p
   * @param {string} p.to            E.164 number to dial
   * @param {string} p.roomName      unique LiveKit room for this call
   * @param {string} p.internalCallId
   * @param {object} p.metadata      passed to the agent (campaignId, callId, apiBase, token…)
   */
  async createOutboundCall({ to, roomName, internalCallId, metadata = {}, skipAgentDispatch = false }) {
    if (!this.configured) {
      return dispatchRejected(this.providerName, {
        message: 'LiveKit SIP is not configured. Provide either LIVEKIT_SIP_OUTBOUND_TRUNK_ID, or a SIP carrier (SIP_OUTBOUND_ADDRESS + SIP_OUTBOUND_NUMBER [+ username/password]). No PSTN call was placed.',
        code: 'NOT_CONFIGURED',
        permanent: true,
      });
    }

    // Resolve (and, for a BYO carrier, provision) the outbound trunk.
    const trunkId = await this.ensureOutboundTrunk();
    if (!trunkId) {
      return dispatchRejected(this.providerName, {
        message: 'Could not resolve or provision a LiveKit outbound SIP trunk from the configured carrier. Check SIP_OUTBOUND_* credentials.',
        code: 'TRUNK_UNAVAILABLE',
        permanent: false,
      });
    }

    const metadataStr = JSON.stringify({ ...metadata, internalCallId, roomName });

    // 1) Ask LiveKit to dispatch our agent worker into the room for this call.
    // Preserve this evidence so the router can decide whether a fallback trunk
    // must create its own dispatch. Skipping twice would dial a silent call;
    // dispatching twice would put duplicate agents in the same room.
    let agentDispatched = Boolean(skipAgentDispatch);
    if (!skipAgentDispatch) try {
      const dispatch = await this._twirp('AgentDispatchService', 'CreateDispatch', {
        agent_name: this.agentName,
        room: roomName,
        metadata: metadataStr,
      }, roomName);
      if (!dispatch.response.ok) {
        return { ...dispatchRejected(this.providerName, {
          message: dispatch.json.msg || dispatch.json.message || `LiveKit agent dispatch rejected (${dispatch.response.status})`,
          code: dispatch.json.code || `HTTP_${dispatch.response.status}`,
          status: dispatch.response.status,
          permanent: dispatch.response.status >= 400 && dispatch.response.status < 500 && dispatch.response.status !== 429,
        }), agentDispatched: false };
      }
      agentDispatched = true;
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        return dispatchAmbiguous(this.providerName, 'Agent dispatch timed out before the call was placed');
      }
      return dispatchAmbiguous(this.providerName, 'Agent dispatch connection failed before the call was placed');
    }

    // 2) Create the outbound SIP participant that actually dials the lead.
    let out;
    try {
      out = await this._twirp('SIP', 'CreateSIPParticipant', {
        sip_trunk_id: trunkId,
        sip_call_to: to,
        room_name: roomName,
        participant_identity: `sip-${internalCallId}`,
        participant_name: 'lead',
        participant_metadata: metadataStr,
        ...(this.callerId ? { sip_number: this.callerId } : {}),
        wait_until_answered: false,
      }, roomName);
    } catch (error) {
      return dispatchAmbiguous(
        this.providerName,
        error?.name === 'TimeoutError' ? 'SIP dispatch timed out' : 'SIP dispatch connection failed',
      );
    }

    const { response, json } = out;
    if (response.ok && (json.participant_id || json.sip_call_id || json.participantId)) {
      return dispatchAccepted(this.providerName, json.sip_call_id || json.participant_id || json.participantId, {
        roomName,
        responseStatus: response.status,
        agentDispatched,
      });
    }
    return { ...dispatchRejected(this.providerName, {
      message: json.msg || json.message || `LiveKit SIP rejected the request (${response.status})`,
      code: json.code || `HTTP_${response.status}`,
      status: response.status,
      permanent: response.status >= 400 && response.status < 500 && response.status !== 429,
    }), agentDispatched };
  }

  /**
   * Dispatch the agent into a room WITHOUT a SIP participant — used for the
   * browser WebRTC test, where an admin joins the room from their browser instead
   * of the lead answering a phone. Returns accepted/ambiguous/rejected.
   */
  async dispatchAgent({ roomName, metadata = {} }) {
    if (!this.livekitReady) {
      return dispatchRejected(this.providerName, {
        message: 'LiveKit is not configured (set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).',
        code: 'NOT_CONFIGURED',
        permanent: true,
      });
    }
    const metadataStr = JSON.stringify({ ...metadata, roomName });
    try {
      const { response, json } = await this._twirp('AgentDispatchService', 'CreateDispatch', {
        agent_name: this.agentName, room: roomName, metadata: metadataStr,
      }, roomName);
      if (response.ok) return dispatchAccepted(this.providerName, json.id || roomName, { roomName });
      return dispatchRejected(this.providerName, { message: json.msg || `dispatch failed (${response.status})`, code: `HTTP_${response.status}`, status: response.status });
    } catch (error) {
      return dispatchAmbiguous(this.providerName, error?.name === 'TimeoutError' ? 'Agent dispatch timed out' : 'Agent dispatch failed');
    }
  }

  /**
   * Mint a participant join token so a browser can connect to a room. Scoped to
   * one room with publish+subscribe; short-lived. Returns null when unconfigured.
   */
  issueJoinToken({ roomName, identity, name, ttlSeconds = 1800 }) {
    if (!this.livekitReady) return null;
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign({
      iss: this.apiKey,
      sub: identity,
      nbf: now,
      exp: now + ttlSeconds,
      name: name || identity,
      video: { room: roomName, roomJoin: true, canPublish: true, canSubscribe: true },
    }, this.apiSecret, { algorithm: 'HS256' });
  }

  /** Public URL a browser client connects to. */
  get wsUrl() { return this.url; }

  /** Force-terminate a room (used to hang up / cancel an in-flight call). */
  async endCall({ roomName }) {
    if (!this.configured || !roomName) return { ended: false };
    try {
      await this._twirp('RoomService', 'DeleteRoom', { room: roomName }, roomName);
      return { ended: true };
    } catch {
      return { ended: false };
    }
  }
}

export default new LiveKitSipProvider();
