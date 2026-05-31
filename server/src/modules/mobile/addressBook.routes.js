import { Router } from 'express';
import Joi from 'joi';
import addressBookController from './addressBook.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';

const router = Router();

const listAddressBookSchema = {
  query: Joi.object({
    lastSyncTimestamp: Joi.date().iso().allow(null),
  }),
};

router.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listAddressBookSchema),
  (req, res, next) => addressBookController.list(req, res, next),
);

export default router;
