import QuotationReminder from './quotationReminder.model.js';

class QuotationReminderRepository {
  async list({ status, limit = 50 } = {}) {
    const filter = {};
    if (status) filter.status = status;
    return QuotationReminder.find(filter)
      .sort({ scheduledAt: -1 })
      .limit(limit)
      .populate({ path: 'quotationId', select: 'quotationNumber customerName status' })
      .lean();
  }

  async create(data) {
    const reminder = new QuotationReminder(data);
    return reminder.save();
  }

  async findPending() {
    const now = new Date();
    return QuotationReminder.find({
      status: { $in: ['PENDING', 'SNOOZED'] },
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
      { returnDocument: 'after' },
    ).lean();
  }

  async snooze(id, snoozedUntil) {
    return QuotationReminder.findByIdAndUpdate(
      id,
      { status: 'SNOOZED', snoozedUntil },
      { returnDocument: 'after' },
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
