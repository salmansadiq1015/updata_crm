import { Router } from 'express';
import vehicleController from './vehicle.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listVehiclesSchema, vehicleIdParamSchema, createVehicleSchema, updateVehicleSchema,
  assignDriverSchema, createServiceSchema, createMaterialSchema, createNoteSchema,
  subResourceParamSchema,
} from './vehicle.validation.js';

const router = Router();
const read = requirePermission('vehicles:read');
const write = requirePermission('vehicles:write');

router.get('/', authenticate, read, validate(listVehiclesSchema), (req, res, next) => vehicleController.list(req, res, next));
router.post('/', authenticate, write, validate(createVehicleSchema), (req, res, next) => vehicleController.create(req, res, next));
router.get('/:id', authenticate, read, validate(vehicleIdParamSchema), (req, res, next) => vehicleController.getById(req, res, next));
router.patch('/:id', authenticate, write, validate(updateVehicleSchema), (req, res, next) => vehicleController.update(req, res, next));
router.delete('/:id', authenticate, write, validate(vehicleIdParamSchema), (req, res, next) => vehicleController.remove(req, res, next));

router.put('/:id/driver', authenticate, write, validate(assignDriverSchema), (req, res, next) => vehicleController.assignDriver(req, res, next));

router.get('/:id/services', authenticate, read, validate(vehicleIdParamSchema), (req, res, next) => vehicleController.listServices(req, res, next));
router.post('/:id/services', authenticate, write, validate(createServiceSchema), (req, res, next) => vehicleController.addService(req, res, next));
router.delete('/:id/services/:subId', authenticate, write, validate(subResourceParamSchema), (req, res, next) => vehicleController.deleteService(req, res, next));

router.get('/:id/materials', authenticate, read, validate(vehicleIdParamSchema), (req, res, next) => vehicleController.listMaterials(req, res, next));
router.get('/:id/materials/export/pdf', authenticate, read, validate(vehicleIdParamSchema), (req, res, next) => vehicleController.exportMaterialsPdf(req, res, next));
router.post('/:id/materials', authenticate, write, validate(createMaterialSchema), (req, res, next) => vehicleController.addMaterial(req, res, next));
router.delete('/:id/materials/:subId', authenticate, write, validate(subResourceParamSchema), (req, res, next) => vehicleController.deleteMaterial(req, res, next));

router.get('/:id/notes', authenticate, read, validate(vehicleIdParamSchema), (req, res, next) => vehicleController.listNotes(req, res, next));
router.post('/:id/notes', authenticate, write, validate(createNoteSchema), (req, res, next) => vehicleController.addNote(req, res, next));
router.delete('/:id/notes/:subId', authenticate, write, validate(subResourceParamSchema), (req, res, next) => vehicleController.deleteNote(req, res, next));

router.get('/:id/history', authenticate, read, validate(vehicleIdParamSchema), (req, res, next) => vehicleController.listHistory(req, res, next));

export default router;
