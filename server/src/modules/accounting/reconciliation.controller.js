import reconciliationService from './reconciliation.service.js';

class ReconciliationController {
  async run(req, res, next) {
    try {
      const result = await reconciliationService.runAutoReconciliation(req.body.bankAccountId);
      return res.success({ data: result, message: 'Auto-reconciliation completed' });
    } catch (err) { next(err); }
  }

  async getUnmatched(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await reconciliationService.getUnmatched(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getSuggestions(req, res, next) {
    try {
      const suggestions = await reconciliationService.getSuggestions(req.params.txId);
      return res.success({ data: suggestions });
    } catch (err) { next(err); }
  }

  async match(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await reconciliationService.manualMatch(
        req.body.transactionId,
        req.body.invoiceId,
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Transaction matched successfully' });
    } catch (err) { next(err); }
  }

  async matchAp(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await reconciliationService.manualMatchAp(
        req.body.transactionId,
        req.body.apInvoiceId,
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'AP transaction matched successfully' });
    } catch (err) { next(err); }
  }

  async categorize(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await reconciliationService.categorize(
        req.body.transactionId,
        req.body.accountId,
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Transaction categorized successfully' });
    } catch (err) { next(err); }
  }
}

const reconciliationController = new ReconciliationController();
export default reconciliationController;
