import EntityImage from './entityImage.model.js';

class EntityImageRepository {
  async create(data) {
    const image = new EntityImage(data);
    return image.save();
  }

  async findById(id) {
    return EntityImage.findById(id).lean();
  }

  async findByEntity(entityType, entityId) {
    return EntityImage.find({ entityType, entityId })
      .sort({ sortOrder: 1 })
      .lean();
  }

  async deleteById(id) {
    return EntityImage.findByIdAndDelete(id);
  }
}

const entityImageRepository = new EntityImageRepository();
export default entityImageRepository;
