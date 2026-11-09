import voiceAgentService from './voiceAgent.service.js';
import { loadUserPermissions } from '../../../shared/middleware/authenticate.js';

function isValidTimeZone(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

class VoiceAgentController {
  async status(req, res, next) {
    try {
      res.success({ data: voiceAgentService.status() });
    } catch (err) { next(err); }
  }

  async createSession(req, res, next) {
    try {
      const data = await voiceAgentService.createSession({
        user: req.user,
        voice: req.body.voice,
        locale: req.body.locale,
        currentPage: req.body.currentPage || null,
        threadId: req.body.threadId || null,
        timeZone: isValidTimeZone(req.body.timeZone) ? req.body.timeZone : 'Europe/Zurich',
        meta: { ipAddress: req.ip, userAgent: req.get('user-agent') },
      });
      res.success({ data, message: 'Voice session created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async runTool(req, res, next) {
    try {
      // Same permission loading as the chat agent: Admin = wildcard.
      const isAdmin = req.user.role?.name === 'Admin';
      const permissions = isAdmin ? ['*'] : await loadUserPermissions(req.user);
      const data = await voiceAgentService.runTool({
        name: req.body.name,
        args: req.body.arguments || {},
        user: req.user,
        permissions,
        threadId: req.body.threadId,
        currentPage: req.body.currentPage || null,
        timeZone: isValidTimeZone(req.body.timeZone) ? req.body.timeZone : 'Europe/Zurich',
        meta: { ipAddress: req.ip, userAgent: req.get('user-agent') },
      });
      res.success({ data });
    } catch (err) { next(err); }
  }
}

export default new VoiceAgentController();
