import { Router } from 'express';
import Joi from 'joi';
import WorkType from './workType.model.js';
import auditService from '../auth/audit.service.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

const fields = {
  name: Joi.string().trim().max(150),
  standardDurationMin: Joi.number().min(0).max(1440),
  description: Joi.string().trim().max(500).allow('', null),
  assignmentType: Joi.string().trim().max(50).allow('', null),
  sortOrder: Joi.number().integer(),
  isActive: Joi.boolean(),
};
const createSchema = {
  body: Joi.object({ ...fields, name: fields.name.required(), standardDurationMin: fields.standardDurationMin.required() }),
};
const updateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(fields).min(1),
};
const idSchema = { params: Joi.object({ id: objectId.required() }) };

const router = Router();

// Read by anyone who plans; managed by scheduling admins.
router.get('/', authenticate, requirePermission('scheduling:read'), async (req, res, next) => {
  try {
    const filter = req.query?.includeInactive ? {} : { isActive: true };
    const data = await WorkType.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    return res.success({ data });
  } catch (err) { next(err); }
});

router.post('/', authenticate, requirePermission('scheduling:admin'), validate(createSchema), async (req, res, next) => {
  try {
    const workType = await WorkType.create({ ...req.body, createdBy: req.user._id });
    auditService.logEvent({
      eventType: 'work_type.created',
      userId: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      result: 'success',
      details: { workTypeId: workType._id, name: workType.name },
      module: 'deploy',
    });
    return res.success({ data: workType, message: 'Work type created successfully', statusCode: 201 });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, requirePermission('scheduling:admin'), validate(updateSchema), async (req, res, next) => {
  try {
    const workType = await WorkType.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after', runValidators: true,
    }).lean();
    if (!workType) throw new NotFoundError('WorkType', req.params.id);
    return res.success({ data: workType, message: 'Work type updated successfully' });
  } catch (err) { next(err); }
});

// Deactivate rather than delete: assignments planned from it keep their meaning.
router.delete('/:id', authenticate, requirePermission('scheduling:admin'), validate(idSchema), async (req, res, next) => {
  try {
    const workType = await WorkType.findByIdAndUpdate(req.params.id, { isActive: false }, { returnDocument: 'after' }).lean();
    if (!workType) throw new NotFoundError('WorkType', req.params.id);
    return res.success({ message: 'Work type deactivated successfully' });
  } catch (err) { next(err); }
});

export default router;
