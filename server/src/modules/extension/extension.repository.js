import ExtensionConnection, {
  EXTENSION_CONNECTION_STATUS,
} from './extensionConnection.model.js';

/**
 * Extension repository — all persistence for ExtensionConnection documents.
 * Every query is scoped by `createdBy` (single-tenant ownership). The service
 * layer owns Redis (pairing grants + token sessions); this layer owns Mongo.
 */
class ExtensionRepository {
  /**
   * Create or update the connection for a (user, browser install) pair.
   * Reconnecting the same install replaces the session + metadata in place.
   */
  async upsertConnection(createdBy, instanceId, fields) {
    return ExtensionConnection.findOneAndUpdate(
      { createdBy, instanceId },
      { $set: { createdBy, instanceId, ...fields } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
  }

  /** The user's most recently active (non-revoked) connection, or null. */
  async findActiveByUser(createdBy) {
    return ExtensionConnection.findOne({
      createdBy,
      status: { $ne: EXTENSION_CONNECTION_STATUS.REVOKED },
    })
      .sort({ lastSeenAt: -1 })
      .lean();
  }

  /** Every non-revoked connection for a user (a user may link >1 browser). */
  async listActiveByUser(createdBy) {
    return ExtensionConnection.find({
      createdBy,
      status: { $ne: EXTENSION_CONNECTION_STATUS.REVOKED },
    })
      .sort({ lastSeenAt: -1 })
      .lean();
  }

  /** The connection row for a specific browser install (any status). */
  async findByInstance(createdBy, instanceId) {
    return ExtensionConnection.findOne({ createdBy, instanceId }).lean();
  }

  async findByIdForUser(id, createdBy) {
    return ExtensionConnection.findOne({ _id: id, createdBy }).lean();
  }

  /** Resolve the connection that owns a given extension session id. */
  async findBySession(createdBy, sessionId) {
    return ExtensionConnection.findOne({ createdBy, sessionId }).lean();
  }

  async touch(id, fields = {}) {
    return ExtensionConnection.findByIdAndUpdate(
      id,
      { $set: { lastSeenAt: new Date(), ...fields } },
      { returnDocument: 'after' },
    ).lean();
  }

  async markStatus(id, status, extra = {}) {
    return ExtensionConnection.findByIdAndUpdate(
      id,
      { $set: { status, ...extra } },
      { returnDocument: 'after' },
    ).lean();
  }
}

const extensionRepository = new ExtensionRepository();
export default extensionRepository;
