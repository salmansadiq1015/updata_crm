/**
 * Device-originated lead communications (mobile app: SIM call via the system
 * dialer / Telecom, or the SMS composer). The server records what the app
 * reports; it never claims more than the evidence shows — an observed
 * off-hook period is NOT an answered call.
 */

export const COMM_CHANNELS = Object.freeze(['phone', 'sms']);
export const COMM_DIRECTIONS = Object.freeze(['outbound']);
export const COMM_ROUTES = Object.freeze(['telecom_direct', 'dialer_handoff', 'sms_composer']);
export const PHONE_ROUTES = Object.freeze(['telecom_direct', 'dialer_handoff']);
export const SMS_ROUTES = Object.freeze(['sms_composer']);
export const COMM_MODES = Object.freeze(['manual', 'assisted']);
export const DESTINATION_FIELDS = Object.freeze(['phone', 'mobile']);
export const COMM_STATES = Object.freeze(['started', 'dispatched', 'dispatch_failed', 'completed']);

export const COMM_EVENT_TYPES = Object.freeze([
  'created', 'dispatch_requested', 'dispatched', 'dispatch_failed',
  'call_state_idle', 'call_state_ringing', 'call_state_offhook',
  'app_backgrounded', 'app_foregrounded', 'composer_opened', 'composer_returned',
  'notes_edited', 'disposition_selected', 'qualification_reviewed', 'submitted',
]);
export const COMM_EVENT_SOURCES = Object.freeze(['native', 'app', 'user']);
export const MAX_EVENTS = 300;
export const MAX_EVENTS_PER_REQUEST = 100;

export const DISPOSITIONS = Object.freeze([
  'interested', 'not_interested', 'callback_requested', 'no_answer', 'busy',
  'voicemail', 'wrong_number', 'human_follow_up', 'do_not_contact',
  'sent', 'not_sent', 'unknown',
]);
export const CONNECTED_VALUES = Object.freeze(['yes', 'no', 'unknown']);
export const SMS_ENCODINGS = Object.freeze(['GSM-7', 'UCS-2']);
export const SMS_SEND_STATUSES = Object.freeze([
  'composer_opened', 'user_reported_sent', 'user_reported_not_sent', 'unknown',
]);

export const ANSWER_STATUSES = Object.freeze(['answered', 'unknown', 'refused', 'not_applicable']);
export const ANSWER_SOURCES = Object.freeze(['user', 'ai_proposed_user_confirmed']);

export const RECEIPT_STEPS = Object.freeze([
  'outcome', 'contactLog', 'leadContact', 'statusChange', 'qualification', 'suppression',
]);
export const STEP_STATUSES = Object.freeze(['ok', 'skipped', 'failed']);

export const ELIGIBILITY_REASONS = Object.freeze({
  NO_DESTINATION: 'NO_DESTINATION',
  INVALID_NUMBER: 'INVALID_NUMBER',
  PHONE_SUPPRESSED: 'PHONE_SUPPRESSED',
  SMS_SUPPRESSED: 'SMS_SUPPRESSED',
  SMS_CONSENT_DENIED: 'SMS_CONSENT_DENIED',
});

export const COMM_ERROR_CODES = Object.freeze({
  CONTACT_NOT_ELIGIBLE: 'CONTACT_NOT_ELIGIBLE',
  OPERATION_ID_CONFLICT: 'OPERATION_ID_CONFLICT',
  ALREADY_COMPLETED: 'ALREADY_COMPLETED',
  COMPLETION_IN_PROGRESS: 'COMPLETION_IN_PROGRESS',
  LEAD_CONVERTED_PROTECTED: 'LEAD_CONVERTED_PROTECTED',
});

/** Disposition that, like outcome.doNotContact, suppresses the number on both channels. */
export const DNC_DISPOSITION = 'do_not_contact';
