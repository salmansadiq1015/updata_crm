import voiceSessionService from './voiceSession.service.js';

class VoiceSessionController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const session = await voiceSessionService.create(req.body, req.user._id, meta);
      return res.success({ data: session, message: 'Voice session created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async uploadAudio(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await voiceSessionService.uploadAudio(req.params.sessionId, req.file.buffer, req.file.mimetype, req.user._id, meta);
      return res.success({ data: result, message: 'Audio uploaded successfully', statusCode: 202 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const session = await voiceSessionService.getById(req.params.sessionId, req.user._id);
      return res.success({ data: session });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await voiceSessionService.list(req.user._id, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async submitCorrections(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const session = await voiceSessionService.submitCorrections(req.params.sessionId, req.body, req.user._id, meta);
      return res.success({ data: session, message: 'Corrections submitted successfully' });
    } catch (err) { next(err); }
  }

  async confirm(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const session = await voiceSessionService.confirm(req.params.sessionId, req.user._id, meta);
      return res.success({ data: session, message: 'Session confirmed successfully' });
    } catch (err) { next(err); }
  }

  async cancel(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const session = await voiceSessionService.cancel(req.params.sessionId, req.user._id, meta);
      return res.success({ data: session, message: 'Session cancelled successfully' });
    } catch (err) { next(err); }
  }
}

const voiceSessionController = new VoiceSessionController();
export default voiceSessionController;
