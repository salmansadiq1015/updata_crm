import mongoose from 'mongoose';
import ContactLogEntry from './contactLog.model.js';
import Lead from './lead.model.js';
import LeadCommunication from './leadCommunication.model.js';
import { ValidationError } from '../../shared/errors/AppError.js';

/**
 * Follow-ups agenda across leads: the `followUpAt` dates recorded on lead
 * contact-log entries (the mobile call/SMS outcome writes them). Read-only.
 *
 * Window defaults: 30 days back (so overdue items stay visible) to 60 days
 * ahead. Results are sorted ascending and capped at FOLLOW_UP_LIMIT.
 */
export const FOLLOW_UP_LIMIT = 200;
export const NOTE_EXCERPT_LENGTH = 140;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAST_DAYS = 30;
const DEFAULT_FUTURE_DAYS = 60;

function excerpt(text) {
  if (typeof text !== 'string') return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > NOTE_EXCERPT_LENGTH ? `${flat.slice(0, NOTE_EXCERPT_LENGTH - 1)}…` : flat;
}

/**
 * @param {{ from?: Date|string, to?: Date|string, scope?: 'mine'|'all' }} query
 * @param {import('mongoose').Types.ObjectId|string} userId
 */
async function listFollowUps({ from, to, scope = 'mine' } = {}, userId, now = new Date()) {
  const start = from ? new Date(from) : new Date(now.getTime() - DEFAULT_PAST_DAYS * DAY_MS);
  const end = to ? new Date(to) : new Date(now.getTime() + DEFAULT_FUTURE_DAYS * DAY_MS);
  if (start.getTime() > end.getTime()) {
    throw new ValidationError('Validation failed', [
      { field: 'to', message: "'to' must not be before 'from'", type: 'date.min' },
    ]);
  }

  const match = {
    isDeleted: false,
    leadId: { $ne: null },
    followUpAt: { $gte: start, $lte: end },
  };
  if (scope !== 'all') {
    const me = new mongoose.Types.ObjectId(String(userId));
    match.$or = [{ createdBy: me }, { employeeId: me }];
  }

  // An aggregation (not find + filter) so soft-deleted leads are excluded
  // BEFORE the limit: the caller always gets up to 200 live follow-ups.
  const rows = await ContactLogEntry.aggregate([
    { $match: match },
    { $sort: { followUpAt: 1, _id: 1 } },
    {
      $lookup: {
        from: Lead.collection.name,
        let: { leadId: '$leadId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$leadId'] }, isDeleted: { $ne: true } } },
          { $project: { _id: 1, name: 1, leadNumber: 1 } },
        ],
        as: 'lead',
      },
    },
    { $unwind: '$lead' },
    { $limit: FOLLOW_UP_LIMIT },
    {
      $lookup: {
        from: LeadCommunication.collection.name,
        localField: '_id',
        foreignField: 'contactLogId',
        pipeline: [{ $project: { _id: 0, 'outcome.followUpTimezone': 1 } }, { $limit: 1 }],
        as: 'communication',
      },
    },
    {
      $project: {
        _id: 1, followUpAt: 1, channel: 1, subject: 1, note: 1, lead: 1, communication: 1,
      },
    },
  ]);

  return rows.map((row) => ({
    contactLogId: String(row._id),
    leadId: String(row.lead._id),
    leadNumber: row.lead.leadNumber ?? null,
    leadName: row.lead.name,
    followUpAt: row.followUpAt.toISOString(),
    followUpTimezone: row.communication?.[0]?.outcome?.followUpTimezone ?? null,
    channel: row.channel,
    subject: row.subject ?? null,
    note: excerpt(row.note),
  }));
}

export default { listFollowUps };
