class MobileController {
  async getMyAssignments(req, res, next) {
    try {
      const assignmentService = (await import('./assignment.service.js')).default;
      const { serializeMobileAssignments } = await import('./mobileAssignment.serializer.js');
      const { dateFrom, dateTo } = req.query;
      const assignments = await assignmentService.listByEmployee(req.user._id, dateFrom, dateTo);
      const data = await serializeMobileAssignments(assignments);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getAssignmentDetail(req, res, next) {
    try {
      const assignmentService = (await import('./assignment.service.js')).default;
      const { serializeMobileAssignment } = await import('./mobileAssignment.serializer.js');
      const assignment = await assignmentService.getById(req.params.id);

      const assignmentEmployeeId = (assignment.employeeId?._id || assignment.employeeId).toString();
      const requestUserId = req.user._id.toString();

      if (assignmentEmployeeId !== requestUserId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You can only view your own assignments' },
        });
      }

      const data = await serializeMobileAssignment(assignment);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async syncAssignments(req, res, next) {
    try {
      const assignmentService = (await import('./assignment.service.js')).default;
      const { serializeMobileAssignments } = await import('./mobileAssignment.serializer.js');
      const { since } = req.query;
      const assignments = await assignmentService.syncSince(req.user._id, since);
      const data = await serializeMobileAssignments(assignments);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const mobileController = new MobileController();
export default mobileController;
