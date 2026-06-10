import accountingDocumentService from '../accounting/accountingDocument.service.js';

class ReceiptController {
  async upload(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const assignmentNote = [
        req.body.notes || 'Uploaded from mobile receipt scan',
        req.body.projectReference ? `Project: ${req.body.projectReference}` : '',
        req.body.accountingCategory ? `Category: ${req.body.accountingCategory}` : '',
      ].filter(Boolean).join(' · ');
      const document = await accountingDocumentService.upload(
        req.file,
        {
          documentType: 'RECEIPT',
          notes: req.body.notes || '',
          projectReference: req.body.projectReference || '',
          supplierName: req.body.supplierName || '',
          receiptDate: req.body.receiptDate || null,
          amount: req.body.amount ?? null,
          vat: req.body.vat ?? null,
          receiptType: req.body.receiptType || null,
          accountingCategory: req.body.accountingCategory || '',
          projectId: req.body.projectId || null,
          customerId: req.body.customerId || null,
          employeeId: req.body.employeeId || req.user._id,
          autoAssignmentStatus: req.body.autoAssignmentStatus || 'CONFIRMED',
        },
        req.user._id,
        meta,
      );

      const assignedTo = req.body.employeeId || req.user._id;
      const assigned = await accountingDocumentService.assignDocument(
        document._id,
        assignedTo,
        req.user._id,
        meta,
        assignmentNote,
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
