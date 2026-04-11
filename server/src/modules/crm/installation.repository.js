import Installation from './installation.model.js';

class InstallationRepository {
  async create(data) {
    const installation = new Installation(data);
    return installation.save();
  }

  async findById(id) {
    return Installation.findById(id).lean();
  }

  async findBySiteId(siteId) {
    return Installation.find({ siteId })
      .sort({ installationNumber: 1 })
      .lean();
  }

  async updateById(id, data) {
    return Installation.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Installation.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async countActiveBySiteId(siteId) {
    return Installation.countDocuments({
      siteId,
      status: 'active',
      isDeleted: false,
    });
  }
}

const installationRepository = new InstallationRepository();
export default installationRepository;
