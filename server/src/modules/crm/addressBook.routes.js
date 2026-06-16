import { Router } from 'express';
import addressBookController from './addressBook.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { listAddressBookSchema } from './addressBook.validation.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('crm:read'),
  validate(listAddressBookSchema),
  (req, res, next) => addressBookController.list(req, res, next),
);

export default router;
