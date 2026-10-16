import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { UpdataTelephonyModuleEvents, UpdataTelephonyNativeModule } from './UpdataTelephony.types';

// Typing only: the native object is created by expo-modules-core. `NativeModule<Events>`
// provides the typed `addListener('onCallStateChanged', cb)`.
declare class UpdataTelephonyModule
  extends NativeModule<UpdataTelephonyModuleEvents>
  implements UpdataTelephonyNativeModule
{
  getCapabilities: UpdataTelephonyNativeModule['getCapabilities'];
  getActiveSims: UpdataTelephonyNativeModule['getActiveSims'];
  normalizeNumber: UpdataTelephonyNativeModule['normalizeNumber'];
  placeCall: UpdataTelephonyNativeModule['placeCall'];
  openSmsComposer: UpdataTelephonyNativeModule['openSmsComposer'];
  startCallStateMonitoring: UpdataTelephonyNativeModule['startCallStateMonitoring'];
  stopCallStateMonitoring: UpdataTelephonyNativeModule['stopCallStateMonitoring'];
  getCallStateEvents: UpdataTelephonyNativeModule['getCallStateEvents'];
  clearCallStateEvents: UpdataTelephonyNativeModule['clearCallStateEvents'];
}

export type UpdataTelephonyModuleType = UpdataTelephonyModule;

/**
 * The Android native module, or `null` where it is not linked (Jest, iOS, web, Expo Go).
 * Callers must handle `null` as "telephony unavailable".
 */
const UpdataTelephony: UpdataTelephonyModule | null =
  requireOptionalNativeModule<UpdataTelephonyModule>('UpdataTelephony');

export default UpdataTelephony;
