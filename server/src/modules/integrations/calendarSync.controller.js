import calendarSyncService from './calendarSync.service.js';

class CalendarSyncController {
  async connect(req, res, next) {
    try {
      const result = await calendarSyncService.connect(req.body.provider, req.user._id);
      return res.success({ data: { authUrl: result.authUrl }, message: 'OAuth flow initiated' });
    } catch (err) { next(err); }
  }

  async callback(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await calendarSyncService.callback(query.code, query.state, query.provider);
      return res.success({ data, message: 'Calendar connected successfully' });
    } catch (err) { next(err); }
  }

  async getStatus(req, res, next) {
    try {
      const data = await calendarSyncService.getStatus(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async disconnect(req, res, next) {
    try {
      const data = await calendarSyncService.disconnect(req.body.provider, req.user._id);
      return res.success({ data, message: 'Calendar disconnected successfully' });
    } catch (err) { next(err); }
  }
}

const calendarSyncController = new CalendarSyncController();
export default calendarSyncController;
