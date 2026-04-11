import assignmentService from './assignment.service.js';

class AssignmentController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await assignmentService.create(req.body, req.user._id, meta);
      return res.success({ data: result, message: 'Assignment(s) created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const assignment = await assignmentService.getById(req.params.id);
      return res.success({ data: assignment });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const assignment = await assignmentService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: assignment, message: 'Assignment updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await assignmentService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Assignment deleted successfully' });
    } catch (err) { next(err); }
  }

  async move(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const assignment = await assignmentService.move(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: assignment, message: 'Assignment moved successfully' });
    } catch (err) { next(err); }
  }

  async resize(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const assignment = await assignmentService.resize(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: assignment, message: 'Assignment resized successfully' });
    } catch (err) { next(err); }
  }
}

const assignmentController = new AssignmentController();
export default assignmentController;
