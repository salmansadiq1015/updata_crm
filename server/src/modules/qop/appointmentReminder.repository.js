import AppointmentReminder from './appointmentReminder.model.js';

class AppointmentReminderRepository {
  async create(data) {
    const reminder = new AppointmentReminder(data);
    return reminder.save();
  }

  async findById(id) {
    return AppointmentReminder.findById(id).lean();
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
    ).lean();
  }

  async findByAppointmentId(appointmentId) {
    return AppointmentReminder.find({ appointmentId })
      .sort({ scheduledAt: -1 })
      .lean();
  }
}

const appointmentReminderRepository = new AppointmentReminderRepository();
export default appointmentReminderRepository;
