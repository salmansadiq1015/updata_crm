import entityNoteService from './entityNote.service.js';

class NoteController {
  async listByEntity(req, res, next) {
    try {
      const notes = await entityNoteService.listByEntity(req.entityType, req.params.id);
      return res.success({ data: notes });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const note = await entityNoteService.create(req.entityType, req.params.id, req.body, req.user._id, meta);
      return res.success({ data: note, message: 'Note created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const note = await entityNoteService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: note, message: 'Note updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await entityNoteService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Note deleted successfully' });
    } catch (err) { next(err); }
  }
}

const noteController = new NoteController();
export default noteController;
