import { Router } from 'express';
import entityNoteService from '../crm/entityNote.service.js';
import { requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { createMobileNoteSchema } from './note.validation.js';

const router = Router();

router.post(
  '/:entityType/:entityId',
  requirePermission('mobile:write'),
  validate(createMobileNoteSchema),
  async (req, res, next) => {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { entityType, entityId } = req.params;
      const note = await entityNoteService.create(entityType, entityId, req.body, req.user._id, meta);
      return res.success({ data: note, message: 'Note created successfully', statusCode: 201 });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
