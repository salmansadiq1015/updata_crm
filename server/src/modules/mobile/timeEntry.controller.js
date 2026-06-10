import timeEntryService from './timeEntry.service.js';

class TimeEntryController {
  async listByOrder(req, res, next) {
    try {
      const entries = await timeEntryService.listByOrder(req.params.id);
      return res.success({ data: entries });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entry = await timeEntryService.create(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: entry, message: 'Time entry created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entry = await timeEntryService.update(req.params.entryId, req.body, req.user._id, meta);
      return res.success({ data: entry, message: 'Time entry updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await timeEntryService.delete(req.params.entryId, req.user._id, meta);
      return res.success({ message: 'Time entry deleted successfully' });
    } catch (err) { next(err); }
  }

  async listByDateRange(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      if (query.all === true || query.all === 'true') {
        const data = await timeEntryService.list({
          technicianId: query.technicianId,
          orderId: query.orderId,
          releaseStatus: query.releaseStatus,
          activityType: query.activityType,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          limit: query.limit ? Number(query.limit) : undefined,
        });
        return res.success({ data });
      }
      const data = await timeEntryService.listByDateRange(req.user._id, query.dateFrom, query.dateTo);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async release(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await timeEntryService.release(req.params.entryId, req.user._id, meta);
      return res.success({ data: result, message: result.released ? 'Time entry released successfully' : result.message });
    } catch (err) { next(err); }
  }
}

const timeEntryController = new TimeEntryController();
export default timeEntryController;
