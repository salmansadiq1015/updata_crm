import { Router } from 'express';
import meetingController from './meeting.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  attendanceSchema,
  cancelMeetingSchema,
  createMeetingSchema,
  decisionSchema,
  followUpTaskSchema,
  listMeetingsSchema,
  meetingIdParamSchema,
  minutesSchema,
  noteSchema,
  rsvpSchema,
  updateMeetingSchema,
} from './meeting.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('meetings:read'), validate(listMeetingsSchema), (req, res, next) => meetingController.list(req, res, next));
router.post('/', authenticate, requirePermission('meetings:write'), validate(createMeetingSchema), (req, res, next) => meetingController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('meetings:read'), validate(meetingIdParamSchema), (req, res, next) => meetingController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('meetings:write'), validate(updateMeetingSchema), (req, res, next) => meetingController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('meetings:delete'), validate(meetingIdParamSchema), (req, res, next) => meetingController.remove(req, res, next));
router.post('/:id/cancel', authenticate, requirePermission('meetings:write'), validate(cancelMeetingSchema), (req, res, next) => meetingController.cancel(req, res, next));
router.post('/:id/rsvp', authenticate, requirePermission('meetings:read'), validate(rsvpSchema), (req, res, next) => meetingController.rsvp(req, res, next));
router.patch('/:id/attendance', authenticate, requirePermission('meetings:write'), validate(attendanceSchema), (req, res, next) => meetingController.attendance(req, res, next));
router.post('/:id/notes', authenticate, requirePermission('meetings:write'), validate(noteSchema), (req, res, next) => meetingController.addNote(req, res, next));
router.patch('/:id/minutes', authenticate, requirePermission('meetings:write'), validate(minutesSchema), (req, res, next) => meetingController.updateMinutes(req, res, next));
router.post('/:id/decisions', authenticate, requirePermission('meetings:write'), validate(decisionSchema), (req, res, next) => meetingController.addDecision(req, res, next));
router.post('/:id/tasks', authenticate, requirePermission('meetings:write'), validate(followUpTaskSchema), (req, res, next) => meetingController.createTask(req, res, next));

export default router;
