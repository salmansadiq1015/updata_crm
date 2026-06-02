import prepActionService from './prepAction.service.js';
import { ValidationError } from '../../shared/errors/AppError.js';

class PrepActionController {
  async list(req, res, next) {
    try {
      const actions = await prepActionService.listByProject(req.params.id);
      return res.success({ data: actions });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const action = await prepActionService.create(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: action, message: 'Preparatory action created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const action = await prepActionService.getById(req.params.actionId);
      return res.success({ data: action });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const action = await prepActionService.update(req.params.actionId, req.body, req.user._id, meta);
      return res.success({ data: action, message: 'Preparatory action updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await prepActionService.delete(req.params.actionId, req.user._id, meta);
      return res.success({ message: 'Preparatory action deleted successfully' });
    } catch (err) { next(err); }
  }

  async listAttachments(req, res, next) {
    try {
      const attachments = await prepActionService.listAttachments(req.params.actionId);
      return res.success({ data: attachments });
    } catch (err) { next(err); }
  }

  async uploadAttachment(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      if (!req.file) throw new ValidationError('A file is required');
      const { buffer, originalname, mimetype, size } = req.file;
      const fileData = {
        buffer,
        originalName: originalname,
        mimeType: mimetype,
        sizeBytes: size,
      };
      const attachments = await prepActionService.addAttachment(req.params.actionId, fileData, req.user._id, meta);
      return res.success({ data: attachments, message: 'Attachment uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async downloadAttachment(req, res, next) {
    try {
      const url = await prepActionService.getAttachmentDownloadUrl(req.params.actionId, req.params.fileId);
      return res.success({ data: { url } });
    } catch (err) { next(err); }
  }

  async history(req, res, next) {
    try {
      const entries = await prepActionService.getHistory(req.params.actionId);
      return res.success({ data: entries });
    } catch (err) { next(err); }
  }
}

const prepActionController = new PrepActionController();
export default prepActionController;
