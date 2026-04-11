import accountingDocumentService from './accountingDocument.service.js';

class AccountingDocumentController {
  async upload(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await accountingDocumentService.upload(req.file, req.body, req.user._id, meta);
      return res.success({ data: doc, message: 'Document uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const doc = await accountingDocumentService.getById(req.params.id);
      return res.success({ data: doc });
    } catch (err) { next(err); }
  }

  async download(req, res, next) {
    try {
      const url = await accountingDocumentService.getDownloadUrl(req.params.id);
      return res.success({ data: { downloadUrl: url } });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await accountingDocumentService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async triggerOcr(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await accountingDocumentService.triggerOcr(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'OCR processing triggered' });
    } catch (err) { next(err); }
  }

  async getOcrResult(req, res, next) {
    try {
      const result = await accountingDocumentService.getOcrResult(req.params.id);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async confirmOcr(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await accountingDocumentService.confirmOcrResult(
        req.params.id,
        req.body.corrections,
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'OCR result confirmed' });
    } catch (err) { next(err); }
  }

  async assign(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await accountingDocumentService.assignDocument(
        req.params.id,
        req.body.userId,
        req.user._id,
        meta,
      );
      return res.success({ data: doc, message: 'Document assigned successfully' });
    } catch (err) { next(err); }
  }

  async bulkAssign(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await accountingDocumentService.bulkAssign(
        req.body.documentIds,
        req.body.userId,
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: `${result.modifiedCount} document(s) assigned` });
    } catch (err) { next(err); }
  }
}

const accountingDocumentController = new AccountingDocumentController();
export default accountingDocumentController;
