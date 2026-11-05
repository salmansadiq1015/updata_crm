import { Router } from 'express';
import multer from 'multer';
import bankingController from './banking.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createBankAccountSchema, updateBankAccountSchema, listBankAccountsSchema, bankingAnalyticsSchema,
  listTransactionsSchema, transactionIdParamSchema,
  bankAccountIdParamSchema, retrieveStatementsSchema,
} from './banking.validation.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Named routes BEFORE /:id
router.get('/analytics', authenticate, requirePermission('accounting:bank:read'), validate(bankingAnalyticsSchema), (req, res, next) => bankingController.analytics(req, res, next));
router.get('/transactions', authenticate, requirePermission('accounting:bank:read'), validate(listTransactionsSchema), (req, res, next) => bankingController.getTransactions(req, res, next));
router.get('/transactions/:id', authenticate, requirePermission('accounting:bank:read'), validate(transactionIdParamSchema), (req, res, next) => bankingController.getTransaction(req, res, next));
router.post('/import', authenticate, requirePermission('accounting:bank:manage'), upload.single('file'), (req, res, next) => bankingController.importStatement(req, res, next));
router.post('/payment-status/import', authenticate, requirePermission('accounting:bank:manage'), upload.single('file'), (req, res, next) => bankingController.importPaymentStatus(req, res, next));
router.post('/retrieve', authenticate, requirePermission('accounting:bank:manage'), validate(retrieveStatementsSchema), (req, res, next) => bankingController.retrieveStatements(req, res, next));

// Standard CRUD
router.get('/', authenticate, requirePermission('accounting:bank:read'), validate(listBankAccountsSchema), (req, res, next) => bankingController.listAccounts(req, res, next));
router.post('/', authenticate, requirePermission('accounting:bank:manage'), validate(createBankAccountSchema), (req, res, next) => bankingController.createAccount(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:bank:read'), validate(bankAccountIdParamSchema), (req, res, next) => bankingController.getAccount(req, res, next));
router.put('/:id', authenticate, requirePermission('accounting:bank:manage'), validate(updateBankAccountSchema), (req, res, next) => bankingController.updateAccount(req, res, next));

export default router;
