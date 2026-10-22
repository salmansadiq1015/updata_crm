// Carrier delivery reports for SMS sent by the SMS queue (sms_direct). The native layer keeps
// each sent message in its journal and stamps deliveredAt when the network's report arrives,
// possibly long after the queue finished or the app was closed. This turns that stamp into an
// `sms_delivered` event on the operation; the outbox delivers it like any other event.
import { isQueueSmsId, QUEUE_SMS_ID_PREFIX } from '@/services/telephony/smsIds';
import { telephony } from '@/services/telephony/telephonyService';

import { withEvent } from '../domain/operations';
import { getOperation, useOperationsStore } from '../store/operationsStore';

/** Carriers may send a report hours later (recipient phone off); after this we stop waiting. */
export const QUEUE_DELIVERY_WAIT_MS = 72 * 60 * 60_000;

/** Returns how many delivery reports were queued for the CRM. */
export async function collectQueueDeliveries(now = Date.now()): Promise<number> {
  const store = useOperationsStore.getState();
  const ack: string[] = [];
  let queued = 0;
  for (const entry of await telephony.getSmsJournal()) {
    if (!isQueueSmsId(entry.messageId)) continue;
    const operationId = entry.messageId.slice(QUEUE_SMS_ID_PREFIX.length);
    const op = getOperation(operationId);
    const age = now - (entry.finishedAt ?? entry.startedAt);
    if (entry.deliveredAt && op) {
      store.update(operationId, (current) =>
        withEvent(current, 'sms_delivered', 'native', entry.deliveredAt!),
      );
      queued += 1;
      ack.push(entry.messageId);
    } else if (age > QUEUE_DELIVERY_WAIT_MS) {
      ack.push(entry.messageId); // no report will come (or the operation is gone)
    }
  }
  await telephony.ackSmsJournal(ack);
  return queued;
}
