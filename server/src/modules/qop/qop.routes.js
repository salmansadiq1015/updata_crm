import { Router } from 'express';
import quotationRoutes from './quotation.routes.js';
import orderRoutes from './order.routes.js';
import invoiceRoutes from './invoice.routes.js';
import numberSequenceRoutes from './documentNumberSequence.routes.js';
import appointmentReminderRoutes from './appointmentReminder.routes.js';
import searchRoutes from './search.routes.js';
import quotationTemplateRoutes from './quotationTemplate.routes.js';

/**
 * QOP route aggregator.
 * Mounts all QOP sub-routers under /api/v1/qop.
 *
 * URL structure:
 *   /api/v1/qop/quotations           — quotation CRUD + actions
 *   /api/v1/qop/quotation-templates  — pre-filled quotation templates
 *   /api/v1/qop/orders               — order CRUD + actions
 *   /api/v1/qop/invoices             — invoice CRUD + actions
 *   /api/v1/qop/numbering/sequences  — document number sequence management
 *   /api/v1/qop/reminders            — appointment reminder management
 *   /api/v1/qop/documents            — cross-document search + reports
 */
const router = Router();

router.use('/quotations', quotationRoutes);
router.use('/quotation-templates', quotationTemplateRoutes);
router.use('/orders', orderRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/numbering/sequences', numberSequenceRoutes);
router.use('/reminders', appointmentReminderRoutes);
router.use('/documents', searchRoutes);

export default router;
