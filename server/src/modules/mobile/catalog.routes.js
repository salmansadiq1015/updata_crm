import { Router } from 'express';
import catalogController from './catalog.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  searchCatalogSchema,
  syncCatalogSchema,
  favoritesSchema,
  favoriteItemSchema,
  recentSchema,
} from './catalog.validation.js';

const router = Router();

router.get(
  '/search',
  authenticate,
  requirePermission('mobile:read'),
  validate(searchCatalogSchema),
  (req, res, next) => catalogController.search(req, res, next),
);

router.get(
  '/sync',
  authenticate,
  requirePermission('mobile:read'),
  validate(syncCatalogSchema),
  (req, res, next) => catalogController.sync(req, res, next),
);

router.get(
  '/favorites',
  authenticate,
  requirePermission('mobile:read'),
  validate(favoritesSchema),
  (req, res, next) => catalogController.listFavorites(req, res, next),
);

router.post(
  '/favorites/:itemId',
  authenticate,
  requirePermission('mobile:write'),
  validate(favoriteItemSchema),
  (req, res, next) => catalogController.addFavorite(req, res, next),
);

router.delete(
  '/favorites/:itemId',
  authenticate,
  requirePermission('mobile:write'),
  validate(favoriteItemSchema),
  (req, res, next) => catalogController.removeFavorite(req, res, next),
);

router.get(
  '/recent',
  authenticate,
  requirePermission('mobile:read'),
  validate(recentSchema),
  (req, res, next) => catalogController.listRecent(req, res, next),
);

export default router;
