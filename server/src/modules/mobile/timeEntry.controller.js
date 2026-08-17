import timeEntryService from './timeEntry.service.js';
import { loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';

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

  // Office hours: no assignment in the URL, so none on the entry.
  async createOffice(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { technicianId, ...data } = req.body;

      // Booking for someone else is an administrative act — a project lead
      // correcting an absent colleague's day. Anyone else books for themselves,
      // whatever the payload claims.
      let owner = req.user._id;
      if (technicianId && String(technicianId) !== String(req.user._id)) {
        const permissions = await loadUserPermissions(req.user);
        // Deliberately not time-tracking:admin: that one is held by Techniker and
        // Lehrling for their own entries, and withheld from the Projektleiter —
        // the exact opposite of who should book on someone else's behalf.
        const canBookForOthers = req.user.role?.name === 'Admin'
          || satisfiesPermission(permissions, 'time-tracking:book-others');
        if (!canBookForOthers) {
          return res.fail({
            statusCode: 403,
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Zeiten für andere Mitarbeitende zu erfassen erfordert die Berechtigung time-tracking:book-others.',
          });
        }
        owner = technicianId;
      }

      const entry = await timeEntryService.create(null, data, owner, meta);
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

  async override(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await timeEntryService.override(
        req.params.entryId,
        req.body.justification,
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Time entry manually released successfully' });
    } catch (err) { next(err); }
  }
}

const timeEntryController = new TimeEntryController();
export default timeEntryController;
