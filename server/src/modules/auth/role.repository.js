import Role from './role.model.js';

/**
 * Role repository — pure data access.
 */
class RoleRepository {
  async create(data) {
    const role = new Role(data);
    return role.save();
  }

  async findById(id) {
    return Role.findById(id).populate('permissions').lean();
  }

  async findByName(name) {
    return Role.findOne({ name }).populate('permissions').lean();
  }

  async findAll() {
    return Role.find().populate('permissions').sort({ name: 1 }).lean();
  }

  async updateById(id, data) {
    return Role.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).populate('permissions').lean();
  }

  async softDelete(id) {
    return Role.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }
}

const roleRepository = new RoleRepository();
export default roleRepository;
