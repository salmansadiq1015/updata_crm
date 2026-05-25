import accountMappingService from './accountMapping.service.js';

class AccountMappingController {
  async upsert(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const mapping = await accountMappingService.upsert(req.body, req.user._id, meta);
      return res.success({ data: mapping, message: 'Account mapping saved successfully' });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const mappings = await accountMappingService.list(query);
      return res.success({ data: mappings });
    } catch (err) {
      next(err);
    }
  }

  async resolve(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const accountId = await accountMappingService.resolveRequired(req.params.mappingType, query);
      return res.success({ data: { mappingType: req.params.mappingType, accountId } });
    } catch (err) {
      next(err);
    }
  }
}

const accountMappingController = new AccountMappingController();
export default accountMappingController;
