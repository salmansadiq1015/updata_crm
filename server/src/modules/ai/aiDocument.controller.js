import aiDocumentService from './aiDocument.service.js';

class AiDocumentController {
  async preview(req, res, next) {
    try {
      const meta = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };
      const preview = await aiDocumentService.previewFromVoiceSession({
        sessionId: req.body.sessionId,
        templateType: req.body.templateType,
        userId: req.user._id,
        meta,
      });
      return res.success({ data: preview, message: 'Document preview generated from voice session', statusCode: 200 });
    } catch (err) {
      return next(err);
    }
  }

  async generate(req, res, next) {
    try {
      const meta = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };
      const doc = await aiDocumentService.generateFromVoiceSession({
        sessionId: req.body.sessionId,
        templateType: req.body.templateType,
        userId: req.user._id,
        meta,
      });
      return res.success({ data: doc, message: 'Document generated from voice session', statusCode: 201 });
    } catch (err) {
      return next(err);
    }
  }
}

const aiDocumentController = new AiDocumentController();
export default aiDocumentController;
