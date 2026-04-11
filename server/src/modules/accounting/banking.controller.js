import bankingService from './banking.service.js';

class BankingController {
  async createAccount(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const account = await bankingService.createBankAccount(req.body, req.user._id, meta);
      return res.success({ data: account, message: 'Bank account created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getAccount(req, res, next) {
    try {
      const account = await bankingService.getBankAccount(req.params.id);
      return res.success({ data: account });
    } catch (err) { next(err); }
  }

  async listAccounts(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await bankingService.listBankAccounts(query);
      if (Array.isArray(data)) {
        return res.success({ data });
      }
      return res.success({ data: data.data, pagination: data.pagination });
    } catch (err) { next(err); }
  }

  async updateAccount(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const account = await bankingService.updateBankAccount(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: account, message: 'Bank account updated successfully' });
    } catch (err) { next(err); }
  }

  async importStatement(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await bankingService.importStatement(
        req.params.bankAccountId || req.body.bankAccountId,
        req.file.buffer,
        req.body.format || 'camt053',
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Bank statement imported successfully' });
    } catch (err) { next(err); }
  }

  async getTransactions(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await bankingService.getTransactions(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getTransaction(req, res, next) {
    try {
      const txn = await bankingService.getTransaction(req.params.id);
      return res.success({ data: txn });
    } catch (err) { next(err); }
  }

  async retrieveStatements(req, res, next) {
    try {
      const result = await bankingService.retrieveStatements(req.body.bankAccountId);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }
}

const bankingController = new BankingController();
export default bankingController;
