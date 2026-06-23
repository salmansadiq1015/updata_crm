import calendarSyncService from './calendarSync.service.js';

class CalendarSyncController {
  async connect(req, res, next) {
    try {
      const authUrl = calendarSyncService.getAuthUrl(req.user._id, req.body.provider);
      return res.success({ data: { authUrl }, message: 'OAuth flow initiated' });
    } catch (err) { next(err); }
  }

  async callback(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const state = query.state ? JSON.parse(query.state) : {};
      const provider = query.provider || state.provider;
      const userId = req.user?._id || state.userId;
      const data = await calendarSyncService.handleCallback(userId, provider, query.code);
      return res.success({ data, message: 'Calendar connected successfully' });
    } catch (err) { next(err); }
  }

  async getStatus(req, res, next) {
    try {
      const data = await calendarSyncService.getConnectionStatus(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async disconnect(req, res, next) {
    try {
      const data = await calendarSyncService.disconnect(req.user._id, req.body.provider, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      return res.success({ data, message: 'Calendar disconnected successfully' });
    } catch (err) { next(err); }
  }
}

const calendarSyncController = new CalendarSyncController();
export default calendarSyncController;
