import MobilePhoto from './mobilePhoto.model.js';

class MobilePhotoRepository {
  async create(data) {
    const photo = new MobilePhoto(data);
    return photo.save();
  }

  async findById(id) {
    return MobilePhoto.findById(id).lean();
  }

  async findByOrderId(orderId) {
    return MobilePhoto.find({ orderId })
      .sort({ capturedAt: -1 })
      .lean();
  }

  async findByReportId(workReportId) {
    return MobilePhoto.find({ workReportId }).lean();
  }

  async deleteById(id) {
    return MobilePhoto.findByIdAndDelete(id);
  }
}

const mobilePhotoRepository = new MobilePhotoRepository();
export default mobilePhotoRepository;
