import Permission from './permission.model.js';

/**
 * Permission repository — pure data access.
 * Permissions are seeded once and rarely change.
 */
class PermissionRepository {
  async findAll() {
    return Permission.find().lean();
  }

  async findByIds(ids) {
    return Permission.find({ _id: { $in: ids } }).lean();
  }

  /**
   * Find permissions by key strings (e.g., ['crm:read', 'projects:write']).
   */
  async findByKeys(keys) {
    const conditions = keys.map((key) => {
      const [module, action] = key.split(':');
      return { module, action };
    });
    return Permission.find({ $or: conditions }).lean();
  }

  async bulkCreate(permissions) {
    return Permission.insertMany(permissions, { ordered: false });
  }

  /**
   * Return permissions grouped by module for the /permissions endpoint.
   */
  async findGroupedByModule() {
    return Permission.aggregate([
      {
        $group: {
          _id: '$module',
          actions: {
            $push: {
              _id: '$_id',
              action: '$action',
              description: '$description',
            },
          },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          module: '$_id',
          actions: 1,
        },
      },
    ]);
  }

  async count() {
    return Permission.countDocuments();
  }
}

const permissionRepository = new PermissionRepository();
export default permissionRepository;
