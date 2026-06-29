import taxService from './tax.service.js';

class TaxController {
  async listCodes(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const codes = await taxService.listCodes(query);
      return res.success({ data: codes });
    } catch (err) { next(err); }
  }

  async createCode(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const code = await taxService.createCode(req.body, req.user._id, meta);
      return res.success({ data: code, message: 'Tax code created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async updateCode(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const code = await taxService.updateCode(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: code, message: 'Tax code updated' });
    } catch (err) { next(err); }
  }

  async listGroups(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const groups = await taxService.listGroups(query);
      return res.success({ data: groups });
    } catch (err) { next(err); }
  }

  async createGroup(req, res, next) {
    try {
      const group = await taxService.createGroup(req.body, req.user._id);
      return res.success({ data: group, message: 'Tax group created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listExemptions(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const exemptions = await taxService.listExemptions(query);
      return res.success({ data: exemptions });
    } catch (err) { next(err); }
  }

  async createExemption(req, res, next) {
    try {
      const exemption = await taxService.createExemption(req.body, req.user._id);
      return res.success({ data: exemption, message: 'Tax exemption created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async calculate(req, res, next) {
    try {
      const calculation = await taxService.calculateDocument(req.body);
      return res.success({ data: calculation });
    } catch (err) { next(err); }
  }

  async listTransactions(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const transactions = await taxService.listTransactions(query);
      return res.success({ data: transactions });
    } catch (err) { next(err); }
  }

  async summary(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const summary = await taxService.getSummary(query);
      return res.success({ data: summary });
    } catch (err) { next(err); }
  }
}

const taxController = new TaxController();
export default taxController;
