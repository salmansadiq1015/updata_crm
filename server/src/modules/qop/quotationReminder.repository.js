import QuotationReminder from './quotationReminder.model.js';

class QuotationReminderRepository {
  async create(data) {
    const reminder = new QuotationReminder(data);
    return reminder.save();
  }

  async findPending() {
    const now = new Date();
    return QuotationReminder.find({
      status: 'PENDING',
      scheduledAt: { $lte: now },
      $or: [
        { snoozedUntil: null },
        { snoozedUntil: { $lte: now } },
      ],
    })
      .sort({ scheduledAt: 1 })
      .lean();
  }

  async markSent(id) {
    return QuotationReminder.findByIdAndUpdate(
      id,
      { status: 'SENT', sentAt: new Date() },
      { new: true },
    ).lean();
  }

  async snooze(id, snoozedUntil) {
    return QuotationReminder.findByIdAndUpdate(
      id,
      { status: 'SNOOZED', snoozedUntil },
      { new: true },
    ).lean();
  }

  async cancelForQuotation(quotationId) {
    return QuotationReminder.updateMany(
      { quotationId, status: { $in: ['PENDING', 'SNOOZED'] } },
      { $set: { status: 'CANCELLED' } },
    );
  }
}

const quotationReminderRepository = new QuotationReminderRepository();
export default quotationReminderRepository;
