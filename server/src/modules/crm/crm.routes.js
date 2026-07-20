import { Router } from 'express';
import customerRoutes from './customer.routes.js';
import contactRoutes, { customerContactsRouter } from './contact.routes.js';
import siteRoutes, { customerSitesRouter } from './site.routes.js';
import installationRoutes, { siteInstallationsRouter } from './installation.routes.js';
import sparePartRoutes, { installationSparePartsRouter } from './sparePart.routes.js';
import maintenanceRoutes from './maintenance.routes.js';
import assetMaintenanceRoutes from './assetMaintenance.routes.js';
import noteRoutes from './note.routes.js';
import imageRoutes from './image.routes.js';
import newsletterRoutes from './newsletter/newsletter.routes.js';
import supplierRoutes from './supplier.routes.js';
import purchaseOrderRoutes from './purchaseOrder.routes.js';
import procurementRoutes from './procurement.routes.js';
import addressBookRoutes from './addressBook.routes.js';

/**
 * CRM route aggregator.
 * Mounts all CRM sub-routers under /api/v1/crm.
 *
 * URL structure:
 *   /api/v1/crm/customers                          — customer CRUD
 *   /api/v1/crm/customers/:customerId/contacts     — nested contacts
 *   /api/v1/crm/customers/:customerId/sites        — nested sites
 *   /api/v1/crm/contacts/:id                       — contact by ID
 *   /api/v1/crm/sites/:id                          — site by ID + notes/images
 *   /api/v1/crm/sites/:siteId/installations        — nested installations
 *   /api/v1/crm/installations/:id                  — installation by ID + notes/images/maintenance
 *   /api/v1/crm/maintenance/dashboard|due|overdue   — standalone maintenance endpoints
 *   /api/v1/crm/notes/:id                          — note update/delete
 *   /api/v1/crm/images/:id                         — image delete
 */
const router = Router();

// Customer routes (includes /search, /duplicates, /bulk-update, /bulk-delete, /merge)
router.use('/customers', customerRoutes);

// Shared address book read model over customers, contacts, and sites
router.use('/address-book', addressBookRoutes);

// Nested routers under customers
router.use('/customers/:customerId/contacts', customerContactsRouter);
router.use('/customers/:customerId/sites', customerSitesRouter);

// Contact standalone routes
router.use('/contacts', contactRoutes);

// Site standalone routes (includes note/image sub-routes)
router.use('/sites', siteRoutes);

// Nested installations under sites
router.use('/sites/:siteId/installations', siteInstallationsRouter);

// Installation standalone routes (includes note/image/maintenance sub-routes)
router.use('/installations', installationRoutes);

// Installation spare parts sub-routes
router.use('/installations/:id/spare-parts', installationSparePartsRouter);

// Spare parts standalone routes
router.use('/spare-parts', sparePartRoutes);

// Procurement routes
router.use('/suppliers', supplierRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/procurement', procurementRoutes);

// Maintenance standalone routes (dashboard, due, overdue, update, delete)
router.use('/asset-maintenance', assetMaintenanceRoutes);
router.use('/maintenance', maintenanceRoutes);

// Note standalone routes (update, delete)
router.use('/notes', noteRoutes);

// Image standalone routes (delete)
router.use('/images', imageRoutes);

// Newsletter routes (compose, schedule, send, track)
router.use('/newsletters', newsletterRoutes);

export default router;
