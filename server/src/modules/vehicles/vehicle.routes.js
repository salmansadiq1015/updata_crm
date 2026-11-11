import { Router } from 'express';
import multer from 'multer';
import c from './vehicle.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { uploadLimiter } from '../../shared/middleware/rateLimiter.js';
import {
  listVehiclesSchema, vehicleIdParamSchema, createVehicleSchema, updateVehicleSchema,
  assignDriverSchema, createServiceSchema, createMaterialSchema, createNoteSchema,
  subResourceParamSchema, listCostsSchema, createCostSchema, listBookingsSchema, createBookingSchema,
} from './vehicle.validation.js';

const router = Router();
const read = requirePermission('vehicles:read');
const write = requirePermission('vehicles:write');
const photo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

router.use(authenticate);

router.get('/', read, validate(listVehiclesSchema), c.list);
router.get('/stats', read, c.stats);
router.post('/', write, validate(createVehicleSchema), c.create);
router.get('/:id', read, validate(vehicleIdParamSchema), c.getById);
router.patch('/:id', write, validate(updateVehicleSchema), c.update);
router.delete('/:id', write, validate(vehicleIdParamSchema), c.remove);

router.put('/:id/driver', write, validate(assignDriverSchema), c.assignDriver);

router.post('/:id/photo', write, uploadLimiter, validate(vehicleIdParamSchema), photo.single('photo'), c.uploadPhoto);
router.delete('/:id/photo', write, validate(vehicleIdParamSchema), c.removePhoto);

router.get('/:id/services', read, validate(vehicleIdParamSchema), c.listServices);
router.post('/:id/services', write, validate(createServiceSchema), c.addService);
router.delete('/:id/services/:subId', write, validate(subResourceParamSchema), c.deleteService);

router.get('/:id/costs', read, validate(listCostsSchema), c.listCosts);
router.post('/:id/costs', write, validate(createCostSchema), c.addCost);
router.delete('/:id/costs/:subId', write, validate(subResourceParamSchema), c.deleteCost);

// Pool booking is open to every fleet reader; the service guards booking for others.
router.get('/:id/bookings', read, validate(listBookingsSchema), c.listBookings);
router.post('/:id/bookings', read, validate(createBookingSchema), c.addBooking);
router.delete('/:id/bookings/:subId', read, validate(subResourceParamSchema), c.cancelBooking);

router.get('/:id/materials', read, validate(vehicleIdParamSchema), c.listMaterials);
router.get('/:id/materials/export/pdf', read, validate(vehicleIdParamSchema), (req, res, next) => c.exportMaterialsPdf(req, res, next));
router.post('/:id/materials', write, validate(createMaterialSchema), c.addMaterial);
router.delete('/:id/materials/:subId', write, validate(subResourceParamSchema), c.deleteMaterial);

router.get('/:id/notes', read, validate(vehicleIdParamSchema), c.listNotes);
router.post('/:id/notes', write, validate(createNoteSchema), c.addNote);
router.delete('/:id/notes/:subId', write, validate(subResourceParamSchema), c.deleteNote);

router.get('/:id/history', read, validate(vehicleIdParamSchema), c.listHistory);

export default router;
