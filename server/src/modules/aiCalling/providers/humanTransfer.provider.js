import livekit from './livekitSip.provider.js';

/**
 * Human transfer behind the telephony provider abstraction. Fail-safe: every
 * method returns { ok:false, code, message } instead of throwing, so a provider
 * problem turns into the scripted fallback (callback offer), never a dropped call.
 *
 *   web   — the person joins the call's LiveKit room from the CRM (works for PSTN
 *           SIP calls and browser calls alike; needs only LiveKit).
 *   phone — LiveKit SIP REFER (TransferSIPParticipant) moves the PSTN caller to the
 *           person's phone. Needs a SIP trunk that permits transfers; unverified here.
 */
export function createHumanTransferProvider(provider = livekit) {
  return {
    capabilities(call, { phone = null, allowPhoneTransfer = true } = {}) {
      const live = Boolean(call?.roomName) && !call?.endedAt;
      // The paired-phone gateway only bridges the agent's audio; a third party in its room is unverified.
      const supportedTransport = call?.provider !== 'paired_phone';
      return {
        web: Boolean(live && supportedTransport && provider.livekitReady && typeof provider.issueJoinToken === 'function'),
        phone: Boolean(live && allowPhoneTransfer && phone && call?.provider === 'livekit_sip' && provider.configured && typeof provider._twirp === 'function'),
      };
    },

    joinToken({ roomName, userId, name }) {
      if (!provider.livekitReady || typeof provider.issueJoinToken !== 'function') return { ok: false, code: 'LIVEKIT_NOT_CONFIGURED', message: 'Live audio is not configured' };
      const token = provider.issueJoinToken({ roomName, identity: `human-${userId}`, name: name || 'Team member', ttlSeconds: 3600, canPublish: true });
      if (!token || !provider.wsUrl) return { ok: false, code: 'LIVEKIT_NOT_CONFIGURED', message: 'Live audio is not configured' };
      return { ok: true, url: provider.wsUrl, token, roomName, identity: `human-${userId}` };
    },

    async transferSip({ roomName, participantIdentity, phone, playDialtone = false }) {
      if (!provider.configured || typeof provider._twirp !== 'function') return { ok: false, code: 'SIP_NOT_CONFIGURED', message: 'SIP transfer is not configured' };
      const target = String(phone || '').trim();
      if (!/^\+?[1-9]\d{6,14}$/.test(target.replace(/[\s-]/g, ''))) return { ok: false, code: 'INVALID_TRANSFER_NUMBER', message: 'The transfer phone number is not a valid E.164 number' };
      try {
        const { response, json } = await provider._twirp('SIP', 'TransferSIPParticipant', {
          participant_identity: participantIdentity, room_name: roomName,
          transfer_to: `tel:${target.replace(/[\s-]/g, '')}`, play_dialtone: playDialtone,
        }, roomName);
        if (response?.ok) return { ok: true };
        return { ok: false, code: 'SIP_TRANSFER_REJECTED', message: String(json?.msg || json?.message || `LiveKit returned ${response?.status}`).slice(0, 300) };
      } catch (error) {
        return { ok: false, code: 'SIP_TRANSFER_ERROR', message: String(error?.message || error).slice(0, 300) };
      }
    },
  };
}

export default createHumanTransferProvider();
