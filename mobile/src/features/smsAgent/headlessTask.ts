// Headless JS task run by the native SmsAgentService (private build). It may start
// in a fresh JS runtime after the OS killed the app, so it restores the session
// first; without a signed-in user it ends, which stops the service.
import { restoreSession } from '@/features/auth/services/session';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { logger } from '@/services/logging/logger';

import { smsAgentLoop } from './domain/agentLoop';

export const SMS_AGENT_TASK = 'UpdataSmsAgent';

export async function smsAgentHeadlessTask(): Promise<void> {
  if (useSessionStore.getState().status !== 'authenticated') {
    await restoreSession().catch((error: unknown) =>
      logger.warn('sms_agent.session_restore_failed', { error }),
    );
  }
  if (useSessionStore.getState().status !== 'authenticated') {
    logger.info('sms_agent.no_session');
    return;
  }
  await smsAgentLoop.run();
}
