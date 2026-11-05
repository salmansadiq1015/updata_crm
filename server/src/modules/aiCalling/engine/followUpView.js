const str = (v) => (v == null ? null : String(v));

/** Public shape of LeadFollowUp.automation (+ live call state) for the inbox, agent page and mobile app. */
export function automationView(a = {}, call = null) {
  // Ordinary human tasks carry the default { mode: 'human' } and no state: no automation view.
  if (!a || (a.mode !== 'ai' && !a.state)) return null;
  return {
    mode: a.mode || 'human', agentId: str(a.agentId), state: a.state || null, reason: a.reason || null, outcome: a.outcome || null,
    round: a.round || 1, attempts: a.attempts || 0, campaignId: str(a.campaignId), callRecordId: str(a.callRecordId), previousCallId: str(a.previousCallId),
    notBefore: a.notBefore || null, lastError: a.lastError || null, instructions: a.instructions || null,
    timeResolution: a.timeResolution?.kind ? { kind: a.timeResolution.kind, approximate: Boolean(a.timeResolution.approximate), requestedText: a.timeResolution.requestedText || null, shiftedFrom: a.timeResolution.shiftedFrom || null } : null,
    stateChangedAt: a.stateChangedAt || null,
    history: (a.history || []).slice(-10).map((h) => ({ state: h.state, at: h.at, reason: h.reason || null })),
    call: call ? { state: call.state, disposition: call.disposition || null, qualification: call.qualification || null, durationSeconds: call.durationSeconds || 0, answeredAt: call.answeredAt || null, endedAt: call.endedAt || null, summary: call.callNotes?.summary || null } : null,
  };
}

