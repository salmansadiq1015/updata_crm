// SHARED CONTRACT (owner: lead integrator). The Kotlin module must implement exactly
// this surface; JS code depends only on these types. Change it only through the
// integrator so native and JS never drift.
//
// Honesty rules encoded in the types:
// - `offhook` is NOT "answered": Android reports OFFHOOK while dialing, active or held.
// - Nothing here sends SMS. The app only opens the system composer; launching it is
//   not proof of sending.
// - A SIM's `number` is whatever the carrier/SIM reports (often null); it is not proof
//   of the caller ID the recipient sees.

export type SimState = 'ready' | 'absent' | 'locked' | 'not_ready' | 'unknown';

export type TelephonyCapabilities = {
  /** PackageManager FEATURE_TELEPHONY. False on Wi-Fi tablets and most emulators without a modem. */
  hasTelephony: boolean;
  sdkInt: number;
  simState: SimState;
  airplaneMode: boolean;
  /** CALL_PHONE granted → TelecomManager.placeCall can target a chosen SIM. */
  callPhoneGranted: boolean;
  /** READ_PHONE_STATE granted → SIM list and call-state observation. */
  readPhoneStateGranted: boolean;
  /** An activity resolves ACTION_DIAL. */
  dialerAvailable: boolean;
  /** An activity resolves ACTION_SENDTO smsto:. */
  smsComposerAvailable: boolean;
  /** RoleManager ROLE_DIALER held. The app never requests it. */
  isDefaultDialer: boolean;
  /** Always false in this build: direct SMS (SEND_SMS) is not declared. */
  directSmsSupported: false;
};

export type SimInfo = {
  subscriptionId: number;
  /** 0-based SIM slot; -1 when unknown. */
  slotIndex: number;
  carrierName: string | null;
  displayName: string | null;
  countryIso: string | null;
  isEmbedded: boolean;
  isDefaultVoice: boolean;
  isDefaultSms: boolean;
  /** As reported by the SIM/carrier. Usually null; never treat as verified caller ID. */
  number: string | null;
};

export type PlaceCallRequest = {
  /** Dialable number (E.164 preferred). */
  number: string;
  /** Selected subscription; omitted → system default / system chooser. */
  subscriptionId?: number;
  /** Stable app operation id; recorded with every observed call-state event. */
  operationId: string;
};

export type PlaceCallResult = {
  /**
   * telecom_direct: TelecomManager.placeCall (CALL_PHONE granted).
   * dialer_handoff: ACTION_DIAL opened with the number; the user presses call.
   */
  route: 'telecom_direct' | 'dialer_handoff';
  /** Whether the requested subscription was passed to Telecom. `false` for dialer_handoff. */
  subscriptionApplied: boolean;
};

export type CallState = 'idle' | 'ringing' | 'offhook';

export type CallStateEvent = {
  operationId: string;
  state: CallState;
  /** Epoch milliseconds (System.currentTimeMillis at callback). */
  at: number;
  source: 'telephony_callback' | 'phone_state_listener';
};

export type TelephonyErrorCode =
  | 'PERMISSION_DENIED'
  | 'NO_TELEPHONY'
  | 'INVALID_NUMBER'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'NO_ACTIVITY'
  | 'CALL_FAILED';

export type UpdataTelephonyModuleEvents = {
  onCallStateChanged: (event: CallStateEvent) => void;
};

export interface UpdataTelephonyNativeModule {
  getCapabilities(): Promise<TelephonyCapabilities>;
  /** Rejects with PERMISSION_DENIED without READ_PHONE_STATE. */
  getActiveSims(): Promise<SimInfo[]>;
  /** PhoneNumberUtils.formatNumberToE164; null when not parseable for that country. */
  normalizeNumber(number: string, countryIso: string): Promise<string | null>;
  placeCall(request: PlaceCallRequest): Promise<PlaceCallResult>;
  /** ACTION_SENDTO smsto:<number> with sms_body. Resolves `true` when an activity was launched. */
  openSmsComposer(number: string, body: string): Promise<boolean>;
  /**
   * Starts observing call state for `operationId` (requires READ_PHONE_STATE; resolves false
   * without it). Events are emitted AND persisted natively (SharedPreferences, bounded) so they
   * survive JS reload / process death until cleared. Starting a new operation stops the old one.
   */
  startCallStateMonitoring(operationId: string): Promise<boolean>;
  stopCallStateMonitoring(): Promise<void>;
  /** Persisted events for the operation, oldest first. */
  getCallStateEvents(operationId: string): Promise<CallStateEvent[]>;
  clearCallStateEvents(operationId: string): Promise<void>;
}
