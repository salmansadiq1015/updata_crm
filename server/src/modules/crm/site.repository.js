import Site from './site.model.js';

class SiteRepository {
  async create(data) {
    const site = new Site(data);
    return site.save();
  }

  async findById(id) {
    return Site.findById(id).lean();
  }

  async findByCustomerId(customerId) {
    return Site.find({ customerId })
      .sort({ siteNumber: 1 })
      .lean();
  }

  async updateById(id, data) {
    return Site.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Site.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async countByCustomer(customerId) {
    return Site.countDocuments({ customerId, isDeleted: false });
  }

  async countAll() {
    return Site.countDocuments({ isDeleted: false });
  }
}

const siteRepository = new SiteRepository();
export default siteRepository;
