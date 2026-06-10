import AppointmentDetails from './appointmentDetails.model.js';

class AppointmentRepository {
  async create(data) {
    const appointment = new AppointmentDetails(data);
    return appointment.save();
  }

  async upsertByAssignmentId(assignmentId, data) {
    return AppointmentDetails.findOneAndUpdate(
      { assignmentId },
      {
        $set: data,
        $setOnInsert: { assignmentId },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
  }

  async findByAssignmentId(assignmentId) {
    return AppointmentDetails.findOne({ assignmentId }).lean();
  }

  async findByAssignmentIds(assignmentIds) {
    if (!assignmentIds.length) return [];
    return AppointmentDetails.find({ assignmentId: { $in: assignmentIds } }).lean();
  }

  async updateByAssignmentId(assignmentId, data) {
    return AppointmentDetails.findOneAndUpdate(
      { assignmentId },
      { $set: data },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async findPendingReminders(targetDate) {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    return AppointmentDetails.find({ reminderSent: false })
      .populate({
        path: 'assignmentId',
        select: 'assignmentNumber startDatetime endDatetime employeeId customerId siteId title',
        match: { startDatetime: { $gte: startOfDay, $lte: endOfDay } },
      })
      .lean()
      .then((results) => results.filter((r) => r.assignmentId !== null));
  }
}

const appointmentRepository = new AppointmentRepository();
export default appointmentRepository;
