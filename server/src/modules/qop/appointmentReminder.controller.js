import appointmentReminderService from './appointmentReminder.service.js';

class AppointmentReminderController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await appointmentReminderService.list(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const reminder = await appointmentReminderService.create(req.body, req.user._id);
      return res.success({ data: reminder, message: 'Appointment reminder created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const reminder = await appointmentReminderService.getById(req.params.id);
      return res.success({ data: reminder });
    } catch (err) { next(err); }
  }

  async updateStatus(req, res, next) {
    try {
      const { status, customerResponse } = req.body;
      const reminder = await appointmentReminderService.updateStatus(
        req.params.id,
        status,
        { customerResponse },
      );
      return res.success({ data: reminder, message: 'Appointment reminder status updated successfully' });
    } catch (err) { next(err); }
  }
}

const appointmentReminderController = new AppointmentReminderController();
export default appointmentReminderController;
