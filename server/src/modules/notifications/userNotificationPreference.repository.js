import UserNotificationPreference from './userNotificationPreference.model.js';

class UserNotificationPreferenceRepository {
  async findByUserId(userId) {
    return UserNotificationPreference.findOne({ userId }).lean();
  }

  async upsert(userId, data) {
    return UserNotificationPreference.findOneAndUpdate(
      { userId },
      { userId, ...data },
      { returnDocument: 'after', upsert: true, runValidators: true },
    ).lean();
  }

  async findAll() {
    return UserNotificationPreference.find().lean();
  }
}

const userNotificationPreferenceRepository = new UserNotificationPreferenceRepository();
export default userNotificationPreferenceRepository;
