import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { SETUP_ACTIONS } from './setupCommand.js';

const id = { params: Joi.object({ id: objectId.required() }) };
const bdaddr = Joi.string().pattern(/^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/);
const nonce = Joi.string().pattern(/^[0-9a-f]{32}$/);
const short = (n) => Joi.string().trim().max(n);

export const deviceId = id;
export const createPairingCode = { body: Joi.object({
  deviceName: short(80).min(1).required(),
  phoneLabel: short(80).allow('').default(''),
}) };
export const updateDevice = { ...id, body: Joi.object({
  name: short(80).min(1),
  phoneLabel: short(80).allow(''),
  limits: Joi.object({
    cooldownSeconds: Joi.number().integer().min(20).max(3600),
    maxCallsPerHour: Joi.number().integer().min(1).max(30),
    maxCallsPerDay: Joi.number().integer().min(1).max(500),
    ringTimeoutSeconds: Joi.number().integer().min(15).max(90),
  }).min(1),
}).min(1) };
export const verifyAudio = { ...id, body: Joi.object({
  inboundPhraseHeard: Joi.boolean().required(),
  outboundPhraseHeard: Joi.boolean().required(),
  note: short(1000).allow('').default(''),
}) };
export const callControl = { params: Joi.object({ callId: objectId.required() }) };
export const setupAction = { ...id, body: Joi.object({ action: Joi.string().valid(...SETUP_ACTIONS).required() }) };
export const setupSettings = { ...id, body: Joi.object({ playbackGainDb: Joi.number().min(0).max(12), autoConnect: Joi.boolean() }).min(1) };
export const setupCommandId = { params: Joi.object({ commandId: Joi.string().guid({ version: 'uuidv4' }).required() }) };
export const setupResult = { ...setupCommandId, body: Joi.object({ succeeded: Joi.boolean().required(), code: Joi.string().valid('no_presence', 'no_peer', 'no_board', 'busy', 'failed', '').default('') }) };
export const audioTest = { ...id, body: Joi.object({ destination: Joi.string().pattern(/^\+[1-9]\d{7,14}$/).required(), ownsDestination: Joi.boolean().valid(true).required() }) };
export const audioTestResult = { params: Joi.object({ id: objectId.required(), callId: objectId.required() }) };

// ---- gateway (device token) ----
export const redeem = { body: Joi.object({
  code: Joi.string().trim().max(20).required(),
  gateway: Joi.object({ version: short(40), platform: short(40), hostname: short(120).allow('') }).default({}),
}) };
const deviceState = Joi.object({
  device: short(30), hfp: short(20), call: Joi.number().integer().min(0).max(1), callsetup: Joi.number().integer().min(0).max(3),
  audio: short(20), codec: short(10), signal: Joi.number().integer().min(0).max(5).allow(null), battery: Joi.number().integer().min(0).max(5).allow(null),
  peer: Joi.alternatives(bdaddr, Joi.valid(null)),
}).unknown(false);
export const heartbeat = { body: Joi.object({
  gateway: Joi.object({ version: short(40), platform: short(40), hostname: short(120).allow(''), playbackGainDb: Joi.number().min(0).max(12), autoConnect: Joi.boolean(), monitorSafe: Joi.boolean() }),
  board: Joi.object({
    connected: Joi.boolean().required(), port: short(120).allow(null, ''), bdaddr: Joi.alternatives(bdaddr, Joi.valid(null)),
    firmware: short(40).allow(null), idf: short(40).allow(null), chipRevision: Joi.number().integer().min(0).max(255).allow(null),
    keyProvisioned: Joi.boolean(), sessionNonce: Joi.alternatives(nonce, Joi.valid(null)),
  }).required(),
  state: deviceState,
  stats: Joi.object().pattern(/^[a-zA-Z]{1,40}$/, Joi.number()).max(40),
  error: Joi.object({ code: short(60).required(), message: short(300).allow('') }),
}) };
export const claim = { body: Joi.object({ sessionNonce: nonce.required() }) };
export const confirmKey = { body: Joi.object({ bdaddr: bdaddr.required() }) };
export const event = {
  params: Joi.object({ callId: Joi.string().pattern(/^call_[A-Za-z0-9_]{1,120}$/).required() }),
  body: Joi.object({
    eventId: Joi.string().pattern(/^[A-Za-z0-9_-]{8,80}$/).required(),
    type: Joi.string().valid('dialing', 'ringing', 'answered', 'ended', 'failed', 'dial_refused', 'audio_opened', 'audio_lost', 'stats', 'command_done', 'outcome_unknown', 'claimed_ack').required(),
    at: Joi.date().iso(),
    data: Joi.object({
      reason: short(60), code: short(60), detail: short(300), codec: short(10), type: Joi.string().valid('takeover', 'hangup'),
      rxLevelDbfs: Joi.number(), txLevelDbfs: Joi.number(), upFrames: Joi.number(), downFrames: Joi.number(), upSeqGaps: Joi.number(),
      downUnderruns: Joi.number(), downOverruns: Joi.number(), firstAiAudioMs: Joi.number(), agentConnected: Joi.boolean(),
    }).default({}),
  }),
};
