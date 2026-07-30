import vehicleService from './vehicle.service.js';

const withMeta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });

class VehicleController {
  async list(req, res, next) {
    try {
      const data = await vehicleService.list(req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const data = await vehicleService.getById(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const data = await vehicleService.create(req.body, req.user._id, withMeta(req));
      return res.success({ data, message: 'Vehicle created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const data = await vehicleService.update(req.params.id, req.body, req.user._id, withMeta(req));
      return res.success({ data, message: 'Vehicle updated' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      await vehicleService.remove(req.params.id, req.user._id, withMeta(req));
      return res.success({ message: 'Vehicle deleted' });
    } catch (err) { next(err); }
  }

  async assignDriver(req, res, next) {
    try {
      const data = await vehicleService.assignDriver(req.params.id, req.body.driverId, req.user._id, withMeta(req));
      return res.success({ data, message: 'Driver updated' });
    } catch (err) { next(err); }
  }

  async listServices(req, res, next) {
    try { return res.success({ data: await vehicleService.listServices(req.params.id) }); } catch (err) { next(err); }
  }

  async addService(req, res, next) {
    try {
      const data = await vehicleService.addService(req.params.id, req.body, req.user._id, withMeta(req));
      return res.success({ data, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async deleteService(req, res, next) {
    try { await vehicleService.deleteService(req.params.id, req.params.subId, req.user._id, withMeta(req)); return res.success({ message: 'Deleted' }); } catch (err) { next(err); }
  }

  async listMaterials(req, res, next) {
    try { return res.success({ data: await vehicleService.listMaterials(req.params.id) }); } catch (err) { next(err); }
  }

  async addMaterial(req, res, next) {
    try {
      const data = await vehicleService.addMaterial(req.params.id, req.body, req.user._id, withMeta(req));
      return res.success({ data, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async deleteMaterial(req, res, next) {
    try { await vehicleService.deleteMaterial(req.params.id, req.params.subId, req.user._id, withMeta(req)); return res.success({ message: 'Deleted' }); } catch (err) { next(err); }
  }

  async listNotes(req, res, next) {
    try { return res.success({ data: await vehicleService.listNotes(req.params.id) }); } catch (err) { next(err); }
  }

  async addNote(req, res, next) {
    try {
      const data = await vehicleService.addNote(req.params.id, req.body, req.user._id, withMeta(req));
      return res.success({ data, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async deleteNote(req, res, next) {
    try { await vehicleService.deleteNote(req.params.id, req.params.subId, req.user._id, withMeta(req)); return res.success({ message: 'Deleted' }); } catch (err) { next(err); }
  }

  async listHistory(req, res, next) {
    try { return res.success({ data: await vehicleService.listHistory(req.params.id) }); } catch (err) { next(err); }
  }
}

export default new VehicleController();
