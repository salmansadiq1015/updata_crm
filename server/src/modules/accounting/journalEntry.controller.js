import journalEntryService from './journalEntry.service.js';

class JournalEntryController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entry = await journalEntryService.createManual(req.body, req.user._id, meta);
      return res.success({ data: entry, message: 'Journal entry created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const entry = await journalEntryService.getById(req.params.id);
      return res.success({ data: entry });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await journalEntryService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async reverse(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entry = await journalEntryService.reverse(req.params.id, req.body.reason, req.user._id, meta);
      return res.success({ data: entry, message: 'Journal entry reversed successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async exportCsv(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const csv = await journalEntryService.exportCsv(query);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="journal_entries.csv"');
      return res.send(csv);
    } catch (err) { next(err); }
  }
}

const journalEntryController = new JournalEntryController();
export default journalEntryController;
