import mongoose from 'mongoose';
import meetingRepository from './meeting.repository.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const DEFAULT_REMINDERS = [1440, 60];
const INTERNAL_JOIN_BASE = process.env.CLIENT_URI || 'http://localhost:3000';

function toObjectId(value) {
  if (!value) return null;
  return new mongoose.Types.ObjectId(value);
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '')).filter(Boolean))];
}

function meetingDeepLink(id) {
  return `/scheduling/meetings?meetingId=${id}`;
}

class MeetingService {
  async create(data, userId, meta = {}) {
    const participants = this._normalizeParticipants(data.participants, userId);
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);
    const onlineMeeting = this._normalizeOnlineMeeting(data.onlineMeeting);
    const reminders = this._normalizeReminderOffsets(data.reminderMinutesBefore).map((minutesBefore) => ({
      minutesBefore,
      status: 'PENDING',
      scheduledAt: new Date(startAt.getTime() - minutesBefore * 60 * 1000),
    }));

    const created = await meetingRepository.create({
      ...data,
      startAt,
      endAt,
      participants,
      onlineMeeting,
      reminders,
      createdBy: userId,
      updatedBy: userId,
      status: data.status || 'SCHEDULED',
    });

    const meetingId = created._id.toString();
    if (created.onlineMeeting?.provider === 'INTERNAL' && !created.onlineMeeting.joinUrl) {
      const meetingOnline = created.onlineMeeting.toObject?.() || created.onlineMeeting;
      await meetingRepository.updateById(meetingId, {
        onlineMeeting: {
          ...meetingOnline,
          joinUrl: `${INTERNAL_JOIN_BASE}/scheduling/meetings?meetingId=${meetingId}&join=1`,
          createdInSystem: true,
        },
      });
    }

    await this._scheduleReminders(meetingId, userId, meta);
    const meeting = await this.getById(meetingId);
    this._publishMeetingEvent(EVENT_TYPES.MEETING_CREATED, meeting, userId, { reason: 'created' });
    await this._logAudit('meeting.created', userId, meetingId, meta, { title: meeting.title });
    await this._invalidateCaches(meetingId);

    return meeting;
  }

  async list(queryParams = {}) {
    const result = await meetingRepository.findWithCursor(queryParams);
    return result;
  }

  async getById(id) {
    const meeting = await meetingRepository.findById(id);
    if (!meeting) throw new NotFoundError('Meeting', id);
    return meeting;
  }

  async update(id, data, userId, meta = {}) {
    const existing = await meetingRepository.findRawById(id);
    if (!existing) throw new NotFoundError('Meeting', id);
    if (existing.status === 'CANCELLED' && data.status !== 'SCHEDULED') {
      throw new AppError('Cancelled meetings must be rescheduled before editing details', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const patch = { ...data, updatedBy: userId };
    if (data.startAt) patch.startAt = new Date(data.startAt);
    if (data.endAt) patch.endAt = new Date(data.endAt);
    if (data.participants) patch.participants = this._normalizeParticipants(data.participants, existing.createdBy || userId);
    if (data.onlineMeeting) patch.onlineMeeting = this._normalizeOnlineMeeting(data.onlineMeeting);
    if (data.reminderMinutesBefore) {
      const startAt = patch.startAt || existing.startAt;
      patch.reminders = this._normalizeReminderOffsets(data.reminderMinutesBefore).map((minutesBefore) => ({
        minutesBefore,
        status: 'PENDING',
        scheduledAt: new Date(new Date(startAt).getTime() - minutesBefore * 60 * 1000),
      }));
    }

    const expectedVersion = data.expectedVersion;
    delete patch.expectedVersion;
    delete patch.reminderMinutesBefore;

    if (data.startAt || data.endAt || data.participants || data.reminderMinutesBefore) {
      await this._cancelScheduledReminders(existing.reminders || [], userId, meta);
    }

    const updated = await meetingRepository.updateById(id, patch, { expectedVersion });
    if (!updated) {
      throw new AppError('Meeting was modified by another user. Refresh and retry.', 409, ERROR_CODES.CONFLICT);
    }

    if (data.startAt || data.endAt || data.participants || data.reminderMinutesBefore) {
      await this._scheduleReminders(id, userId, meta);
    }

    this._publishMeetingEvent(EVENT_TYPES.MEETING_UPDATED, updated, userId, {
      changedFields: Object.keys(patch),
    });
    await this._logAudit('meeting.updated', userId, id, meta, { changedFields: Object.keys(patch) });
    await this._invalidateCaches(id);
    return this.getById(id);
  }

  async cancel(id, { reason = '', expectedVersion } = {}, userId, meta = {}) {
    const existing = await meetingRepository.findRawById(id);
    if (!existing) throw new NotFoundError('Meeting', id);
    if (existing.status === 'CANCELLED') return this.getById(id);
    await this._cancelScheduledReminders(existing.reminders || [], userId, meta);

    const updated = await meetingRepository.updateById(
      id,
      {
        status: 'CANCELLED',
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancellationReason: reason || '',
        updatedBy: userId,
        reminders: (existing.reminders || []).map((reminder) => ({
          ...reminder,
          status: reminder.status === 'SENT' ? 'SENT' : 'CANCELLED',
        })),
      },
      { expectedVersion },
    );
    if (!updated) {
      throw new AppError('Meeting was modified by another user. Refresh and retry.', 409, ERROR_CODES.CONFLICT);
    }

    this._publishMeetingEvent(EVENT_TYPES.MEETING_CANCELLED, updated, userId, { reason });
    await this._logAudit('meeting.cancelled', userId, id, meta, { reason });
    await this._invalidateCaches(id);
    return this.getById(id);
  }

  async remove(id, userId, meta = {}) {
    const existing = await meetingRepository.findRawById(id);
    if (!existing) throw new NotFoundError('Meeting', id);
    await meetingRepository.softDelete(id, userId);
    await this._logAudit('meeting.deleted', userId, id, meta, { title: existing.title });
    await this._invalidateCaches(id);
    return { deleted: true };
  }

  async updateRsvp(id, data, userId, meta = {}) {
    const meeting = await meetingRepository.findRawById(id);
    if (!meeting) throw new NotFoundError('Meeting', id);
    const participants = meeting.participants || [];
    const idx = participants.findIndex((participant) => String(participant.userId || '') === String(userId));
    if (idx < 0) throw new AppError('Current user is not a participant in this meeting', 403, ERROR_CODES.INSUFFICIENT_PERMISSIONS);

    participants[idx] = {
      ...participants[idx],
      rsvpStatus: data.rsvpStatus,
      respondedAt: new Date(),
    };

    const updated = await meetingRepository.updateById(id, { participants, updatedBy: userId });
    this._publishMeetingEvent(EVENT_TYPES.MEETING_RSVP_UPDATED, updated, userId, {
      participantId: userId,
      rsvpStatus: data.rsvpStatus,
    });
    await this._logAudit('meeting.rsvp_updated', userId, id, meta, { rsvpStatus: data.rsvpStatus });
    await this._invalidateCaches(id);
    return this.getById(id);
  }

  async updateAttendance(id, data, userId, meta = {}) {
    const meeting = await meetingRepository.findRawById(id);
    if (!meeting) throw new NotFoundError('Meeting', id);
    const byUserId = new Map((data.attendees || []).map((item) => [String(item.userId), item.attendanceStatus]));
    const participants = (meeting.participants || []).map((participant) => {
      const nextStatus = byUserId.get(String(participant.userId || ''));
      return nextStatus ? { ...participant, attendanceStatus: nextStatus } : participant;
    });

    const updated = await meetingRepository.updateById(id, { participants, updatedBy: userId });
    await this._logAudit('meeting.attendance_updated', userId, id, meta, { attendeeCount: byUserId.size });
    await this._invalidateCaches(id);
    return updated;
  }

  async addNote(id, data, userId, meta = {}) {
    const meeting = await meetingRepository.findRawById(id);
    if (!meeting) throw new NotFoundError('Meeting', id);
    const notes = [
      ...(meeting.notes || []),
      { title: data.title || '', content: data.content, createdBy: userId },
    ];
    const updated = await meetingRepository.updateById(id, { notes, updatedBy: userId });
    await this._logAudit('meeting.note_added', userId, id, meta, {});
    await this._invalidateCaches(id);
    return updated;
  }

  async updateMinutes(id, data, userId, meta = {}) {
    const patch = {
      minutes: {
        summary: data.summary || '',
        recordedBy: userId,
        recordedAt: new Date(),
      },
      updatedBy: userId,
    };
    if (data.markCompleted) {
      patch.status = 'COMPLETED';
    } else if (data.status) {
      patch.status = data.status;
    }
    const updated = await meetingRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError('Meeting', id);
    await this._logAudit('meeting.minutes_updated', userId, id, meta, { markCompleted: !!data.markCompleted });
    await this._invalidateCaches(id);
    return this.getById(id);
  }

  async addDecision(id, data, userId, meta = {}) {
    const meeting = await meetingRepository.findRawById(id);
    if (!meeting) throw new NotFoundError('Meeting', id);
    const decisions = [
      ...(meeting.decisions || []),
      {
        title: data.title,
        description: data.description || '',
        ownerId: data.ownerId || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: data.status || 'OPEN',
        createdBy: userId,
      },
    ];
    const updated = await meetingRepository.updateById(id, { decisions, updatedBy: userId });
    await this._logAudit('meeting.decision_added', userId, id, meta, { title: data.title });
    await this._invalidateCaches(id);
    return updated;
  }

  async createTaskFromMeeting(id, data, userId, meta = {}) {
    const meeting = await meetingRepository.findRawById(id);
    if (!meeting) throw new NotFoundError('Meeting', id);

    const taskService = (await import('../tasks/task.service.js')).default;
    const task = await taskService.create({
      title: data.title,
      description: data.description || `Follow-up from meeting: ${meeting.title}`,
      assigneeId: data.assigneeId || userId,
      dueDate: data.dueDate || null,
      priority: data.priority || 'MEDIUM',
      projectId: data.projectId || meeting.projectId || null,
      meetingId: id,
    }, userId, meta);

    const taskIds = uniqueStrings([...(meeting.taskIds || []), task._id]).map(toObjectId);
    let decisions = meeting.decisions || [];
    if (data.decisionId) {
      decisions = decisions.map((decision) => (
        String(decision._id) === String(data.decisionId)
          ? { ...decision, taskId: task._id, updatedBy: userId }
          : decision
      ));
    }

    const updated = await meetingRepository.updateById(id, { taskIds, decisions, updatedBy: userId });
    this._publishMeetingEvent(EVENT_TYPES.MEETING_TASK_CREATED, updated, userId, {
      taskId: task._id,
      assigneeId: task.assigneeId,
      taskTitle: task.title,
    });
    await this._logAudit('meeting.task_created', userId, id, meta, { taskId: task._id });
    await this._invalidateCaches(id);
    return { meeting: await this.getById(id), task };
  }

  _normalizeParticipants(participants = [], creatorId) {
    const seen = new Set();
    const normalized = [];
    const addParticipant = (participant) => {
      const userId = participant.userId || null;
      const email = participant.email || null;
      const key = userId ? `u:${userId}` : email ? `e:${String(email).toLowerCase()}` : null;
      if (!key || seen.has(key)) return;
      seen.add(key);
      normalized.push({
        userId,
        email,
        displayName: participant.displayName || '',
        role: participant.role || 'REQUIRED',
        rsvpStatus: participant.rsvpStatus || (String(userId) === String(creatorId) ? 'ACCEPTED' : 'PENDING'),
        attendanceStatus: participant.attendanceStatus || 'UNKNOWN',
        invitedAt: participant.invitedAt || new Date(),
        respondedAt: participant.respondedAt || (String(userId) === String(creatorId) ? new Date() : null),
      });
    };

    for (const participant of participants) addParticipant(participant);
    addParticipant({ userId: creatorId, role: 'ORGANIZER', rsvpStatus: 'ACCEPTED' });
    return normalized;
  }

  _normalizeOnlineMeeting(onlineMeeting = {}) {
    const provider = onlineMeeting.provider || 'NONE';
    return {
      provider,
      joinUrl: onlineMeeting.joinUrl || '',
      externalEventId: onlineMeeting.externalEventId || '',
      createdInSystem: provider === 'INTERNAL' || !!onlineMeeting.createdInSystem,
    };
  }

  _normalizeReminderOffsets(values) {
    const source = Array.isArray(values) && values.length > 0 ? values : DEFAULT_REMINDERS;
    return [...new Set(source.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 10080))]
      .sort((a, b) => b - a);
  }

  async _scheduleReminders(meetingId, userId, meta = {}) {
    const meeting = await meetingRepository.findRawById(meetingId);
    if (!meeting || meeting.status === 'CANCELLED') return;
    const recipientIds = uniqueStrings((meeting.participants || []).map((participant) => participant.userId));
    if (recipientIds.length === 0) return;

    const scheduledNotificationService = (await import('../notifications/scheduledNotification.service.js')).default;
    const nextReminders = [];
    for (const reminder of meeting.reminders || []) {
      const scheduledAt = new Date(new Date(meeting.startAt).getTime() - reminder.minutesBefore * 60 * 1000);
      if (scheduledAt <= new Date()) {
        nextReminders.push({ ...reminder, scheduledAt, status: 'FAILED' });
        continue;
      }

      try {
        const scheduled = await scheduledNotificationService.create({
          notificationType: 'meeting_reminder',
          category: 'SCHEDULING',
          priority: reminder.minutesBefore <= 60 ? 'HIGH' : 'NORMAL',
          channels: ['IN_APP', 'PUSH', 'EMAIL'],
          recipientIds,
          payload: {
            title: meeting.title,
            meetingId,
            startAt: meeting.startAt,
            agenda: meeting.agenda,
            deepLink: meetingDeepLink(meetingId),
          },
          sourceModule: 'meetings',
          sourceEntityType: 'Meeting',
          sourceEntityId: meetingId,
          scheduleType: 'ONE_TIME',
          scheduledAt,
        }, userId, meta);
        nextReminders.push({
          minutesBefore: reminder.minutesBefore,
          scheduledAt,
          scheduledNotificationId: scheduled._id,
          status: 'SCHEDULED',
        });
      } catch (err) {
        logger.warn('Meeting reminder could not be scheduled', {
          module: 'meetings',
          action: 'scheduleReminder',
          meetingId,
          minutesBefore: reminder.minutesBefore,
          error: err.message,
        });
        nextReminders.push({ ...reminder, scheduledAt, status: 'FAILED' });
      }
    }

    await meetingRepository.updateById(meetingId, { reminders: nextReminders, updatedBy: userId });
  }

  async _cancelScheduledReminders(reminders = [], userId, meta = {}) {
    const ids = reminders
      .filter((reminder) => reminder.scheduledNotificationId && reminder.status === 'SCHEDULED')
      .map((reminder) => reminder.scheduledNotificationId);
    if (ids.length === 0) return;

    const scheduledNotificationService = (await import('../notifications/scheduledNotification.service.js')).default;
    for (const id of ids) {
      try {
        await scheduledNotificationService.cancel(id, userId, meta);
      } catch (err) {
        logger.warn('Meeting reminder cancellation failed', {
          module: 'meetings',
          action: 'cancelReminder',
          scheduledNotificationId: id,
          error: err.message,
        });
      }
    }
  }

  _publishMeetingEvent(type, meeting, actorId, extra = {}) {
    const recipientIds = uniqueStrings((meeting.participants || []).map((participant) => participant.userId))
      .filter((id) => String(id) !== String(actorId));
    const externalRecipients = (meeting.participants || [])
      .filter((participant) => !participant.userId && participant.email)
      .map((participant) => ({
        email: participant.email,
        displayName: participant.displayName || participant.email,
      }));

    eventBus.publish(type, {
      meetingId: meeting._id,
      title: meeting.title,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      agenda: meeting.agenda,
      joinUrl: meeting.onlineMeeting?.joinUrl || '',
      actorId,
      recipientIds,
      externalRecipients,
      deepLink: meetingDeepLink(meeting._id),
      ...extra,
    }, { source: 'meetings' });
  }

  async _invalidateCaches(id) {
    await cacheManager.del(`meetings:${id}`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}meetings:list:*`);
  }

  async _logAudit(eventType, userId, meetingId, meta, details) {
    auditService.logEvent({
      eventType,
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { meetingId, ...details },
      module: 'meetings',
    });
  }
}

const meetingService = new MeetingService();
export default meetingService;
