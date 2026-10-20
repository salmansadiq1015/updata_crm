/**
 * Translate a (signature-verified) LiveKit webhook body into the telephony event
 * vocabulary understood by `normalizeTelephonyStatus`.
 *
 * LiveKit has no "call answered" webhook. With `wait_until_answered: false` the
 * SIP participant joins the room while it is still dialling, so a bare
 * `participant_joined` is NOT an answer; only `sip.callStatus === 'active'` is.
 * The end of a call surfaces as `participant_left` (with a disconnect reason)
 * for the SIP leg, or `room_finished`.
 *
 * Pure: no I/O, so the mapping is unit-tested against recorded payload shapes.
 */
const ROOM_PREFIX = 'crm-call-';

// ParticipantInfo.DisconnectReason → telephony event. Anything not listed is a
// normal hang-up; post-call processing then derives no_answer vs completed from
// whether the call was ever answered.
const DISCONNECT_REASON_EVENT = Object.freeze({
  USER_REJECTED: 'busy',
  USER_UNAVAILABLE: 'no-answer',
  SIP_TRUNK_FAILURE: 'failed',
  JOIN_FAILURE: 'failed',
  MEDIA_FAILURE: 'failed',
  CONNECTION_TIMEOUT: 'failed',
});

function isSipParticipant(participant) {
  if (!participant) return false;
  return participant.kind === 'SIP' || participant.kind === 3
    || String(participant.identity || '').startsWith('sip-');
}

/**
 * @returns {{ internalCallId: string|null, providerCallId: string|null, eventType: string, sip: boolean }}
 *   eventType is 'ignored' for events that carry no call-state meaning.
 */
export function mapLiveKitWebhook(body = {}) {
  const roomName = body.room?.name || body.room_name || '';
  const internalCallId = roomName.startsWith(ROOM_PREFIX) ? roomName.slice(ROOM_PREFIX.length) : null;
  const participant = body.participant || null;
  const sip = isSipParticipant(participant);
  const attributes = participant?.attributes || {};
  const providerCallId = attributes['sip.callID'] || participant?.sid || null;
  const event = String(body.event || '');

  let eventType = 'ignored';
  if (event === 'room_finished') {
    eventType = 'completed';
  } else if (sip && event === 'participant_joined') {
    eventType = attributes['sip.callStatus'] === 'active' ? 'answered' : 'ringing';
  } else if (sip && (event === 'participant_left' || event === 'participant_connection_aborted')) {
    const reason = String(participant.disconnectReason ?? participant.disconnect_reason ?? '');
    eventType = DISCONNECT_REASON_EVENT[reason] || 'completed';
  }
  return { internalCallId, providerCallId, eventType, sip };
}

export default { mapLiveKitWebhook };
