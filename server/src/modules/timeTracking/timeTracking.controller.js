import timeTrackingService from './timeTracking.service.js';

class TimeTrackingController {
  async overview(req, res, next) {
    try {
      const data = await timeTrackingService.getOverview(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async listTimeEntries(req, res, next) {
    try {
      const data = await timeTrackingService.listTimeEntries(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async listOrderTimeEntries(req, res, next) {
    try {
      const data = await timeTrackingService.listTimeEntries({
        ...(req._validatedQuery || req.query),
        orderId: req.params.orderId,
      });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async createTimeEntry(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await timeTrackingService.createTimeEntry(req.params.orderId, req.body, req.user._id, meta);
      return res.success({ data, message: 'Time entry created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async updateTimeEntry(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await timeTrackingService.updateTimeEntry(req.params.entryId, req.body, req.user._id, meta);
      return res.success({ data, message: 'Time entry updated successfully' });
    } catch (err) { next(err); }
  }

  async deleteTimeEntry(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await timeTrackingService.deleteTimeEntry(req.params.entryId, req.user._id, meta);
      return res.success({ message: 'Time entry deleted successfully' });
    } catch (err) { next(err); }
  }

  async releaseTimeEntry(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await timeTrackingService.releaseTimeEntry(req.params.entryId, req.user._id, meta);
      return res.success({ data, message: data.released ? 'Time entry released successfully' : data.message });
    } catch (err) { next(err); }
  }

  async overrideTimeEntry(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await timeTrackingService.overrideTimeEntry(
        req.params.entryId,
        req.body.justification,
        req.user._id,
        meta,
      );
      return res.success({ data, message: 'Time entry manually released successfully' });
    } catch (err) { next(err); }
  }

  async exportTimeEntries(req, res, next) {
    try {
      const { filename, csv } = await timeTrackingService.exportTimeEntries(req._validatedQuery || req.query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (err) { next(err); }
  }

  async listLeaveRequests(req, res, next) {
    try {
      const data = await timeTrackingService.listLeaveRequests(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async createLeaveRequest(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await timeTrackingService.createLeaveRequest(req.body, req.user._id, meta);
      return res.success({ data, message: 'Leave request created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async approveLeaveRequest(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await timeTrackingService.approveLeaveRequest(req.params.id, req.body, req.user._id, meta);
      return res.success({ data, message: 'Leave request approved successfully' });
    } catch (err) { next(err); }
  }

  async rejectLeaveRequest(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await timeTrackingService.rejectLeaveRequest(req.params.id, req.body, req.user._id, meta);
      return res.success({ data, message: 'Leave request rejected successfully' });
    } catch (err) { next(err); }
  }

  async cancelLeaveRequest(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await timeTrackingService.cancelLeaveRequest(req.params.id, req.user._id, meta);
      return res.success({ data, message: 'Leave request cancelled successfully' });
    } catch (err) { next(err); }
  }

  async balances(req, res, next) {
    try {
      const data = await timeTrackingService.getVacationBalances(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async upsertBalance(req, res, next) {
    try {
      const data = await timeTrackingService.upsertVacationBalance(
        req.params.employeeId,
        Number(req.params.year),
        req.body,
        req.user._id,
      );
      return res.success({ data, message: 'Vacation balance updated successfully' });
    } catch (err) { next(err); }
  }

  async calendar(req, res, next) {
    try {
      const data = await timeTrackingService.getCalendar(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async analytics(req, res, next) {
    try {
      const data = await timeTrackingService.getAnalytics(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async aiContext(req, res, next) {
    try {
      const data = await timeTrackingService.getAiContext(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const timeTrackingController = new TimeTrackingController();
export default timeTrackingController;
