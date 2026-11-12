import calendarService from './calendar.service.js';

class CalendarController {
  async getCalendarData(req, res, next) {
    try {
      const { startDate, endDate, employeeIds, teamId, type, status } = req._validatedQuery || req.query;
      const filters = {};
      if (employeeIds) filters.employeeIds = String(employeeIds).split(',').filter(Boolean);
      if (teamId) filters.teamId = teamId;
      if (type) filters.type = type;
      if (status) filters.status = status;

      const data = await calendarService.getCalendarData(startDate, endDate, filters);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const calendarController = new CalendarController();
export default calendarController;
