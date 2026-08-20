import { Router } from 'express';
import Joi from 'joi';
import WorkTimeSettings from './workTimeSettings.model.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';

const updateSchema = {
  body: Joi.object({
    breakDurationMin: Joi.number().min(0).max(240),
    breakThresholdHours: Joi.number().min(0).max(24),
    billingHourlyRate: Joi.number().min(0).max(10000),
  }).min(1),
};

/** Read the singleton, creating it with its defaults on first access. */
async function readSettings() {
  return WorkTimeSettings.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
}

const router = Router();

// Everyone booking time needs the rule; only admins change it.
router.get('/', authenticate, requirePermission('time-tracking:read'), async (req, res, next) => {
  try {
    return res.success({ data: await readSettings() });
  } catch (err) { next(err); }
});

router.put('/', authenticate, requirePermission('time-tracking:admin'), validate(updateSchema), async (req, res, next) => {
  try {
    const data = await WorkTimeSettings.findOneAndUpdate(
      { key: 'default' },
      { ...req.body, updatedBy: req.user._id },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
    return res.success({ data, message: 'Working-time settings updated successfully' });
  } catch (err) { next(err); }
});

export default router;
