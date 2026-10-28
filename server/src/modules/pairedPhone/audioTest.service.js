import Device from './pairedDevice.model.js';
import Call from '../aiCalling/callRecord.model.js';
import Lead from '../crm/lead.model.js';
import leadService from '../crm/lead.service.js';
import ai, { AUDIO_VERIFICATION_TEST } from '../aiCalling/aiCalling.service.js';
import phone from './pairedPhone.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

async function owned(actor, id) {
  const d = await Device.findOne({ _id: id, createdBy: actor, revokedAt: null }).lean();
  if (!d) throw new NotFoundError('PairedDevice', id);
  return d;
}

export default {
  async start(actor, id, { destination, ownsDestination }, meta = {}) {
    if (ownsDestination !== true || !/^\+[1-9]\d{7,14}$/.test(destination)) throw new ValidationError('Confirm you own the test destination and use its international number');
    const d = await owned(actor, id);
    const ready = await phone.readiness(id, new Date(), { audioVerificationTest: true });
    if (!ready.ok) throw new ConflictError(ready.messages?.join('; ') || ready.reasons.join(', '));
    const name = `Phone bridge audio test ${id}`;
    let lead = await Lead.findOne({ name, createdBy: actor, phone: destination, isDeleted: false }).lean();
    if (!lead) lead = await leadService.create({ name, phone: destination, type: 'private', source: 'manual' }, actor, meta);
    await ai.updateConsent(lead._id, { status: 'granted', source: 'manual', evidence: 'Owner explicitly requested one immediate audio test to their own second phone using the CRM setup controls.', expiresAt: new Date(Date.now() + 10 * 60_000) }, actor, meta);
    const c = await ai.createCampaign({ name: 'Phone bridge audio verification', isTest: true, transport: 'paired_phone', pairedDeviceId: id,
      selection: { mode: 'explicit', leadIds: [String(lead._id)] },
      questionnaire: { questions: [
        { fieldKey: 'voice_clear', label: 'AI voice clear', text: 'Can you hear my voice clearly at a comfortable volume?', type: 'boolean', required: true, order: 1 },
        { fieldKey: 'microphone_phrase', label: 'Return speech', text: 'Please say: Updata bridge test.', type: 'short_text', required: true, order: 2 },
      ] },
      agentConfig: { agentName: 'Updata setup assistant', organizationName: 'Updata', disclosure: 'Hello, this is the Updata AI setup assistant, calling for the audio test you requested. May we check the sound in both directions?', maxCallSeconds: 90, recordCall: false },
      schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxAttemptsPerLead: 1, maxCallsPerDay: 1, maxConcurrency: 1 },
    }, actor, meta);
    const options = { [AUDIO_VERIFICATION_TEST]: true };
    try {
      await ai.startCampaign(c._id, actor, options, meta);
      await ai.tickCampaign(c._id, null, options);
    } catch (e) {
      await ai.cancelCampaign(c._id, actor, meta).catch(() => {});
      throw e;
    }
    const call = await Call.findOne({ campaignId: c._id, createdBy: actor }).select('_id').lean();
    if (!call) {
      await ai.cancelCampaign(c._id, actor, meta).catch(() => {});
      throw new ConflictError('The audio test could not be dispatched. No call was queued.');
    }
    await Device.updateOne({ _id: id, createdBy: actor }, { $set: { audioTest: { callId: call._id, firmware: d.board.firmware, playbackGainDb: d.setup?.playbackGainDb ?? 0, createdAt: new Date() } } });
    return this.result(actor, id, call._id);
  },
  async result(actor, id, callId) {
    await owned(actor, id);
    const c = await Call.findOne({ _id: callId, createdBy: actor, pairedDeviceId: id, provider: 'paired_phone', isTest: true }).select('state answeredAt endedAt durationSeconds answers gateway failureMessage').lean();
    if (!c) throw new NotFoundError('CallRecord', callId);
    return { id: String(c._id), state: c.state, answeredAt: c.answeredAt, endedAt: c.endedAt, durationSeconds: c.durationSeconds,
      answers: c.answers.map(a => ({ field: a.questionFieldKey, value: a.normalizedValue, validation: a.validation })),
      audio: c.gateway?.audio || null, failureMessage: c.failureMessage || null };
  },
};
