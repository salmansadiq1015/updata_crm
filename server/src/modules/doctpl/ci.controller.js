import ciService from './ci.service.js';

class CIController {
  async getActiveConfig(req, res, next) {
    try {
      const config = await ciService.getActiveConfig();
      return res.success({ data: config });
    } catch (err) { next(err); }
  }

  async updateConfig(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const config = await ciService.updateConfig(req.body, req.user._id, meta);
      return res.success({ data: config, message: 'CI configuration updated successfully' });
    } catch (err) { next(err); }
  }

  async uploadAsset(req, res, next) {
    try {
      if (!req.file) {
        return res.fail({
          statusCode: 400,
          code: 'FILE_REQUIRED',
          message: 'No file provided',
        });
      }
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const asset = await ciService.uploadAsset(req.file, req.body.assetType, req.user._id, meta);
      return res.success({ data: asset, message: 'CI asset uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listAssets(req, res, next) {
    try {
      const assets = await ciService.listAssets();
      return res.success({ data: assets });
    } catch (err) { next(err); }
  }

  async deleteAsset(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await ciService.deleteAsset(req.params.id, req.user._id, meta);
      return res.success({ message: 'CI asset deleted successfully' });
    } catch (err) { next(err); }
  }
}

const ciController = new CIController();
export default ciController;
