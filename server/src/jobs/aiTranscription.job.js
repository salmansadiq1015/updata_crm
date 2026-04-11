import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class AiTranscriptionWorker extends BaseWorker {
  constructor() {
    super('ai-transcription');
  }

  async process(job) {
    const { sessionId } = job.data;
    const voiceSessionService = (await import('../modules/ai/voiceSession.service.js')).default;

    try {
      await voiceSessionService.processTranscription(sessionId);

      logger.info('AI transcription completed', {
        module: 'jobs',
        action: 'ai-transcription',
        sessionId,
      });

      return { sessionId, status: 'transcribed' };
    } catch (err) {
      logger.error('AI transcription failed', {
        module: 'jobs',
        action: 'ai-transcription',
        sessionId,
        error: { message: err.message, stack: err.stack },
      });

      // Update session status to FAILED
      try {
        const voiceSessionRepository = (await import('../modules/ai/voiceSession.repository.js')).default;
        await voiceSessionRepository.updateStatus(sessionId, 'FAILED', {
          result: { action: 'transcription_failed', message: err.message },
        });
      } catch (updateErr) {
        logger.error('Failed to update session status after error', {
          module: 'jobs', sessionId, error: { message: updateErr.message },
        });
      }

      throw err; // Let BullMQ retry
    }
  }
}
