import AppointmentReminder from './appointmentReminder.model.js';

class AppointmentReminderRepository {
  async create(data) {
    const reminder = new AppointmentReminder(data);
    const saved = await reminder.save();
    return this.findById(saved._id);
  }

  async findById(id) {
    return AppointmentReminder.findById(id)
      .populate({ path: 'customerId', select: 'customerNumber name email phone mobile' })
      .lean();
  }

  async findPendingForDispatch() {
    return AppointmentReminder.find({
      status: 'PENDING',
      scheduledAt: { $lte: new Date() },
    })
      .sort({ scheduledAt: 1 })
      .lean();
  }

  async updateStatus(id, data) {
    return AppointmentReminder.findByIdAndUpdate(
      id,
      { $set: data },
      { returnDocument: 'after' },
    )
      .populate({ path: 'customerId', select: 'customerNumber name email phone mobile' })
      .lean();
  }

  async findByAppointmentId(appointmentId) {
    return AppointmentReminder.find({ appointmentId })
      .sort({ scheduledAt: -1 })
      .lean();
  }
}

const appointmentReminderRepository = new AppointmentReminderRepository();
export default appointmentReminderRepository;
