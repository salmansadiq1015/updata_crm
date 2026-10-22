// Mobile calling readiness: can THIS phone call and text leads from its own SIM, and which
// server features back it up. Pure: the hook gathers the inputs, the screen renders the result.
// Cloud calling (LiveKit + SIP on the server) is optional and never blocks SIM calling.
import type { Distribution } from '@/config/envSchema';
import type { PermissionStatus } from '@/services/permissions/permissionsService';
import type { SimInfo, TelephonyCapabilities } from '@/services/telephony/types';

import type { ServerReadiness } from '../types';

export type ItemState = 'ok' | 'action' | 'blocked' | 'info' | 'checking';

export type ReadinessAction =
  | 'allowPhone'
  | 'allowSms'
  | 'allowMicrophone'
  | 'allowNotifications'
  | 'allowBackground'
  | 'openSettings'
  | 'retry';

export type ReadinessKey =
  | 'sim'
  | 'phone'
  | 'sms'
  | 'microphone'
  | 'notifications'
  | 'background'
  | 'server'
  | 'ai'
  | 'callAudio'
  | 'cloudCalling';

export type ReadinessItem = {
  key: ReadinessKey;
  state: ItemState;
  /** i18n key suffix under `readiness.reasons`. */
  reason: string;
  /** Interpolation values for the reason (SIM names, latency, …). */
  values?: Record<string, string | number>;
  action?: ReadinessAction;
};

export type ServerCheck =
  | { state: 'checking' }
  | { state: 'ok'; latencyMs: number; data: ServerReadiness | null }
  | { state: 'offline' }
  | { state: 'error'; message: string };

export type ReadinessInput = {
  caps: TelephonyCapabilities | null;
  sims: SimInfo[] | null;
  distribution: Distribution;
  microphone: PermissionStatus | null;
  batteryUnrestricted: boolean | null;
  /** A permission Android will no longer ask for ("Don't ask again"): only Settings can grant it. */
  blockedPermissions: ReadonlySet<'phone' | 'sms' | 'microphone' | 'notifications'>;
  server: ServerCheck;
};

export type ReadinessSummary = {
  state: 'checking' | 'ready' | 'attention' | 'blocked';
  /** Items that need a tap (allow / settings / retry). */
  attention: number;
  /** SIM calling works now: a SIM is usable and the CRM is reachable. */
  canCall: boolean;
};

const simLabel = (sim: SimInfo) => sim.displayName || sim.carrierName || `SIM ${sim.slotIndex + 1}`;

function askOrSettings(
  blocked: ReadinessInput['blockedPermissions'],
  key: 'phone' | 'sms' | 'microphone' | 'notifications',
  allow: ReadinessAction,
): ReadinessAction {
  return blocked.has(key) ? 'openSettings' : allow;
}

export function buildReadiness(input: ReadinessInput): ReadinessItem[] {
  const { caps, sims, distribution, server } = input;
  const items: ReadinessItem[] = [];

  // SIM and network.
  if (!caps) items.push({ key: 'sim', state: 'checking', reason: 'checking' });
  else if (!caps.hasTelephony) items.push({ key: 'sim', state: 'blocked', reason: 'noTelephony' });
  else if (caps.airplaneMode) items.push({ key: 'sim', state: 'blocked', reason: 'airplane' });
  else if (caps.simState === 'absent') items.push({ key: 'sim', state: 'blocked', reason: 'noSim' });
  else if (caps.simState !== 'ready' && caps.simState !== 'unknown')
    items.push({ key: 'sim', state: 'blocked', reason: 'simNotReady' });
  else if (sims && sims.length > 0)
    items.push({
      key: 'sim',
      state: 'ok',
      reason: sims.length > 1 ? 'simsReady' : 'simReady',
      values: { count: sims.length, names: sims.map(simLabel).join(', ') },
    });
  else items.push({ key: 'sim', state: 'ok', reason: 'simReadyUnnamed' });

  // Placing calls on the chosen SIM and seeing when they end.
  if (caps?.hasTelephony) {
    const granted = caps.callPhoneGranted && caps.readPhoneStateGranted;
    items.push(
      granted
        ? { key: 'phone', state: 'ok', reason: 'phoneGranted' }
        : {
            key: 'phone',
            state: 'action',
            reason: 'phoneMissing',
            action: askOrSettings(input.blockedPermissions, 'phone', 'allowPhone'),
          },
    );
  }

  // SMS: automatic from the SIM only in the company (private) build.
  if (caps) {
    if (distribution === 'private' && caps.smsPermissionsDeclared) {
      items.push(
        caps.sendSmsGranted && caps.receiveSmsGranted
          ? { key: 'sms', state: 'ok', reason: 'smsAutomatic' }
          : {
              key: 'sms',
              state: 'action',
              reason: 'smsMissing',
              action: askOrSettings(input.blockedPermissions, 'sms', 'allowSms'),
            },
      );
      items.push(
        caps.notificationsGranted
          ? { key: 'notifications', state: 'ok', reason: 'notificationsGranted' }
          : {
              key: 'notifications',
              state: 'action',
              reason: 'notificationsMissing',
              action: askOrSettings(input.blockedPermissions, 'notifications', 'allowNotifications'),
            },
      );
      if (input.batteryUnrestricted !== null)
        items.push(
          input.batteryUnrestricted
            ? { key: 'background', state: 'ok', reason: 'backgroundOk' }
            : { key: 'background', state: 'action', reason: 'backgroundLimited', action: 'allowBackground' },
        );
    } else if (distribution === 'shared' && caps.smsPermissionsDeclared) {
      // Client APK: one-way automatic SMS from the SIM; replies land in the phone's SMS app.
      items.push(
        caps.sendSmsGranted
          ? { key: 'sms', state: 'ok', reason: 'smsSendOnly' }
          : {
              key: 'sms',
              state: 'action',
              reason: 'smsSendMissing',
              action: askOrSettings(input.blockedPermissions, 'sms', 'allowSms'),
            },
      );
    } else {
      items.push(
        caps.smsComposerAvailable
          ? { key: 'sms', state: 'info', reason: 'smsComposer' }
          : { key: 'sms', state: 'blocked', reason: 'noSmsApp' },
      );
    }
  }

  // Voice notes after a call (asked for on first use; never during a call).
  if (input.microphone === 'granted') items.push({ key: 'microphone', state: 'ok', reason: 'micGranted' });
  else if (input.microphone === 'blocked')
    items.push({ key: 'microphone', state: 'info', reason: 'micBlocked', action: 'openSettings' });
  else if (input.microphone !== null)
    items.push({ key: 'microphone', state: 'info', reason: 'micOnUse', action: 'allowMicrophone' });

  // The CRM server and the AI features it provides.
  if (server.state === 'checking') {
    items.push({ key: 'server', state: 'checking', reason: 'checking' });
  } else if (server.state === 'ok') {
    items.push({ key: 'server', state: 'ok', reason: 'serverOk', values: { ms: server.latencyMs } });
    if (!server.data) items.push({ key: 'ai', state: 'info', reason: 'serverOutdated' });
    else
      items.push(
        server.data.ai.configured
          ? { key: 'ai', state: 'ok', reason: 'aiReady' }
          : { key: 'ai', state: 'info', reason: 'aiOff' },
      );
  } else {
    items.push({
      key: 'server',
      state: 'blocked',
      reason: server.state === 'offline' ? 'offline' : 'serverError',
      action: 'retry',
    });
  }

  // What Android does not allow, stated plainly (measured on Android 13, LEAD-VOICE-CALLING.md 0.1).
  items.push({ key: 'callAudio', state: 'info', reason: 'callAudioUnsupported' });

  // Optional cloud mode; information only.
  if (server.state === 'ok' && server.data)
    items.push({
      key: 'cloudCalling',
      state: 'info',
      reason: server.data.cloudCalling.configured ? 'cloudReady' : 'cloudOptional',
    });

  return items;
}

export function summarize(items: ReadinessItem[]): ReadinessSummary {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const checking = items.some((item) => item.state === 'checking');
  const blocked = items.some((item) => item.state === 'blocked');
  const attention = items.filter((item) => item.state === 'action' || item.state === 'blocked').length;
  const canCall = byKey.get('sim')?.state === 'ok' && byKey.get('server')?.state === 'ok';
  return {
    state: checking ? 'checking' : blocked ? 'blocked' : attention > 0 ? 'attention' : 'ready',
    attention,
    canCall,
  };
}

/**
 * Machine-readable capability codes for support and diagnostics. The three AI-audio codes are
 * constant: measured on Android 13 (LEAD-VOICE-CALLING.md 0.1), an app cannot hear or speak into
 * an ordinary SIM call, so "AI calling ready" is never derived from being able to dial.
 */
export type CapabilityCode =
  | 'SIM_CALLING_AVAILABLE'
  | 'SIM_CALLING_UNAVAILABLE'
  | 'CALL_STATE_TRACKING_AVAILABLE'
  | 'CALL_STATE_TRACKING_UNAVAILABLE'
  | 'SMS_AVAILABLE'
  | 'SMS_COMPOSER_ONLY'
  | 'SMS_UNAVAILABLE'
  | 'AI_PROCESSING_AVAILABLE'
  | 'AI_PROCESSING_UNAVAILABLE'
  | 'AI_AUDIO_INPUT_UNAVAILABLE'
  | 'AI_AUDIO_OUTPUT_UNAVAILABLE'
  | 'AUTONOMOUS_CELLULAR_AI_UNSUPPORTED'
  | 'CLOUD_AI_CALLING_AVAILABLE'
  | 'CLOUD_AI_CALLING_NOT_CONFIGURED';

export function capabilityCodes(items: ReadinessItem[]): CapabilityCode[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const ok = (key: ReadinessKey) => byKey.get(key)?.state === 'ok';
  const sms = byKey.get('sms');
  const cloud = byKey.get('cloudCalling');
  return [
    ok('sim') && ok('phone') ? 'SIM_CALLING_AVAILABLE' : 'SIM_CALLING_UNAVAILABLE',
    ok('phone') ? 'CALL_STATE_TRACKING_AVAILABLE' : 'CALL_STATE_TRACKING_UNAVAILABLE',
    sms?.state === 'ok'
      ? 'SMS_AVAILABLE'
      : sms?.reason === 'smsComposer'
        ? 'SMS_COMPOSER_ONLY'
        : 'SMS_UNAVAILABLE',
    ok('ai') ? 'AI_PROCESSING_AVAILABLE' : 'AI_PROCESSING_UNAVAILABLE',
    'AI_AUDIO_INPUT_UNAVAILABLE',
    'AI_AUDIO_OUTPUT_UNAVAILABLE',
    'AUTONOMOUS_CELLULAR_AI_UNSUPPORTED',
    cloud?.reason === 'cloudReady' ? 'CLOUD_AI_CALLING_AVAILABLE' : 'CLOUD_AI_CALLING_NOT_CONFIGURED',
  ];
}

/** Plain-text report for support: states and codes only, no phone numbers or message text. */
export function diagnosticReport(input: {
  items: ReadinessItem[];
  appVersion: string;
  distribution: Distribution;
  unsyncedOperations: number;
  now: Date;
}): string {
  return [
    'Updata mobile diagnostics',
    `time: ${input.now.toISOString()}`,
    `app: ${input.appVersion} (${input.distribution})`,
    `unsynced CRM records: ${input.unsyncedOperations}`,
    `capabilities: ${capabilityCodes(input.items).join(', ')}`,
    ...input.items.map((item) => `${item.key}: ${item.state} (${item.reason})`),
  ].join('\n');
}
