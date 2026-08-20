export const AGENT_STATUSES = {
  PENDING:               'PENDING',
  RUNNING:               'RUNNING',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  COMPLETED:             'COMPLETED',
  FAILED:                'FAILED',
  CANCELLED:             'CANCELLED',
};

export const SESSION_STATUSES = {
  ACTIVE:                'ACTIVE',
  PROCESSING:            'PROCESSING',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  COMPLETED:             'COMPLETED',
  CANCELLED:             'CANCELLED',
  FAILED:                'FAILED',
};

export const TERMINAL_AGENT_STATUSES = new Set([
  AGENT_STATUSES.COMPLETED,
  AGENT_STATUSES.FAILED,
  AGENT_STATUSES.CANCELLED,
]);

export const TERMINAL_SESSION_STATUSES = new Set([
  SESSION_STATUSES.COMPLETED,
  SESSION_STATUSES.CANCELLED,
  SESSION_STATUSES.FAILED,
  'completed',
  'cancelled',
  'error',
  'failed',
]);

export const PANEL_VIEWS = {
  IDLE:               'idle',
  RECORDING:          'recording',
  UPLOADING:          'uploading',
  PROCESSING:         'processing',
  ENTITIES:           'entities',
  AGENT:              'agent',
  AGENT_CONFIRMATION: 'agent_confirmation',
  RESULT:             'result',
  ERROR:              'error',
};

export const SESSION_TYPES = {
  ORDER_CREATION:   'ORDER_CREATION',
  REPORT_DICTATION: 'REPORT_DICTATION',
  ADDRESS_CAPTURE:  'ADDRESS_CAPTURE',
  COMMAND:          'COMMAND',
  GENERAL:          'GENERAL',
};

export const RECORDING_STATES = {
  IDLE:      'idle',
  RECORDING: 'recording',
  UPLOADING: 'uploading',
};

// Confidence thresholds for entity extraction display
export const CONFIDENCE = {
  HIGH:   0.85,
  MEDIUM: 0.70,
};

export const MAX_RECORDING_SECONDS = 15 * 60; // 15 minutes
export const RECORDING_WARNING_SECONDS = 14 * 60; // warn at 14 min

export const AGENT_POLL_INTERVAL_MS = 1000;
export const SESSION_POLL_INTERVAL_MS = 2000;
export const SESSION_PROCESSING_TIMEOUT_MS = 90000;
// One character is enough when answering a numbered choice from the assistant.
export const MIN_AGENT_INPUT_LENGTH = 1;

export const OFFLINE_QUEUE_MAX = 5; // max queued recordings

export const WORKFLOW_LABELS = {
  TASK_AUTOMATION:     'Creating task',
  NOTIFICATION:        'Sending notification',
  FIELD_SERVICE_AGENT: 'Running field-service action',
  LEAD_CREATION:       'Creating lead',
  INVOICE_GENERATION:  'Generating invoice',
  GENERAL:             'Thinking...',
};

export const ENTITY_LABELS = {
  CUSTOMER_NAME:   'Customer',
  ADDRESS:         'Address',
  EQUIPMENT_MODEL: 'Equipment',
  PART_NUMBER:     'Part Number',
  DATE:            'Date',
  TIME:            'Time',
  URGENCY:         'Urgency',
  QUANTITY:        'Quantity',
  DESCRIPTION:     'Description',
  STATUS:          'Status',
};

/**
 * Returns 'high' | 'medium' | 'low' based on confidence score.
 */
export function getConfidenceTier(confidence) {
  if (confidence >= CONFIDENCE.HIGH)   return 'high';
  if (confidence >= CONFIDENCE.MEDIUM) return 'medium';
  return 'low';
}

export function isTerminalAgentStatus(status) {
  return TERMINAL_AGENT_STATUSES.has(status);
}

export function isTerminalSessionStatus(status) {
  return TERMINAL_SESSION_STATUSES.has(status);
}

export function normalizeSessionStatus(status) {
  return typeof status === 'string' ? status.toUpperCase() : status;
}

export function formatEntityLabel(type) {
  return ENTITY_LABELS[type] || type;
}
