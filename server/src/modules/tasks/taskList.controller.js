import taskListService from './taskList.service.js';

class TaskListController {
  async list(req, res, next) {
    try {
      const result = await taskListService.getAllForUser(req.user._id);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const list = await taskListService.create(req.body, req.user._id, meta);
      return res.success({ data: list, message: 'Task list created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const list = await taskListService.getById(req.params.id, req.user._id);
      return res.success({ data: list });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const list = await taskListService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: list, message: 'Task list updated successfully' });
    } catch (err) { next(err); }
  }

  async archive(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const list = await taskListService.archive(req.params.id, req.user._id, meta);
      return res.success({ data: list, message: 'Task list archived successfully' });
    } catch (err) { next(err); }
  }

  async unarchive(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const list = await taskListService.unarchive(req.params.id, req.user._id, meta);
      return res.success({ data: list, message: 'Task list unarchived successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await taskListService.remove(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Task list deleted successfully' });
    } catch (err) { next(err); }
  }

  async reorder(req, res, next) {
    try {
      const result = await taskListService.reorder(req.body.orderedIds, req.user._id);
      return res.success({ data: result, message: 'Task lists reordered successfully' });
    } catch (err) { next(err); }
  }

  async getMembers(req, res, next) {
    try {
      const members = await taskListService.getMembers(req.params.id, req.user._id);
      return res.success({ data: members });
    } catch (err) { next(err); }
  }

  async addMember(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const member = await taskListService.addMember(req.params.id, req.body.userId, req.body.role, req.user._id, meta);
      return res.success({ data: member, message: 'Member added successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async updateMemberRole(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const member = await taskListService.updateMemberRole(req.params.id, req.params.userId, req.body.role, req.user._id, meta);
      return res.success({ data: member, message: 'Member role updated successfully' });
    } catch (err) { next(err); }
  }

  async removeMember(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await taskListService.removeMember(req.params.id, req.params.userId, req.user._id, meta);
      return res.success({ data: result, message: 'Member removed successfully' });
    } catch (err) { next(err); }
  }

  async leave(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await taskListService.leaveGroup(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Left group list successfully' });
    } catch (err) { next(err); }
  }

  async transferOwnership(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const list = await taskListService.transferOwnership(req.params.id, req.body.newOwnerId, req.user._id, meta);
      return res.success({ data: list, message: 'Ownership transferred successfully' });
    } catch (err) { next(err); }
  }
}

const taskListController = new TaskListController();
export default taskListController;
