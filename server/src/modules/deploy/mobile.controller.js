class MobileController {
  async getMyAssignments(req, res, next) {
    try {
      const assignmentService = (await import('./assignment.service.js')).default;
      const { dateFrom, dateTo } = req.query;
      const data = await assignmentService.listByEmployee(req.user._id, dateFrom, dateTo);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getAssignmentDetail(req, res, next) {
    try {
      const assignmentService = (await import('./assignment.service.js')).default;
      const assignment = await assignmentService.getById(req.params.id);

      const assignmentEmployeeId = (assignment.employeeId?._id || assignment.employeeId).toString();
      const requestUserId = req.user._id.toString();

      if (assignmentEmployeeId !== requestUserId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You can only view your own assignments' },
        });
      }

      return res.success({ data: assignment });
    } catch (err) { next(err); }
  }

  async syncAssignments(req, res, next) {
    try {
      const assignmentService = (await import('./assignment.service.js')).default;
      const { since } = req.query;
      const data = await assignmentService.syncSince(req.user._id, since);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const mobileController = new MobileController();
export default mobileController;
