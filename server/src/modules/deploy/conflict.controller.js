import conflictService from './conflict.service.js';

class ConflictController {
  async check(req, res, next) {
    try {
      const { employeeId, startDatetime, endDatetime, excludeAssignmentId } = req.body;
      const result = await conflictService.checkConflicts(
        employeeId,
        new Date(startDatetime),
        new Date(endDatetime),
        excludeAssignmentId || null,
      );
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async listActive(req, res, next) {
    try {
      const data = await conflictService.listActive();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async resolve(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await conflictService.resolve(
        req.params.id,
        req.body.overrideReason,
        req.user._id,
        meta,
      );
      return res.success({ data, message: 'Conflict resolved successfully' });
    } catch (err) { next(err); }
  }
}

const conflictController = new ConflictController();
export default conflictController;
