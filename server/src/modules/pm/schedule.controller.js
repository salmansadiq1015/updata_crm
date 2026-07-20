import scheduleService from './schedule.service.js';

class ScheduleController {
  async getSchedule(req, res, next) {
    try {
      const entries = await scheduleService.getSchedule(req.params.id);
      return res.success({ data: entries });
    } catch (err) { next(err); }
  }

  async getConflicts(req, res, next) {
    try {
      const result = await scheduleService.detectConflicts(req.params.id);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async sendBulkConfirmations(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await scheduleService.sendBulkConfirmations(req.body.items, req.user._id, meta);
      return res.success({ data: result, message: 'Bulk confirmations processed' });
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

  async exportSchedule(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const format = query.format || 'pdf';

      if (format === 'ical') {
        const icalData = await scheduleService.exportIcal(req.params.id);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="schedule.ics"');
        return res.send(icalData);
      }

      if (format === 'excel') {
        const { csv, filename } = await scheduleService.exportExcel(req.params.id);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
      }

      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const generatedDoc = await scheduleService.exportPdf(req.params.id, req.user._id, meta);
      return res.success({ data: generatedDoc, message: 'Schedule PDF generated successfully' });
    } catch (err) { next(err); }
  }

  async transferSchedule(req, res, next) {
    try {
      const body = req._validatedBody || req.body || {};
      const target = body.target || 'einsatzplanung';
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await scheduleService.transferToEinsatzplanung(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Schedule transferred to Einsatzplanung' });
    } catch (err) { next(err); }
  }
}

const scheduleController = new ScheduleController();
export default scheduleController;
