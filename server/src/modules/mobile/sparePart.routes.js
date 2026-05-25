import { Router } from 'express';
import Joi from 'joi';
import sparePartController from '../crm/sparePart.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { requirePermission } from '../../shared/middleware/authenticate.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import {
  searchSparePartsSchema,
  linkSparePartSchema,
  flagSparePartOrderSchema,
} from '../crm/sparePart.validation.js';

const sparePartRouter = Router();
const installationSparePartRouter = Router({ mergeParams: true });

const installationIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};

sparePartRouter.get(
  '/search',
  requirePermission('mobile:read'),
  validate(searchSparePartsSchema),
  (req, res, next) => sparePartController.search(req, res, next),
);

installationSparePartRouter.get(
  '/',
  requirePermission('mobile:read'),
  validate(installationIdSchema),
  (req, res, next) => sparePartController.getByInstallation(req, res, next),
);

installationSparePartRouter.post(
  '/',
  requirePermission('mobile:write'),
  validate(linkSparePartSchema),
  (req, res, next) => sparePartController.linkToInstallation(req, res, next),
);

installationSparePartRouter.post(
  '/:sparePartId/order-flag',
  requirePermission('mobile:write'),
  validate(flagSparePartOrderSchema),
  (req, res, next) => sparePartController.flagForOrdering(req, res, next),
);

export { sparePartRouter, installationSparePartRouter };
