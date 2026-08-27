import { AppError } from '../../shared/errors/AppError.js';

const APK_SERVER_URL = process.env.APK_SERVER_URL;
const APK_UPLOAD_SECRET = process.env.APK_UPLOAD_SECRET;

class ApkController {
  async getInfo(req, res, next) {
    try {
      if (!APK_SERVER_URL) {
        return res.success({ data: null });
      }
      const response = await fetch(`${APK_SERVER_URL}/info`);
      if (!response.ok) {
        return res.success({ data: null });
      }
      const info = await response.json();
      return res.success({
        data: {
          ...info,
          downloadUrl: info.name ? `${APK_SERVER_URL}/files/${info.name}` : null,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getUploadCredentials(req, res, next) {
    try {
      if (!APK_SERVER_URL || !APK_UPLOAD_SECRET) {
        throw new AppError('APK server is not configured', 500);
      }
      return res.success({
        data: {
          uploadUrl: `${APK_SERVER_URL}/upload`,
          token: APK_UPLOAD_SECRET,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

const apkController = new ApkController();
export default apkController;
