import fixedAssetService from './fixedAsset.service.js';

class FixedAssetController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const assets = await fixedAssetService.list(query);
      return res.success({ data: assets });
    } catch (err) { next(err); }
  }

  async summary(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const summary = await fixedAssetService.summary(query);
      return res.success({ data: summary });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const asset = await fixedAssetService.create(req.body, req.user._id, meta);
      return res.success({ data: asset, message: 'Fixed asset created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const asset = await fixedAssetService.getById(req.params.id);
      return res.success({ data: asset });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const asset = await fixedAssetService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: asset, message: 'Fixed asset updated' });
    } catch (err) { next(err); }
  }

  async activate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const asset = await fixedAssetService.activate(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: asset, message: 'Fixed asset activated' });
    } catch (err) { next(err); }
  }

  async depreciate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await fixedAssetService.depreciate(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: result, message: 'Depreciation posted' });
    } catch (err) { next(err); }
  }

  async dispose(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const asset = await fixedAssetService.dispose(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: asset, message: 'Fixed asset disposed' });
    } catch (err) { next(err); }
  }
}

const fixedAssetController = new FixedAssetController();
export default fixedAssetController;
