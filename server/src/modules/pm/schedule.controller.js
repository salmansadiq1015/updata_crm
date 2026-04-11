import scheduleService from './schedule.service.js';

class ScheduleController {
  async getSchedule(req, res, next) {
    try {
      const entries = await scheduleService.getSchedule(req.params.id);
      return res.success({ data: entries });
    } catch (err) { next(err); }
  }

  async addEntry(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entry = await scheduleService.addEntry(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: entry, message: 'Schedule entry created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async updateEntry(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entry = await scheduleService.updateEntry(req.params.entryId, req.body, req.user._id, meta);
      return res.success({ data: entry, message: 'Schedule entry updated successfully' });
    } catch (err) { next(err); }
  }

  async deleteEntry(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await scheduleService.deleteEntry(req.params.entryId, req.user._id, meta);
      return res.success({ message: 'Schedule entry deleted successfully' });
    } catch (err) { next(err); }
  }

  async sendConfirmation(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const confirmation = await scheduleService.sendConfirmation(req.params.entryId, req.body, req.user._id, meta);
      return res.success({ data: confirmation, message: 'Partner confirmation sent successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async updateConfirmationResponse(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const confirmation = await scheduleService.updateConfirmationResponse(req.params.confId, req.body, req.user._id, meta);
      return res.success({ data: confirmation, message: 'Confirmation response updated successfully' });
    } catch (err) { next(err); }
  }
}

const scheduleController = new ScheduleController();
export default scheduleController;
