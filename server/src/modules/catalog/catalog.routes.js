import { Router } from 'express';
import unitOfMeasureRoutes from './unitOfMeasure.routes.js';
import priceRoutes from './price.routes.js';
import ighRoutes from './igh.routes.js';
import pickerRoutes from './picker.routes.js';
import catalogSearchRoutes from './catalogSearch.routes.js';

/**
 * Catalog route aggregator.
 * Mounts all catalog sub-routers under /api/v1/catalog.
 *
 * URL structure:
 *   /api/v1/catalog/categories          — catalog category CRUD
 *   /api/v1/catalog/articles            — article CRUD
 *   /api/v1/catalog/text-blocks         — text block CRUD
 *   /api/v1/catalog/units               — unit of measure CRUD
 *   /api/v1/catalog/prices              — price management
 *   /api/v1/catalog/igh                 — IGH integration
 *   /api/v1/catalog/picker              — picker search
 */
const router = Router();

// Sub-routers that exist already are lazy-loaded to avoid import errors
// if their source files are created later in the project lifecycle.

// Categories (lazy — file may not exist yet)
try {
  const { default: catalogCategoryRoutes } = await import('./catalogCategory.routes.js');
  router.use('/categories', catalogCategoryRoutes);
} catch {
  // catalogCategory.routes.js not yet created — skip
}

// Articles (lazy — file may not exist yet)
try {
  const { default: articleRoutes } = await import('./article.routes.js');
  router.use('/articles', articleRoutes);
} catch {
  // article.routes.js not yet created — skip
}

// Text blocks (lazy — file may not exist yet)
try {
  const { default: textBlockRoutes } = await import('./textBlock.routes.js');
  router.use('/text-blocks', textBlockRoutes);
} catch {
  // textBlock.routes.js not yet created — skip
}

// Units of measure
router.use('/units', unitOfMeasureRoutes);

// Price management
router.use('/prices', priceRoutes);

// IGH integration
router.use('/igh', ighRoutes);

// Picker
router.use('/picker', pickerRoutes);

// Search analytics/recent searches
router.use('/search', catalogSearchRoutes);

export default router;
