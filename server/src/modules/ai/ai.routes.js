import { Router } from 'express';
import voiceSessionRoutes from './voiceSession.routes.js';
import customVocabularyRoutes from './customVocabulary.routes.js';
import voiceCommandRoutes from './voiceCommand.routes.js';
import aiAnalyticsRoutes from './aiAnalytics.routes.js';
import agentRoutes from './agent/agent.routes.js';

const router = Router();

// Voice sessions (core AI workflow)
router.use('/sessions', voiceSessionRoutes);

// Custom vocabulary management
router.use('/vocabulary', customVocabularyRoutes);

// Voice commands management
router.use('/commands', voiceCommandRoutes);

// Analytics & accuracy metrics
router.use('/analytics', aiAnalyticsRoutes);

// AI agent orchestration (run, confirm, status, list)
router.use('/agent', agentRoutes);

export default router;
