import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

function toMobileInstallation(item) {
  if (!item) return null;
  return {
    id: String(item._id || item.id),
    site_id: String(item.siteId?._id || item.siteId),
    installation_number: item.installationNumber,
    system_type: item.type,
    manufacturer: item.manufacturer,
    model: item.model,
    name: item.model || item.installationNumber,
    serial_number: item.serialNumber,
    commissioning_date: item.commissioningDate,
    warranty_until: item.warrantyEndDate,
    power_output_kw: item.powerOutputKw,
    capacity: item.powerOutputKw ? `${item.powerOutputKw} kW` : null,
    fuel_type: item.fuelType,
    year_installed: item.yearOfManufacture,
    technical_notes: item.technicalNotes,
    notes: item.technicalNotes,
    status: item.status,
    updated_at: item.updatedAt,
  };
}

function stripSyncFields(data) {
  const payload = { ...data };
  delete payload.baseUpdatedAt;
  delete payload.clientMutationId;
  return payload;
}

class InstallationController {
  async listBySite(req, res, next) {
    try {
      const { default: installationRepository } = await import('../crm/installation.repository.js');
      const data = await installationRepository.findBySiteId(req.params.siteId);
      return res.success({ data: data.map(toMobileInstallation) });
    } catch (err) { next(err); }
  }

  async createForSite(req, res, next) {
    try {
      const { default: installationService } = await import('../crm/installation.service.js');
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await installationService.create(
        req.params.siteId,
        stripSyncFields(req.body),
        req.user._id,
        meta,
      );
      return res.success({ data: toMobileInstallation(data), statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const { default: installationRepository } = await import('../crm/installation.repository.js');
      const data = await installationRepository.findById(req.params.id);
      return res.success({ data: toMobileInstallation(data) });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const { default: installationRepository } = await import('../crm/installation.repository.js');
      const existing = await installationRepository.findById(req.params.id);
      if (
        req.body.baseUpdatedAt &&
        existing?.updatedAt &&
        new Date(existing.updatedAt).getTime() > new Date(req.body.baseUpdatedAt).getTime()
      ) {
        throw new ConflictError('Installation changed on the server. Refresh before applying this mobile update.');
      }

      const { default: installationService } = await import('../crm/installation.service.js');
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await installationService.update(
        req.params.id,
        stripSyncFields(req.body),
        req.user._id,
        meta,
      );
      return res.success({ data: toMobileInstallation(data) });
    } catch (err) { next(err); }
  }

  async getHistory(req, res, next) {
    try {
      // Placeholder: cross-module aggregation deferred
      return res.success({ data: [] });
    } catch (err) { next(err); }
  }

  async uploadNameplate(req, res, next) {
    try {
      if (!req.file) {
        throw new ValidationError('Nameplate image is required', [
          { field: 'image', message: 'Nameplate image is required' },
        ]);
      }

      const { default: installationRepository } = await import('../crm/installation.repository.js');
      const installation = await installationRepository.findById(req.params.id);
      if (!installation) {
        throw new NotFoundError('Installation', req.params.id);
      }

      const { default: entityImageService } = await import('../crm/entityImage.service.js');
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const image = await entityImageService.create(
        'installation',
        req.params.id,
        {
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          caption: req.body.caption || 'Nameplate',
          category: 'nameplate',
          sortOrder: req.body.sortOrder || 0,
        },
        req.user._id,
        meta,
      );
      return res.success({ data: image, message: 'Nameplate uploaded', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async extractNameplate(req, res, next) {
    try {
      if (!req.file) {
        throw new ValidationError('Nameplate image is required', [
          { field: 'image', message: 'Nameplate image is required' },
        ]);
      }

      if (req.params.id) {
        const { default: installationRepository } = await import('../crm/installation.repository.js');
        const installation = await installationRepository.findById(req.params.id);
        if (!installation) {
          throw new NotFoundError('Installation', req.params.id);
        }
      }

      const { default: nameplateOcrService } = await import('./nameplateOcr.service.js');
      const extraction = await nameplateOcrService.extract({
        installationId: req.params.id || null,
        file: {
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
        },
      });

      return res.success({ data: extraction });
    } catch (err) { next(err); }
  }
}

const installationController = new InstallationController();
export default installationController;
