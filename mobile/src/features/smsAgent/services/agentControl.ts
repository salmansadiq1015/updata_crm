// Starting / stopping the SMS agent on this phone (private build). The foreground
// service runs the headless loop; when the OS refuses to start it (e.g. Android 12+
// background start restrictions) the loop runs in the foreground app instead and
// pauses with it — never silently pretending to run.
import { t } from 'i18next';

import { getEnv } from '@/config/env';
import { logger } from '@/services/logging/logger';
import { telephony } from '@/services/telephony/telephonyService';

import { simSmsApi } from '../api/simSmsApi';
import { smsAgentLoop } from '../domain/agentLoop';

export async function ensureSmsAgentRunning(): Promise<'service' | 'foreground' | 'idle' | 'unsupported'> {
  if (getEnv().distribution !== 'private') return 'unsupported';
  const [running, journal, inbound] = await Promise.all([
    simSmsApi.campaigns('running').catch(() => []),
    telephony.getSmsJournal(),
    telephony.getInboundSms(),
  ]);
  if (!running.length && !journal.length && !inbound.length) return 'idle';
  smsAgentLoop.kick();
  if (smsAgentLoop.getStatus().running) return 'service';
  const started = await telephony.startSmsAgentService(
    t('smsAgent.notification.title'),
    t('smsAgent.notification.body'),
  );
  if (started) return 'service';
  logger.warn('sms_agent.service_not_started');
  void smsAgentLoop.run();
  return 'foreground';
}

export async function stopSmsAgent(): Promise<void> {
  smsAgentLoop.stop();
  await telephony.stopSmsAgentService();
}
