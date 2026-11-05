import bankingService from './banking.service.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

class BankingController {
  async analytics(req, res, next) {
    try {
      const data = await bankingService.analytics(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

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
      if (!req.file?.buffer) {
        throw new AppError('Bank statement file is required', 400, ERROR_CODES.FILE_UPLOAD_FAILED);
      }
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

  async importPaymentStatus(req, res, next) {
    try {
      if (!req.file?.buffer) {
        throw new AppError('Payment status report file is required', 400, ERROR_CODES.FILE_UPLOAD_FAILED);
      }
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await bankingService.importPaymentStatus(req.file.buffer, req.user._id, meta);
      return res.success({ data: result, message: 'Payment status report imported successfully' });
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
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await bankingService.retrieveStatements(req.body.bankAccountId, req.user._id, meta);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }
}

const bankingController = new BankingController();
export default bankingController;
