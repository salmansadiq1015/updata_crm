import mongoose from 'mongoose';
import {
  COMM_CHANNELS, COMM_DIRECTIONS, COMM_ROUTES, COMM_MODES, DESTINATION_FIELDS, COMM_STATES,
  COMM_EVENT_TYPES, COMM_EVENT_SOURCES, DISPOSITIONS, CONNECTED_VALUES, SMS_ENCODINGS,
  SMS_SEND_STATUSES, ANSWER_STATUSES, ANSWER_SOURCES, STEP_STATUSES,
} from './leadCommunication.constants.js';
import { LEAD_STATUS } from './lead.model.js';

/**
 * LeadCommunication — one device-originated contact operation (mobile app SIM
 * call or SMS composer) against a lead. Keyed by a client-generated UUID
 * (operationId) unique per user, so every app call is idempotent and resumable.
 *
 * The destination number is resolved server-side from the lead and stored only
 * as an HMAC hash + mask. `observed` is derived from app-reported telephony
 * events; an off-hook period is dialing+talk time, never proof of an answer.
 */

const { Mixed, ObjectId } = mongoose.Schema.Types;

const eventSchema = new mongoose.Schema({
  seq: { type: Number, required: true, min: 0 },
  type: { type: String, enum: COMM_EVENT_TYPES, required: true },
  at: { type: Date, required: true },
  source: { type: String, enum: COMM_EVENT_SOURCES, required: true },
  data: { type: Mixed, default: null },
}, { _id: false });

const answerSchema = new mongoose.Schema({
  fieldKey: { type: String, required: true, trim: true, maxlength: 80 },
  label: { type: String, trim: true, maxlength: 200, default: null },
  value: { type: Mixed, default: null },
  status: { type: String, enum: ANSWER_STATUSES, required: true },
  source: { type: String, enum: ANSWER_SOURCES, default: 'user' },
  evidence: { type: String, maxlength: 2000, default: null },
  confidence: { type: Number, min: 0, max: 1, default: null },
}, { _id: false });

const stepSchema = new mongoose.Schema({
  status: { type: String, enum: STEP_STATUSES, required: true },
  error: { type: String, maxlength: 500, default: null },
  at: { type: Date, default: null },
}, { _id: false });

const leadCommunicationSchema = new mongoose.Schema({
  operationId: { type: String, required: true, trim: true, maxlength: 64 },
  leadId: { type: ObjectId, ref: 'Lead', required: true },
  createdBy: { type: ObjectId, ref: 'User', required: true },
  channel: { type: String, enum: COMM_CHANNELS, required: true },
  direction: { type: String, enum: COMM_DIRECTIONS, default: 'outbound' },
  route: { type: String, enum: COMM_ROUTES, required: true },
  mode: { type: String, enum: COMM_MODES, default: 'manual' },

  destinationField: { type: String, enum: DESTINATION_FIELDS, required: true },
  destinationHash: { type: String, required: true },
  destinationMasked: { type: String, maxlength: 40, default: null },

  sim: {
    subscriptionId: { type: Number, default: null },
    slotIndex: { type: Number, default: null },
    carrierName: { type: String, trim: true, maxlength: 120, default: null },
    displayName: { type: String, trim: true, maxlength: 120, default: null },
    isEmbedded: { type: Boolean, default: null },
    originNumber: { type: String, trim: true, maxlength: 40, default: null },
    originNumberSource: { type: String, enum: ['sim_reported', null], default: null },
  },
  device: {
    platform: { type: String, enum: ['android'], default: 'android' },
    osVersion: { type: String, trim: true, maxlength: 40, default: null },
    appVersion: { type: String, trim: true, maxlength: 40, default: null },
    model: { type: String, trim: true, maxlength: 120, default: null },
  },

  state: { type: String, enum: COMM_STATES, default: 'started' },
  events: { type: [eventSchema], default: [] },

  observed: {
    ringingObserved: { type: Boolean, default: false },
    offhookAt: { type: Date, default: null },
    idleAfterOffhookAt: { type: Date, default: null },
    offhookDurationSec: { type: Number, default: null },
    evidence: { type: String, enum: ['telephony_events', 'none'], default: 'none' },
  },

  outcome: {
    type: new mongoose.Schema({
      disposition: { type: String, enum: DISPOSITIONS, required: true },
      connected: { type: String, enum: CONNECTED_VALUES, default: 'unknown' },
      notes: { type: String, maxlength: 5000, default: '' },
      followUpAt: { type: Date, default: null },
      followUpTimezone: { type: String, maxlength: 64, default: null },
      statusChange: { type: String, enum: [...Object.values(LEAD_STATUS), null], default: null },
      doNotContact: { type: Boolean, default: false },
    }, { _id: false }),
    default: null,
  },

  sms: {
    type: new mongoose.Schema({
      templateId: { type: String, maxlength: 64, default: null },
      body: { type: String, maxlength: 1600, default: '' },
      encoding: { type: String, enum: SMS_ENCODINGS, default: 'GSM-7' },
      segments: { type: Number, min: 0, default: 1 },
      sendStatus: { type: String, enum: SMS_SEND_STATUSES, default: 'unknown' },
    }, { _id: false }),
    default: null,
  },

  qualification: {
    type: new mongoose.Schema({ answers: { type: [answerSchema], default: [] } }, { _id: false }),
    default: null,
  },

  receipt: {
    steps: {
      outcome: { type: stepSchema, default: null },
      contactLog: { type: stepSchema, default: null },
      leadContact: { type: stepSchema, default: null },
      statusChange: { type: stepSchema, default: null },
      qualification: { type: stepSchema, default: null },
      suppression: { type: stepSchema, default: null },
    },
    completedAt: { type: Date, default: null },
  },

  contactLogId: { type: ObjectId, ref: 'ContactLogEntry', default: null },
  completedAt: { type: Date, default: null },
  // Internal lease so two concurrent /complete requests cannot run the side
  // effects twice. Never serialized.
  completionLockUntil: { type: Date, default: null },
}, {
  timestamps: true,
  collection: 'leadcommunications',
  // Event appends save the whole events array: a concurrent writer must make
  // the second save fail (VersionError) and retry on fresh state.
  optimisticConcurrency: true,
});

leadCommunicationSchema.index({ createdBy: 1, operationId: 1 }, { unique: true, name: 'owner_operation_unique' });
leadCommunicationSchema.index({ leadId: 1, createdAt: -1 }, { name: 'lead_communications' });

const LeadCommunication = mongoose.model('LeadCommunication', leadCommunicationSchema);
export default LeadCommunication;
