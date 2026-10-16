// The one place the app touches the native telephony module (modules/updata-telephony).
// Every function degrades to an explicit "unavailable" result when the module is not in
// the binary (Jest, an old dev client, non-Android), so a missing capability is visible
// instead of crashing or being assumed.
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';

import { logger } from '@/services/logging/logger';
import {
  ensurePermission,
  type PermissionRationale,
  type PermissionStatus,
} from '@/services/permissions/permissionsService';

import type {
  CallStateEvent,
  PlaceCallRequest,
  PlaceCallResult,
  SimInfo,
  TelephonyCapabilities,
  UpdataTelephonyNativeModule,
} from './types';

type NativeWithEvents = UpdataTelephonyNativeModule & {
  addListener(eventName: 'onCallStateChanged', listener: (event: CallStateEvent) => void): EventSubscription;
};

let cached: NativeWithEvents | null | undefined;

function native(): NativeWithEvents | null {
  if (cached === undefined) {
    cached =
      Platform.OS === 'android' ? requireOptionalNativeModule<NativeWithEvents>('UpdataTelephony') : null;
    if (!cached) logger.info('telephony.native_module_missing');
  }
  return cached;
}

/** Test hook: inject a fake native module (or null). */
export function __setNativeTelephonyForTests(module: NativeWithEvents | null | undefined) {
  cached = module;
}

export class TelephonyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TelephonyError';
  }
}

function toTelephonyError(error: unknown): TelephonyError {
  if (error instanceof TelephonyError) return error;
  const code =
    typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'CALL_FAILED';
  const message = error instanceof Error ? error.message : String(error);
  return new TelephonyError(code.replace(/^ERR_/, ''), message);
}

export const UNAVAILABLE_CAPABILITIES: TelephonyCapabilities = {
  hasTelephony: false,
  sdkInt: 0,
  simState: 'unknown',
  airplaneMode: false,
  callPhoneGranted: false,
  readPhoneStateGranted: false,
  dialerAvailable: false,
  smsComposerAvailable: false,
  isDefaultDialer: false,
  directSmsSupported: false,
};

export const telephony = {
  isAvailable(): boolean {
    return native() !== null;
  },

  async getCapabilities(): Promise<TelephonyCapabilities> {
    const module = native();
    if (!module) return UNAVAILABLE_CAPABILITIES;
    try {
      return await module.getCapabilities();
    } catch (error) {
      logger.warn('telephony.capabilities_failed', { error });
      return UNAVAILABLE_CAPABILITIES;
    }
  },

  async getActiveSims(): Promise<SimInfo[]> {
    const module = native();
    if (!module) return [];
    try {
      return await module.getActiveSims();
    } catch (error) {
      throw toTelephonyError(error);
    }
  },

  async normalizeNumber(number: string, countryIso: string | null): Promise<string | null> {
    const module = native();
    if (!module || !countryIso) return null;
    try {
      return await module.normalizeNumber(number, countryIso);
    } catch {
      return null;
    }
  },

  async placeCall(request: PlaceCallRequest): Promise<PlaceCallResult> {
    const module = native();
    if (!module) throw new TelephonyError('NO_TELEPHONY', 'Native telephony module not available');
    try {
      return await module.placeCall(request);
    } catch (error) {
      throw toTelephonyError(error);
    }
  },

  async openSmsComposer(number: string, body: string): Promise<boolean> {
    const module = native();
    if (!module) return false;
    try {
      return await module.openSmsComposer(number, body);
    } catch (error) {
      logger.warn('telephony.sms_composer_failed', { error });
      return false;
    }
  },

  async startMonitoring(operationId: string): Promise<boolean> {
    const module = native();
    if (!module) return false;
    try {
      return await module.startCallStateMonitoring(operationId);
    } catch (error) {
      logger.warn('telephony.monitor_start_failed', { error });
      return false;
    }
  },

  async stopMonitoring(): Promise<void> {
    await native()
      ?.stopCallStateMonitoring()
      .catch(() => undefined);
  },

  async getPersistedEvents(operationId: string): Promise<CallStateEvent[]> {
    const module = native();
    if (!module) return [];
    try {
      return await module.getCallStateEvents(operationId);
    } catch {
      return [];
    }
  },

  async clearPersistedEvents(operationId: string): Promise<void> {
    await native()
      ?.clearCallStateEvents(operationId)
      .catch(() => undefined);
  },

  addCallStateListener(listener: (event: CallStateEvent) => void): EventSubscription | null {
    return native()?.addListener('onCallStateChanged', listener) ?? null;
  },
};

/**
 * CALL_PHONE lets the app place the call on the SIM the user picked; READ_PHONE_STATE
 * lists SIMs and observes call state. Neither is required: without them the app hands
 * the number to the system dialer and records no call-state evidence.
 */
export async function requestCallingPermissions(rationale: {
  callPhone: PermissionRationale;
  phoneState: PermissionRationale;
}): Promise<{ callPhone: PermissionStatus; phoneState: PermissionStatus }> {
  const phoneState = await ensurePermission(
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    rationale.phoneState,
  );
  const callPhone = await ensurePermission(PermissionsAndroid.PERMISSIONS.CALL_PHONE, rationale.callPhone);
  return { callPhone, phoneState };
}
