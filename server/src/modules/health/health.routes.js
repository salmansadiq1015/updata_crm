import { Router } from 'express';
import healthController from './health.controller.js';

const router = Router();

// No authentication required — consumed by LB probes and orchestrators
router.get('/live', (req, res) => healthController.live(req, res));
router.get('/ready', (req, res, next) => healthController.ready(req, res, next));

export default router;
