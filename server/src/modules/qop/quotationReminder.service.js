import quotationReminderRepository from './quotationReminder.repository.js';

class QuotationReminderService {
  async createReminder(quotationId, type, scheduledAt) {
    return quotationReminderRepository.create({
      quotationId,
      type,
      scheduledAt,
    });
  }

  async getPending() {
    return quotationReminderRepository.findPending();
  }

  async markSent(id) {
    return quotationReminderRepository.markSent(id);
  }

  async snooze(id, snoozedUntil, userId) {
    return quotationReminderRepository.snooze(id, snoozedUntil);
  }

  async cancelForQuotation(quotationId) {
    return quotationReminderRepository.cancelForQuotation(quotationId);
  }
}

const quotationReminderService = new QuotationReminderService();
export default quotationReminderService;
