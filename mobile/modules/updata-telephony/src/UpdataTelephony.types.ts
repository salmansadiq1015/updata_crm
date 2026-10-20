// SHARED CONTRACT (owner: lead integrator). The Kotlin module must implement exactly
// this surface; JS code depends only on these types. Change it only through the
// integrator so native and JS never drift.
//
// Honesty rules encoded in the types:
// - `offhook` is NOT "answered": Android reports OFFHOOK while dialing, active or held.
// - `openSmsComposer` only opens the system composer; launching it is not proof of sending.
// - `sendSms` exists only in the PRIVATE build (SEND_SMS declared). It transmits one
//   CRM-leased message and journals it BEFORE calling SmsManager, so a message id is
//   handed to the modem at most once. Its outcome is read from the journal.
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
  /** SEND_SMS / RECEIVE_SMS are declared in the manifest (private build only). */
  smsPermissionsDeclared: boolean;
  sendSmsGranted: boolean;
  receiveSmsGranted: boolean;
  /** POST_NOTIFICATIONS granted (always true below Android 13). */
  notificationsGranted: boolean;
  /** Private build + SEND_SMS granted + telephony hardware. */
  directSmsSupported: boolean;
};

export type SendSmsRequest = {
  /** CRM SimSmsMessage id (leased to this device and marked attempting). */
  messageId: string;
  to: string;
  body: string;
  /** Selected SIM; omitted → system default SMS SIM. */
  subscriptionId?: number | null;
};

export type SmsJournalStatus = 'attempting' | 'sent' | 'failed' | 'unknown';

export type SmsJournalEntry = {
  messageId: string;
  status: SmsJournalStatus;
  errorCode: string | null;
  parts: number;
  startedAt: number;
  finishedAt: number | null;
  deliveredAt: number | null;
};

export type InboundSms = {
  /** De-duplication key (hash of sender, time, SIM and text). */
  key: string;
  from: string;
  /** The watched E.164 number this sender matched. */
  matchedTo: string;
  body: string;
  receivedAt: number;
  subscriptionId: number;
};

export type SmsStatusEvent = {
  messageId: string;
  status: 'sent' | 'failed' | 'unknown' | 'delivered';
  errorCode?: string | null;
};
export type SmsReceivedEvent = { key: string };

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
  | 'CALL_FAILED'
  | 'SMS_NOT_SUPPORTED'
  | 'SMS_SEND_FAILED'
  | 'ALREADY_ATTEMPTED'
  | 'INVALID_ARGUMENT';

/** Diagnostics: what this device lets the app do with audio during a SIM call. */
export type AudioProbeSource =
  | 'MIC'
  | 'VOICE_COMMUNICATION'
  | 'VOICE_RECOGNITION'
  | 'UNPROCESSED'
  | 'CAMCORDER'
  | 'VOICE_CALL'
  | 'VOICE_DOWNLINK'
  | 'VOICE_UPLINK';

export type AudioDeviceState = {
  sdk: number;
  manufacturer: string;
  model: string;
  callState: 'idle' | 'ringing' | 'offhook' | 'unknown' | 'no_permission';
  audioMode: string;
  speakerphoneOn: boolean;
  communicationDevice: string | null;
  micPermission: boolean;
};

export type AudioCaptureResult = {
  source: AudioProbeSource;
  result:
    | 'ok'
    | 'no_permission'
    | 'unsupported_format'
    | 'construct_error'
    | 'init_failed'
    | 'start_error'
    | 'not_recording'
    | 'no_samples';
  seconds?: number;
  rms?: number;
  peak?: number;
  /** Android 10+: the platform is feeding this client silence. */
  clientSilenced?: boolean | null;
  error?: string;
};

export type AudioProbeReport = AudioDeviceState & { captures: AudioCaptureResult[] };

export type UpdataTelephonyModuleEvents = {
  onCallStateChanged: (event: CallStateEvent) => void;
  onSmsStatus: (event: SmsStatusEvent) => void;
  onSmsReceived: (event: SmsReceivedEvent) => void;
};

export interface UpdataTelephonyNativeModule {
  /** Diagnostics: capture `ms` per source (all when empty) and report levels; samples are discarded. */
  probeCallAudio(sources: AudioProbeSource[], ms: number): Promise<AudioProbeReport>;
  /** Diagnostics: try to route the active call to/from the loudspeaker as a non-dialer app. */
  setCallSpeaker(
    on: boolean,
  ): Promise<AudioDeviceState & { requested: boolean; accepted: boolean | null; error: string | null }>;
  /** Diagnostics: play a test tone (usage voice/media) while recording MIC. */
  probeToneLoop(
    usage: 'voice' | 'media',
    ms: number,
  ): Promise<{ usage: string; result: string; micWhilePlaying?: AudioCaptureResult; error?: string }>;
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

  // ---- SIM SMS agent (private build; reject SMS_NOT_SUPPORTED in the Play build) ----
  sendSms(request: SendSmsRequest): Promise<{ parts: number }>;
  getSmsJournal(): Promise<SmsJournalEntry[]>;
  ackSmsJournal(messageIds: string[]): Promise<void>;
  /** Replies are kept only from these numbers (E.164); everything else is dropped natively. */
  setWatchedNumbers(numbers: string[]): Promise<void>;
  getInboundSms(): Promise<InboundSms[]>;
  ackInboundSms(keys: string[]): Promise<void>;
  /** Foreground service + notification while the agent runs. Resolves false if not allowed. */
  startSmsAgentService(title: string, text: string): Promise<boolean>;
  stopSmsAgentService(): Promise<void>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  /** Opens the system prompt/settings; resolves true when an activity was launched. */
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
}
