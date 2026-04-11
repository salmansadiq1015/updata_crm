import appointmentService from './appointment.service.js';

class AppointmentController {
  async getDetails(req, res, next) {
    try {
      const data = await appointmentService.getByAssignmentId(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async updateDetails(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await appointmentService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data, message: 'Appointment details updated successfully' });
    } catch (err) { next(err); }
  }

  async confirm(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await appointmentService.sendConfirmation(req.params.id, req.user._id, meta);
      return res.success({ data, message: 'Appointment confirmation sent successfully' });
    } catch (err) { next(err); }
  }

  async cancel(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await appointmentService.cancel(req.params.id, req.body.reason, req.user._id, meta);
      return res.success({ data, message: 'Appointment cancelled successfully' });
    } catch (err) { next(err); }
  }

  async reschedule(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await appointmentService.reschedule(req.params.id, req.body, req.user._id, meta);
      return res.success({ data, message: 'Appointment rescheduled successfully' });
    } catch (err) { next(err); }
  }
}

const appointmentController = new AppointmentController();
export default appointmentController;
