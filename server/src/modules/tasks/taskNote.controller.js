import taskNoteService from './taskNote.service.js';

class TaskNoteController {
  async list(req, res, next) {
    try {
      const notes = await taskNoteService.getByTaskId(req.params.taskId, req.user._id);
      return res.success({ data: notes });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const note = await taskNoteService.create(req.params.taskId, req.body, req.user._id, meta);
      return res.success({ data: note, message: 'Note added successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const note = await taskNoteService.update(req.params.taskId, req.params.noteId, req.body, req.user._id, meta);
      return res.success({ data: note, message: 'Note updated successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await taskNoteService.remove(req.params.taskId, req.params.noteId, req.user._id, meta);
      return res.success({ data: result, message: 'Note deleted successfully' });
    } catch (err) { next(err); }
  }
}

const taskNoteController = new TaskNoteController();
export default taskNoteController;
