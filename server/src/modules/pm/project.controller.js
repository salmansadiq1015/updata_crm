import projectService from './project.service.js';

class ProjectController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const project = await projectService.create(req.body, req.user._id, meta);
      return res.success({ data: project, message: 'Project created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await projectService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const project = await projectService.getById(req.params.id);
      return res.success({ data: project });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const project = await projectService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: project, message: 'Project updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await projectService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Project deleted successfully' });
    } catch (err) { next(err); }
  }

  async duplicate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const project = await projectService.duplicate(req.params.id, req.user._id, meta);
      return res.success({ data: project, message: 'Project duplicated successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async search(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await projectService.search(query.q, query.limit);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async bulkUpdate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await projectService.bulkUpdate(req.body.ids, req.body.data, req.user._id, meta);
      return res.success({ data: result, message: `${result.modifiedCount} project(s) updated` });
    } catch (err) { next(err); }
  }

  async bulkDeactivate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await projectService.bulkDeactivate(req.body.ids, req.user._id, meta);
      return res.success({ data: result, message: `${result.deactivatedCount} project(s) archived` });
    } catch (err) { next(err); }
  }

  async dashboardSummary(req, res, next) {
    try {
      const data = await projectService.getDashboardSummary();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async dashboardMilestones(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await projectService.getDashboardMilestones(query.days);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const projectController = new ProjectController();
export default projectController;
