import accountingDocumentService from '../accounting/accountingDocument.service.js';

class ReceiptController {
  async upload(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const document = await accountingDocumentService.upload(
        req.file,
        {
          documentType: 'SUPPLIER_INVOICE',
          notes: req.body.notes || '',
          projectReference: req.body.projectReference || '',
        },
        req.user._id,
        meta,
      );

      const assigned = await accountingDocumentService.assignDocument(
        document._id,
        req.user._id,
        req.user._id,
        meta,
        req.body.notes || 'Uploaded from mobile receipt scan',
      );

      return res.success({
        data: {
          document: assigned,
          ocrStatus: assigned.ocrStatus,
        },
        message: 'Receipt uploaded successfully',
        statusCode: 201,
      });
    } catch (err) {
      next(err);
    }
  }
}

const receiptController = new ReceiptController();
export default receiptController;
