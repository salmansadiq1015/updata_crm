import EmployeeAvailability from './employeeAvailability.model.js';

class AvailabilityRepository {
  async findByEmployeeAndDateRange(employeeId, startDate, endDate) {
    return EmployeeAvailability.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean();
  }

  async findByEmployeesAndDateRange(employeeIds, startDate, endDate) {
    return EmployeeAvailability.find({
      employeeId: { $in: employeeIds },
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean();
  }

  async isAvailable(employeeId, date) {
    return EmployeeAvailability.findOne({ employeeId, date }).lean();
  }

  async bulkUpsert(records) {
    const operations = records.map((record) => ({
      updateOne: {
        filter: { employeeId: record.employeeId, date: record.date },
        update: { $set: record },
        upsert: true,
      },
    }));
    return EmployeeAvailability.bulkWrite(operations);
  }

  async findAbsences(employeeId, startDate, endDate) {
    return EmployeeAvailability.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate },
      availabilityType: { $in: ['VACATION', 'SICK', 'OTHER_ABSENCE'] },
    }).lean();
  }
}

const availabilityRepository = new AvailabilityRepository();
export default availabilityRepository;
