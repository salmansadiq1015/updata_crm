import type { TFunction } from 'i18next';

import { tKey } from '@/features/communication/i18n';

import type { QueueItem } from '../domain/queue';

/** Human text for why an item was skipped ("user", "ended", or CRM eligibility codes). */
export function skipReasonLabel(t: TFunction, reason: string | null | undefined): string {
  if (!reason || reason === 'user') return t('callQueue.skipReason.user');
  if (reason === 'ended') return t('callQueue.skipReason.ended');
  return reason
    .split(',')
    .map((code) => tKey(t, `communication.eligibility.${code}`, { defaultValue: code }))
    .join(' ');
}

/** One-line result of an item for lists and the summary. */
export function itemResultLabel(t: TFunction, item: QueueItem): string {
  switch (item.state) {
    case 'done':
      return item.disposition
        ? tKey(t, `communication.disposition.${item.disposition}`, { defaultValue: item.disposition })
        : t('callQueue.state.done');
    case 'skipped':
      return skipReasonLabel(t, item.skipReason);
    case 'failed':
      return t('callQueue.state.failed');
    default:
      return t('callQueue.summary.notCalled');
  }
}
