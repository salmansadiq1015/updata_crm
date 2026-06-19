import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import {
  MEETING_STATUSES,
  MEETING_PARTICIPANT_ROLES,
  MEETING_RSVP_STATUSES,
  MEETING_ATTENDANCE_STATUSES,
  ONLINE_MEETING_PROVIDERS,
  MEETING_DECISION_STATUSES,
} from './meeting.model.js';

const participantSchema = Joi.object({
  userId: objectId.allow(null),
  email: Joi.string().email().trim().allow('', null),
  displayName: Joi.string().trim().max(255).allow('', null),
  role: Joi.string().valid(...MEETING_PARTICIPANT_ROLES).default('REQUIRED'),
  rsvpStatus: Joi.string().valid(...MEETING_RSVP_STATUSES),
  attendanceStatus: Joi.string().valid(...MEETING_ATTENDANCE_STATUSES),
}).or('userId', 'email');

const onlineMeetingSchema = Joi.object({
  provider: Joi.string().valid(...ONLINE_MEETING_PROVIDERS).default('NONE'),
  joinUrl: Joi.string().uri().max(2000).allow('', null),
  externalEventId: Joi.string().trim().max(255).allow('', null),
  createdInSystem: Joi.boolean(),
});

export const listMeetingsSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('ALL', ...MEETING_STATUSES),
    scope: Joi.string().valid('upcoming', 'past', 'all').default('upcoming'),
    projectId: objectId,
    customerId: objectId,
    taskId: objectId,
    participantId: objectId,
    responsibleId: objectId,
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    q: Joi.string().trim().max(200).allow(''),
  }),
};

export const meetingIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const createMeetingSchema = {
  body: Joi.object({
    title: Joi.string().trim().min(2).max(255).required(),
    description: Joi.string().trim().max(5000).allow('', null),
    agenda: Joi.string().trim().max(10000).allow('', null),
    startAt: Joi.date().iso().required(),
    endAt: Joi.date().iso().greater(Joi.ref('startAt')).required(),
    timezone: Joi.string().trim().max(80).default('Europe/Zurich'),
    status: Joi.string().valid(...MEETING_STATUSES),
    location: Joi.string().trim().max(500).allow('', null),
    onlineMeeting: onlineMeetingSchema,
    participants: Joi.array().items(participantSchema).max(200).default([]),
    projectId: objectId.allow(null),
    customerId: objectId.allow(null),
    taskIds: Joi.array().items(objectId).max(200).default([]),
    attachmentIds: Joi.array().items(objectId).max(200).default([]),
    reminderMinutesBefore: Joi.array().items(Joi.number().integer().min(0).max(10080)).max(10),
  }),
};

export const updateMeetingSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    expectedVersion: Joi.number().integer().min(0),
    title: Joi.string().trim().min(2).max(255),
    description: Joi.string().trim().max(5000).allow('', null),
    agenda: Joi.string().trim().max(10000).allow('', null),
    startAt: Joi.date().iso(),
    endAt: Joi.date().iso(),
    timezone: Joi.string().trim().max(80),
    status: Joi.string().valid(...MEETING_STATUSES),
    location: Joi.string().trim().max(500).allow('', null),
    onlineMeeting: onlineMeetingSchema,
    participants: Joi.array().items(participantSchema).max(200),
    projectId: objectId.allow(null),
    customerId: objectId.allow(null),
    taskIds: Joi.array().items(objectId).max(200),
    attachmentIds: Joi.array().items(objectId).max(200),
    reminderMinutesBefore: Joi.array().items(Joi.number().integer().min(0).max(10080)).max(10),
  }).min(1),
};

export const cancelMeetingSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().trim().max(2000).allow('', null),
    expectedVersion: Joi.number().integer().min(0),
  }),
};

export const rsvpSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    rsvpStatus: Joi.string().valid(...MEETING_RSVP_STATUSES).required(),
  }),
};

export const attendanceSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    attendees: Joi.array().items(Joi.object({
      userId: objectId.required(),
      attendanceStatus: Joi.string().valid(...MEETING_ATTENDANCE_STATUSES).required(),
    })).min(1).max(200).required(),
  }),
};

export const noteSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    title: Joi.string().trim().max(255).allow('', null),
    content: Joi.string().trim().min(1).max(10000).required(),
  }),
};

export const minutesSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    summary: Joi.string().trim().max(20000).allow('', null),
    markCompleted: Joi.boolean().default(false),
    status: Joi.string().valid('IN_PROGRESS', 'COMPLETED'),
  }),
};

export const decisionSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    title: Joi.string().trim().min(1).max(500).required(),
    description: Joi.string().trim().max(5000).allow('', null),
    ownerId: objectId.allow(null),
    dueDate: Joi.date().iso().allow(null),
    status: Joi.string().valid(...MEETING_DECISION_STATUSES),
  }),
};

export const followUpTaskSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    title: Joi.string().trim().min(1).max(500).required(),
    description: Joi.string().trim().max(5000).allow('', null),
    assigneeId: objectId.allow(null),
    dueDate: Joi.date().iso().allow(null),
    priority: Joi.string().valid('NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT').default('MEDIUM'),
    projectId: objectId.allow(null),
    decisionId: objectId.allow(null),
  }),
};
