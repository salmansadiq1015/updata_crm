import taskAttachmentService from './taskAttachment.service.js';

class TaskAttachmentController {
  async list(req, res, next) {
    try {
      const attachments = await taskAttachmentService.getByTaskId(req.params.taskId, req.user._id);
      return res.success({ data: attachments });
    } catch (err) { next(err); }
  }

  async upload(req, res, next) {
    try {
      if (!req.file) {
        return res.fail({
          statusCode: 400,
          code: 'FILE_REQUIRED',
          message: 'No file provided in the request',
        });
      }

      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const attachment = await taskAttachmentService.upload(req.params.taskId, req.file, req.user._id, meta);
      return res.success({ data: attachment, message: 'Attachment uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async download(req, res, next) {
    try {
      const result = await taskAttachmentService.download(req.params.taskId, req.params.attachmentId, req.user._id);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await taskAttachmentService.remove(req.params.taskId, req.params.attachmentId, req.user._id, meta);
      return res.success({ data: result, message: 'Attachment deleted successfully' });
    } catch (err) { next(err); }
  }
}

const taskAttachmentController = new TaskAttachmentController();
export default taskAttachmentController;
