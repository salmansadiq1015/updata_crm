import { conditionMet } from './questionEngine.js';

/** Public lifecycle labels over the existing call/qualification enums. No provider state is rewritten. */
export function leadCallLifecycle(call, campaign, outcome) {
  const disposition = call.disposition;
  const missingFields = (campaign.questionnaire?.questions || [])
    .filter((q) => q.required && conditionMet(q.condition, call.conversationState?.answers || {}) && !call.answers?.some((a) => a.questionFieldKey === q.fieldKey
      && a.validation === 'valid' && (!q.confirmCritical || a.confirmed)))
    .map((q) => q.fieldKey);
  const qualificationStatus = outcome.qualification === 'qualified' ? 'QUALIFIED'
    : outcome.action === 'mark_not_interested' || outcome.action === 'mark_do_not_contact' ? 'NOT_INTERESTED'
      : outcome.qualification === 'callback' ? 'CALLBACK_REQUIRED'
        : outcome.qualification === 'unqualified' ? 'NOT_QUALIFIED'
          : disposition === 'unresponsive' ? 'UNRESPONSIVE'
            : outcome.qualification === 'review' ? (call.answers?.some((a) => a.validation === 'valid') ? 'PARTIALLY_QUALIFIED' : 'UNQUALIFIED')
              : ['no_answer', 'busy', 'voicemail', 'failed', 'cancelled'].includes(disposition) ? 'NEW' : 'CONTACTED';
  const callStatus = ({
    answered_completed: 'CALL_COMPLETED', answered_partial: 'CALL_COMPLETED',
    interrupted: 'CALL_INTERRUPTED', no_answer: 'CALL_NO_ANSWER', busy: 'CALL_BUSY',
    voicemail: 'CALL_NO_RESPONSE', unresponsive: 'CALL_NO_RESPONSE', failed: 'CALL_FAILED',
    declined: 'CALL_REJECTED', do_not_contact: 'CALL_REJECTED', cancelled: 'CALL_CANCELLED',
    callback_requested: 'CALLBACK_REQUESTED', needs_review: 'CALL_INTERRUPTED',
  })[disposition] || 'CALL_INTERRUPTED';
  return {
    callId: call._id, campaignId: campaign._id, callStatus, qualificationStatus,
    outcome: disposition, evaluatedAt: call.endedAt || call.createdAt,
    missingFields,
    recommendedAction: qualificationStatus === 'QUALIFIED' ? 'INTRODUCTION_EMAIL'
      : qualificationStatus === 'CALLBACK_REQUIRED' ? 'SCHEDULE_CALLBACK'
        : outcome.requiresReview ? 'REVIEW_ANSWERS' : null,
  };
}
