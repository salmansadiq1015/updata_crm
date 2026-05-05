import agentService from './agent.service.js';
import { loadUserPermissions } from '../../../shared/middleware/authenticate.js';

class AgentController {
  async run(req, res, next) {
    try {
      // Admin role bypasses all permission checks — pass wildcard so tool runner skips checks.
      // All other roles: load their actual permission strings from DB/cache.
      const isAdmin = req.user.role?.name === 'Admin';
      const permissions = isAdmin ? ['*'] : await loadUserPermissions(req.user);

      const result = await agentService.run(
        req.body.input,
        req.user._id.toString(),
        permissions,
        { ipAddress: req.ip, userAgent: req.get('user-agent'), correlationId: req.id, threadId: req.body.threadId },
      );
      res.success({ data: result, message: 'Agent run dispatched', statusCode: 202 });
    } catch (err) {
      next(err);
    }
  }

  async confirm(req, res, next) {
    try {
      const result = await agentService.confirmRun(
        req.params.runId,
        req.user._id.toString(),
        req.body.decision,
      );
      res.success({
        data: result,
        message: req.body.decision ? 'Agent run resumed' : 'Agent run cancelled',
      });
    } catch (err) {
      next(err);
    }
  }

  async getStatus(req, res, next) {
    try {
      const run = await agentService.getStatus(req.params.runId, req.user._id.toString());
      res.success({ data: run });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const threads = await agentService.listThreads(
        req.user._id.toString(),
        req._validatedQuery || req.query,
      );
      res.success({ data: threads });
    } catch (err) {
      next(err);
    }
  }

  async listThread(req, res, next) {
    try {
      const runs = await agentService.getThread(req.user._id.toString(), req.params.threadId);
      res.success({ data: runs });
    } catch (err) {
      next(err);
    }
  }

  async archiveThread(req, res, next) {
    try {
      const result = await agentService.archiveThread(req.user._id.toString(), req.params.threadId);
      res.success({ data: result, message: 'Thread archived' });
    } catch (err) {
      next(err);
    }
  }

  async deleteThread(req, res, next) {
    try {
      const result = await agentService.deleteThread(req.user._id.toString(), req.params.threadId);
      res.success({ data: result, message: 'Thread deleted' });
    } catch (err) {
      next(err);
    }
  }

  async archive(req, res, next) {
    try {
      const result = await agentService.archiveRun(req.params.runId, req.user._id.toString());
      res.success({ data: result, message: 'Chat archived' });
    } catch (err) {
      next(err);
    }
  }

  async unarchive(req, res, next) {
    try {
      const result = await agentService.unarchiveRun(req.params.runId, req.user._id.toString());
      res.success({ data: result, message: 'Chat unarchived' });
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const result = await agentService.deleteRun(req.params.runId, req.user._id.toString());
      res.success({ data: result, message: 'Chat deleted' });
    } catch (err) {
      next(err);
    }
  }
}

export default new AgentController();
