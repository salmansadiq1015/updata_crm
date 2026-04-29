import sparePartService from './sparePart.service.js';

class SparePartController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const sparePart = await sparePartService.create(req.body, req.user._id, meta);
      return res.success({ data: sparePart, message: 'Spare part created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await sparePartService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async search(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await sparePartService.search(query.q, query.limit);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async exportCsv(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { format, ...filters } = query;
      const csv = await sparePartService.exportCsv(filters);
      const filename = `spare-parts-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const sparePart = await sparePartService.getById(req.params.id);
      return res.success({ data: sparePart });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const sparePart = await sparePartService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: sparePart, message: 'Spare part updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await sparePartService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Spare part deleted successfully' });
    } catch (err) { next(err); }
  }

  // --- Installation spare parts ---

  async getByInstallation(req, res, next) {
    try {
      const data = await sparePartService.getByInstallation(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async linkToInstallation(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const link = await sparePartService.linkToInstallation(
        { installationId: req.params.id, ...req.body },
        req.user._id,
        meta,
      );
      return res.success({ data: link, message: 'Spare part linked to installation', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async unlinkFromInstallation(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await sparePartService.unlinkFromInstallation(
        req.params.id,
        req.params.sparePartId,
        req.user._id,
        meta,
      );
      return res.success({ message: 'Spare part unlinked from installation' });
    } catch (err) { next(err); }
  }
}

const sparePartController = new SparePartController();
export default sparePartController;
