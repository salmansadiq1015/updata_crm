/**
 * Native SMS journal ids. The SIM SMS agent journals CRM SimSmsMessage ids; messages the app
 * sends from an SMS queue carry this prefix so the agent never reports them to its server.
 */
export const QUEUE_SMS_ID_PREFIX = 'smsq-';

export const queueSmsId = (operationId: string) => `${QUEUE_SMS_ID_PREFIX}${operationId}`;
export const isQueueSmsId = (messageId: string) => messageId.startsWith(QUEUE_SMS_ID_PREFIX);
