import CallRecord from '../callRecord.model.js';
import livekit from './livekitSip.provider.js';
import { dispatchAccepted, dispatchRejected } from './providerResult.js';

const PROVIDER = 'paired_phone';

/**
 * Outbound calls through the owner's own phone (ESP32 Bluetooth hands-free gateway).
 *
 * The CRM cannot dial the phone itself: it dispatches the voice agent into the call's LiveKit
 * room and queues the call for the gateway, which claims it, dials with the phone's SIM and joins
 * the room as `sip-<callId>` (so the agent worker treats it like a SIP leg, unchanged).
 *
 * Nothing here can have dialed yet, so every failure is a definite rejection (never ambiguous):
 * an unclaimed queued call is cancelled by the claim/reconcile path with the attempt refunded.
 */
export class PairedPhoneProvider {
  constructor(livekitProvider = livekit) {
    this.providerName = PROVIDER;
    this.livekit = livekitProvider;
  }

  eligibleFor() {
    return false; // never a fallback target
  }

  async health() {
    return { provider: PROVIDER, configured: Boolean(this.livekit.livekitReady), livekitReady: Boolean(this.livekit.livekitReady), reason: this.livekit.livekitReady ? null : 'livekit_not_configured' };
  }

  async createOutboundCall({ roomName, internalCallId, metadata = {}, callRecordId, pairedDeviceId }) {
    if (!pairedDeviceId || !callRecordId) {
      return dispatchRejected(PROVIDER, { message: 'Campaign has no paired device', code: 'NO_DEVICE', permanent: true });
    }
    // The agent must be in the room before the lead can answer.
    const dispatch = await this.livekit.dispatchAgent({ roomName, metadata: { ...metadata, internalCallId, transport: PROVIDER } });
    if (dispatch.outcome !== 'accepted') {
      this.livekit.endCall?.({ roomName }).catch?.(() => {});
      return dispatchRejected(PROVIDER, {
        message: `Voice agent could not be dispatched: ${dispatch.errorMessage || dispatch.outcome}. The phone was not dialed.`,
        // Not ambiguous for the phone (nothing was dialed), whatever LiveKit's answer was.
        code: dispatch.outcome === 'ambiguous' ? 'AGENT_DISPATCH_UNCONFIRMED' : (dispatch.errorCode || 'AGENT_DISPATCH_FAILED'),
        permanent: dispatch.outcome === 'rejected' && dispatch.safeToRetry === false,
      });
    }
    if (this.livekit.waitForAgentWorker) {
      const worker = await this.livekit.waitForAgentWorker({ roomName });
      if (worker !== 'running') {
        await this.livekit.endCall({ roomName }).catch(() => {});
        return dispatchRejected(PROVIDER, { message: 'The voice agent is not ready. Start the configured agent worker before testing. The phone was not dialed.', code: 'AGENT_NOT_READY', permanent: false });
      }
    }
    await CallRecord.updateOne({ _id: callRecordId }, { $set: {
      pairedDeviceId,
      gateway: { state: 'queued', queuedAt: new Date() },
    } });
    return dispatchAccepted(PROVIDER, `pp_${internalCallId}`, { roomName, agentDispatched: true });
  }

  endCall(args) {
    return this.livekit.endCall(args);
  }
}

export default new PairedPhoneProvider();
