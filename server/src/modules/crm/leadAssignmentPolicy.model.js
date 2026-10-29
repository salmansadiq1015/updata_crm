import mongoose from 'mongoose';

/**
 * LeadAssignmentPolicy — the single company-wide policy (key 'default') for
 * automatic lead assignment, the first-response SLA and escalation. Edited by
 * holders of `lead:assign-policy`. Round-robin positions live in `rrCounters`
 * (atomically $inc'ed per pool, so concurrent creates never pick the same slot).
 */
export const ASSIGNMENT_STRATEGIES = Object.freeze(['round_robin', 'least_loaded']);

const { ObjectId } = mongoose.Schema.Types;

const ruleSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 120, default: null },
  match: {
    source: { type: String, trim: true, maxlength: 40, default: null },
    city: { type: String, trim: true, maxlength: 120, default: null },
    businessType: { type: String, trim: true, maxlength: 120, default: null },
  },
  userIds: { type: [ObjectId], ref: 'User', default: [] },
  strategy: { type: String, enum: [...ASSIGNMENT_STRATEGIES, null], default: null },
}, { _id: true });

const policySchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  enabled: { type: Boolean, default: false },
  strategy: { type: String, enum: ASSIGNMENT_STRATEGIES, default: 'round_robin' },
  eligibleUserIds: { type: [ObjectId], ref: 'User', default: [] },
  rules: { type: [ruleSchema], default: [] },
  rrCounters: { type: mongoose.Schema.Types.Mixed, default: {} },

  sla: {
    enabled: { type: Boolean, default: false },
    firstResponseMinutes: { type: Number, min: 5, max: 60 * 24 * 14, default: 240 },
    businessHours: {
      enabled: { type: Boolean, default: false },
      timezone: { type: String, trim: true, maxlength: 64, default: 'Europe/Zurich' },
      days: { type: [Number], default: [1, 2, 3, 4, 5] }, // ISO weekday 1=Mon … 7=Sun
      start: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '08:00' },
      end: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '17:00' },
    },
  },
  escalation: {
    enabled: { type: Boolean, default: false },
    afterMinutes: { type: Number, min: 5, max: 60 * 24 * 14, default: 60 },
    maxLevel: { type: Number, min: 1, max: 5, default: 2 },
    userIds: { type: [ObjectId], ref: 'User', default: [] },
    followUpAfterMinutes: { type: Number, min: 5, max: 60 * 24 * 14, default: 24 * 60 },
  },

  updatedBy: { type: ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'leadassignmentpolicies', minimize: false });

const LeadAssignmentPolicy = mongoose.model('LeadAssignmentPolicy', policySchema);
export default LeadAssignmentPolicy;
