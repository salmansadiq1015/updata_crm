import meetingService from './meeting.service.js';

class MeetingController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await meetingService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const meeting = await meetingService.create(req.body, req.user._id, meta);
      return res.success({ data: meeting, message: 'Meeting created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const meeting = await meetingService.getById(req.params.id);
      return res.success({ data: meeting });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const meeting = await meetingService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: meeting, message: 'Meeting updated successfully' });
    } catch (err) { next(err); }
  }

  async cancel(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const meeting = await meetingService.cancel(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: meeting, message: 'Meeting cancelled successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await meetingService.remove(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Meeting deleted successfully' });
    } catch (err) { next(err); }
  }

  async rsvp(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const meeting = await meetingService.updateRsvp(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: meeting, message: 'RSVP updated successfully' });
    } catch (err) { next(err); }
  }

  async attendance(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const meeting = await meetingService.updateAttendance(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: meeting, message: 'Attendance updated successfully' });
    } catch (err) { next(err); }
  }

  async addNote(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const meeting = await meetingService.addNote(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: meeting, message: 'Meeting note added successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async updateMinutes(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const meeting = await meetingService.updateMinutes(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: meeting, message: 'Meeting minutes updated successfully' });
    } catch (err) { next(err); }
  }

  async addDecision(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const meeting = await meetingService.addDecision(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: meeting, message: 'Meeting decision added successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async createTask(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await meetingService.createTaskFromMeeting(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: result, message: 'Follow-up task created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }
}

const meetingController = new MeetingController();
export default meetingController;
