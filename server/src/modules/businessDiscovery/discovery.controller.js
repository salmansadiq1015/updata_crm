import discoveryService from './discovery.service.js';
import locationService from './location.service.js';

/**
 * Discovery controller (Module 15). Thin HTTP layer: derive the acting identity
 * from `req.user._id` (never body/query), read validated input, delegate to the
 * service / location service, and respond via the standard envelope. All session
 * & result access is private to the creator — the service scopes every call.
 */
class DiscoveryController {
  async createDiscovery(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await discoveryService.createDiscovery(req.body, req.user._id, meta);
      // 202 Accepted — the run is processed asynchronously by the worker.
      return res.success({ data: result, message: 'Discovery started', statusCode: 202 });
    } catch (err) { next(err); }
  }

  async listSessions(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await discoveryService.listSessions(req.user._id, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getSession(req, res, next) {
    try {
      const session = await discoveryService.getSession(req.params.id, req.user._id);
      return res.success({ data: session });
    } catch (err) { next(err); }
  }

  async cancelSession(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const session = await discoveryService.cancel(req.params.id, req.user._id, meta);
      return res.success({ data: session, message: 'Discovery cancellation requested' });
    } catch (err) { next(err); }
  }

  async deleteSession(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await discoveryService.deleteSession(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Discovery session deleted' });
    } catch (err) { next(err); }
  }

  async listResults(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await discoveryService.listResults(req.params.id, req.user._id, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getResult(req, res, next) {
    try {
      const result = await discoveryService.getResult(req.params.resultId, req.user._id);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async getUsage(req, res, next) {
    try {
      const data = await discoveryService.getUsage(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getBusinessTypes(req, res, next) {
    try {
      const data = discoveryService.getBusinessTypes();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async geocode(req, res, next) {
    try {
      const data = await locationService.resolveLocation(req.body.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async autocomplete(req, res, next) {
    try {
      const { input, sessionToken, center } = req.body;
      const result = await locationService.autocomplete(input, { sessionToken, center });
      return res.success({ data: result.predictions });
    } catch (err) { next(err); }
  }
}

const discoveryController = new DiscoveryController();
export default discoveryController;
