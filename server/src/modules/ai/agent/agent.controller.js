import agentService from './agent.service.js';

class AgentController {
  async run(req, res, next) {
    try {
      const result = await agentService.run(
        req.body.input,
        req.user._id.toString(),
        req.user.permissions || [],
        { ipAddress: req.ip, userAgent: req.get('user-agent'), correlationId: req.id },
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
      const runs = await agentService.listRuns(
        req.user._id.toString(),
        req._validatedQuery || req.query,
      );
      res.success({ data: runs });
    } catch (err) {
      next(err);
    }
  }
}

export default new AgentController();
